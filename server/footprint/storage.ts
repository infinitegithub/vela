import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { FootprintBar, PriceLevelVolume, StoredTrade } from "./types";

export class FootprintStorage {
    private db: Database.Database;

    constructor(dbPath: string) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new Database(dbPath);
        this.initSchema();
    }

    private initSchema(): void {
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("synchronous = NORMAL");

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS raw_trades (
                symbol TEXT NOT NULL,
                id INTEGER NOT NULL,
                price REAL NOT NULL,
                qty REAL NOT NULL,
                time INTEGER NOT NULL,
                is_buyer_maker INTEGER NOT NULL,
                PRIMARY KEY (symbol, id)
            );
            CREATE INDEX IF NOT EXISTS idx_trades_sym_time ON raw_trades (symbol, time);

            CREATE TABLE IF NOT EXISTS minute_slices (
                symbol TEXT NOT NULL,
                minute_time INTEGER NOT NULL,
                bucket_size REAL NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume REAL NOT NULL,
                delta REAL NOT NULL,
                min_delta REAL NOT NULL,
                max_delta REAL NOT NULL,
                trade_count INTEGER NOT NULL,
                poc REAL NOT NULL,
                levels_json TEXT NOT NULL,
                PRIMARY KEY (symbol, minute_time, bucket_size)
            );
            CREATE INDEX IF NOT EXISTS idx_slices_sym_min ON minute_slices (symbol, minute_time);

            CREATE TABLE IF NOT EXISTS sync_state (
                symbol TEXT PRIMARY KEY,
                last_trade_id INTEGER,
                last_trade_time INTEGER,
                last_backfill_time INTEGER
            );
        `);
    }

    public insertTrades(trades: StoredTrade[]): number {
        if (trades.length === 0) return 0;
        const insertStmt = this.db.prepare(`
            INSERT OR IGNORE INTO raw_trades (symbol, id, price, qty, time, is_buyer_maker)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const insertMany = this.db.transaction((items: StoredTrade[]) => {
            let insertedCount = 0;
            for (const t of items) {
                const res = insertStmt.run(t.symbol, t.id, t.price, t.qty, t.time, t.isBuyerMaker ? 1 : 0);
                if (res.changes > 0) insertedCount++;
            }
            return insertedCount;
        });

        return insertMany(trades);
    }

    public getRawTrades(symbol: string, fromTime: number, toTime: number): StoredTrade[] {
        const stmt = this.db.prepare(`
            SELECT symbol, id, price, qty, time, is_buyer_maker AS isBuyerMaker
            FROM raw_trades
            WHERE symbol = ? AND time >= ? AND time < ?
            ORDER BY time ASC, id ASC
        `);
        const rows = stmt.all(symbol, fromTime, toTime) as any[];
        return rows.map((r) => ({
            symbol: r.symbol,
            id: r.id,
            price: r.price,
            qty: r.qty,
            time: r.time,
            isBuyerMaker: Boolean(r.isBuyerMaker),
        }));
    }

    public saveMinuteSlice(bar: FootprintBar, bucketSize: number, tradeCount: number): void {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO minute_slices (
                symbol, minute_time, bucket_size, open, high, low, close,
                volume, delta, min_delta, max_delta, trade_count, poc, levels_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            bar.symbol,
            bar.time,
            bucketSize,
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.volume,
            bar.delta,
            bar.minDelta,
            bar.maxDelta,
            tradeCount,
            bar.poc,
            JSON.stringify(bar.levels),
        );
    }

    public getMinuteSlices(symbol: string, fromTime: number, toTime: number, bucketSize: number): FootprintBar[] {
        const stmt = this.db.prepare(`
            SELECT symbol, minute_time, open, high, low, close, volume, delta, min_delta, max_delta, poc, levels_json
            FROM minute_slices
            WHERE symbol = ? AND minute_time >= ? AND minute_time < ? AND bucket_size = ?
            ORDER BY minute_time ASC
        `);
        const rows = stmt.all(symbol, fromTime, toTime, bucketSize) as any[];
        return rows.map((r) => ({
            symbol: r.symbol,
            time: r.minute_time,
            timeframe: "1m",
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volume: r.volume,
            delta: r.delta,
            minDelta: r.min_delta,
            maxDelta: r.max_delta,
            poc: r.poc,
            levels: JSON.parse(r.levels_json) as PriceLevelVolume[],
        }));
    }

    public getSyncState(symbol: string): { lastTradeId?: number; lastTradeTime?: number; lastBackfillTime?: number } {
        const row = this.db.prepare(`SELECT last_trade_id, last_trade_time, last_backfill_time FROM sync_state WHERE symbol = ?`).get(symbol) as any;
        if (!row) return {};
        return {
            lastTradeId: row.last_trade_id ?? undefined,
            lastTradeTime: row.last_trade_time ?? undefined,
            lastBackfillTime: row.last_backfill_time ?? undefined,
        };
    }

    public updateSyncState(symbol: string, lastTradeId?: number, lastTradeTime?: number, lastBackfillTime?: number): void {
        const current = this.getSyncState(symbol);
        const newId = lastTradeId !== undefined ? Math.max(lastTradeId, current.lastTradeId ?? 0) : current.lastTradeId;
        const newTime = lastTradeTime !== undefined ? Math.max(lastTradeTime, current.lastTradeTime ?? 0) : current.lastTradeTime;
        const newBackfill = lastBackfillTime !== undefined ? Math.max(lastBackfillTime, current.lastBackfillTime ?? 0) : current.lastBackfillTime;

        this.db.prepare(`
            INSERT OR REPLACE INTO sync_state (symbol, last_trade_id, last_trade_time, last_backfill_time)
            VALUES (?, ?, ?, ?)
        `).run(symbol, newId ?? null, newTime ?? null, newBackfill ?? null);
    }

    public pruneRetention(retentionDays: number, maxDiskUsageMb: number, dbPath: string): void {
        const cutoffTime = Date.now() - retentionDays * 86400 * 1000;
        this.db.prepare(`DELETE FROM raw_trades WHERE time < ?`).run(cutoffTime);
        this.db.prepare(`DELETE FROM minute_slices WHERE minute_time < ?`).run(cutoffTime);

        try {
            const stats = fs.statSync(dbPath);
            const sizeMb = stats.size / (1024 * 1024);
            if (sizeMb > maxDiskUsageMb) {
                const aggressiveCutoff = Date.now() - Math.max(1, retentionDays - 2) * 86400 * 1000;
                this.db.prepare(`DELETE FROM raw_trades WHERE time < ?`).run(aggressiveCutoff);
                this.db.prepare(`DELETE FROM minute_slices WHERE minute_time < ?`).run(aggressiveCutoff);
                this.db.pragma("wal_checkpoint(TRUNCATE)");
            }
        } catch {
            // Ignore stat errors
        }
    }

    public close(): void {
        this.db.close();
    }
}
