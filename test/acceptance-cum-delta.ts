import { FootprintStorage } from '../server/footprint/storage';
import { DEFAULT_CONFIG } from '../server/footprint/config';
import { queryFootprintBars } from '../server/footprint/api';
import { roundQty } from '../server/footprint/aggregator';

function runCumDeltaCheck() {
    console.log('================================================================================');
    console.log('ACCEPTANCE CHECK 3: Cumulative Delta Running Sum Invariant Verification');
    console.log('Verifying cumDelta === sum(bar.delta from start to current bar) across timeframes');
    console.log('================================================================================\n');

    const storage = new FootprintStorage('./footprint-data/footprint.db');
    const testCases = [
        { symbol: 'BTCUSDT', tf: '1m' },
        { symbol: 'BTCUSDT', tf: '5m' },
        { symbol: 'BTCUSDT', tf: '15m' },
        { symbol: 'ETHUSDT', tf: '1m' },
        { symbol: 'ETHUSDT', tf: '5m' },
        { symbol: 'SOLUSDT', tf: '1m' },
        { symbol: 'SOLUSDT', tf: '15m' },
    ];

    let allPassed = true;

    for (const tc of testCases) {
        console.log(`\n--- Symbol: ${tc.symbol} | Timeframe: ${tc.tf} ---`);

        const res = queryFootprintBars(storage, DEFAULT_CONFIG, {
            symbol: tc.symbol,
            timeframe: tc.tf,
        });

        const bars = res.bars;
        if (bars.length === 0) {
            console.error(`ERROR: No bars returned for ${tc.symbol} ${tc.tf}`);
            allPassed = false;
            continue;
        }

        console.log(
            'Bar Time (UTC)'.padEnd(22) +
            'Volume'.padStart(14) +
            'Bar Delta'.padStart(14) +
            'Running Sum'.padStart(16) +
            'Bar Cum Delta'.padStart(16) +
            'Discrepancy'.padStart(14) +
            'Status'.padStart(10)
        );
        console.log('-'.repeat(106));

        let runningSum = 0;
        let maxDiff = 0;

        for (let i = 0; i < bars.length; i++) {
            const b = bars[i]!;
            runningSum = roundQty(runningSum + b.delta);
            const barCumDelta = b.cumDelta ?? 0;
            const diff = Math.abs(barCumDelta - runningSum);
            if (diff > maxDiff) maxDiff = diff;

            const pass = diff < 1e-6;
            if (!pass) allPassed = false;

            const iso = new Date(b.time).toISOString().replace('T', ' ').substring(0, 19);
            // Print every bar if <= 15 bars, else first 5 and last 5
            if (bars.length <= 15 || i < 5 || i >= bars.length - 5) {
                console.log(
                    iso.padEnd(22) +
                    b.volume.toFixed(3).padStart(14) +
                    b.delta.toFixed(3).padStart(14) +
                    runningSum.toFixed(3).padStart(16) +
                    barCumDelta.toFixed(3).padStart(16) +
                    diff.toExponential(2).padStart(14) +
                    (pass ? 'PASS' : 'FAIL').padStart(10)
                );
            } else if (i === 5) {
                console.log('...'.padStart(20) + ` [${bars.length - 10} intermediate bars verified identically] ` + '...'.padStart(20));
            }
        }

        console.log(`Result for ${tc.symbol} ${tc.tf}: ${bars.length} bars checked, Max Discrepancy: ${maxDiff.toExponential(2)} -> ${maxDiff < 1e-6 ? 'PASS' : 'FAIL'}`);
    }

    console.log('\n================================================================================');
    if (allPassed) {
        console.log('VERDICT: CHECK 3 PASSED - Cum Delta Strictly Equals Running Sum of Deltas\n');
        process.exit(0);
    } else {
        console.error('VERDICT: CHECK 3 FAILED\n');
        process.exit(1);
    }
}

try {
    runCumDeltaCheck();
} catch (err) {
    console.error('FATAL in acceptance check 3:', err);
    process.exit(1);
}
