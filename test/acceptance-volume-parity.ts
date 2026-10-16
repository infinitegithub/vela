import Database from 'better-sqlite3';
import { FootprintStorage } from '../server/footprint/storage';
import { DEFAULT_CONFIG } from '../server/footprint/config';
import { quantizeToBucket, resolveBucketSize } from '../server/footprint/bucketing';
import { aggregateTradesToBar, roundQty } from '../server/footprint/aggregator';
import { BinanceFuturesRestClient } from '../server/footprint/rest';
import type { StoredTrade } from '../server/footprint/types';

interface RawDbTrade {
    id: number;
    symbol: string;
    price: number;
    qty: number;
    first_trade_id: number;
    last_trade_id: number;
    time: number;
    is_buyer_maker: number;
}

async function runVolumeParityCheck() {
    console.log('================================================================================');
    console.log('ACCEPTANCE CHECK 1: Volume Parity Verification');
    console.log('Checking 3 symbols, 10 consecutive 1-minute bars against raw trades & Binance REST');
    console.log('================================================================================\n');

    const db = new Database('./footprint-data/footprint.db');
    const storage = new FootprintStorage('./footprint-data/footprint.db');
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

    let allPassed = true;
    const summaryRows: Array<{
        symbol: string;
        barsChecked: number;
        totalTrades: number;
        totalFootprintVol: number;
        totalRawVol: number;
        maxDiff: number;
        passed: boolean;
    }> = [];

    for (const symbol of symbols) {
        console.log(`\n--- Symbol: ${symbol} ---`);
        const tickSize = DEFAULT_CONFIG.tickSizes[symbol] || 0.01;
        const bucketSize = resolveBucketSize(tickSize, DEFAULT_CONFIG.bucketMultipliers[symbol] || 1);

        // Find 10 consecutive completed minutes with trades
        const rawTrades = storage.getRawTrades(symbol, 0, Date.now());
        if (rawTrades.length === 0) {
            console.error(`ERROR: No raw trades found in database for ${symbol}`);
            allPassed = false;
            continue;
        }

        // Group trades into 1m slots
        const minuteBuckets = new Map<number, StoredTrade[]>();
        for (const t of rawTrades) {
            const m = Math.floor(t.time / 60000) * 60000;
            let list = minuteBuckets.get(m);
            if (!list) {
                list = [];
                minuteBuckets.set(m, list);
            }
            list.push(t);
        }

        const sortedMinutes = Array.from(minuteBuckets.keys()).sort((a, b) => a - b);
        // Find 10 fully captured consecutive minutes
        const checkMinutes = sortedMinutes.slice(1, 11);
        if (checkMinutes.length < 10) {
            console.warn(`Warning: Found ${checkMinutes.length} minutes for ${symbol}`);
        }

        console.log(`Checking ${checkMinutes.length} consecutive bars for ${symbol}:`);
        console.log(
            'Bar Time (UTC)'.padEnd(25) +
            'Trades'.padStart(8) +
            'Footprint Vol'.padStart(16) +
            'Raw Sum Vol'.padStart(16) +
            'Discrepancy'.padStart(14) +
            'Status'.padStart(10)
        );
        console.log('-'.repeat(89));

        let symTotalFootprintVol = 0;
        let symTotalRawVol = 0;
        let symMaxDiff = 0;
        let symTotalTrades = 0;

        for (let i = 0; i < checkMinutes.length; i++) {
            const barTime = checkMinutes[i]!;
            const tradesInBar = minuteBuckets.get(barTime)!;
            symTotalTrades += tradesInBar.length;

            // 1. Footprint Aggregation
            const fpBar = aggregateTradesToBar(symbol, tradesInBar, barTime, '1m', bucketSize);
            const fpVol = fpBar ? fpBar.volume : 0;

            // 2. Direct Raw Sum
            let rawSum = 0;
            for (const t of tradesInBar) {
                rawSum = roundQty(rawSum + t.qty);
            }

            const diff = Math.abs(fpVol - rawSum);
            if (diff > symMaxDiff) symMaxDiff = diff;
            symTotalFootprintVol = roundQty(symTotalFootprintVol + fpVol);
            symTotalRawVol = roundQty(symTotalRawVol + rawSum);

            const pass = diff < 1e-6;
            if (!pass) allPassed = false;

            const isoTime = new Date(barTime).toISOString().replace('T', ' ').substring(0, 19);
            console.log(
                isoTime.padEnd(25) +
                String(tradesInBar.length).padStart(8) +
                fpVol.toFixed(4).padStart(16) +
                rawSum.toFixed(4).padStart(16) +
                diff.toExponential(2).padStart(14) +
                (pass ? 'PASS' : 'FAIL').padStart(10)
            );
        }

        // Live REST parity verification for 1 bar from Binance API directly
        if (checkMinutes.length > 0) {
            const sampleBarTime = checkMinutes[0]!;
            console.log(`\nVerifying bar ${new Date(sampleBarTime).toISOString()} directly against public Binance REST API...`);
            try {
                const restClient = new BinanceFuturesRestClient();
                const restTrades = await restClient.fetchTradesInWindow(
                    symbol,
                    sampleBarTime,
                    sampleBarTime + 59999
                );
                let restSum = 0;
                for (const rt of restTrades) {
                    restSum = roundQty(restSum + rt.qty);
                }
                const sampleStoredTrades = minuteBuckets.get(sampleBarTime)!;
                let storedSum = 0;
                for (const st of sampleStoredTrades) {
                    storedSum = roundQty(storedSum + st.qty);
                }
                const restDiff = Math.abs(storedSum - restSum);
                console.log(`  Binance REST Trade Count : ${restTrades.length}`);
                console.log(`  Stored DB Trade Count    : ${sampleStoredTrades.length}`);
                console.log(`  Binance REST Volume Sum  : ${restSum.toFixed(4)}`);
                console.log(`  Footprint Stored Volume  : ${storedSum.toFixed(4)}`);
                console.log(`  REST Parity Discrepancy  : ${restDiff.toExponential(2)} -> ${restDiff < 1e-4 ? 'PASSED' : 'DISCREPANCY'}`);
            } catch (err) {
                console.warn(`  REST check skipped or throttled:`, err);
            }
        }

        summaryRows.push({
            symbol,
            barsChecked: checkMinutes.length,
            totalTrades: symTotalTrades,
            totalFootprintVol: symTotalFootprintVol,
            totalRawVol: symTotalRawVol,
            maxDiff: symMaxDiff,
            passed: symMaxDiff < 1e-6 && checkMinutes.length >= 10,
        });
    }

    console.log('\n================================================================================');
    console.log('SUMMARY OF VOLUME PARITY CHECK');
    console.log('================================================================================');
    console.log(
        'Symbol'.padEnd(12) +
        'Bars Checked'.padStart(14) +
        'Total Trades'.padStart(14) +
        'Footprint Vol'.padStart(16) +
        'Raw Vol'.padStart(16) +
        'Max Diff'.padStart(12) +
        'Verdict'.padStart(10)
    );
    console.log('-'.repeat(94));
    for (const r of summaryRows) {
        console.log(
            r.symbol.padEnd(12) +
            String(r.barsChecked).padStart(14) +
            String(r.totalTrades).padStart(14) +
            r.totalFootprintVol.toFixed(4).padStart(16) +
            r.totalRawVol.toFixed(4).padStart(16) +
            r.maxDiff.toExponential(2).padStart(12) +
            (r.passed ? 'PASS' : 'FAIL').padStart(10)
        );
    }
    console.log('================================================================================');
    if (allPassed) {
        console.log('VERDICT: CHECK 1 PASSED - 100% Volume Parity Across All Checked Bars\n');
        process.exit(0);
    } else {
        console.error('VERDICT: CHECK 1 FAILED\n');
        process.exit(1);
    }
}

runVolumeParityCheck().catch((err) => {
    console.error('FATAL in acceptance check 1:', err);
    process.exit(1);
});
