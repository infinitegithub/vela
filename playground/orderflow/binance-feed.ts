import type { OrderFlowBar, PriceLevelVolume, TimeValue, InstrumentContext } from 'lightweight-orderflow-charts';
import {
    roundToPriceStep,
    inferPricePrecision,
    normalizeBars,
} from 'lightweight-orderflow-charts';

export interface BinanceAggTrade {
    e: string; // Event type 'aggTrade'
    E: number; // Event time
    s: string; // Symbol
    a: number; // Aggregate trade ID
    p: string; // Price
    q: string; // Quantity
    f: number; // First trade ID
    l: number; // Last trade ID
    T: number; // Trade time
    m: boolean; // Was buyer maker? (true = sell aggressive = bid volume; false = buy aggressive = ask volume)
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function roundToPrecision(value: number, precision: number): number {
    return Number(value.toFixed(precision));
}

export function roundToTick(value: number, tickSize: number, precision: number): number {
    if (!Number.isFinite(tickSize) || tickSize <= 0) {
        return roundToPrecision(value, precision);
    }
    return roundToPriceStep(value, tickSize, precision);
}

/**
 * Builds price levels with realistic volume distribution, POC, and diagonal imbalances
 * identical to upstream buildSyntheticOrderFlowFromBars.
 */
export function buildSyntheticLevels(
    bar: { open: number; high: number; low: number; close: number; volume?: number; count?: number },
    tickSize: number,
    precision: number,
    totalVolume: number,
    maxLevels: number = 40,
): PriceLevelVolume[] {
    const open = roundToTick(bar.open, tickSize, precision);
    const high = roundToTick(bar.high, tickSize, precision);
    const low = roundToTick(bar.low, tickSize, precision);
    const close = roundToTick(bar.close, tickSize, precision);

    const startPrice = roundToTick(low, tickSize, precision);
    const endPrice = Math.max(startPrice + tickSize, roundToTick(high, tickSize, precision));

    const prices: number[] = [];
    for (let p = startPrice; p <= endPrice + tickSize * 0.1; p += tickSize) {
        prices.push(roundToTick(p, tickSize, precision));
    }
    const uniquePrices = Array.from(new Set(prices)).sort((a, b) => a - b);

    const bodyLow = Math.min(open, close);
    const bodyHigh = Math.max(open, close);
    const bullish = close >= open;
    const priceSpan = Math.max(endPrice - startPrice, tickSize);

    const weights = uniquePrices.map((price) => {
        const distanceToClose = Math.abs(price - close) / priceSpan;
        const insideBodyBonus = price >= bodyLow && price <= bodyHigh ? 0.45 : 0;
        const wickBonus = price === high || price === low ? 0.05 : 0;
        return 0.35 + (1 - Math.min(distanceToClose, 1)) * 1.2 + insideBodyBonus + wickBonus;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;

    return uniquePrices.map((price, index) => {
        const position = priceSpan === 0 ? 0.5 : (price - low) / priceSpan;
        const directionalBias = bullish ? position : 1 - position;
        const askShare = clamp(
            0.5 + (directionalBias - 0.5) * 0.38 + (bullish ? 0.1 : -0.1),
            0.15,
            0.85,
        );
        const levelTotal = roundToPrecision((totalVolume * weights[index]) / totalWeight, 2);
        const askVolume = roundToPrecision(levelTotal * askShare, 2);
        const bidVolume = roundToPrecision(Math.max(levelTotal - askVolume, 0), 2);

        return {
            price,
            bidVolume,
            askVolume,
            totalVolume: roundToPrecision(bidVolume + askVolume, 2),
            delta: roundToPrecision(askVolume - bidVolume, 2),
            tradeCount: bar.count,
        };
    });
}

/**
 * Reconstructs a fully normalized OrderFlowBar matching upstream specifications.
 */
export function reconstructOrderFlowBar(
    bar: { time: number; open: number; high: number; low: number; close: number; volume?: number; count?: number },
    tickSize: number,
): OrderFlowBar {
    const timeSec = bar.time > 1e11 ? Math.floor(bar.time / 1000) : bar.time;
    const precision = inferPricePrecision(tickSize);
    const totalVolume = bar.volume && bar.volume > 0 ? bar.volume : 2500;

    const rawSpread = Math.max(0, bar.high - bar.low);
    const minSpread = Math.max(8 * tickSize, rawSpread);
    const center = (bar.open + bar.close) / 2;
    const effectiveHigh = rawSpread >= 8 * tickSize ? bar.high : Math.max(bar.high, roundToTick(center + minSpread * 0.5, tickSize, precision));
    const effectiveLow = rawSpread >= 8 * tickSize ? bar.low : Math.min(bar.low, roundToTick(center - minSpread * 0.5, tickSize, precision));

    const augmentedBar = {
        ...bar,
        high: effectiveHigh,
        low: effectiveLow,
    };

    const rawBar: OrderFlowBar = {
        time: timeSec as TimeValue,
        open: roundToTick(augmentedBar.open, tickSize, precision),
        high: effectiveHigh,
        low: effectiveLow,
        close: roundToTick(augmentedBar.close, tickSize, precision),
        levels: buildSyntheticLevels(augmentedBar, tickSize, precision, totalVolume, 35),
        totalVolume,
    };

    const [normalized] = normalizeBars([rawBar]);
    return normalized || rawBar;
}

/**
 * Live order-flow feed for Binance Futures and Spot WebSocket + REST backfill.
 */
export class BinanceOrderFlowFeed {
    private ws: WebSocket | null = null;
    private currentSymbol: string = '';
    private intervalMs: number = 60000; // 1m default
    private barsMap: Map<number, OrderFlowBar> = new Map();
    private priceStep: number = 1.0;
    private listeners: Set<() => void> = new Set();
    private isConnected: boolean = false;

    constructor() {}

    public configure(symbol: string, intervalSeconds: number, priceStep?: number) {
        const cleanSymbol = symbol.toUpperCase().replace(/^BINANCE(\.F)?:/, '').replace(/USDT$/, 'USDT');
        const intervalMs = Math.max(1000, intervalSeconds * 1000);
        
        let defaultStep = 1.0;
        if (cleanSymbol.includes('BTC')) defaultStep = 5.0;
        else if (cleanSymbol.includes('ETH')) defaultStep = 0.5;
        else if (cleanSymbol.includes('SOL')) defaultStep = 0.1;
        else if (cleanSymbol.includes('BNB')) defaultStep = 0.1;
        else defaultStep = 0.05;

        const resolvedStep = priceStep && priceStep > 0 ? priceStep : defaultStep;

        if (this.currentSymbol === cleanSymbol && this.intervalMs === intervalMs && this.priceStep === resolvedStep) {
            return;
        }

        this.currentSymbol = cleanSymbol;
        this.intervalMs = intervalMs;
        this.priceStep = resolvedStep;
        this.barsMap.clear();

        this.connect();
        this.fetchRecentAggTrades();
    }

    public subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify() {
        for (const listener of this.listeners) {
            try {
                listener();
            } catch (e) {
                console.error('[BinanceOrderFlowFeed] listener error:', e);
            }
        }
    }

    private connect() {
        if (this.ws) {
            try {
                this.ws.close();
            } catch {}
            this.ws = null;
        }

        if (!this.currentSymbol || typeof WebSocket === 'undefined') return;

        const streamName = `${this.currentSymbol.toLowerCase()}@aggTrade`;
        const wsUrl = `wss://fstream.binance.com/ws/${streamName}`;

        try {
            this.ws = new WebSocket(wsUrl);
            this.ws.onopen = () => {
                this.isConnected = true;
            };
            this.ws.onmessage = (event) => {
                try {
                    const data: BinanceAggTrade = JSON.parse(event.data);
                    if (data && data.p && data.q && data.T) {
                        this.processTrade(data);
                    }
                } catch {}
            };
            this.ws.onerror = () => {
                this.isConnected = false;
            };
            this.ws.onclose = () => {
                this.isConnected = false;
                setTimeout(() => {
                    if (this.currentSymbol) this.connect();
                }, 3000);
            };
        } catch (e) {
            console.error('[BinanceOrderFlowFeed] Failed to connect WebSocket:', e);
        }
    }

    private async fetchRecentAggTrades() {
        if (!this.currentSymbol) return;
        try {
            const url = `https://fapi.binance.com/fapi/v1/aggTrades?symbol=${this.currentSymbol}&limit=1000`;
            const res = await fetch(url);
            if (!res.ok) return;
            const trades = await res.json();
            if (Array.isArray(trades)) {
                for (const t of trades) {
                    this.processTrade({
                        e: 'aggTrade',
                        E: t.T,
                        s: this.currentSymbol,
                        a: t.a,
                        p: t.p,
                        q: t.q,
                        f: t.f,
                        l: t.l,
                        T: t.T,
                        m: t.m,
                    });
                }
                this.notify();
            }
        } catch (e) {
            console.warn('[BinanceOrderFlowFeed] Failed to fetch REST aggTrades:', e);
        }
    }

    private processTrade(trade: BinanceAggTrade) {
        const price = parseFloat(trade.p);
        const qty = parseFloat(trade.q);
        const timeMs = trade.T;
        if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return;

        const barTimeMs = Math.floor(timeMs / this.intervalMs) * this.intervalMs;
        const barTimeSec = Math.floor(barTimeMs / 1000);
        const precision = inferPricePrecision(this.priceStep);
        const roundedPrice = roundToPriceStep(price, this.priceStep, precision);

        let bar = this.barsMap.get(barTimeSec);
        if (!bar) {
            bar = {
                time: barTimeSec as TimeValue,
                open: price,
                high: price,
                low: price,
                close: price,
                totalVolume: 0,
                delta: 0,
                bidVolume: 0,
                askVolume: 0,
                levels: [],
            };
            this.barsMap.set(barTimeSec, bar);
        }

        bar.high = Math.max(bar.high, price);
        bar.low = Math.min(bar.low, price);
        bar.close = price;

        const isSell = trade.m;
        const bidVol = isSell ? qty : 0;
        const askVol = isSell ? 0 : qty;

        bar.totalVolume = roundToPrecision((bar.totalVolume || 0) + qty, 2);
        bar.delta = roundToPrecision((bar.delta || 0) + (askVol - bidVol), 2);
        bar.bidVolume = roundToPrecision((bar.bidVolume || 0) + bidVol, 2);
        bar.askVolume = roundToPrecision((bar.askVolume || 0) + askVol, 2);

        let level = bar.levels.find((l) => Math.abs(l.price - roundedPrice) < this.priceStep * 0.1);
        if (!level) {
            level = {
                price: roundedPrice,
                bidVolume: 0,
                askVolume: 0,
                totalVolume: 0,
                delta: 0,
            };
            bar.levels.push(level);
            bar.levels.sort((a, b) => a.price - b.price);
        }

        level.bidVolume = roundToPrecision(level.bidVolume + bidVol, 2);
        level.askVolume = roundToPrecision(level.askVolume + askVol, 2);
        level.totalVolume = roundToPrecision(level.bidVolume + level.askVolume, 2);
        level.delta = roundToPrecision(level.askVolume - level.bidVolume, 2);

        this.notify();
    }

    public getOrderFlowBar(
        ohlcv: { time: number; open: number; high: number; low: number; close: number; volume?: number; count?: number },
        priceStep: number,
    ): OrderFlowBar {
        const barTimeSec = ohlcv.time > 1e11 ? Math.floor(ohlcv.time / 1000) : ohlcv.time;
        const liveBar = this.barsMap.get(barTimeSec);
        if (liveBar && liveBar.levels.length >= 2) {
            const precision = inferPricePrecision(priceStep);
            const low = roundToPriceStep(Math.min(liveBar.low, ohlcv.low), priceStep, precision);
            const high = roundToPriceStep(Math.max(liveBar.high, ohlcv.high), priceStep, precision);
            const levelMap = new Map<number, PriceLevelVolume>();
            for (const lvl of liveBar.levels) {
                levelMap.set(roundToPriceStep(lvl.price, priceStep, precision), lvl);
            }

            const synthetic = buildSyntheticLevels(
                {
                    open: ohlcv.open,
                    high,
                    low,
                    close: ohlcv.close,
                    volume: Math.max(ohlcv.volume || 0, liveBar.totalVolume || 0),
                    count: ohlcv.count,
                },
                priceStep,
                precision,
                Math.max(ohlcv.volume || 100, liveBar.totalVolume || 100),
            );

            const completeLevels: PriceLevelVolume[] = [];
            for (const synthLvl of synthetic) {
                const existing = levelMap.get(synthLvl.price);
                if (existing && existing.totalVolume > 0) {
                    completeLevels.push(existing);
                } else {
                    completeLevels.push(synthLvl);
                }
            }

            const raw: OrderFlowBar = {
                ...liveBar,
                open: ohlcv.open,
                high,
                low,
                close: ohlcv.close,
                totalVolume: Math.max(liveBar.totalVolume || 0, ohlcv.volume || 0),
                levels: completeLevels,
            };
            const [norm] = normalizeBars([raw]);
            return norm || raw;
        }

        return reconstructOrderFlowBar(ohlcv, priceStep);
    }

    public destroy() {
        if (this.ws) {
            try {
                this.ws.close();
            } catch {}
            this.ws = null;
        }
        this.listeners.clear();
        this.barsMap.clear();
    }
}

export const globalBinanceOrderFlow = new BinanceOrderFlowFeed();
