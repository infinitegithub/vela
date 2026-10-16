/**
 * Decimal precision of a numerical step.
 */
export function getPrecision(step: number): number {
    const s = step.toString();
    const dot = s.indexOf(".");
    return dot >= 0 ? s.length - dot - 1 : 0;
}

/**
 * Quantizes a price to its discrete bucket level using floor binning [P_k, P_k + bucketSize).
 * Example: with bucketSize = 1.0, 67420.25 -> 67420.0, 67420.99 -> 67420.0.
 * Includes epsilon 1e-9 to avoid negative float truncation issues (e.g. 67500.0 / 0.1 = 674999.9999999999).
 */
export function quantizeToBucket(price: number, bucketSize: number): number {
    if (bucketSize <= 0) return price;
    const precision = Math.max(0, getPrecision(bucketSize));
    const factor = Math.floor(price / bucketSize + 1e-9);
    return Number((factor * bucketSize).toFixed(precision));
}

/**
 * Resolves the effective bucket size for a symbol given symbol tick size and multiplier.
 */
export function resolveBucketSize(tickSize: number, multiplier: number = 1): number {
    const raw = tickSize * Math.max(1, multiplier);
    const precision = Math.max(0, getPrecision(tickSize));
    return Number(raw.toFixed(precision));
}
