import WebSocket from 'ws';
import type { FootprintStorage } from './storage';
import type { BinanceFuturesRestClient } from './rest';
import type { FootprintBar, RawAggTrade, StoredTrade } from './types';
import { aggregateTradesToBar } from './aggregator';

export interface StreamCallbacks {
    onTrade?: (trade: StoredTrade) => void;
    onSliceCompleted?: (bar: FootprintBar) => void;
}

export class BinanceFuturesStream {
    private symbols: string[];
    private storage: FootprintStorage;
    private restClient: BinanceFuturesRestClient;
    private bucketSizes: Record<string, number>;
    private callbacks: StreamCallbacks;

    private ws: WebSocket | null = null;
    private isRunning = false;
    private reconnectAttempts = 0;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private pingInterval: NodeJS.Timeout | null = null;
    private connectionLifetimeTimer: NodeJS.Timeout | null = null;

    private lastAggIds = new Map<string, number>();
    private minuteTrades = new Map<string, { minute: number; trades: StoredTrade[] }>();
    private pendingGapRepairs = new Set<string>();

    constructor(
        symbols: string[],
        storage: FootprintStorage,
        restClient: BinanceFuturesRestClient,
        bucketSizes: Record<string, number>,
        callbacks?: StreamCallbacks,
    ) {
        this.symbols = symbols.map((s) => s.toUpperCase());
        this.storage = storage;
        this.restClient = restClient;
        this.bucketSizes = bucketSizes;
        this.callbacks = callbacks || {};

        for (const sym of this.symbols) {
            const state = this.storage.getSyncState(sym);
            if (state.lastTradeId) {
                this.lastAggIds.set(sym, state.lastTradeId);
            }
        }
    }

    public start(): void {
        this.isRunning = true;
        this.connect();
    }

    private connect(): void {
        if (!this.isRunning) return;

        const streamNames = this.symbols.map((s) => `${s.toLowerCase()}@aggTrade`).join('/');
        const url = `wss://fstream.binance.com/stream?streams=${streamNames}`;

        console.log(`[Stream] Connecting to Binance USD-M fstream: ${url}`);
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            console.log(`[Stream] Connected to Binance stream (${this.symbols.join(', ')})`);
            this.reconnectAttempts = 0;

            this.pingInterval = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.ping();
                }
            }, 180000);

            this.connectionLifetimeTimer = setTimeout(() => {
                console.log('[Stream] Reconnecting proactively before 24h Binance limit...');
                this.reconnect();
            }, 23.5 * 3600 * 1000);
        });

        this.ws.on('message', (data: WebSocket.RawData) => {
            try {
                const parsed = JSON.parse(data.toString());
                if (!parsed || !parsed.data) return;
                const agg = parsed.data as RawAggTrade;
                if (!agg.s || !agg.a) return;
                this.handleAggTrade(agg);
            } catch (err) {
                console.error('[Stream] Error parsing message:', err);
            }
        });

        this.ws.on('error', (err) => {
            console.error('[Stream] WebSocket error:', err);
        });

        this.ws.on('close', (code, reason) => {
            console.warn(`[Stream] WebSocket closed (${code}: ${reason.toString()})`);
            this.cleanup();
            if (this.isRunning) {
                this.scheduleReconnect();
            }
        });
    }

    private handleAggTrade(agg: RawAggTrade): void {
        const symbol = agg.s.toUpperCase();
        const tradeId = agg.a;
        const trade: StoredTrade = {
            symbol,
            id: tradeId,
            price: parseFloat(agg.p),
            qty: parseFloat(agg.q),
            time: agg.T,
            isBuyerMaker: agg.m,
        };

        const lastId = this.lastAggIds.get(symbol);

        if (lastId !== undefined && tradeId > lastId + 1) {
            const gapSize = tradeId - (lastId + 1);
            console.warn(`[Stream] Gap detected for ${symbol}: missing ${gapSize} trades (${lastId + 1} to ${tradeId - 1})`);
            void this.triggerGapRepair(symbol, lastId + 1, tradeId - 1);
        }

        this.lastAggIds.set(symbol, tradeId);
        this.storage.insertTrades([trade]);
        this.storage.updateSyncState(symbol, tradeId, trade.time);

        this.accumulateMinuteSlice(trade);

        if (this.callbacks.onTrade) {
            this.callbacks.onTrade(trade);
        }
    }

    private accumulateMinuteSlice(trade: StoredTrade): void {
        const symbol = trade.symbol;
        const tradeMinute = Math.floor(trade.time / 60000) * 60000;
        const current = this.minuteTrades.get(symbol);
        const bucketSize = this.bucketSizes[symbol] || 1;

        if (!current) {
            this.minuteTrades.set(symbol, { minute: tradeMinute, trades: [trade] });
            return;
        }

        if (tradeMinute === current.minute) {
            current.trades.push(trade);
        } else if (tradeMinute > current.minute) {
            const bar = aggregateTradesToBar(symbol, current.trades, current.minute, '1m', bucketSize);
            if (bar) {
                this.storage.saveMinuteSlice(bar, bucketSize, current.trades.length);
                if (this.callbacks.onSliceCompleted) {
                    this.callbacks.onSliceCompleted(bar);
                }
            }
            this.minuteTrades.set(symbol, { minute: tradeMinute, trades: [trade] });
        }
    }

    private async triggerGapRepair(symbol: string, fromId: number, toId: number): Promise<void> {
        const key = `${symbol}:${fromId}:${toId}`;
        if (this.pendingGapRepairs.has(key)) return;
        this.pendingGapRepairs.add(key);

        try {
            console.log(`[GapRepair] Repairing ${symbol} trades ${fromId}..${toId} via REST`);
            let nextFromId = fromId;
            while (nextFromId <= toId) {
                const limit = Math.min(1000, toId - nextFromId + 1);
                const repaired = await this.restClient.fetchAggTrades({
                    symbol,
                    fromId: nextFromId,
                    limit,
                });

                if (repaired.length === 0) break;
                this.storage.insertTrades(repaired);
                console.log(`[GapRepair] Repaired ${repaired.length} trades for ${symbol}`);

                const lastRepairedId = repaired[repaired.length - 1].id;
                if (lastRepairedId >= toId || repaired.length < limit) break;
                nextFromId = lastRepairedId + 1;
            }
        } catch (err) {
            console.error(`[GapRepair] Failed to repair trades for ${symbol}:`, err);
        } finally {
            this.pendingGapRepairs.delete(key);
        }
    }

    private scheduleReconnect(): void {
        this.reconnectAttempts++;
        const backoffMs = Math.min(30000, Math.pow(2, this.reconnectAttempts) * 1000);
        console.log(`[Stream] Reconnecting in ${backoffMs}ms (attempt ${this.reconnectAttempts})...`);
        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, backoffMs);
    }

    private reconnect(): void {
        this.cleanup();
        this.connect();
    }

    private cleanup(): void {
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.connectionLifetimeTimer) clearTimeout(this.connectionLifetimeTimer);
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.pingInterval = null;
        this.connectionLifetimeTimer = null;
        this.reconnectTimeout = null;

        if (this.ws) {
            try {
                this.ws.removeAllListeners();
                this.ws.close();
            } catch {}
            this.ws = null;
        }
    }

    public stop(): void {
        this.isRunning = false;
        this.cleanup();
    }
}
