import http from 'http';
import { parse as parseUrl } from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import type { FootprintStorage } from './storage';
import type { FootprintConfig, FootprintBar, StoredTrade } from './types';
import { resolveBucketSize } from './bucketing';
import { aggregateTradesToBar, mergeMinuteSlices, roundQty } from './aggregator';

export function parseTimeframeToMs(tf: string): number {
    const clean = tf.trim().toLowerCase();
    if (clean === '1m' || clean === '1') return 60000;
    if (clean === '3m' || clean === '3') return 180000;
    if (clean === '5m' || clean === '5') return 300000;
    if (clean === '15m' || clean === '15') return 900000;
    if (clean === '30m' || clean === '30') return 1800000;
    if (clean === '1h' || clean === '60') return 3600000;
    if (clean === '2h' || clean === '120') return 7200000;
    if (clean === '4h' || clean === '240') return 14400000;
    if (clean === '1d' || clean === 'd') return 86400000;
    // Default fallback 1m
    return 60000;
}

export interface QueryFootprintParams {
    symbol?: string;
    timeframe?: string;
    from?: string | number;
    to?: string | number;
    bucket?: string | number;
}

export function queryFootprintBars(
    storage: FootprintStorage,
    config: FootprintConfig,
    params: QueryFootprintParams
): { symbol: string; timeframe: string; bucketSize: number; count: number; bars: FootprintBar[] } {
    const symbol = (params.symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const timeframe = params.timeframe || '1m';
    const tfMs = parseTimeframeToMs(timeframe);

    // Bucket resolution
    let bucketSize: number;
    if (params.bucket !== undefined && !isNaN(Number(params.bucket)) && Number(params.bucket) > 0) {
        bucketSize = Number(params.bucket);
    } else {
        const tick = config.tickSizes[symbol] || 0.01;
        const mult = config.bucketMultipliers[symbol] || 1;
        bucketSize = resolveBucketSize(tick, mult);
    }

    // Time window capping
    const now = Date.now();
    let toTime = params.to ? Number(params.to) : now;
    if (isNaN(toTime) || toTime <= 0) toTime = now;

    let fromTime = params.from ? Number(params.from) : toTime - 100 * tfMs;
    if (isNaN(fromTime) || fromTime <= 0) fromTime = toTime - 100 * tfMs;

    // Hard bounds: max 1000 bars, max 7 days retention
    const maxWindowMs = Math.min(1000 * tfMs, config.retentionDays * 86400 * 1000);
    if (toTime - fromTime > maxWindowMs) {
        fromTime = toTime - maxWindowMs;
    }
    if (fromTime >= toTime) {
        fromTime = toTime - tfMs;
    }

    // Align fromTime to timeframe boundary
    fromTime = Math.floor(fromTime / tfMs) * tfMs;
    toTime = Math.ceil(toTime / tfMs) * tfMs;

    // 1. Fetch 1m slices from storage
    let oneMinuteSlices = storage.getMinuteSlices(symbol, fromTime, toTime, bucketSize);

    // If no 1m slices exist in cache table (e.g. custom bucket), aggregate from raw_trades table
    if (oneMinuteSlices.length === 0) {
        const rawTrades = storage.getRawTrades(symbol, fromTime, toTime);
        if (rawTrades.length > 0) {
            let curMin = Math.floor(rawTrades[0]!.time / 60000) * 60000;
            const endMin = Math.floor(rawTrades[rawTrades.length - 1]!.time / 60000) * 60000;

            while (curMin <= endMin) {
                const nextMin = curMin + 60000;
                const mTrades = rawTrades.filter((t) => t.time >= curMin && t.time < nextMin);
                if (mTrades.length > 0) {
                    const bar = aggregateTradesToBar(symbol, mTrades, curMin, '1m', bucketSize);
                    if (bar) oneMinuteSlices.push(bar);
                }
                curMin = nextMin;
            }
        }
    } else {
        // Slices exist in cache, but check if there are trailing forming trades in raw_trades
        const lastSliceEnd = oneMinuteSlices[oneMinuteSlices.length - 1]!.time + 60000;
        if (lastSliceEnd < toTime) {
            const trailingTrades = storage.getRawTrades(symbol, lastSliceEnd, toTime + 1000);
            if (trailingTrades.length > 0) {
                let curMin = Math.floor(trailingTrades[0]!.time / 60000) * 60000;
                const endMin = Math.floor(trailingTrades[trailingTrades.length - 1]!.time / 60000) * 60000;
                while (curMin <= endMin) {
                    const nextMin = curMin + 60000;
                    const mTrades = trailingTrades.filter((t) => t.time >= curMin && t.time < nextMin);
                    if (mTrades.length > 0) {
                        const bar = aggregateTradesToBar(symbol, mTrades, curMin, '1m', bucketSize);
                        if (bar && !oneMinuteSlices.some((s) => s.time === bar.time)) {
                            oneMinuteSlices.push(bar);
                        }
                    }
                    curMin = nextMin;
                }
            }
        }
    }

    let finalBars: FootprintBar[] = [];

    if (tfMs === 60000) {
        finalBars = oneMinuteSlices;
    } else {
        // Group 1m slices into higher timeframe buckets [barStart, barStart + tfMs)
        const groups = new Map<number, FootprintBar[]>();
        for (const slice of oneMinuteSlices) {
            const barStart = Math.floor(slice.time / tfMs) * tfMs;
            let group = groups.get(barStart);
            if (!group) {
                group = [];
                groups.set(barStart, group);
            }
            group.push(slice);
        }

        const sortedStarts = Array.from(groups.keys()).sort((a, b) => a - b);
        for (const start of sortedStarts) {
            const groupSlices = groups.get(start)!;
            const merged = mergeMinuteSlices(groupSlices, symbol, start, timeframe);
            if (merged) finalBars.push(merged);
        }
    }

    // Compute cumulative delta across bars
    let runningCumDelta = 0;
    for (const b of finalBars) {
        runningCumDelta = roundQty(runningCumDelta + b.delta);
        b.cumDelta = runningCumDelta;
    }

    return {
        symbol,
        timeframe,
        bucketSize,
        count: finalBars.length,
        bars: finalBars,
    };
}

export class FootprintApiServer {
    private server: http.Server;
    private wss: WebSocketServer;
    private storage: FootprintStorage;
    private config: FootprintConfig;
    private sseClients = new Set<{ res: http.ServerResponse; symbol: string }>();

    constructor(storage: FootprintStorage, config: FootprintConfig) {
        this.storage = storage;
        this.config = config;

        this.server = http.createServer((req, res) => this.handleRequest(req, res));
        this.wss = new WebSocketServer({ noServer: true });

        this.server.on('upgrade', (request, socket, head) => {
            const { pathname } = parseUrl(request.url || '', true);
            if (pathname === '/api/footprint/ws' || pathname === '/api/footprint') {
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    this.wss.emit('connection', ws, request);
                });
            } else {
                socket.destroy();
            }
        });

        this.wss.on('connection', (ws: WebSocket) => {
            ws.send(JSON.stringify({ type: 'connected', time: Date.now() }));
        });
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        const parsed = parseUrl(req.url || '', true);
        const pathname = parsed.pathname;

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (pathname === '/api/footprint/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), symbols: this.config.symbols }));
            return;
        }

        if (pathname === '/api/footprint/live') {
            // Server-Sent Events (SSE)
            const symbol = ((parsed.query.symbol as string) || 'BTCUSDT').toUpperCase();
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });
            res.write(`data: ${JSON.stringify({ type: 'connected', symbol })}\n\n`);

            const client = { res, symbol };
            this.sseClients.add(client);

            req.on('close', () => {
                this.sseClients.delete(client);
            });
            return;
        }

        if (pathname === '/api/footprint') {
            try {
                const result = queryFootprintBars(this.storage, this.config, parsed.query as QueryFootprintParams);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (err: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err?.message || 'Internal server error' }));
            }
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }

    public broadcastTrade(trade: StoredTrade): void {
        const payload = JSON.stringify({ type: 'trade', data: trade });
        // Broadcast to SSE
        for (const client of this.sseClients) {
            if (client.symbol === trade.symbol) {
                client.res.write(`data: ${payload}\n\n`);
            }
        }
        // Broadcast to WS
        for (const client of this.wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        }
    }

    public broadcastBar(bar: FootprintBar): void {
        const payload = JSON.stringify({ type: 'bar', data: bar });
        for (const client of this.sseClients) {
            if (client.symbol === bar.symbol) {
                client.res.write(`data: ${payload}\n\n`);
            }
        }
        for (const client of this.wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        }
    }

    public listen(port: number, host: string): Promise<void> {
        return new Promise((resolve) => {
            this.server.listen(port, host, () => {
                console.log(`[FootprintApiServer] HTTP & Live Stream listening on http://${host}:${port}/api/footprint`);
                resolve();
            });
        });
    }

    public close(): Promise<void> {
        return new Promise((resolve) => {
            for (const client of this.sseClients) {
                client.res.end();
            }
            this.sseClients.clear();
            this.wss.close();
            this.server.close(() => resolve());
        });
    }
}
