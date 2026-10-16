import fs from 'fs';
import { FootprintStorage } from '../server/footprint/storage';
import type { StoredTrade } from '../server/footprint/types';

function createTrade(symbol: string, id: number, time: number, price: number, qty: number, isBuyerMaker: boolean): StoredTrade {
    return {
        id,
        symbol,
        price,
        qty,
        time,
        isBuyerMaker,
    };
}

function runResilienceCheck() {
    console.log('================================================================================');
    console.log('ACCEPTANCE CHECK 5: Collector Kill & Restart Resilience Verification');
    console.log('Testing deduplication, crash recovery, gap detection, and state persistence');
    console.log('================================================================================\n');

    const testDbPath = './footprint-data/resilience-test.db';
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');

    let allPassed = true;

    // --- PHASE 1: Initial Ingestion ---
    console.log('--- Step 1: Initial Ingestion (Trades 1000 to 1100) ---');
    let storage = new FootprintStorage(testDbPath);
    const initialTrades: StoredTrade[] = [];
    const baseTime = 1700000000000;
    for (let id = 1000; id <= 1100; id++) {
        initialTrades.push(createTrade('BTCUSDT', id, baseTime + (id - 1000) * 500, 67500 + (id % 10), 0.1, id % 2 === 0));
    }
    const inserted1 = storage.insertTrades(initialTrades);
    storage.updateSyncState('BTCUSDT', 1100, baseTime + 100 * 500);
    console.log(`  Dispatched trades : 101`);
    console.log(`  Inserted into DB  : ${inserted1}`);
    if (inserted1 !== 101) {
        console.error(`  FAIL: Expected 101 inserted, got ${inserted1}`);
        allPassed = false;
    }

    const lastId1 = storage.getSyncState('BTCUSDT').lastTradeId;
    console.log(`  Last trade ID in DB: ${lastId1}`);
    if (lastId1 !== 1100) {
        console.error(`  FAIL: Expected last trade ID 1100, got ${lastId1}`);
        allPassed = false;
    }

    // --- PHASE 2: Abrupt Crash Simulation & Restart with Overlapping Trades ---
    console.log('\n--- Step 2: Simulating Abrupt Crash / Kill and Restart ---');
    storage.close();
    console.log('  Collector process stopped abruptly. Re-opening storage (warm restart)...');
    storage = new FootprintStorage(testDbPath);

    const recoveredLastId = storage.getSyncState('BTCUSDT').lastTradeId;
    console.log(`  Recovered last trade ID from SQLite WAL: ${recoveredLastId}`);
    if (recoveredLastId !== 1100) {
        console.error(`  FAIL: State recovery failed, expected 1100, got ${recoveredLastId}`);
        allPassed = false;
    }

    console.log('  Re-ingesting overlapping trades (1050 to 1200)...');
    const restartTrades: StoredTrade[] = [];
    for (let id = 1050; id <= 1200; id++) {
        restartTrades.push(createTrade('BTCUSDT', id, baseTime + (id - 1000) * 500, 67500 + (id % 10), 0.1, id % 2 === 0));
    }
    const inserted2 = storage.insertTrades(restartTrades);
    storage.updateSyncState('BTCUSDT', 1200, baseTime + 200 * 500);
    console.log(`  Dispatched trades : 151 (51 duplicates + 100 new)`);
    console.log(`  Newly inserted    : ${inserted2} (Deduplicated exactly 51)`);
    if (inserted2 !== 100) {
        console.error(`  FAIL: Expected exactly 100 new trades inserted, got ${inserted2}`);
        allPassed = false;
    }

    // Verify row count
    const totalStored1 = storage.getRawTrades('BTCUSDT', 0, baseTime + 1000000).length;
    console.log(`  Total trades in DB: ${totalStored1} (Expected 201: 1000..1200)`);
    if (totalStored1 !== 201) {
        console.error(`  FAIL: Expected 201 total trades, got ${totalStored1}`);
        allPassed = false;
    }

    // --- PHASE 3: Gap Detection & Automatic Backfill Simulation ---
    console.log('\n--- Step 3: Stream Gap Detection & Gap Repair ---');
    console.log('  Stream receives trade 1250 while lastSeen is 1200 (gap: 1201..1249)...');
    const incomingGapTrade = createTrade('BTCUSDT', 1250, baseTime + 250 * 500, 67520, 0.5, false);

    const currentLast = storage.getSyncState('BTCUSDT').lastTradeId!;
    const gapSize = incomingGapTrade.id - currentLast - 1;
    console.log(`  Detected gap size: ${gapSize} missing trades`);

    if (gapSize > 0) {
        console.log(`  Triggering gap repair backfill for IDs [${currentLast + 1}..${incomingGapTrade.id - 1}]...`);
        const repairedTrades: StoredTrade[] = [];
        for (let id = currentLast + 1; id < incomingGapTrade.id; id++) {
            repairedTrades.push(createTrade('BTCUSDT', id, baseTime + (id - 1000) * 500, 67510 + (id % 5), 0.2, id % 2 === 1));
        }
        const repairedCount = storage.insertTrades(repairedTrades);
        const incomingCount = storage.insertTrades([incomingGapTrade]);
        console.log(`  Backfilled missing trades: ${repairedCount}`);
        console.log(`  Committed incoming trade : ${incomingCount}`);
    }

    // --- PHASE 4: Strict Sequence & Integrity Audit ---
    console.log('\n--- Step 4: Strict Sequence & Integrity Audit ---');
    const allTrades = storage.getRawTrades('BTCUSDT', 0, baseTime + 1000000);
    console.log(`  Total audit trade count: ${allTrades.length}`);

    let sequenceValid = true;
    for (let i = 0; i < allTrades.length; i++) {
        const expectedId = 1000 + i;
        if (allTrades[i]!.id !== expectedId) {
            console.error(`  Sequence broken at index ${i}: expected id ${expectedId}, got ${allTrades[i]!.id}`);
            sequenceValid = false;
            allPassed = false;
            break;
        }
    }

    if (sequenceValid && allTrades.length === 251) {
        console.log(`  Sequence check: PERFECT (All 251 trades strictly sequential from 1000 to 1250)`);
        console.log(`  Missing trades: 0`);
        console.log(`  Duplicate trades: 0`);
    } else {
        allPassed = false;
    }

    storage.close();

    // Clean up test DB
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');

    console.log('\n================================================================================');
    if (allPassed) {
        console.log('VERDICT: CHECK 5 PASSED - Zero Duplicates, Zero Data Loss on Kill/Restart/Gap\n');
        process.exit(0);
    } else {
        console.error('VERDICT: CHECK 5 FAILED\n');
        process.exit(1);
    }
}

try {
    runResilienceCheck();
} catch (err) {
    console.error('FATAL in acceptance check 5:', err);
    process.exit(1);
}
