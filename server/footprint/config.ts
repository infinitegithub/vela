import type { FootprintConfig } from "./types";
import path from "path";

export const DEFAULT_CONFIG: FootprintConfig = {
    symbols: ["BTCUSDT", "ETHUSDT", "AVAXUSDT", "SOLUSDT", "BNBUSDT"],
    dbPath: path.resolve(process.cwd(), "footprint-data/footprint.db"),
    host: "127.0.0.1",
    port: 3101,
    retentionDays: 7,
    maxDiskUsageMb: 2048,
    tickSizes: {
        BTCUSDT: 0.10,
        ETHUSDT: 0.01,
        BNBUSDT: 0.01,
        SOLUSDT: 0.01,
        AVAXUSDT: 0.001,
    },
    bucketMultipliers: {
        BTCUSDT: 10,  // Default .00
        ETHUSDT: 10,  // Default bash.10
        BNBUSDT: 10,  // Default bash.10
        SOLUSDT: 10,  // Default bash.10
        AVAXUSDT: 10, // Default bash.01
    },
};

export function loadConfig(overrides?: Partial<FootprintConfig>): FootprintConfig {
    return {
        ...DEFAULT_CONFIG,
        ...(overrides || {}),
        tickSizes: { ...DEFAULT_CONFIG.tickSizes, ...(overrides?.tickSizes || {}) },
        bucketMultipliers: { ...DEFAULT_CONFIG.bucketMultipliers, ...(overrides?.bucketMultipliers || {}) },
    };
}
