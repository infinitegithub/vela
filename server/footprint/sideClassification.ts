export type AggressorSide = "buy" | "sell";

/**
 * Classifies an aggTrade taker side according to official Binance USD-M Futures documentation:
 * Field m = buyer is maker.
 *   - m === true  => Maker was buyer (passive bid). Taker was seller => Aggressive SELL (hits bid).
 *   - m === false => Maker was seller (passive ask). Taker was buyer => Aggressive BUY (lifts ask).
 */
export function classifyTradeSide(isBuyerMaker: boolean): AggressorSide {
    return isBuyerMaker ? "sell" : "buy";
}

export function isAggressiveBuy(isBuyerMaker: boolean): boolean {
    return !isBuyerMaker;
}

export function isAggressiveSell(isBuyerMaker: boolean): boolean {
    return isBuyerMaker;
}
