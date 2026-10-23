/**
 * LiquidityMapper Local Client Bridge & Quantitative Mathematical Engine
 * Ports exact calculations, order flow models, and dynamic multi-coin data planes
 * from LiquidityMapper into Vela.
 */

export interface MarketInfo {
    id: string;
    instrumentId: string;
    venue: string;
    symbol: string;
    base: string;
    quote: string;
    tickSize: number;
    marketType: 'perpetual' | 'spot';
}

export interface LiquidityState {
    asOf: number;
    now: number;
    markPrice: number;
    markInstrumentId: string;
    markets: MarketInfo[];
}

export interface CoinMarketListing {
    symbol: string;
    unit?: number;
    contract?: number;
    inverse?: boolean;
}

export interface CoinEntry {
    coin: string;
    volumeUsd: number;
    price: number;
    tier: number;
    markets: Partial<Record<string, CoinMarketListing>>;
}

export interface CoinsCatalogue {
    version: number;
    builtAt: number;
    coins: CoinEntry[];
}

export interface ResolvedCoinInfo {
    base: string;
    multiVenueInst: string;
    binanceInst: string;
    bybitInst: string;
    okxInst: string;
    unit: number;
    price: number;
    tier: number;
}

export interface RawFootprintBar {
    t: number;
    rows: [price: number, buyUsd: number, sellUsd: number][];
    buyUsd: number;
    sellUsd: number;
    minutes?: number;
}

export interface RawFootprintResponse {
    instrumentId: string;
    tf: string;
    step: number;
    fine: number;
    from: number;
    bars: RawFootprintBar[];
}

export interface ParsedFootprintLevel {
    price: number;
    bidVolume: number; // market sell (hitting bid)
    askVolume: number; // market buy (hitting ask)
    totalVolume: number;
    delta: number;
    buyImbalance?: boolean;
    sellImbalance?: boolean;
}

export interface ParsedFootprintBar {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    totalVolume: number;
    buyVolume: number;
    sellVolume: number;
    delta: number;
    pocPrice: number;
    levels: ParsedFootprintLevel[];
}

export interface StackedImbalanceZone {
    side: 'buy' | 'sell';
    topPrice: number;
    bottomPrice: number;
    startTime: number;
    endTime: number | null; // null = active / unmitigated
}

export interface NakedPocRay {
    price: number;
    startTime: number;
    mitigatedTime: number | null; // null = virgin / unmitigated
}

export interface SideArrays {
    lo: Float64Array;
    hi: Float64Array;
    usd: Float64Array;
}

export interface LiveBook {
    id: string;
    venue: string;
    timestamp: number;
    coarse: boolean;
    bids: SideArrays;
    asks: SideArrays;
    touch?: { lo: number; hi: number };
}

export interface LevelsFrame {
    asOf: number;
    books: LiveBook[];
}

export interface LiquidationItem {
    time: number;
    inst: string;
    side: 'long' | 'short';
    price: number;
    usd: number;
}

export interface LongShortPoint {
    t: number;
    long: number;
}

export interface LongShortResponse {
    id: string;
    population: string;
    periodMs: number;
    points: LongShortPoint[];
}

export interface OpenInterestBar {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

interface PartSpec {
    kind: 'f64' | 'f32' | 'i32';
    offset: number;
    length: number;
}

interface FrameHeader {
    type: string;
    asOf: number;
    parts: PartSpec[];
    instruments: { id: string; venue: string; timestamp: number; coarse: boolean; touch?: unknown }[];
}

// ============================================================================
// Mathematical Engine & Grid Formulas (1:1 with LiquidityMapper)
// ============================================================================

/**
 * Dynamic 1-2-5 price-grid step of roughly 0.02% of price.
 * Identical to LiquidityMapper src/shared/grid.ts.
 */
export function gridStepFor(price: number): number {
    const raw = Math.max(price * 0.0002, 1e-9);
    const exp = Math.floor(Math.log10(raw));
    const unit = raw / 10 ** exp;
    const nice = unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10;
    return Number((nice * 10 ** exp).toPrecision(12));
}

/**
 * Volume bar length fraction relative to busiest row in view (linear, sqrt, or log).
 * Sqrt is LiquidityMapper's default and industry gold standard for footprint orderflow.
 */
export function barFraction(val: number, busiest: number, mode: 'sqrt' | 'linear' | 'log' = 'sqrt'): number {
    if (!(busiest > 0) || !(val > 0)) return 0;
    const f = Math.max(0, Math.min(1, val / busiest));
    if (mode === 'linear') return f;
    if (mode === 'log') return Math.max(0, Math.log10(1 + 9 * f));
    return Math.sqrt(f);
}

/**
 * Dominant side check for cell volume bar tinting.
 */
export function imbalance(buy: number, sell: number, ratio = 1.15): 'buy' | 'sell' | null {
    if (buy >= ratio * sell && buy > 0) return 'buy';
    if (sell >= ratio * buy && sell > 0) return 'sell';
    return null;
}

/**
 * Format numbers compactly matching LiquidityMapper (e.g. 1.2M, 450k, 12.5).
 */
export function formatVol(val: number): string {
    if (val === 0) return '0';
    const abs = Math.abs(val);
    if (abs >= 1_000_000_000) return (val / 1_000_000_000).toFixed(2) + 'B';
    if (abs >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M';
    if (abs >= 1_000) return (val / 1_000).toFixed(1) + 'k';
    if (abs < 0.1) return val.toFixed(3);
    if (abs < 1) return val.toFixed(2);
    return val.toFixed(1);
}

/**
 * Diagonal Imbalance Detection (1:1 with LiquidityMapper bar-stats.ts).
 */
export interface RawImbalance {
    low: number;
    side: 'buy' | 'sell';
    ratio: number;
}

export function diagonalImbalances(
    rows: [price: number, buyUsd: number, sellUsd: number][],
    step: number,
    options: { imbRatio: number; imbMinUsd: number; imbZeros: boolean } = { imbRatio: 3.0, imbMinUsd: 0, imbZeros: true }
): RawImbalance[] {
    const at = new Map<number, [number, number]>();
    let lowest = Infinity, highest = -Infinity;
    for (const [low, buy, sell] of rows) {
        const index = Math.round(low / step);
        at.set(index, [buy, sell]);
        lowest = Math.min(lowest, index);
        highest = Math.max(highest, index);
    }
    const found: RawImbalance[] = [];
    const min = options.imbMinUsd;

    const opposite = (index: number, side: 0 | 1): number | null =>
        index < lowest || index > highest ? null : at.get(index)?.[side] ?? 0;

    const flag = (own: number, other: number | null): number | null => {
        if (other === null || !(own > 0) || own < min) return null;
        if (other > 0) return own >= options.imbRatio * other ? own / other : null;
        return options.imbZeros ? Infinity : null;
    };

    for (const [low, buy, sell] of rows) {
        const index = Math.round(low / step);
        const sellRatio = flag(sell, opposite(index + 1, 0));
        const buyRatio = flag(buy, opposite(index - 1, 1));
        if (sellRatio !== null) found.push({ low, side: 'sell', ratio: sellRatio });
        if (buyRatio !== null) found.push({ low, side: 'buy', ratio: buyRatio });
    }
    return found;
}

/**
 * Stacked Imbalance Zones: n or more adjacent rows flagged on the same side.
 */
export function stackedZones(found: readonly RawImbalance[], step: number, n: number = 3): { side: 'buy' | 'sell'; low: number; high: number }[] {
    const zones: { side: 'buy' | 'sell'; low: number; high: number }[] = [];
    for (const side of ['buy', 'sell'] as const) {
        const indices = [...new Set(found.filter(f => f.side === side).map(f => Math.round(f.low / step)))].sort((a, b) => a - b);
        let start = 0;
        for (let i = 1; i <= indices.length; i++) {
            if (i < indices.length && indices[i] === indices[i - 1]! + 1) continue;
            if (i - start >= n) {
                zones.push({
                    side,
                    low: indices[start]! * step,
                    high: (indices[i - 1]! + 1) * step
                });
            }
            start = i;
        }
    }
    return zones;
}

export function normalizeTimeframe(tf: string): string {
    const raw = (tf || '').trim().toLowerCase();
    if (raw === '1' || raw === '1m') return '1m';
    if (raw === '3' || raw === '5' || raw === '5m') return '5m';
    if (raw === '15' || raw === '15m') return '15m';
    if (raw === '30' || raw === '30m') return '30m';
    if (raw === '60' || raw === '1h' || raw === '60m') return '1h';
    if (raw === '120' || raw === '240' || raw === '4h' || raw === '240m') return '4h';
    if (raw === '1d' || raw === 'd' || raw === '1440' || raw === 'd1') return '1d';
    if (['1m', '5m', '15m', '30m', '1h', '4h', '1d'].includes(raw)) return raw;
    return '1h';
}

export function timeframeToMs(tf: string): number {
    const norm = normalizeTimeframe(tf);
    const map: Record<string, number> = {
        '1m': 60_000,
        '5m': 300_000,
        '15m': 900_000,
        '30m': 1_800_000,
        '1h': 3_600_000,
        '4h': 14_400_000,
        '1d': 86_400_000,
    };
    return map[norm] || 3_600_000;
}

export function decodeLevels(buffer: ArrayBuffer): LevelsFrame | null {
    if (buffer.byteLength < 4) return null;
    const view = new DataView(buffer);
    const length = view.getUint32(0, true);
    if (length === 0 || 4 + length > buffer.byteLength) return null;

    let headerStr = '';
    try {
        headerStr = new TextDecoder().decode(new Uint8Array(buffer, 4, length));
    } catch (_) {
        return null;
    }

    let header: FrameHeader;
    try {
        header = JSON.parse(headerStr) as FrameHeader;
    } catch (_) {
        return null;
    }

    if (header.type !== 'levels' || !Array.isArray(header.parts)) return null;

    const base = (4 + length + 7) & ~7;
    const part = (index: number) => {
        const spec = header.parts[index];
        if (!spec) return new Float64Array(0);
        const bytes = spec.kind === 'f32' || spec.kind === 'i32' ? 4 : 8;
        const offset = base + spec.offset;
        if (offset + spec.length * bytes > buffer.byteLength) return new Float64Array(0);
        return spec.kind === 'f64'
            ? new Float64Array(buffer, offset, spec.length)
            : spec.kind === 'f32'
            ? new Float32Array(buffer, offset, spec.length)
            : new Int32Array(buffer, offset, spec.length);
    };

    const side = (at: number): SideArrays => ({
        lo: part(at) as Float64Array,
        hi: part(at + 1) as Float64Array,
        usd: part(at + 2) as Float64Array
    });

    const touchOf = (value: unknown): { lo: number; hi: number } | undefined =>
        Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]) && value[1] > value[0]
            ? { lo: value[0], hi: value[1] }
            : undefined;

    return {
        asOf: Number(header.asOf),
        books: (header.instruments || []).map((item, i) => {
            const touch = touchOf(item.touch);
            return {
                id: item.id,
                venue: item.venue,
                timestamp: item.timestamp,
                coarse: item.coarse,
                bids: side(i * 6),
                asks: side(i * 6 + 3),
                ...(touch ? { touch } : {})
            };
        })
    };
}

// ============================================================================
// LiquidityClient Singleton
// ============================================================================

export class LiquidityClient {
    private static instance: LiquidityClient | null = null;
    private state: LiquidityState | null = null;
    private catalogue: CoinsCatalogue | null = null;
    private catalogueLoading: Promise<CoinsCatalogue | null> | null = null;
    private activeSymbol = 'BTCUSDT';
    private ws: WebSocket | null = null;

    private tickListeners = new Set<(price: number, time: number) => void>();
    private levelsListeners = new Set<(frame: LevelsFrame) => void>();
    private printsListeners = new Set<(prints: any[]) => void>();
    private liqListeners = new Set<(liqs: any[]) => void>();
    private flowListeners = new Set<(flow: any[]) => void>();
    private marketSwitchListeners = new Set<(symbol: string) => void>();

    static get(): LiquidityClient {
        if (!this.instance) this.instance = new LiquidityClient();
        return this.instance;
    }

    async loadCoinsCatalogue(): Promise<CoinsCatalogue | null> {
        if (this.catalogue) return this.catalogue;
        if (this.catalogueLoading) return this.catalogueLoading;

        this.catalogueLoading = (async () => {
            try {
                const res = await fetch('/coins.json');
                if (res.ok) {
                    const data = await res.json() as CoinsCatalogue;
                    if (data && Array.isArray(data.coins)) {
                        this.catalogue = data;
                        return data;
                    }
                }
            } catch (e) {
                console.warn('[LiquidityClient] /coins.json fetch warning:', e);
            }
            return null;
        })();

        return this.catalogueLoading;
    }

    /**
     * Dynamically maps ANY user symbol (BTC, ETH, SOL, DOGE, PEPE, etc.)
     * to its multi-venue and single-venue specifications using the 147-coin catalogue.
     */
    resolveCoin(symbol: string): ResolvedCoinInfo {
        const raw = (symbol || '').trim().toUpperCase();
        // Remove exchange prefixes and contract suffixes
        const clean = raw
            .replace(/^(BINANCE:|BYBIT:|OKX:|BITGET:|COINBASE:|HYPERLIQUID:|DERIBIT:)/i, '')
            .replace(/\.P$/i, '')
            .replace(/[-_]PERP$/i, '')
            .replace(/[-_]SWAP$/i, '')
            .trim();

        let base = clean;
        if (base.endsWith('USDT') && base.length > 4) base = base.slice(0, -4);
        else if (base.endsWith('USD') && base.length > 3) base = base.slice(0, -3);
        else if (base.endsWith('USDC') && base.length > 4) base = base.slice(0, -4);

        let coinEntry: CoinEntry | undefined;
        if (this.catalogue && this.catalogue.coins) {
            coinEntry = this.catalogue.coins.find(c => c.coin === base || c.coin === clean);
        }

        if (coinEntry) {
            const m = coinEntry.markets;
            const bSym = m.binance?.symbol || `${base}USDT`;
            const bySym = m.bybit?.symbol || `${base}USDT`;
            const okSym = m.okx?.symbol || `${base}-USDT-SWAP`;

            const venues = [
                `binance:${bSym}`,
                `bybit:${bySym}`,
                `okx:${okSym}`
            ];
            if (m.bitget?.symbol) venues.push(`bitget:${m.bitget.symbol}`);
            if (m.hyperliquid?.symbol) venues.push(`hyperliquid:${m.hyperliquid.symbol}-PERP`);

            return {
                base: coinEntry.coin,
                multiVenueInst: venues.join(','),
                binanceInst: `binance:${bSym}`,
                bybitInst: `bybit:${bySym}`,
                okxInst: `okx:${okSym}`,
                unit: m.binance?.unit || 1,
                price: coinEntry.price || 0,
                tier: coinEntry.tier || 0
            };
        }

        // Robust Fallback
        const fallbackBinance = clean.includes('USDT') ? clean : `${clean}USDT`;
        const fallbackOkx = clean.includes('-') ? clean : `${base}-USDT-SWAP`;
        return {
            base,
            multiVenueInst: `binance:${fallbackBinance},bybit:${fallbackBinance},okx:${fallbackOkx}`,
            binanceInst: `binance:${fallbackBinance}`,
            bybitInst: `bybit:${fallbackBinance}`,
            okxInst: `okx:${fallbackOkx}`,
            unit: 1,
            price: 0,
            tier: 0
        };
    }

    /**
     * Dynamically switches the active live market feed on the LiquidityMapper backend.
     * Notifies all registered listeners (DOM Ladder, Footprint, Indicators).
     */
    async switchMarket(symbol: string): Promise<boolean> {
        await this.loadCoinsCatalogue();
        const resolved = this.resolveCoin(symbol);
        this.activeSymbol = resolved.base;

        try {
            const res = await fetch('/api/market-selection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instrumentId: resolved.binanceInst })
            });
            if (res.ok || res.status === 202) {
                this.state = null; // Invalidate cached state
                await this.getState(); // Fresh state
                for (const l of this.marketSwitchListeners) l(symbol);
                return true;
            }
        } catch (e) {
            console.warn('[LiquidityClient] Market selection error:', e);
        }
        return false;
    }

    onMarketSwitch(fn: (symbol: string) => void): () => void {
        this.marketSwitchListeners.add(fn);
        return () => this.marketSwitchListeners.delete(fn);
    }

    async getState(): Promise<LiquidityState | null> {
        if (this.state) return this.state;
        try {
            const res = await fetch('/api/v2/state');
            if (res.ok) {
                this.state = await res.json();
                return this.state;
            }
        } catch (e) {
            console.error('[LiquidityClient] Failed to fetch state:', e);
        }
        return null;
    }

    async fetchFootprint(symbol: string, tf: string = '1h'): Promise<{
        bars: ParsedFootprintBar[];
        step: number;
        stackedZones: StackedImbalanceZone[];
        nakedPocs: NakedPocRay[];
    }> {
        await this.loadCoinsCatalogue();
        const resolved = this.resolveCoin(symbol);
        const tfParam = normalizeTimeframe(tf);

        try {
            const url = `/api/v2/footprint?inst=${encodeURIComponent(resolved.multiVenueInst)}&tf=${tfParam}`;
            const res = await fetch(url);
            if (!res.ok) {
                console.warn('[LiquidityClient] Footprint responded with:', res.status, res.statusText);
                return { bars: [], step: 1.0, stackedZones: [], nakedPocs: [] };
            }
            const data = await res.json() as RawFootprintResponse;
            const step = data.step || (data.fine ? data.fine : 0.5);

            const parsedBars: ParsedFootprintBar[] = [];
            const stackedZonesList: StackedImbalanceZone[] = [];
            const nakedPocsList: NakedPocRay[] = [];

            for (const b of (data.bars || [])) {
                if (!b.rows || b.rows.length === 0) continue;
                let high = -Infinity, low = Infinity;
                let maxVol = 0, poc = 0;
                const levels: ParsedFootprintLevel[] = [];

                // 1. Detect diagonal imbalances diagonally across adjacent rows
                const imbFound = diagonalImbalances(b.rows, step, { imbRatio: 3.0, imbMinUsd: 0, imbZeros: true });
                const imbMap = new Map<number, { buy?: boolean; sell?: boolean }>();
                for (const imb of imbFound) {
                    const entry = imbMap.get(imb.low) || {};
                    if (imb.side === 'buy') entry.buy = true;
                    if (imb.side === 'sell') entry.sell = true;
                    imbMap.set(imb.low, entry);
                }

                // 2. Build stacked zones for this bar (>= 3 consecutive rows)
                const zones = stackedZones(imbFound, step, 3);
                for (const z of zones) {
                    stackedZonesList.push({
                        side: z.side,
                        bottomPrice: z.low,
                        topPrice: z.high,
                        startTime: b.t,
                        endTime: null
                    });
                }

                // 3. Populate levels
                for (const r of b.rows) {
                    const price = r[0];
                    const askVol = r[1];
                    const bidVol = r[2];
                    const tot = askVol + bidVol;
                    if (price > high) high = price;
                    if (price < low) low = price;
                    if (tot > maxVol) {
                        maxVol = tot;
                        poc = price;
                    }
                    const flags = imbMap.get(price);
                    levels.push({
                        price,
                        askVolume: askVol,
                        bidVolume: bidVol,
                        totalVolume: tot,
                        delta: askVol - bidVol,
                        buyImbalance: flags?.buy,
                        sellImbalance: flags?.sell
                    });
                }

                levels.sort((a, b) => a.price - b.price);

                const barObj: ParsedFootprintBar = {
                    time: b.t,
                    open: levels[0]?.price ?? 0,
                    high,
                    low,
                    close: levels[levels.length - 1]?.price ?? 0,
                    totalVolume: b.buyUsd + b.sellUsd,
                    buyVolume: b.buyUsd,
                    sellVolume: b.sellUsd,
                    delta: b.buyUsd - b.sellUsd,
                    pocPrice: poc,
                    levels
                };
                parsedBars.push(barObj);

                nakedPocsList.push({
                    price: poc,
                    startTime: b.t,
                    mitigatedTime: null
                });
            }

            // Mitigate stacked zones and naked POCs when traded through by later candles
            for (let i = 0; i < parsedBars.length; i++) {
                const bar = parsedBars[i]!;
                for (const zone of stackedZonesList) {
                    if (zone.endTime === null && bar.time > zone.startTime) {
                        if (zone.side === 'buy' && bar.low <= zone.topPrice) {
                            zone.endTime = bar.time;
                        } else if (zone.side === 'sell' && bar.high >= zone.bottomPrice) {
                            zone.endTime = bar.time;
                        }
                    }
                }
                for (const poc of nakedPocsList) {
                    if (poc.mitigatedTime === null && bar.time > poc.startTime) {
                        if (bar.low <= poc.price && bar.high >= poc.price) {
                            poc.mitigatedTime = bar.time;
                        }
                    }
                }
            }

            return { bars: parsedBars, step, stackedZones: stackedZonesList, nakedPocs: nakedPocsList };
        } catch (e) {
            console.error('[LiquidityClient] Footprint fetch error:', e);
            return { bars: [], step: 1.0, stackedZones: [], nakedPocs: [] };
        }
    }

    async fetchFlowDelta(symbol: string, tf: string = '1h'): Promise<{ time: number; delta: number; cumDelta: number }[]> {
        await this.loadCoinsCatalogue();
        const resolved = this.resolveCoin(symbol);
        const tfParam = normalizeTimeframe(tf);
        try {
            const url = `/api/v2/candles?inst=${encodeURIComponent(resolved.binanceInst)}&tf=${tfParam}`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const candles = await res.json() as [time: number, open: number, high: number, low: number, close: number, vol: number, takerVol: number][];
            let runningCvd = 0;
            return candles.map(c => {
                const vol = c[5] || 0;
                const buyVol = c[6] || (vol / 2);
                const sellVol = Math.max(0, vol - buyVol);
                const delta = buyVol - sellVol;
                runningCvd += delta;
                return { time: c[0], delta, cumDelta: runningCvd };
            });
        } catch (e) {
            console.error('[LiquidityClient] Flow delta error:', e);
            return [];
        }
    }

    async fetchLongShort(symbol: string, tf: string = '1h', metric: string = 'topPositions'): Promise<LongShortPoint[]> {
        await this.loadCoinsCatalogue();
        const resolved = this.resolveCoin(symbol);
        const tfParam = normalizeTimeframe(tf);
        try {
            const url = `/api/v2/long-short?inst=${encodeURIComponent(resolved.binanceInst)}&tf=${tfParam}&metric=${metric}`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = await res.json() as LongShortResponse;
            return Array.isArray(data.points) ? data.points : [];
        } catch (e) {
            console.error('[LiquidityClient] Long/Short fetch error:', e);
            return [];
        }
    }

    async fetchOpenInterest(symbol: string, tf: string = '1h'): Promise<OpenInterestBar[]> {
        await this.loadCoinsCatalogue();
        const resolved = this.resolveCoin(symbol);
        const tfParam = normalizeTimeframe(tf);
        try {
            const url = `/api/v2/oi?inst=${encodeURIComponent(resolved.binanceInst)}&tf=${tfParam}`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = await res.json() as { bars: [t: number, o: number, h: number, l: number, c: number][] };
            if (!Array.isArray(data.bars)) return [];
            return data.bars.map(b => ({
                time: b[0],
                open: b[1],
                high: b[2],
                low: b[3],
                close: b[4]
            }));
        } catch (e) {
            console.error('[LiquidityClient] Open Interest fetch error:', e);
            return [];
        }
    }

    async fetchLiquidations(symbol: string = 'BTCUSDT'): Promise<LiquidationItem[]> {
        await this.loadCoinsCatalogue();
        const resolved = this.resolveCoin(symbol);
        try {
            const url = `/api/v2/liquidations?inst=${encodeURIComponent(resolved.binanceInst)}`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = await res.json() as { liquidations: [time: number, inst: string, side: 'long'|'short', px: number, usd: number, markPx: number, type: string][] };
            if (!Array.isArray(data.liquidations)) return [];
            return data.liquidations.map(l => ({
                time: l[0],
                inst: l[1],
                side: l[2],
                price: l[3],
                usd: l[4]
            }));
        } catch (_) {
            return [];
        }
    }

    connectLiveWs(): void {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = proto + '//' + window.location.host + '/api/v2/ws';

        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log('[LiquidityClient] Live WebSocket connected successfully');
        };

        this.ws.onmessage = async (evt) => {
            if (typeof evt.data === 'string') {
                try {
                    const msg = JSON.parse(evt.data);
                    if (msg.t === 'tick' && typeof msg.price === 'number') {
                        for (const l of this.tickListeners) l(msg.price, msg.asOf || Date.now());
                    } else if (msg.t === 'prints' && Array.isArray(msg.items)) {
                        for (const l of this.printsListeners) l(msg.items);
                    } else if (msg.t === 'liquidations' && Array.isArray(msg.items)) {
                        for (const l of this.liqListeners) l(msg.items);
                    } else if (msg.t === 'flow' && Array.isArray(msg.items)) {
                        for (const l of this.flowListeners) l(msg.items);
                    }
                } catch (_) {}
            } else {
                try {
                    let buffer: ArrayBuffer | null = null;
                    if (evt.data instanceof ArrayBuffer) {
                        buffer = evt.data;
                    } else if (typeof Blob !== 'undefined' && evt.data instanceof Blob) {
                        buffer = await evt.data.arrayBuffer();
                    }
                    if (buffer) {
                        const frame = decodeLevels(buffer);
                        if (frame && frame.books && frame.books.length > 0) {
                            for (const l of this.levelsListeners) l(frame);
                        }
                    }
                } catch (_) {}
            }
        };

        this.ws.onerror = (err) => {
            console.warn('[LiquidityClient] WebSocket error:', err);
        };

        this.ws.onclose = () => {
            setTimeout(() => this.connectLiveWs(), 3000);
        };
    }

    onTick(fn: (price: number, time: number) => void): () => void {
        this.tickListeners.add(fn);
        this.connectLiveWs();
        return () => this.tickListeners.delete(fn);
    }

    onLevels(fn: (frame: LevelsFrame) => void): () => void {
        this.levelsListeners.add(fn);
        this.connectLiveWs();
        return () => this.levelsListeners.delete(fn);
    }

    onPrints(fn: (prints: any[]) => void): () => void {
        this.printsListeners.add(fn);
        this.connectLiveWs();
        return () => this.printsListeners.delete(fn);
    }

    onLiquidations(fn: (liqs: any[]) => void): () => void {
        this.liqListeners.add(fn);
        this.connectLiveWs();
        return () => this.liqListeners.delete(fn);
    }

    onFlow(fn: (flow: any[]) => void): () => void {
        this.flowListeners.add(fn);
        this.connectLiveWs();
        return () => this.flowListeners.delete(fn);
    }
}
