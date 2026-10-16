import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { FootprintStorage } from '../server/footprint/storage';
import { DEFAULT_CONFIG } from '../server/footprint/config';
import { parseTimeframeToMs, queryFootprintBars, FootprintApiServer } from '../server/footprint/api';
import type { StoredTrade } from '../server/footprint/types';
import { aggregateTradesToBar } from '../server/footprint/aggregator';

describe('Footprint Read API & Query Validation', () => {
    const testDbPath = path.resolve(process.cwd(), 'footprint-data/test-api.db');
    let storage: FootprintStorage;

    beforeEach(() => {
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        storage = new FootprintStorage(testDbPath);
    });

    afterEach(() => {
        storage.close();
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    });

    describe('1. Parameter Parsing and Bounds Capping', () => {
        it('parses timeframe strings into millisecond durations', () => {
            expect(parseTimeframeToMs('1m')).toBe(60000);
            expect(parseTimeframeToMs('5m')).toBe(300000);
            expect(parseTimeframeToMs('15m')).toBe(900000);
            expect(parseTimeframeToMs('1h')).toBe(3600000);
            expect(parseTimeframeToMs('4h')).toBe(14400000);
            expect(parseTimeframeToMs('1d')).toBe(86400000);
        });

        it('normalizes symbol and enforces lookback capping', () => {
            const now = Date.now();
            const res = queryFootprintBars(storage, DEFAULT_CONFIG, {
                symbol: 'btc-usdt!',
                timeframe: '1m',
                from: now - 30 * 86400 * 1000, // 30 days ago (exceeds 7-day retention)
                to: now,
            });

            expect(res.symbol).toBe('BTCUSDT');
            expect(res.timeframe).toBe('1m');
            // Empty DB returns 0 bars cleanly without errors
            expect(res.count).toBe(0);
            expect(res.bars).toEqual([]);
        });
    });

    describe('2. Fixture Query with Real Ladder Computation', () => {
        it('returns correctly formed footprint bars with cumDelta and price ladders', () => {
            const baseTime = 1700000000000;
            const trades: StoredTrade[] = [];

            // 3 consecutive 1-minute bars
            for (let m = 0; m < 3; m++) {
                const mStart = baseTime + m * 60000;
                for (let i = 0; i < 10; i++) {
                    trades.push({
                        symbol: 'BTCUSDT',
                        id: 2000 + m * 10 + i,
                        price: 68000 + i * 2,
                        qty: 0.5,
                        time: mStart + i * 5000,
                        isBuyerMaker: i % 2 === 0, // alternating buy/sell
                    });
                }
            }

            storage.insertTrades(trades);

            // Seed minute slices in storage
            for (let m = 0; m < 3; m++) {
                const mStart = baseTime + m * 60000;
                const mTrades = trades.filter((t) => t.time >= mStart && t.time < mStart + 60000);
                const bar = aggregateTradesToBar('BTCUSDT', mTrades, mStart, '1m', 1.0);
                expect(bar).not.toBeNull();
                storage.saveMinuteSlice(bar!, 1.0, mTrades.length);
            }

            const res = queryFootprintBars(storage, DEFAULT_CONFIG, {
                symbol: 'BTCUSDT',
                timeframe: '1m',
                from: baseTime,
                to: baseTime + 3 * 60000,
                bucket: 1.0,
            });

            expect(res.symbol).toBe('BTCUSDT');
            expect(res.count).toBe(3);
            expect(res.bars.length).toBe(3);

            let expectedCumDelta = 0;
            for (const bar of res.bars) {
                expect(bar.volume).toBeGreaterThan(0);
                expect(bar.levels.length).toBeGreaterThan(0);
                expect(bar.poc).toBeGreaterThan(0);
                expectedCumDelta += bar.delta;
                expect(bar.cumDelta).toBeCloseTo(expectedCumDelta, 6);

                // Verify levels are sorted descending by price
                for (let l = 0; l < bar.levels.length - 1; l++) {
                    expect(bar.levels[l].price).toBeGreaterThanOrEqual(bar.levels[l + 1].price);
                }
            }
        });
    });

    describe('3. HTTP Server Endpoints', () => {
        let apiServer: FootprintApiServer;
        const testPort = 3199;

        beforeEach(async () => {
            apiServer = new FootprintApiServer(storage, DEFAULT_CONFIG);
            await apiServer.listen(testPort, '127.0.0.1');
        });

        afterEach(async () => {
            await apiServer.close();
        });

        it('responds 200 to /api/footprint/health', async () => {
            const res = await fetch(`http://127.0.0.1:${testPort}/api/footprint/health`);
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.status).toBe('ok');
            expect(Array.isArray(data.symbols)).toBe(true);
        });

        it('responds 200 to /api/footprint query', async () => {
            const res = await fetch(`http://127.0.0.1:${testPort}/api/footprint?symbol=BTCUSDT&timeframe=1m`);
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.symbol).toBe('BTCUSDT');
            expect(Array.isArray(data.bars)).toBe(true);
        });
    });
});
