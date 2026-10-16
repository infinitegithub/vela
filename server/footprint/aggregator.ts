import type { FootprintBar, PriceLevelVolume, StoredTrade } from "./types";
import { quantizeToBucket } from "./bucketing";

export function roundQty(qty: number): number {
    return Number(qty.toFixed(8));
}

export function aggregateTradesToBar(
    symbol: string,
    trades: StoredTrade[],
    barTime: number,
    timeframe: string,
    bucketSize: number,
): FootprintBar | null {
    if (trades.length === 0) return null;

    const firstTrade = trades[0]!;
    const lastTrade = trades[trades.length - 1]!;
    let open = firstTrade.price;
    let high = -Infinity;
    let low = Infinity;
    let close = lastTrade.price;
    let totalVolume = 0;
    let totalDelta = 0;
    let runningDelta = 0;
    let minDelta = 0;
    let maxDelta = 0;

    const levelsMap = new Map<number, PriceLevelVolume>();

    for (const t of trades) {
        if (t.price > high) high = t.price;
        if (t.price < low) low = t.price;

        const bucketPrice = quantizeToBucket(t.price, bucketSize);
        let lvl = levelsMap.get(bucketPrice);
        if (!lvl) {
            lvl = {
                price: bucketPrice,
                bidVolume: 0,
                askVolume: 0,
                totalVolume: 0,
                delta: 0,
                tradeCount: 0,
            };
            levelsMap.set(bucketPrice, lvl);
        }

        lvl.tradeCount += 1;
        lvl.totalVolume = roundQty(lvl.totalVolume + t.qty);
        totalVolume = roundQty(totalVolume + t.qty);

        if (t.isBuyerMaker) {
            // Aggressive SELL (hits bid)
            lvl.bidVolume = roundQty(lvl.bidVolume + t.qty);
            runningDelta = roundQty(runningDelta - t.qty);
            totalDelta = roundQty(totalDelta - t.qty);
        } else {
            // Aggressive BUY (lifts ask)
            lvl.askVolume = roundQty(lvl.askVolume + t.qty);
            runningDelta = roundQty(runningDelta + t.qty);
            totalDelta = roundQty(totalDelta + t.qty);
        }

        lvl.delta = roundQty(lvl.askVolume - lvl.bidVolume);

        if (runningDelta < minDelta) minDelta = runningDelta;
        if (runningDelta > maxDelta) maxDelta = runningDelta;
    }

    const levels = Array.from(levelsMap.values()).sort((a, b) => b.price - a.price);

    let poc = levels[0]?.price ?? open;
    let maxVol = -1;
    for (const lvl of levels) {
        if (lvl.totalVolume > maxVol) {
            maxVol = lvl.totalVolume;
            poc = lvl.price;
        }
    }

    return {
        symbol,
        time: barTime,
        timeframe,
        open,
        high,
        low,
        close,
        volume: totalVolume,
        delta: totalDelta,
        minDelta,
        maxDelta,
        poc,
        levels,
    };
}

export function mergeMinuteSlices(
    slices: FootprintBar[],
    symbol: string,
    barTime: number,
    timeframe: string,
): FootprintBar | null {
    if (slices.length === 0) return null;

    const firstSlice = slices[0]!;
    const lastSlice = slices[slices.length - 1]!;
    const open = firstSlice.open;
    let high = -Infinity;
    let low = Infinity;
    const close = lastSlice.close;
    let totalVolume = 0;
    let totalDelta = 0;

    let runningOffset = 0;
    let minDelta = 0;
    let maxDelta = 0;

    const levelsMap = new Map<number, PriceLevelVolume>();

    for (const slice of slices) {
        if (slice.high > high) high = slice.high;
        if (slice.low < low) low = slice.low;

        totalVolume = roundQty(totalVolume + slice.volume);

        const sliceMinDeltaAcross = roundQty(runningOffset + slice.minDelta);
        const sliceMaxDeltaAcross = roundQty(runningOffset + slice.maxDelta);
        if (sliceMinDeltaAcross < minDelta) minDelta = sliceMinDeltaAcross;
        if (sliceMaxDeltaAcross > maxDelta) maxDelta = sliceMaxDeltaAcross;

        runningOffset = roundQty(runningOffset + slice.delta);
        totalDelta = roundQty(totalDelta + slice.delta);

        for (const lvl of slice.levels) {
            let merged = levelsMap.get(lvl.price);
            if (!merged) {
                merged = {
                    price: lvl.price,
                    bidVolume: 0,
                    askVolume: 0,
                    totalVolume: 0,
                    delta: 0,
                    tradeCount: 0,
                };
                levelsMap.set(lvl.price, merged);
            }
            merged.bidVolume = roundQty(merged.bidVolume + lvl.bidVolume);
            merged.askVolume = roundQty(merged.askVolume + lvl.askVolume);
            merged.totalVolume = roundQty(merged.totalVolume + lvl.totalVolume);
            merged.tradeCount += lvl.tradeCount;
            merged.delta = roundQty(merged.askVolume - merged.bidVolume);
        }
    }

    const levels = Array.from(levelsMap.values()).sort((a, b) => b.price - a.price);

    let poc = levels[0]?.price ?? open;
    let maxVol = -1;
    for (const lvl of levels) {
        if (lvl.totalVolume > maxVol) {
            maxVol = lvl.totalVolume;
            poc = lvl.price;
        }
    }

    return {
        symbol,
        time: barTime,
        timeframe,
        open,
        high,
        low,
        close,
        volume: totalVolume,
        delta: totalDelta,
        minDelta,
        maxDelta,
        poc,
        levels,
    };
}
