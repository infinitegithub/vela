import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyTradeSide, isAggressiveBuy, isAggressiveSell } from '../server/footprint/sideClassification';
import { quantizeToBucket, resolveBucketSize, getPrecision } from '../server/footprint/bucketing';
import { FootprintStorage } from '../server/footprint/storage';
import { aggregateTradesToBar, mergeMinuteSlices, roundQty } from '../server/footprint/aggregator';
import type { StoredTrade } from '../server/footprint/types';

describe('Footprint Pipeline - Core Logic & Invariants', () => {
    const testDbPath = path.resolve(process.cwd(), 'footprint-data/test-footprint.db');
    let storage: FootprintStorage;

    beforeEach(() => {
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        storage = new FootprintStorage(testDbPath);
    });

    afterEach(() => {
        storage.close();
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    });

    describe('1. Side Classification (Binance USD-M Futures Rules)', () => {
        it('m = true classifies as aggressive SELL (hits bid)', () => {
            const isBuyerMaker = true;
            expect(classifyTradeSide(isBuyerMaker)).toBe('sell');
            expect(isAggressiveSell(isBuyerMaker)).toBe(true);
            expect(isAggressiveBuy(isBuyerMaker)).toBe(false);
        });

        it('m = false classifies as aggressive BUY (lifts ask)', () => {
            const isBuyerMaker = false;
            expect(classifyTradeSide(isBuyerMaker)).toBe('buy');
            expect(isAggressiveBuy(isBuyerMaker)).toBe(true);
            expect(isAggressiveSell(isBuyerMaker)).toBe(false);
        });
    });

    describe('2. Price Bucketing & Precision', () => {
        it('quantizes BTC prices into $1.00 discrete brackets', () => {
            const bucketSize = resolveBucketSize(0.10, 10); // $1.00
            expect(bucketSize).toBe(1.0);
            expect(quantizeToBucket(67420.25, bucketSize)).toBe(67420.0);
            expect(quantizeToBucket(67420.99, bucketSize)).toBe(67420.0);
            expect(quantizeToBucket(67421.00, bucketSize)).toBe(67421.0);
        });

        it('quantizes ETH prices into $0.10 discrete brackets', () => {
            const bucketSize = resolveBucketSize(0.01, 10); // $0.10
            expect(bucketSize).toBe(0.10);
            expect(quantizeToBucket(2450.05, bucketSize)).toBe(2450.0);
            expect(quantizeToBucket(2450.09, bucketSize)).toBe(2450.0);
            expect(quantizeToBucket(2450.15, bucketSize)).toBe(2450.1);
        });

        it('handles tick sizes without precision drift', () => {
            expect(getPrecision(0.001)).toBe(3);
            expect(getPrecision(0.01)).toBe(2);
            expect(getPrecision(0.1)).toBe(1);
            expect(getPrecision(1.0)).toBe(0);
        });
    });

    describe('3. Deduplication & Idempotency', () => {
        it('deduplicates raw trades by aggregate trade ID', () => {
            const trades: StoredTrade[] = [
                { symbol: 'BTCUSDT', id: 1001, price: 68000.5, qty: 0.5, time: 1700000000000, isBuyerMaker: false },
                { symbol: 'BTCUSDT', id: 1002, price: 68001.0, qty: 1.2, time: 1700000001000, isBuyerMaker: true },
            ];

            const firstInsert = storage.insertTrades(trades);
            expect(firstInsert).toBe(2);

            // Re-inserting same trades must be a no-op (0 inserted)
            const secondInsert = storage.insertTrades(trades);
            expect(secondInsert).toBe(0);

            const stored = storage.getRawTrades('BTCUSDT', 1700000000000, 1700000005000);
            expect(stored.length).toBe(2);
            expect(stored[0].id).toBe(1001);
            expect(stored[1].id).toBe(1002);
        });
    });

    describe('4. Slice Merging Invariant (1m slices equal direct raw trade aggregation)', () => {
        function generateTradesWindow(startTime: number, durationMinutes: number): StoredTrade[] {
            const trades: StoredTrade[] = [];
            let price = 68000.0;
            let tradeId = 5000;

            for (let m = 0; m < durationMinutes; m++) {
                const minuteBase = startTime + m * 60000;
                // Generate 20 deterministic trades per minute
                for (let i = 0; i < 20; i++) {
                    const priceStep = ((i % 5) - 2) * 0.5;
                    price = roundQty(price + priceStep);
                    const qty = roundQty(0.1 + (i % 7) * 0.05);
                    const isBuyerMaker = (i + m) % 2 === 0;

                    trades.push({
                        symbol: 'BTCUSDT',
                        id: tradeId++,
                        price,
                        qty,
                        time: minuteBase + i * 2500,
                        isBuyerMaker,
                    });
                }
            }
            return trades;
        }

        const timeframes = [
            { tf: '5m', minutes: 5 },
            { tf: '15m', minutes: 15 },
            { tf: '1h', minutes: 60 },
        ];

        for (const { tf, minutes } of timeframes) {
            it(`merging 1m slices exactly equals direct aggregation for ${tf} bar`, () => {
                const baseTime = 1700000000000;
                const bucketSize = 1.0;
                const trades = generateTradesWindow(baseTime, minutes);

                // Method A: Direct aggregation of all raw trades
                const directBar = aggregateTradesToBar('BTCUSDT', trades, baseTime, tf, bucketSize);
                expect(directBar).not.toBeNull();

                // Method B: 1-minute slice creation and subsequent merge
                const minuteSlices = [];
                for (let m = 0; m < minutes; m++) {
                    const mStart = baseTime + m * 60000;
                    const mEnd = mStart + 60000;
                    const mTrades = trades.filter((t) => t.time >= mStart && t.time < mEnd);
                    const slice = aggregateTradesToBar('BTCUSDT', mTrades, mStart, '1m', bucketSize);
                    expect(slice).not.toBeNull();
                    minuteSlices.push(slice!);
                }

                const mergedBar = mergeMinuteSlices(minuteSlices, 'BTCUSDT', baseTime, tf);
                expect(mergedBar).not.toBeNull();

                // Compare OHLCV
                expect(mergedBar!.open).toBe(directBar!.open);
                expect(mergedBar!.high).toBe(directBar!.high);
                expect(mergedBar!.low).toBe(directBar!.low);
                expect(mergedBar!.close).toBe(directBar!.close);
                expect(mergedBar!.volume).toBeCloseTo(directBar!.volume, 6);
                expect(mergedBar!.delta).toBeCloseTo(directBar!.delta, 6);
                expect(mergedBar!.minDelta).toBeCloseTo(directBar!.minDelta, 6);
                expect(mergedBar!.maxDelta).toBeCloseTo(directBar!.maxDelta, 6);
                expect(mergedBar!.poc).toBe(directBar!.poc);

                // Compare level-by-level ladders
                expect(mergedBar!.levels.length).toBe(directBar!.levels.length);
                for (let idx = 0; idx < directBar!.levels.length; idx++) {
                    const directLvl = directBar!.levels[idx];
                    const mergedLvl = mergedBar!.levels[idx];
                    expect(mergedLvl.price).toBe(directLvl.price);
                    expect(mergedLvl.bidVolume).toBeCloseTo(directLvl.bidVolume, 6);
                    expect(mergedLvl.askVolume).toBeCloseTo(directLvl.askVolume, 6);
                    expect(mergedLvl.totalVolume).toBeCloseTo(directLvl.totalVolume, 6);
                    expect(mergedLvl.delta).toBeCloseTo(directLvl.delta, 6);
                    expect(mergedLvl.tradeCount).toBe(directLvl.tradeCount);
                }
            });
        }
    });

    describe('5. Gap Repair Simulation', () => {
        it('detects missing trades and stores repaired trades seamlessly', () => {
            const t100 = { symbol: 'BTCUSDT', id: 100, price: 68000, qty: 1.0, time: 1000, isBuyerMaker: false };
            const t105 = { symbol: 'BTCUSDT', id: 105, price: 68005, qty: 1.0, time: 5000, isBuyerMaker: true };

            storage.insertTrades([t100, t105]);

            // Simulate gap repair fetching missing 101..104
            const repairedTrades: StoredTrade[] = [
                { symbol: 'BTCUSDT', id: 101, price: 68001, qty: 0.5, time: 2000, isBuyerMaker: false },
                { symbol: 'BTCUSDT', id: 102, price: 68002, qty: 0.6, time: 3000, isBuyerMaker: true },
                { symbol: 'BTCUSDT', id: 103, price: 68003, qty: 0.7, time: 3500, isBuyerMaker: false },
                { symbol: 'BTCUSDT', id: 104, price: 68004, qty: 0.8, time: 4000, isBuyerMaker: true },
            ];

            const count = storage.insertTrades(repairedTrades);
            expect(count).toBe(4);

            const all = storage.getRawTrades('BTCUSDT', 1000, 6000);
            expect(all.length).toBe(6);
            for (let i = 0; i < 6; i++) {
                expect(all[i].id).toBe(100 + i);
            }
        });
    });
});
