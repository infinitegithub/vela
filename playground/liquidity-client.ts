/**
 * LiquidityMapper Local Client Bridge
 * Connects Vela directly to LiquidityMapper's v2 data plane running on 127.0.0.1:8787 (proxied via /api/v2).
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

export function decodeLevels(buffer: ArrayBuffer): LevelsFrame {
    const view = new DataView(buffer);
    const length = view.getUint32(0, true);
    if (length === 0 || 4 + length > buffer.byteLength) throw new Error('Malformed frame header length');
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length))) as FrameHeader;
    if (header.type !== 'levels' || !Array.isArray(header.parts)) throw new Error('Not a levels frame');
    const base = (4 + length + 7) & ~7;
    const part = (index: number) => {
        const spec = header.parts[index];
        if (!spec) throw new Error(`Frame part ${index} is missing`);
        const bytes = spec.kind === 'f32' || spec.kind === 'i32' ? 4 : 8;
        if (base + spec.offset + spec.length * bytes > buffer.byteLength) throw new Error('Frame part exceeds the buffer');
        return spec.kind === 'f64'
            ? new Float64Array(buffer, base + spec.offset, spec.length)
            : spec.kind === 'f32'
            ? new Float32Array(buffer, base + spec.offset, spec.length)
            : new Int32Array(buffer, base + spec.offset, spec.length);
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

export class LiquidityClient {
    private static instance: LiquidityClient | null = null;
    private state: LiquidityState | null = null;
    private ws: WebSocket | null = null;
    private tickListeners = new Set<(price: number, time: number) => void>();
    private levelsListeners = new Set<(frame: LevelsFrame) => void>();
    private printsListeners = new Set<(prints: any[]) => void>();
    private liqListeners = new Set<(liqs: any[]) => void>();
    private flowListeners = new Set<(flow: any[]) => void>();

    static get(): LiquidityClient {
        if (!this.instance) this.instance = new LiquidityClient();
        return this.instance;
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

    resolveInstrumentId(symbol: string): string {
        const clean = symbol.replace(/^(BINANCE:|BYBIT:|OKX:)/i, '').toUpperCase().replace(/\.P$/i, '').trim();
        if (clean === 'BTCUSDT' || clean === 'BTC') return 'binance:BTCUSDT,bybit:BTCUSDT,okx:BTC-USDT-SWAP';
        if (clean === 'ETHUSDT' || clean === 'ETH') return 'binance:ETHUSDT,bybit:ETHUSDT,okx:ETH-USDT-SWAP';
        if (clean === 'SOLUSDT' || clean === 'SOL') return 'binance:SOLUSDT,bybit:SOLUSDT,okx:SOL-USDT-SWAP';
        return 'binance:' + clean;
    }

    resolveSingleInstrumentId(symbol: string, venue: string = 'binance'): string {
        const clean = symbol.replace(/^(BINANCE:|BYBIT:|OKX:)/i, '').toUpperCase().replace(/\.P$/i, '').trim();
        if (venue === 'bybit') return `bybit:${clean}`;
        if (venue === 'okx') return clean.includes('-') ? `okx:${clean}` : `okx:${clean.replace('USDT', '')}-USDT-SWAP`;
        return `binance:${clean}`;
    }

    async fetchFootprint(symbol: string, tf: string = '1m'): Promise<{
        bars: ParsedFootprintBar[];
        step: number;
        stackedZones: StackedImbalanceZone[];
        nakedPocs: NakedPocRay[];
    }> {
        const inst = this.resolveInstrumentId(symbol);
        const tfParam = tf.toLowerCase();
        try {
            const url = '/api/v2/footprint?inst=' + encodeURIComponent(inst) + '&tf=' + tfParam;
            const res = await fetch(url);
            if (!res.ok) return { bars: [], step: 1.0, stackedZones: [], nakedPocs: [] };
            const data = await res.json() as RawFootprintResponse;
            const step = data.step || 0.5;

            const parsedBars: ParsedFootprintBar[] = [];
            const stackedZones: StackedImbalanceZone[] = [];
            const nakedPocs: NakedPocRay[] = [];

            for (const b of data.bars) {
                if (!b.rows || b.rows.length === 0) continue;
                let high = -Infinity, low = Infinity;
                let maxVol = 0, poc = 0;
                const levels: ParsedFootprintLevel[] = [];

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
                    levels.push({
                        price,
                        askVolume: askVol,
                        bidVolume: bidVol,
                        totalVolume: tot,
                        delta: askVol - bidVol
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

                nakedPocs.push({
                    price: poc,
                    startTime: b.t,
                    mitigatedTime: null
                });

                const ratio = 3.0;
                let buyRun: { start: number; end: number } | null = null;
                let sellRun: { start: number; end: number } | null = null;

                for (let k = 0; k < levels.length - 1; k++) {
                    const curr = levels[k]!;
                    const next = levels[k + 1]!;

                    if (next.askVolume > 0 && (curr.bidVolume === 0 || next.askVolume >= curr.bidVolume * ratio)) {
                        if (!buyRun) buyRun = { start: curr.price, end: next.price };
                        else buyRun.end = next.price;
                    } else {
                        if (buyRun && (buyRun.end - buyRun.start) >= step * 2) {
                            stackedZones.push({
                                side: 'buy',
                                bottomPrice: buyRun.start,
                                topPrice: buyRun.end,
                                startTime: b.t,
                                endTime: null
                            });
                        }
                        buyRun = null;
                    }

                    if (curr.bidVolume > 0 && (next.askVolume === 0 || curr.bidVolume >= next.askVolume * ratio)) {
                        if (!sellRun) sellRun = { start: curr.price, end: next.price };
                        else sellRun.end = next.price;
                    } else {
                        if (sellRun && (sellRun.end - sellRun.start) >= step * 2) {
                            stackedZones.push({
                                side: 'sell',
                                bottomPrice: sellRun.start,
                                topPrice: sellRun.end,
                                startTime: b.t,
                                endTime: null
                            });
                        }
                        sellRun = null;
                    }
                }
            }

            for (let i = 0; i < parsedBars.length; i++) {
                const bar = parsedBars[i]!;
                for (const zone of stackedZones) {
                    if (zone.endTime === null && bar.time > zone.startTime) {
                        if (zone.side === 'buy' && bar.low <= zone.topPrice) {
                            zone.endTime = bar.time;
                        } else if (zone.side === 'sell' && bar.high >= zone.bottomPrice) {
                            zone.endTime = bar.time;
                        }
                    }
                }
                for (const poc of nakedPocs) {
                    if (poc.mitigatedTime === null && bar.time > poc.startTime) {
                        if (bar.low <= poc.price && bar.high >= poc.price) {
                            poc.mitigatedTime = bar.time;
                        }
                    }
                }
            }

            return { bars: parsedBars, step, stackedZones, nakedPocs };
        } catch (e) {
            console.error('[LiquidityClient] Footprint fetch error:', e);
            return { bars: [], step: 1.0, stackedZones: [], nakedPocs: [] };
        }
    }

    async fetchFlowDelta(symbol: string, tf: string = '1m'): Promise<{ time: number; delta: number; cumDelta: number }[]> {
        const inst = this.resolveInstrumentId(symbol);
        try {
            const url = '/api/v2/candles?inst=' + encodeURIComponent(inst.split(',')[0]!) + '&tf=' + tf;
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
        const inst = this.resolveSingleInstrumentId(symbol, 'binance');
        try {
            const url = `/api/v2/long-short?inst=${encodeURIComponent(inst)}&tf=${tf}&metric=${metric}`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = await res.json() as LongShortResponse;
            return Array.isArray(data.points) ? data.points : [];
        } catch (e) {
            console.error('[LiquidityClient] Long/Short fetch error:', e);
            return [];
        }
    }

    async fetchOpenInterest(symbol: string, tf: string = '1m'): Promise<OpenInterestBar[]> {
        const inst = this.resolveSingleInstrumentId(symbol, 'binance');
        try {
            const url = `/api/v2/oi?inst=${encodeURIComponent(inst)}&tf=${tf}`;
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

    async fetchLiquidations(): Promise<LiquidationItem[]> {
        try {
            const url = '/api/v2/liquidations?inst=binance:BTCUSDT';
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
            console.log('[LiquidityClient] Live WebSocket connected');
        };

        this.ws.onmessage = (evt) => {
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
            } else if (evt.data instanceof ArrayBuffer) {
                try {
                    const frame = decodeLevels(evt.data);
                    for (const l of this.levelsListeners) l(frame);
                } catch (_) {}
            }
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
