export interface RawAggTrade {
    a: number;          // Aggregate trade ID
    p: string;          // Price
    q: string;          // Quantity
    f?: number;         // First trade ID
    l?: number;         // Last trade ID
    T: number;          // Trade time in epoch ms
    m: boolean;         // Buyer is maker (m=true -> taker is seller -> hit bid; m=false -> taker is buyer -> lift ask)
}

export interface StoredTrade {
    symbol: string;
    id: number;
    price: number;
    qty: number;
    time: number;
    isBuyerMaker: boolean;
}

export interface PriceLevelVolume {
    price: number;
    bidVolume: number;
    askVolume: number;
    totalVolume: number;
    delta: number;
    tradeCount: number;
}

export interface FootprintBar {
    symbol: string;
    time: number;       // Epoch ms of bar open
    timeframe: string;  // 1m, 5m, 15m, 1h, etc.
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    delta: number;
    minDelta: number;
    maxDelta: number;
    cumDelta?: number;
    poc: number;
    levels: PriceLevelVolume[];
}

export interface FootprintConfig {
    symbols: string[];
    dbPath: string;
    host: string;
    port: number;
    retentionDays: number;
    maxDiskUsageMb: number;
    tickSizes: Record<string, number>;
    bucketMultipliers: Record<string, number>;
}
