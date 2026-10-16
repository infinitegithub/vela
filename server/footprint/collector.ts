import { loadConfig } from './config';
import { FootprintStorage } from './storage';
import { BinanceFuturesRestClient } from './rest';
import { BinanceFuturesStream } from './stream';
import { resolveBucketSize } from './bucketing';
import { aggregateTradesToBar } from './aggregator';

async function main() {
    console.log('[Collector] Initializing Footprint Data Pipeline...');
    const config = loadConfig();

    const storage = new FootprintStorage(config.dbPath);
    const restClient = new BinanceFuturesRestClient();

    const bucketSizes: Record<string, number> = {};
    for (const sym of config.symbols) {
        const tick = config.tickSizes[sym] || 0.01;
        const mult = config.bucketMultipliers[sym] || 1;
        bucketSizes[sym] = resolveBucketSize(tick, mult);
        console.log(`[Collector] Symbol ${sym}: tick=${tick}, mult=${mult} -> bucketSize=${bucketSizes[sym]}`);
    }

    const now = Date.now();
    const oneHourAgo = now - 3600000;
    console.log('[Collector] Seeding initial history for configured symbols from REST (1 hour window)...');
    for (const sym of config.symbols) {
        try {
            const syncState = storage.getSyncState(sym);
            const fromTime = syncState.lastTradeTime ? Math.max(syncState.lastTradeTime, oneHourAgo) : oneHourAgo;
            console.log(`[Collector] Fetching REST trades for ${sym} from ${new Date(fromTime).toISOString()} to ${new Date(now).toISOString()}...`);
            const trades = await restClient.fetchTradesInWindow(sym, fromTime, now);
            if (trades.length > 0) {
                storage.insertTrades(trades);
                storage.updateSyncState(sym, trades[trades.length - 1].id, trades[trades.length - 1].time, now);
                console.log(`[Collector] Inserted ${trades.length} initial trades for ${sym}`);

                const bucketSize = bucketSizes[sym];
                let minTime = Math.floor(trades[0].time / 60000) * 60000;
                const maxTime = Math.floor(trades[trades.length - 1].time / 60000) * 60000;
                let currentMinute = minTime;

                while (currentMinute <= maxTime) {
                    const nextMinute = currentMinute + 60000;
                    const minTrades = trades.filter((t) => t.time >= currentMinute && t.time < nextMinute);
                    if (minTrades.length > 0) {
                        const bar = aggregateTradesToBar(sym, minTrades, currentMinute, '1m', bucketSize);
                        if (bar) {
                            storage.saveMinuteSlice(bar, bucketSize, minTrades.length);
                        }
                    }
                    currentMinute = nextMinute;
                }
            }
        } catch (err) {
            console.error(`[Collector] Failed to fetch initial trades for ${sym}:`, err);
        }
    }

    const stream = new BinanceFuturesStream(config.symbols, storage, restClient, bucketSizes, {
        onTrade: (_t) => {},
        onSliceCompleted: (bar) => {
            console.log(`[Collector] 1m slice completed: ${bar.symbol} @ ${new Date(bar.time).toISOString()} | Vol: ${bar.volume} | Delta: ${bar.delta} | Levels: ${bar.levels.length}`);
        },
    });

    stream.start();

    const pruneTimer = setInterval(() => {
        console.log('[Collector] Running retention pruning...');
        storage.pruneRetention(config.retentionDays, config.maxDiskUsageMb, config.dbPath);
    }, 6 * 3600 * 1000);

    storage.pruneRetention(config.retentionDays, config.maxDiskUsageMb, config.dbPath);

    const shutdown = () => {
        console.log('[Collector] Shutting down cleanly...');
        clearInterval(pruneTimer);
        stream.stop();
        storage.close();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log('[Collector] Footprint Data Pipeline is ACTIVE and running on 127.0.0.1.');
}

main().catch((err) => {
    console.error('[Collector] Fatal error:', err);
    process.exit(1);
});
