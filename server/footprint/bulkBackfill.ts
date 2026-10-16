import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';
import type { FootprintStorage } from './storage';
import type { StoredTrade } from './types';
import { aggregateTradesToBar } from './aggregator';

export class BulkBackfiller {
    private storage: FootprintStorage;
    private tempDir: string;

    constructor(storage: FootprintStorage, tempDir?: string) {
        this.storage = storage;
        this.tempDir = tempDir || path.resolve(process.cwd(), 'footprint-data/temp');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    public async backfillDate(symbol: string, dateStr: string, bucketSize: number): Promise<{ success: boolean; tradesCount: number; error?: string }> {
        const zipName = `${symbol}-aggTrades-${dateStr}.zip`;
        const zipUrl = `https://data.binance.vision/data/futures/um/daily/aggTrades/${symbol}/${zipName}`;
        const checksumUrl = `${zipUrl}.CHECKSUM`;

        const zipPath = path.join(this.tempDir, zipName);

        try {
            // 1. Fetch checksum
            const csRes = await fetch(checksumUrl);
            if (!csRes.ok) {
                return { success: false, tradesCount: 0, error: `Checksum not available (${csRes.status})` };
            }
            const csText = (await csRes.text()).trim();
            const expectedSha256 = csText.split(/\s+/)[0];

            // 2. Download zip
            const zipRes = await fetch(zipUrl);
            if (!zipRes.ok) {
                return { success: false, tradesCount: 0, error: `Zip not available (${zipRes.status})` };
            }
            const arrayBuffer = await zipRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // 3. Verify SHA256 checksum
            const computedSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
            if (computedSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
                return { success: false, tradesCount: 0, error: `Checksum mismatch: expected ${expectedSha256}, got ${computedSha256}` };
            }

            fs.writeFileSync(zipPath, buffer);

            // 4. Extract CSV using python3 zipfile module
            execSync(`python3 -m zipfile -e "${zipPath}" "${this.tempDir}"`);
            const csvName = `${symbol}-aggTrades-${dateStr}.csv`;
            const csvPath = path.join(this.tempDir, csvName);

            if (!fs.existsSync(csvPath)) {
                return { success: false, tradesCount: 0, error: `Extracted CSV not found: ${csvName}` };
            }

            // 5. Stream and parse CSV
            const fileStream = fs.createReadStream(csvPath);
            const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

            let batch: StoredTrade[] = [];
            let totalInserted = 0;
            let currentMinuteTrades: StoredTrade[] = [];
            let currentMinute = -1;

            for await (const line of rl) {
                if (!line || line.startsWith('agg_trade_id') || line.startsWith('id')) continue;
                const parts = line.split(',');
                if (parts.length < 7) continue;

                const trade: StoredTrade = {
                    symbol,
                    id: parseInt(parts[0], 10),
                    price: parseFloat(parts[1]),
                    qty: parseFloat(parts[2]),
                    time: parseInt(parts[5], 10),
                    isBuyerMaker: parts[6].trim().toLowerCase() === 'true' || parts[6].trim() === '1',
                };

                batch.push(trade);

                const tradeMinute = Math.floor(trade.time / 60000) * 60000;
                if (currentMinute === -1) {
                    currentMinute = tradeMinute;
                    currentMinuteTrades.push(trade);
                } else if (tradeMinute === currentMinute) {
                    currentMinuteTrades.push(trade);
                } else {
                    const bar = aggregateTradesToBar(symbol, currentMinuteTrades, currentMinute, '1m', bucketSize);
                    if (bar) {
                        this.storage.saveMinuteSlice(bar, bucketSize, currentMinuteTrades.length);
                    }
                    currentMinute = tradeMinute;
                    currentMinuteTrades = [trade];
                }

                if (batch.length >= 10000) {
                    totalInserted += this.storage.insertTrades(batch);
                    batch = [];
                }
            }

            if (batch.length > 0) {
                totalInserted += this.storage.insertTrades(batch);
            }
            if (currentMinuteTrades.length > 0 && currentMinute !== -1) {
                const bar = aggregateTradesToBar(symbol, currentMinuteTrades, currentMinute, '1m', bucketSize);
                if (bar) {
                    this.storage.saveMinuteSlice(bar, bucketSize, currentMinuteTrades.length);
                }
            }

            // Cleanup temp files
            try {
                if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
                if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
            } catch {}

            return { success: true, tradesCount: totalInserted };
        } catch (err: any) {
            return { success: false, tradesCount: 0, error: err?.message || String(err) };
        }
    }
}
