import { FootprintStorage } from '../server/footprint/storage';
import { DEFAULT_CONFIG } from '../server/footprint/config';
import { resolveBucketSize } from '../server/footprint/bucketing';
import { queryFootprintBars } from '../server/footprint/api';

function runDeltaSanityCheck() {
    console.log('================================================================================');
    console.log('ACCEPTANCE CHECK 2: Delta Sanity & Non-Constant Ratio Verification');
    console.log('Verifying natural delta sign variation, delta/volume distribution, and intrabar bounds');
    console.log('================================================================================\n');

    const storage = new FootprintStorage('./footprint-data/footprint.db');
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

    let allPassed = true;

    for (const symbol of symbols) {
        console.log(`\n--------------------------------------------------------------------------------`);
        console.log(`Symbol: ${symbol} (1m timeframes)`);
        console.log(`--------------------------------------------------------------------------------`);

        const res = queryFootprintBars(storage, DEFAULT_CONFIG, {
            symbol,
            timeframe: '1m',
        });

        const bars = res.bars;
        if (bars.length < 5) {
            console.error(`ERROR: Not enough bars found for ${symbol} (found ${bars.length})`);
            allPassed = false;
            continue;
        }

        console.log(
            'Bar Time (UTC)'.padEnd(22) +
            'Volume'.padStart(14) +
            'Bid Vol'.padStart(14) +
            'Ask Vol'.padStart(14) +
            'Delta'.padStart(12) +
            'Min Delta'.padStart(12) +
            'Max Delta'.padStart(12) +
            'Delta/Vol'.padStart(12) +
            'Sign'.padStart(6)
        );
        console.log('-'.repeat(108));

        let positiveCount = 0;
        let negativeCount = 0;
        let zeroCount = 0;
        const deltaRatios: number[] = [];

        for (const b of bars) {
            let totalBid = 0;
            let totalAsk = 0;
            for (const lvl of b.levels) {
                totalBid += lvl.bidVolume;
                totalAsk += lvl.askVolume;
            }

            // Invariant checks
            const calcDelta = totalAsk - totalBid;
            const deltaDiff = Math.abs(b.delta - calcDelta);
            if (deltaDiff > 1e-4) {
                console.error(`Delta discrepancy in bar ${b.time}: stored=${b.delta}, calc=${calcDelta}`);
                allPassed = false;
            }

            if (Math.abs(b.delta) > b.volume + 1e-4) {
                console.error(`|Delta| exceeds volume in bar ${b.time}: delta=${b.delta}, vol=${b.volume}`);
                allPassed = false;
            }

            if (b.minDelta > b.delta + 1e-4 || b.maxDelta < b.delta - 1e-4) {
                console.error(`Intrabar delta bounds violation in bar ${b.time}: min=${b.minDelta}, max=${b.maxDelta}, delta=${b.delta}`);
                allPassed = false;
            }

            if (b.delta > 0) positiveCount++;
            else if (b.delta < 0) negativeCount++;
            else zeroCount++;

            const ratio = b.volume > 0 ? b.delta / b.volume : 0;
            deltaRatios.push(ratio);

            const iso = new Date(b.time).toISOString().replace('T', ' ').substring(0, 19);
            const signStr = b.delta > 0 ? '+BUY' : b.delta < 0 ? '-SELL' : ' 0';
            console.log(
                iso.padEnd(22) +
                b.volume.toFixed(3).padStart(14) +
                totalBid.toFixed(3).padStart(14) +
                totalAsk.toFixed(3).padStart(14) +
                b.delta.toFixed(3).padStart(12) +
                b.minDelta.toFixed(3).padStart(12) +
                b.maxDelta.toFixed(3).padStart(12) +
                ratio.toFixed(4).padStart(12) +
                signStr.padStart(6)
            );
        }

        // Statistical analysis of Delta/Volume ratio
        const meanRatio = deltaRatios.reduce((acc, r) => acc + r, 0) / deltaRatios.length;
        const variance = deltaRatios.reduce((acc, r) => acc + Math.pow(r - meanRatio, 2), 0) / deltaRatios.length;
        const stdDev = Math.sqrt(variance);
        const minRatio = Math.min(...deltaRatios);
        const maxRatio = Math.max(...deltaRatios);

        console.log(`\nStatistical Sanity Analysis for ${symbol}:`);
        console.log(`  Total Bars Evaluated   : ${bars.length}`);
        console.log(`  Positive Delta Bars    : ${positiveCount} (${((positiveCount / bars.length) * 100).toFixed(1)}%)`);
        console.log(`  Negative Delta Bars    : ${negativeCount} (${((negativeCount / bars.length) * 100).toFixed(1)}%)`);
        console.log(`  Zero Delta Bars        : ${zeroCount}`);
        console.log(`  Delta/Volume Min Ratio : ${minRatio.toFixed(4)}`);
        console.log(`  Delta/Volume Max Ratio : ${maxRatio.toFixed(4)}`);
        console.log(`  Delta/Volume Mean Ratio: ${meanRatio.toFixed(4)}`);
        console.log(`  Delta/Volume Std Dev   : ${stdDev.toFixed(4)}`);

        // Criteria:
        // 1. Both positive and negative delta must exist across bars (natural two-way market flow)
        // 2. StdDev of ratio must be significant (> 0.05), proving ratio is NOT constant or hardcoded
        // 3. |minRatio| and maxRatio must demonstrate real variation
        const hasBothSigns = positiveCount > 0 && negativeCount > 0;
        const isNonConstant = stdDev > 0.05 && (maxRatio - minRatio) > 0.1;

        console.log(`  Check: Sign Variations  -> ${hasBothSigns ? 'PASSED (Two-way orderflow detected)' : 'FAILED'}`);
        console.log(`  Check: Non-constant R   -> ${isNonConstant ? 'PASSED (Real dynamic orderflow ratio)' : 'FAILED'}`);

        if (!hasBothSigns || !isNonConstant) {
            allPassed = false;
        }
    }

    console.log('\n================================================================================');
    if (allPassed) {
        console.log('VERDICT: CHECK 2 PASSED - Delta Varies Naturally with Real Market Orderflow\n');
        process.exit(0);
    } else {
        console.error('VERDICT: CHECK 2 FAILED\n');
        process.exit(1);
    }
}

try {
    runDeltaSanityCheck();
} catch (err) {
    console.error('FATAL in acceptance check 2:', err);
    process.exit(1);
}
