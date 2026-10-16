import type { RawAggTrade, StoredTrade } from './types';

export class BinanceFuturesRestClient {
    private baseUrl = 'https://fapi.binance.com';
    private minIntervalMs = 200; // 5 req/sec max (weight 100/s)
    private lastRequestTime = 0;

    private async rateLimit(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < this.minIntervalMs) {
            await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
        }
        this.lastRequestTime = Date.now();
    }

    public async fetchAggTrades(params: {
        symbol: string;
        fromId?: number;
        startTime?: number;
        endTime?: number;
        limit?: number;
    }): Promise<StoredTrade[]> {
        await this.rateLimit();

        const url = new URL(`${this.baseUrl}/fapi/v1/aggTrades`);
        url.searchParams.set('symbol', params.symbol.toUpperCase());

        if (params.fromId !== undefined) {
            url.searchParams.set('fromId', params.fromId.toString());
        } else {
            if (params.startTime !== undefined) url.searchParams.set('startTime', params.startTime.toString());
            if (params.endTime !== undefined) url.searchParams.set('endTime', params.endTime.toString());
        }

        const limit = Math.min(params.limit ?? 1000, 1000);
        url.searchParams.set('limit', limit.toString());

        let res: Response;
        let retries = 3;
        while (retries > 0) {
            try {
                res = await fetch(url.toString(), {
                    headers: { 'User-Agent': 'Vela-Footprint/1.0', 'Accept': 'application/json' }
                });

                if (res.status === 429 || res.status === 418) {
                    const retryAfter = res.headers.get('Retry-After');
                    const waitSec = retryAfter ? parseInt(retryAfter, 10) : 5;
                    console.warn(`[Binance REST] Rate limited (${res.status}), backing off for ${waitSec}s`);
                    await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
                    retries--;
                    continue;
                }

                if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(`HTTP ${res.status}: ${txt}`);
                }

                const data = (await res.json()) as RawAggTrade[];
                return data.map((t) => ({
                    symbol: params.symbol.toUpperCase(),
                    id: t.a,
                    price: parseFloat(t.p),
                    qty: parseFloat(t.q),
                    time: t.T,
                    isBuyerMaker: t.m,
                }));
            } catch (err) {
                retries--;
                if (retries === 0) throw err;
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        return [];
    }

    public async fetchTradesInWindow(symbol: string, fromTime: number, toTime: number): Promise<StoredTrade[]> {
        const allTrades: StoredTrade[] = [];
        let currentStart = fromTime;

        while (currentStart < toTime) {
            const chunkEnd = Math.min(toTime, currentStart + 3600000);
            const firstBatch = await this.fetchAggTrades({
                symbol,
                startTime: currentStart,
                endTime: chunkEnd,
                limit: 1000,
            });

            if (firstBatch.length === 0) {
                currentStart = chunkEnd;
                continue;
            }

            allTrades.push(...firstBatch);

            let lastTrade = firstBatch[firstBatch.length - 1];
            while (firstBatch.length === 1000 && lastTrade.time < chunkEnd) {
                const nextTrades = await this.fetchAggTrades({
                    symbol,
                    fromId: lastTrade.id + 1,
                    limit: 1000,
                });
                if (nextTrades.length === 0) break;

                const filtered = nextTrades.filter((t) => t.time < chunkEnd);
                allTrades.push(...filtered);
                lastTrade = nextTrades[nextTrades.length - 1];
                if (nextTrades.length < 1000 || lastTrade.time >= chunkEnd) break;
            }

            currentStart = chunkEnd;
        }

        return allTrades;
    }
}
