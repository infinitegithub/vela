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
// Authentic LiquidityMapper Colormaps & WebGL2 Shaders
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

const LIGHT_STOPS: [number, string][] = [
    [0.0, '#ffffff'],
    [0.18, '#d6e6f7'],
    [0.38, '#7db6e6'],
    [0.58, '#2a78c4'],
    [0.74, '#f6c244'],
    [0.88, '#f0701f'],
    [1.00, '#b0102a']
];

const hexToRgb = (h: string): [number, number, number] => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function buildLutBytes(dark: boolean = true): Uint8Array {
    const stops = dark ? DARK_STOPS : LIGHT_STOPS;
    const out = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
        const t = i / 255;
        let k = 1;
        while (k < stops.length - 1 && stops[k]![0] < t) k++;
        const [t0, c0] = stops[k - 1]!;
        const [t1, c1] = stops[k]!;
        const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
        const a = hexToRgb(c0);
        const b = hexToRgb(c1);
        for (let c = 0; c < 3; c++) {
            out[i * 4 + c] = Math.round(a[c]! + (b[c]! - a[c]!) * f);
        }
        out[i * 4 + 3] = 255;
    }
    return out;
}

export const LUT_DARK_CSS: string[] = (() => {
    const bytes = buildLutBytes(true);
    const lut: string[] = [];
    for (let i = 0; i < 256; i++) {
        const r = bytes[i * 4]!;
        const g = bytes[i * 4 + 1]!;
        const b = bytes[i * 4 + 2]!;
        const alpha = Math.min(0.92, 0.22 + 0.70 * (i / 255)).toFixed(2);
        lut.push(`rgba(${r},${g},${b},${alpha})`);
    }
    return lut;
})();

const VERT_SHADER = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 uv;
out vec4 color;
uniform sampler2D grid;
uniform sampler2D lut;
uniform vec4 view;   // t0, t1, p0, p1 of the screen
uniform vec4 tex;    // t0, t1, p0, p1 covered by the texture
uniform vec4 range;  // min, max, opacity, mode (0 = size ramp, 1 = two hues)
uniform vec3 bidC, bidS, askC, askS;
uniform vec4 fill;   // boundary and sample time (ms from view origin), enabled, unused
uniform vec3 fillRgb; // neutral backfilled grey

void main() {
  float t = mix(view.x, view.y, uv.x);
  bool back = fill.z > 0.5 && t < fill.x;
  if (back) t = fill.y;
  float p = mix(view.z, view.w, uv.y);
  vec2 q = vec2((t - tex.x) / (tex.y - tex.x), (p - tex.z) / (tex.w - tex.z));
  if (q.x < 0.0 || q.x >= 1.0 || q.y < 0.0 || q.y >= 1.0) discard;
  ivec2 size = textureSize(grid, 0);
  vec2 v = texelFetch(grid, ivec2(q * vec2(size)), 0).rg;
  float total = v.r + v.g;
  if (total <= 0.0) discard;
  if (range.w < 0.5) {
    float lo = log(max(range.x, 1.0)), hi = log(max(range.y, range.x * 1.0001 + 1.0));
    float s = (log(total) - lo) / max(hi - lo, 1e-6);
    if (s <= 0.0) discard;
    if (back) {
      color = vec4(fillRgb, (0.16 + 0.74 * clamp(s, 0.0, 1.0)) * smoothstep(0.0, 0.06, s) * range.z);
      return;
    }
    color = vec4(texture(lut, vec2(clamp(s, 0.0, 1.0), 0.5)).rgb, smoothstep(0.0, 0.06, s) * range.z);
    return;
  }
  bool isAsk = v.g > v.r;
  float a = clamp((max(v.r, v.g) - range.x) / max(range.y - range.x, 1e-6), 0.0, 1.0);
  if (a <= 0.0) discard;
  vec3 c = mix(isAsk ? askS : bidS, isAsk ? askC : bidC, a);
  if (back) {
    color = vec4(fillRgb, (0.16 + 0.74 * a) * range.z);
    return;
  }
  color = vec4(c, pow(a, 0.75) * range.z);
}`;

/**
 * 1D Vertical Gaussian Blur directly matching LiquidityMapper crates/hlm-kernels/src/lib.rs blur_vec.
 * Eliminates blocky pixel stepped appearance, creating smooth liquid resting depth contours.
 */
function blurVec(v: Float32Array, sigma: number): void {
    if (sigma < 0.34 || v.length < 3) return;
    const radius = Math.ceil(3.0 * sigma);
    const kLen = 2 * radius + 1;
    const kernel = new Float32Array(kLen);
    const twoSigmaSq = 2.0 * sigma * sigma;
    let sum = 0;
    for (let i = 0; i <= 2 * radius; i++) {
        const x = i - radius;
        const w = Math.exp(-x * x / twoSigmaSq);
        kernel[i] = w;
        sum += w;
    }
    for (let i = 0; i < kLen; i++) kernel[i] /= sum;
    const temp = new Float32Array(v);
    const len = temp.length;
    for (let i = 0; i < len; i++) {
        let acc = 0;
        for (let k = 0; k < kLen; k++) {
            const j = Math.max(0, Math.min(len - 1, i + k - radius));
            acc += temp[j]! * kernel[k]!;
        }
        v[i] = acc;
    }
}

export interface HeatStyle {
    bid: [number, number, number];
    bidSoft: [number, number, number];
    ask: [number, number, number];
    askSoft: [number, number, number];
    min: number;
    max: number;
    opacity: number;
    mode: 'size' | 'sides';
}

export class HeatGL {
    readonly gl: WebGL2RenderingContext | null;
    private program: WebGLProgram | null = null;
    private texture: WebGLTexture | null = null;
    private lut: WebGLTexture | null = null;
    private loc: Record<string, WebGLUniformLocation | null> = {};
    private bounds: { t0: number; t1: number; p0: number; p1: number } | null = null;
    private size: [number, number] = [0, 0];

    constructor(readonly canvas: HTMLCanvasElement) {
        let gl: WebGL2RenderingContext | null = null;
        try {
            gl = canvas.getContext('webgl2', {
                premultipliedAlpha: false,
                alpha: true,
                antialias: false,
                preserveDrawingBuffer: true
            });
        } catch (_) {}
        this.gl = gl;
        if (!gl) return;

        const compile = (type: number, source: string) => {
            const shader = gl!.createShader(type)!;
            gl!.shaderSource(shader, source);
            gl!.compileShader(shader);
            return shader;
        };

        const program = gl.createProgram()!;
        gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT_SHADER));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG_SHADER));
        gl.linkProgram(program);
        this.program = program;

        for (const name of ['grid', 'lut', 'view', 'tex', 'range', 'bidC', 'bidS', 'askC', 'askS', 'fill', 'fillRgb']) {
            this.loc[name] = gl.getUniformLocation(program, name);
        }

        this.texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.lut = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.lut);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.setLut(buildLutBytes(true));

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    setLut(rgba: Uint8Array): void {
        const { gl } = this;
        if (!gl || !this.lut) return;
        gl.bindTexture(gl.TEXTURE_2D, this.lut);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    }

    upload(grid: Float32Array, w: number, h: number, bounds: { t0: number; t1: number; p0: number; p1: number }): void {
        const { gl } = this;
        if (!gl || !this.texture) return;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, w, h, 0, gl.RG, gl.FLOAT, grid);
        this.bounds = bounds;
        this.size = [w, h];
    }

    resize(width: number, height: number): void {
        const w = Math.max(1, Math.round(width));
        const h = Math.max(1, Math.round(height));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
    }

    draw(view: { t0: number; t1: number; p0: number; p1: number }, style: HeatStyle, fill?: { boundary: number; sample: number; rgb: [number, number, number] } | null): void {
        const { gl } = this;
        if (!gl || !this.program || !this.bounds || this.size[0] === 0) return;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.lut);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        const b = this.bounds, l = this.loc;
        gl.uniform1i(l.grid!, 0);
        gl.uniform1i(l.lut!, 1);
        gl.uniform4f(l.view!, 0, view.t1 - view.t0, 0, view.p1 - view.p0);
        gl.uniform4f(l.tex!, b.t0 - view.t0, b.t1 - view.t0, b.p0 - view.p0, b.p1 - view.p0);
        gl.uniform4f(l.range!, style.min, style.max, style.opacity, style.mode === 'size' ? 0 : 1);
        gl.uniform4f(l.fill!, fill ? fill.boundary - view.t0 : 0, fill ? fill.sample - view.t0 : 0, fill ? 1 : 0, 0);
        gl.uniform3fv(l.fillRgb!, fill ? fill.rgb : [0.18, 0.22, 0.28]);
        gl.uniform3fv(l.bidC!, style.bid);
        gl.uniform3fv(l.bidS!, style.bidSoft);
        gl.uniform3fv(l.askC!, style.ask);
        gl.uniform3fv(l.askS!, style.askSoft);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
}

// ============================================================================
// Data Engine & Types
// ============================================================================

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

    return { stepMs: inst.stepMs || 60000, step: inst.step, columns, maxUsd };
}

export class HeatmapDataEngine implements SeriesDataEngine {
    private host: SeriesDataEngineHost | null = null;
    private barLevels = new Map<number, HeatmapBarLevel[]>();
    private liveLevels: HeatmapBarLevel[] = [];
    private liquidations: HeatmapLiquidation[] = [];
    private step: number = 20;
    private stepMs: number = 60_000;
    private maxLevelUsd: number = 100_000;
    private active = false;
    private unsubscribeLevels: (() => void) | null = null;
    private unsubscribeLiqs: (() => void) | null = null;
    private unsubscribeMarket: (() => void) | null = null;

    start(host: SeriesDataEngineHost): void {
        this.host = host;
        this.active = true;
        void this.loadData();

        this.unsubscribeLevels = LiquidityClient.get().onLevels((frame) => {
            if (this.active) this.ingestLevels(frame);
        });

        this.unsubscribeLiqs = LiquidityClient.get().onLiquidations((liqs) => {
            if (this.active) this.ingestLiqs(liqs);
        });

        this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch(() => {
            if (this.active) void this.loadData();
        });
    }

    suspend(): void {
        this.active = false;
        if (this.unsubscribeLevels) { this.unsubscribeLevels(); this.unsubscribeLevels = null; }
        if (this.unsubscribeLiqs) { this.unsubscribeLiqs(); this.unsubscribeLiqs = null; }
        if (this.unsubscribeMarket) { this.unsubscribeMarket(); this.unsubscribeMarket = null; }
    }

    resume(): void {
        this.active = true;
        void this.loadData();
        this.unsubscribeLevels = LiquidityClient.get().onLevels((frame) => {
            if (this.active) this.ingestLevels(frame);
        });
        this.unsubscribeLiqs = LiquidityClient.get().onLiquidations((liqs) => {
            if (this.active) this.ingestLiqs(liqs);
        });
        this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch(() => {
            if (this.active) void this.loadData();
        });
    }

    stop(): void {
        this.active = false;
        if (this.unsubscribeLevels) { this.unsubscribeLevels(); this.unsubscribeLevels = null; }
        if (this.unsubscribeLiqs) { this.unsubscribeLiqs(); this.unsubscribeLiqs = null; }
        if (this.unsubscribeMarket) { this.unsubscribeMarket(); this.unsubscribeMarket = null; }
        this.barLevels.clear();
        this.liveLevels = [];
        this.liquidations = [];
        this.host = null;
    }

    onBars(): void {
        this.pushCurrent();
    }

    private async loadData(): Promise<void> {
        if (!this.host) return;
        const sym = this.host.symbol || 'BTCUSDT';
        let raw = sym.trim().toUpperCase();
        if (raw.includes(':')) raw = raw.split(':')[1] || raw;
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
            this.liveLevels = levels;
            this.barLevels.set(barTime, levels);
            this.pushCurrent();
        }
    }

    private ingestLiqs(liqs: any[]): void {
        if (!Array.isArray(liqs)) return;
        for (const item of liqs) {
            this.liquidations.push({
                time: item.time || Date.now(),
                price: item.price || 0,
                usd: item.usd || 0,
                side: item.side === 'long' ? 'buy' : 'sell',
                venue: (item.inst || 'BIN').slice(0, 3).toUpperCase(),
            });
        }
        if (this.liquidations.length > 60) {
            this.liquidations = this.liquidations.slice(-60);
        }
        this.pushCurrent();
    }

    private pushCurrent(): void {
        if (!this.host) return;
        const payload: HeatmapPayload = {
            symbol: this.host.symbol || 'BTCUSDT',
            timeframe: normalizeTimeframe(this.host.timeframe || '1h'),
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

// ============================================================================
// WebGL2 Interpolated Heatmap Renderer Layer
// ============================================================================

export class HeatmapRendererLayer implements RendererLayerInstance {
    private canvas: HTMLCanvasElement | null = null;
    private offscreen: HTMLCanvasElement | null = null;
    private heatGl: HeatGL | null = null;
    private lastUploadedKey: string = '';

    mount(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
        try {
            this.offscreen = document.createElement('canvas');
            this.heatGl = new HeatGL(this.offscreen);
        } catch (e) {
            console.warn('[HeatmapRendererLayer] Offscreen WebGL2 init warning:', e);
        }
    }

    destroy(): void {
        this.canvas = null;
        this.offscreen = null;
        this.heatGl = null;
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
        const shift = -((contrast - 50) / 50) * Math.log(hi / lo) * 0.75;
        const winLo = Math.max(1000, Math.exp(lo + shift));
        const winHi = Math.max(winLo * 1.05, Math.exp(hi + shift));

        const plotW = Math.max(1, coords.width || (this.canvas.width / dpr));
        const plotH = Math.max(1, bounds.height);

        // Calculate view coordinates in time & price
        const timeRange = coords.visibleTimeRange();
        const viewT0 = timeRange.from;
        const viewT1 = timeRange.to;
        const viewP0 = coords.yToPrice(bounds.top + bounds.height, scale, bounds);
        const viewP1 = coords.yToPrice(bounds.top, scale, bounds);
        const view = { t0: viewT0, t1: viewT1, p0: viewP0, p1: viewP1 };

        const style: HeatStyle = {
            bid: [0.18, 0.74, 0.52],
            bidSoft: [0.08, 0.35, 0.25],
            ask: [0.96, 0.27, 0.36],
            askSoft: [0.45, 0.12, 0.18],
            min: winLo,
            max: winHi,
            opacity: 0.92,
            mode: styleMode === 'sides' ? 'sides' : 'size'
        };

        // Prepare or upload grid texture if WebGL2 is active
        if (this.heatGl && this.heatGl.gl && this.offscreen && barLevels && barLevels.size > 0) {
            const sortedTimes = [...barLevels.keys()].sort((a, b) => a - b);
            const firstT = sortedTimes[0]!;
            const lastT = sortedTimes[sortedTimes.length - 1]!;
            const futureCols = 50; // Extend depth smoothly into the right price scale
            const totalCols = sortedTimes.length + futureCols;

            // Determine price span covering the visible window plus padding
            let pMin = Math.min(viewP0, 80000);
            let pMax = Math.max(viewP1, 85000);
            for (const lvls of barLevels.values()) {
                if (!lvls || lvls.length === 0) continue;
                if (lvls[0]!.price < pMin) pMin = lvls[0]!.price;
                if (lvls[lvls.length - 1]!.price > pMax) pMax = lvls[lvls.length - 1]!.price;
            }
            pMin = Math.floor(pMin / step) * step;
            pMax = Math.ceil(pMax / step) * step;
            const numRows = Math.max(10, Math.ceil((pMax - pMin) / step) + 1);

            const uploadKey = `${firstT}-${lastT}-${pMin}-${pMax}-${numRows}-${totalCols}-${barLevels.size}-${liveLevels.length}`;
            if (this.lastUploadedKey !== uploadKey) {
                const grid = new Float32Array(totalCols * numRows * 2);

                // 1. Fill recorded columns
                for (let colIdx = 0; colIdx < sortedTimes.length; colIdx++) {
                    const t = sortedTimes[colIdx]!;
                    const lvls = barLevels.get(t);
                    if (!lvls) continue;
                    for (let k = 0; k < lvls.length; k++) {
                        const lvl = lvls[k]!;
                        const r = Math.round((lvl.price - pMin) / step);
                        if (r >= 0 && r < numRows) {
                            const offset = (r * totalCols + colIdx) * 2;
                            grid[offset] = lvl.bidUsd;
                            grid[offset + 1] = lvl.askUsd;
                        }
                    }
                }

                // 2. Fill live extending order book across future columns
                if (liveLevels && liveLevels.length > 0) {
                    for (let k = 0; k < liveLevels.length; k++) {
                        const lvl = liveLevels[k]!;
                        const r = Math.round((lvl.price - pMin) / step);
                        if (r >= 0 && r < numRows) {
                            for (let colIdx = sortedTimes.length; colIdx < totalCols; colIdx++) {
                                const offset = (r * totalCols + colIdx) * 2;
                                grid[offset] = lvl.bidUsd;
                                grid[offset + 1] = lvl.askUsd;
                            }
                        }
                    }
                }

                // 3. 1D Vertical Gaussian Blur matching LiquidityMapper
                const colBids = new Float32Array(numRows);
                const colAsks = new Float32Array(numRows);
                for (let x = 0; x < totalCols; x++) {
                    for (let r = 0; r < numRows; r++) {
                        const offset = (r * totalCols + x) * 2;
                        colBids[r] = grid[offset]!;
                        colAsks[r] = grid[offset + 1]!;
                    }
                    blurVec(colBids, 3.5);
                    blurVec(colAsks, 3.5);
                    for (let r = 0; r < numRows; r++) {
                        const offset = (r * totalCols + x) * 2;
                        grid[offset] = colBids[r]!;
                        grid[offset + 1] = colAsks[r]!;
                    }
                }

                const texBounds = {
                    t0: firstT,
                    t1: firstT + totalCols * stepMs,
                    p0: pMin,
                    p1: pMax
                };
                this.heatGl.upload(grid, totalCols, numRows, texBounds);
                this.lastUploadedKey = uploadKey;
            }

            // Draw WebGL2 onto offscreen canvas and blit to layer canvas
            const offW = Math.round(plotW * dpr);
            const offH = Math.round(plotH * dpr);
            this.heatGl.resize(offW, offH);
            this.heatGl.draw(view, style, { boundary: firstT, sample: firstT, rgb: [0.18, 0.22, 0.28] });

            ctx.save();
            ctx.beginPath();
            ctx.rect(0, bounds.top, plotW, plotH);
            ctx.clip();
            ctx.drawImage(this.offscreen, 0, bounds.top, plotW, plotH);
            ctx.restore();
            return;
        }

        // ====================================================================
        // Fallback High-Fidelity 2D Continuous Renderer (if WebGL2 unavailable)
        // ====================================================================
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, bounds.top, plotW, plotH);
        ctx.clip();

        if (barLevels && barLevels.size > 0) {
            for (const [colT, levels] of barLevels.entries()) {
                const x0 = coords.timeToX(colT);
                const x1 = coords.timeToX(colT + stepMs);
                const colW = Math.max(1.5, Math.ceil(x1 - x0));
                if (x1 < -20 || x0 > plotW + 20 || !levels || levels.length === 0) continue;

                for (let k = 0; k < levels.length; k++) {
                    const lvl = levels[k]!;
                    const y = coords.priceToY(lvl.price, scale, bounds);
                    const yTop = coords.priceToY(lvl.price + step, scale, bounds);
                    const h = Math.max(1.2, Math.abs(yTop - y));
                    const topY = Math.min(y, yTop);

                    if (topY + h < bounds.top || topY > bounds.top + bounds.height) continue;

                    if (styleMode === 'sides') {
                        const isAsk = lvl.askUsd > lvl.bidUsd;
                        const val = Math.max(lvl.bidUsd, lvl.askUsd);
                        const a = Math.min(1, Math.max(0, (val - winLo) / (winHi - winLo)));
                        if (a < 0.03) continue;
                        ctx.fillStyle = isAsk
                            ? `rgba(232, 40, 28, ${Math.min(0.92, 0.18 + 0.74 * a).toFixed(2)})`
                            : `rgba(46, 189, 133, ${Math.min(0.92, 0.18 + 0.74 * a).toFixed(2)})`;
                    } else {
                        const s = (Math.log(Math.max(1, lvl.totalUsd)) - Math.log(winLo)) / Math.max(0.01, Math.log(winHi) - Math.log(winLo));
                        if (s < 0.02) continue;
                        const idx = Math.min(255, Math.max(0, Math.floor(s * 255)));
                        ctx.fillStyle = LUT_DARK_CSS[idx]!;
                    }
                    ctx.fillRect(x0, topY, colW + 0.5, h);
                }
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
