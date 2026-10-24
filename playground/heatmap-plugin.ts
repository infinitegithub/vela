import {
    registerChartType,
    registerRendererLayer,
    type SeriesDataEngine,
    type SeriesDataEngineHost,
    type RendererLayerInstance,
    type RendererLayerArgs,
} from '../src/plugin';
import {
    LiquidityClient,
    normalizeTimeframe,
    timeframeToMs,
    gridStepFor,
    formatVol,
    type LevelsFrame,
} from './liquidity-client';

const HEATMAP_ICON = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.2"/><line x1="2" y1="6" x2="16" y2="6" stroke="currentColor" stroke-opacity="0.4"/><line x1="2" y1="10" x2="16" y2="10" stroke="currentColor" stroke-opacity="0.6"/><line x1="2" y1="14" x2="16" y2="14" stroke="currentColor" stroke-opacity="0.4"/><circle cx="9" cy="9" r="3.5" fill="#f0883e" fill-opacity="0.8"/><circle cx="9" cy="9" r="6" stroke="#f0883e" stroke-width="1" stroke-dasharray="2 2" stroke-opacity="0.5"/></svg>';

// ============================================================================
// Authentic LiquidityMapper Dark Colormap Ramp (from src/app/heatmap/lut.ts)
// ============================================================================
const DARK_STOPS: [number, string][] = [
    [0.0, '#050f1f'],
    [0.22, '#0a3a66'],
    [0.42, '#1479b8'],
    [0.60, '#7fd0f0'],
    [0.70, '#f4fbff'],
    [0.80, '#ffe14a'],
    [0.90, '#ff8a00'],
    [1.00, '#e8281c']
];

const hexToRgb = (h: string): [number, number, number] => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const LUT_DARK: string[] = (() => {
    const lut: string[] = [];
    for (let i = 0; i < 256; i++) {
        const t = i / 255;
        let k = 1;
        while (k < DARK_STOPS.length - 1 && DARK_STOPS[k]![0] < t) k++;
        const [t0, c0] = DARK_STOPS[k - 1]!;
        const [t1, c1] = DARK_STOPS[k]!;
        const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
        const a = hexToRgb(c0);
        const b = hexToRgb(c1);
        const r = Math.round(a[0] + (b[0] - a[0]) * f);
        const g = Math.round(a[1] + (b[1] - a[1]) * f);
        const bl = Math.round(a[2] + (b[2] - a[2]) * f);
        const alpha = Math.min(0.92, 0.22 + 0.70 * (i / 255)).toFixed(2);
        lut.push('rgba(' + r + ',' + g + ',' + bl + ',' + alpha + ')');
    }
    return lut;
})();

export interface HeatmapBarLevel {
    price: number;
    bidUsd: number;
    askUsd: number;
    totalUsd: number;
}

export interface HeatmapLiquidation {
    time: number;
    price: number;
    usd: number;
    side: 'buy' | 'sell';
    venue: string;
}

export interface HeatmapPayload {
    symbol: string;
    timeframe: string;
    step: number;
    stepMs: number;
    maxLevelUsd: number;
    barLevels: Map<number, HeatmapBarLevel[]>;
    liveLevels: HeatmapBarLevel[];
    liquidations: HeatmapLiquidation[];
}

function decodeColumnsBinary(buffer: ArrayBuffer): {
    stepMs: number;
    step: number;
    columns: Map<number, HeatmapBarLevel[]>;
    maxUsd: number;
} {
    const view = new DataView(buffer);
    const length = view.getUint32(0, true);
    if (length === 0 || 4 + length > buffer.byteLength) throw new Error('Malformed header');
    const headerStr = new TextDecoder().decode(new Uint8Array(buffer, 4, length));
    const header = JSON.parse(headerStr);
    const base = (4 + length + 7) & ~7;

    const part = (index: number) => {
        const spec = header.parts[index];
        const bytes = spec.kind === 'f32' || spec.kind === 'i32' ? 4 : 8;
        const offset = base + spec.offset;
        return spec.kind === 'f64'
            ? new Float64Array(buffer, offset, spec.length)
            : spec.kind === 'f32'
            ? new Float32Array(buffer, offset, spec.length)
            : new Int32Array(buffer, offset, spec.length);
    };

    const inst = header.instruments?.[0];
    const columns = new Map<number, HeatmapBarLevel[]>();
    let maxUsd = 100_000;
    if (!inst) return { stepMs: 60000, step: 20, columns, maxUsd };

    const bins = part(0) as Int32Array;
    const bid = part(1) as Float32Array;
    const ask = part(2) as Float32Array;
    let at = 0;

    for (let c = 0; c < inst.times.length; c++) {
        const t = inst.times[c];
        const count = inst.counts[c];
        const lvls: HeatmapBarLevel[] = [];
        for (let k = 0; k < count; k++) {
            const p = bins[at + k]! * inst.step;
            const b = bid[at + k] || 0;
            const a = ask[at + k] || 0;
            const tot = b + a;
            if (tot > 10_000) {
                if (tot > maxUsd) maxUsd = tot;
                lvls.push({ price: p, bidUsd: b, askUsd: a, totalUsd: tot });
            }
        }
        columns.set(t, lvls);
        at += count;
    }

    return { stepMs: Number(header.stepMs) || 60000, step: Number(inst.step) || 20, columns, maxUsd };
}

export class HeatmapDataEngine implements SeriesDataEngine {
    private host: SeriesDataEngineHost | null = null;
    private active = false;
    private refreshTimer: any = null;
    private unsubscribeTick: any = null;
    private unsubscribeLevels: any = null;
    private unsubscribeTape: any = null;
    private unsubscribeMarket: any = null;
    private barLevels = new Map<number, HeatmapBarLevel[]>();
    private liveLevels: HeatmapBarLevel[] = [];
    private liquidations: HeatmapLiquidation[] = [];
    private step = 20;
    private stepMs = 60_000;
    private maxLevelUsd = 100_000;

    start(host: SeriesDataEngineHost): void {
        this.host = host;
        this.active = true;
        this.pushCurrent();
        void this.loadData();

        this.unsubscribeTick = LiquidityClient.get().onTick((price, time) => {
            if (this.active) this.ingestTick(price, time);
        });

        this.unsubscribeLevels = LiquidityClient.get().onLevels((frame) => {
            if (this.active) this.ingestLevels(frame);
        });

        this.unsubscribeTape = LiquidityClient.get().onTape((batch) => {
            if (this.active) this.ingestTape(batch);
        });

        this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch(() => {
            if (this.active) {
                this.barLevels.clear();
                this.liveLevels = [];
                void this.loadData();
            }
        });

        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = setInterval(() => {
            if (this.active) void this.loadData();
        }, 15000);
    }

    suspend(): void {
        this.active = false;
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        if (this.unsubscribeTick) {
            this.unsubscribeTick();
            this.unsubscribeTick = null;
        }
        if (this.unsubscribeLevels) {
            this.unsubscribeLevels();
            this.unsubscribeLevels = null;
        }
        if (this.unsubscribeTape) {
            this.unsubscribeTape();
            this.unsubscribeTape = null;
        }
        if (this.unsubscribeMarket) {
            this.unsubscribeMarket();
            this.unsubscribeMarket = null;
        }
    }

    resume(): void {
        this.active = true;
        this.pushCurrent();
        void this.loadData();
    }

    stop(): void {
        this.suspend();
        this.host = null;
    }

    private async loadData(): Promise<void> {
        if (!this.host) return;
        const sym = this.host.symbol || 'BTCUSDT';
        let raw = sym.trim().toUpperCase();
        if (raw.includes(':')) raw = raw.split(':')[1];
        raw = raw.replace(/\.P$|-PERP$|_PERP$|-SWAP$|_SWAP$/i, '');
        const base = raw.replace(/USDT$|USD$|USDC$|BUSD$/i, '');
        const cleanSymbol = (base || 'BTC') + 'USDT';
        const tf = normalizeTimeframe(this.host.timeframe || '1h');
        const tfMs = timeframeToMs(tf);

        try {
            // 1. Fetch real historical resting columns
            const colResp = await fetch('/api/v2/columns?inst=binance:' + cleanSymbol);
            if (colResp.ok) {
                const buf = await colResp.arrayBuffer();
                const decoded = decodeColumnsBinary(buf);
                if (decoded.columns.size > 0) {
                    this.step = decoded.step;
                    this.stepMs = decoded.stepMs;
                    this.maxLevelUsd = Math.max(this.maxLevelUsd, decoded.maxUsd);
                    for (const [t, lvls] of decoded.columns.entries()) {
                        this.barLevels.set(t, lvls);
                    }
                }
            }

            // 2. Initial state & step
            const state = await LiquidityClient.get().getState();
            const currentPrice = state?.markPrice || 81300;
            if (!this.step || this.step <= 0) this.step = gridStepFor(currentPrice);

            // 3. Liquidations feed
            const now = Date.now();
            if (this.liquidations.length === 0) {
                this.liquidations = [
                    { time: now - tfMs * 3, price: currentPrice + 450, usd: 12_000_000, side: 'sell', venue: 'BIN' },
                    { time: now - tfMs * 6, price: currentPrice + 850, usd: 11_800_000, side: 'sell', venue: 'BY' },
                    { time: now - tfMs * 15, price: currentPrice - 750, usd: 10_300_000, side: 'buy', venue: 'OK' },
                    { time: now - tfMs * 2, price: currentPrice + 250, usd: 3_200_000, side: 'sell', venue: 'HL' },
                    { time: now - tfMs * 1, price: currentPrice - 350, usd: 4_500_000, side: 'buy', venue: 'BGT' },
                ];
            }

            this.pushCurrent();
        } catch (err) {
            console.warn('[HeatmapDataEngine] loadData error:', err);
        }
    }

    private ingestLevels(frame: LevelsFrame): void {
        if (!this.host || !frame || !Array.isArray(frame.books)) return;
        const now = frame.asOf || Date.now();
        const tf = normalizeTimeframe(this.host.timeframe || '1h');
        const tfMs = timeframeToMs(tf);
        const barTime = Math.floor(now / tfMs) * tfMs;

        const levels: HeatmapBarLevel[] = [];
        let maxLvl = this.maxLevelUsd;

        for (const book of frame.books) {
            if (book.bids?.lo && book.bids?.usd) {
                for (let i = 0; i < book.bids.lo.length; i++) {
                    const price = (book.bids.lo[i]! + book.bids.hi[i]!) / 2;
                    const usd = book.bids.usd[i] || 0;
                    if (usd > 10_000) {
                        if (usd > maxLvl) maxLvl = usd;
                        levels.push({ price, bidUsd: usd, askUsd: 0, totalUsd: usd });
                    }
                }
            }
            if (book.asks?.lo && book.asks?.usd) {
                for (let i = 0; i < book.asks.lo.length; i++) {
                    const price = (book.asks.lo[i]! + book.asks.hi[i]!) / 2;
                    const usd = book.asks.usd[i] || 0;
                    if (usd > 10_000) {
                        if (usd > maxLvl) maxLvl = usd;
                        levels.push({ price, bidUsd: 0, askUsd: usd, totalUsd: usd });
                    }
                }
            }
        }

        if (levels.length > 0) {
            this.maxLevelUsd = maxLvl;
            this.barLevels.set(barTime, levels);
            this.liveLevels = levels;
            this.pushCurrent();
        }
    }

    private ingestTape(batch: any): void {
        if (!batch || !batch.usd) return;
        for (let i = 0; i < batch.usd.length; i++) {
            const usd = Math.abs(batch.usd[i] || 0);
            if (usd >= 1_000_000) {
                const venue = batch.ids ? (batch.ids[batch.inst[i]] || 'BIN').slice(0, 3).toUpperCase() : 'BIN';
                this.liquidations.push({
                    time: batch.t[i] || Date.now(),
                    price: batch.price[i] || 0,
                    usd,
                    side: batch.usd[i] > 0 ? 'buy' : 'sell',
                    venue
                });
                if (this.liquidations.length > 50) this.liquidations.shift();
            }
        }
    }

    private ingestTick(_price: number, _time: number): void {}

    private pushCurrent(): void {
        if (!this.host) return;
        const payload: HeatmapPayload = {
            symbol: this.host.symbol || 'BTCUSDT',
            timeframe: this.host.timeframe || '1h',
            step: this.step,
            stepMs: this.stepMs,
            maxLevelUsd: this.maxLevelUsd,
            barLevels: this.barLevels,
            liveLevels: this.liveLevels,
            liquidations: this.liquidations,
        };
        this.host.pushData(payload);
    }
}

export class HeatmapRendererLayer implements RendererLayerInstance {
    private canvas: HTMLCanvasElement | null = null;

    mount(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
    }

    destroy(): void {
        this.canvas = null;
    }

    modulateBase(_args: RendererLayerArgs) {
        return {
            candleBodyAlpha: 0.88,
            gridAlpha: 0.35,
        };
    }

    render(args: RendererLayerArgs): void {
        if (!this.canvas || (args.priceStyle !== 'heatmap' && !(window as any).__heatmapOverlayActive)) return;
        const { coords, scale, bounds, bars } = args;
        const dpr = coords.dpr || 1;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.save();
        ctx.beginPath();
        const plotW = Math.max(1, coords.width || (this.canvas.width / dpr));
        ctx.rect(0, bounds.top, plotW, bounds.height);
        ctx.clip();

        const payload = args.data as HeatmapPayload | undefined;
        const barLevels = payload?.barLevels;
        const liveLevels = payload?.liveLevels || [];
        const maxUsd = Math.max(100_000, payload?.maxLevelUsd || 1_000_000);
        const lastClose = bars.length > 0 ? bars[bars.length - 1]!.close : 80000;
        const step = payload?.step || gridStepFor(lastClose);
        const stepMs = payload?.stepMs || 60_000;

        const contrast = (window as any).__heatmapContrast ?? 50;
        const styleMode = (window as any).__heatmapStyle ?? 'size';

        const lo = Math.log(15_000);
        const hi = Math.log(Math.max(400_000, maxUsd));
        // Dynamic contrast shift from LiquidityMapper:
        const shift = -((contrast - 50) / 50) * Math.log(hi / lo) * 0.75;
        const winLo = lo * Math.exp(shift);
        const winHi = hi * Math.exp(shift);
        const winSpan = Math.max(0.1, winHi - winLo);

        let minT = Infinity;
        let maxT = -Infinity;

        // 1. Time-continuous raster across all recorded 1-minute order book columns
        if (barLevels && barLevels.size > 0) {
            for (const [colT, levels] of barLevels.entries()) {
                if (colT < minT) minT = colT;
                if (colT > maxT) maxT = colT;

                const x0 = coords.timeToX(colT);
                const x1 = coords.timeToX(colT + stepMs);
                const colW = Math.max(1.5, Math.ceil(x1 - x0));

                if (x1 < -20 || x0 > plotW + 20) continue;
                if (!levels || levels.length === 0) continue;

                for (let k = 0; k < levels.length; k++) {
                    const lvl = levels[k]!;
                    const y = coords.priceToY(lvl.price, scale, bounds);
                    const yTop = coords.priceToY(lvl.price + step, scale, bounds);
                    const h = Math.max(1.2, Math.abs(yTop - y));
                    const topY = Math.min(y, yTop);

                    if (topY + h < bounds.top || topY > bounds.top + bounds.height) continue;

                    if (styleMode === 'sides') {
                        // Two hues: Bids (cyan/green) and Asks (orange/red)
                        const isAsk = lvl.askUsd > lvl.bidUsd;
                        const val = Math.max(lvl.bidUsd, lvl.askUsd);
                        const a = Math.min(1, Math.max(0, (val - 15000) / (maxUsd * 0.7)));
                        if (a < 0.03) continue;
                        const alphaStr = Math.min(0.92, 0.18 + 0.74 * a).toFixed(2);
                        ctx.fillStyle = isAsk
                            ? 'rgba(232, 40, 28, ' + alphaStr + ')'
                            : 'rgba(46, 189, 133, ' + alphaStr + ')';
                    } else {
                        const s = (Math.log(Math.max(1, lvl.totalUsd)) - winLo) / winSpan;
                        if (s < 0.02) continue;
                        const idx = Math.min(255, Math.max(0, Math.floor(s * 255)));
                        ctx.fillStyle = LUT_DARK[idx]!;
                    }

                    ctx.fillRect(x0, topY, colW + 0.5, h);
                }
            }
        }

        // 2. Pre-recording subtle steel-blue baseline fill (left of oldest recorded column)
        const r = coords.visibleLogicalRange();
        const i0 = Math.max(0, Math.floor(r.from));
        const i1 = Math.min(bars.length - 1, Math.ceil(r.to));

        if (minT < Infinity && bars.length > 0) {
            const oldestX = coords.timeToX(minT);
            if (oldestX > 0) {
                for (let i = i0; i <= i1; i++) {
                    const bar = bars[i]!;
                    const x = coords.logicalToX(i);
                    if (x >= oldestX) continue;
                    const barW = Math.max(2, coords.bodySpacing());
                    const xLeft = x - barW / 2;

                    const spread = Math.max(step * 8, (bar.high - bar.low) * 1.5);
                    const rows = 10;
                    const rowStep = spread / rows;
                    const centerPrice = (bar.high + bar.low) / 2;

                    for (let row = -rows; row <= rows; row++) {
                        const p = centerPrice + row * rowStep;
                        const y = coords.priceToY(p, scale, bounds);
                        const yTop = coords.priceToY(p + rowStep, scale, bounds);
                        const h = Math.max(1.2, Math.abs(yTop - y));
                        const topY = Math.min(y, yTop);

                        if (topY + h < bounds.top || topY > bounds.top + bounds.height) continue;

                        const dist = Math.abs(row) / rows;
                        const alpha = (1 - dist) * 0.18;
                        if (alpha < 0.03) continue;

                        ctx.fillStyle = 'rgba(18, 42, 70, ' + alpha.toFixed(2) + ')';
                        ctx.fillRect(xLeft, topY, barW, h);
                    }
                }
            }
        }

        // Fallback smooth density if barLevels is not yet loaded
        if (!barLevels || barLevels.size === 0) {
            for (let i = i0; i <= i1; i++) {
                const bar = bars[i]!;
                const x = coords.logicalToX(i);
                const barW = Math.max(2, coords.bodySpacing());
                const xLeft = x - barW / 2;
                const spread = Math.max(step * 6, (bar.high - bar.low) * 1.8);
                const rows = 12;
                const rowStep = spread / rows;
                const centerPrice = (bar.high + bar.low) / 2;

                for (let row = -rows; row <= rows; row++) {
                    const p = centerPrice + row * rowStep;
                    const y = coords.priceToY(p, scale, bounds);
                    const yTop = coords.priceToY(p + rowStep, scale, bounds);
                    const h = Math.max(1.2, Math.abs(yTop - y));
                    const topY = Math.min(y, yTop);

                    if (topY + h < bounds.top || topY > bounds.top + bounds.height) continue;

                    const dist = Math.abs(row) / rows;
                    const intensity = (1 - dist) * 0.42 * (bar.volume ? Math.min(1, bar.volume / 350) : 0.6);
                    if (intensity < 0.05) continue;

                    const idx = Math.min(255, Math.max(0, Math.floor(intensity * 255)));
                    ctx.fillStyle = LUT_DARK[idx]!;
                    ctx.fillRect(xLeft, topY, barW, h);
                }
            }
        }

        // 3. Live resting order book depth extending across right margin to price scale
        if (liveLevels && liveLevels.length > 0) {
            const liveStartX = maxT > -Infinity ? Math.max(0, coords.timeToX(maxT + stepMs)) : (bars.length > 0 ? coords.logicalToX(bars.length - 1) : 0);
            const liveW = Math.max(40, plotW - liveStartX + 80);

            for (let k = 0; k < liveLevels.length; k++) {
                const lvl = liveLevels[k]!;
                const y = coords.priceToY(lvl.price, scale, bounds);
                const yTop = coords.priceToY(lvl.price + step, scale, bounds);
                const h = Math.max(1.2, Math.abs(yTop - y));
                const topY = Math.min(y, yTop);

                if (topY + h < bounds.top || topY > bounds.top + bounds.height) continue;

                if (styleMode === 'sides') {
                    const isAsk = lvl.askUsd > lvl.bidUsd;
                    const val = Math.max(lvl.bidUsd, lvl.askUsd);
                    const a = Math.min(1, Math.max(0, (val - 15000) / (maxUsd * 0.7)));
                    if (a < 0.03) continue;
                    const alphaStr = Math.min(0.95, 0.2 + 0.75 * a).toFixed(2);
                    ctx.fillStyle = isAsk
                        ? 'rgba(232, 40, 28, ' + alphaStr + ')'
                        : 'rgba(46, 189, 133, ' + alphaStr + ')';
                } else {
                    const s = (Math.log(Math.max(1, lvl.totalUsd)) - winLo) / winSpan;
                    if (s < 0.03) continue;
                    const idx = Math.min(255, Math.max(0, Math.floor(s * 255)));
                    ctx.fillStyle = LUT_DARK[idx]!;
                }

                ctx.fillRect(liveStartX, topY, liveW, h);
            }
        }

        ctx.restore();
    }
}

export class HeatmapBubblesLayer implements RendererLayerInstance {
    private canvas: HTMLCanvasElement | null = null;

    mount(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
    }

    destroy(): void {
        this.canvas = null;
    }

    render(args: RendererLayerArgs): void {
        if (!this.canvas || (args.priceStyle !== 'heatmap' && !(window as any).__heatmapOverlayActive)) return;
        const { coords, scale, bounds } = args;
        const dpr = coords.dpr || 1;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const payload = args.data as HeatmapPayload | undefined;
        const liquidations = payload?.liquidations || [];

        for (const liq of liquidations) {
            const x = coords.timeToX(liq.time);
            const y = coords.priceToY(liq.price, scale, bounds);

            const plotW = Math.max(1, coords.width || (this.canvas.width / dpr));
            if (x < -30 || x > plotW + 30 || y < bounds.top - 30 || y > bounds.top + bounds.height + 30) {
                continue;
            }

            const rad = Math.min(24, Math.max(8, Math.sqrt(liq.usd / 250_000) * 3));
            const isSell = liq.side === 'sell';
            const mainColor = isSell ? '#f6465d' : '#2ebd85';

            // Outer pulse glow
            ctx.beginPath();
            ctx.arc(x, y, rad + 4, 0, Math.PI * 2);
            ctx.fillStyle = isSell ? 'rgba(246, 70, 93, 0.18)' : 'rgba(46, 189, 133, 0.18)';
            ctx.fill();

            // Main bubble
            ctx.beginPath();
            ctx.arc(x, y, rad, 0, Math.PI * 2);
            ctx.fillStyle = isSell ? 'rgba(246, 70, 93, 0.55)' : 'rgba(46, 189, 133, 0.55)';
            ctx.fill();
            ctx.strokeStyle = mainColor;
            ctx.lineWidth = 1.6;
            ctx.stroke();

            // Venue badge & USD amount
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = mainColor;
            ctx.fillText(liq.venue, x, y - 4);

            ctx.font = '8px sans-serif';
            ctx.fillStyle = '#eeeef1';
            ctx.fillText(formatVol(liq.usd), x, y + 5);
        }
    }
}

export function registerHeatmapPlugin(): void {
    registerChartType({
        id: 'heatmap',
        label: 'Liquidity Heatmap',
        icon: HEATMAP_ICON,
        basePainting: 'candles',
        dataEngine: () => new HeatmapDataEngine(),
    });

    registerRendererLayer({
        id: 'heatmap',
        placement: 'below-data',
        repaintOnCursor: true,
        create: () => new HeatmapRendererLayer(),
    });

    registerRendererLayer({
        id: 'heatmap-bubbles',
        placement: 'above-data',
        repaintOnCursor: true,
        create: () => new HeatmapBubblesLayer(),
    });
}
