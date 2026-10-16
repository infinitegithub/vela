import {
    registerChartType,
    registerRendererLayer,
    type SeriesDataEngine,
    type SeriesDataEngineHost,
    type RendererLayerInstance,
    type RendererLayerArgs,
} from '../src/plugin';
import { VALID, INVALID, HIGHLIGHT, NEUTRAL, MUTED } from '../src/core/palette';

export interface PriceBucketLevel {
    price: number;
    bidVolume: number;
    askVolume: number;
    totalVolume: number;
    delta: number;
    tradeCount: number;
}

export interface ClientFootprintBar {
    symbol: string;
    time: number;
    timeframe: string;
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
    levels: PriceBucketLevel[];
}

export interface FootprintPayload {
    symbol: string;
    timeframe: string;
    bucketSize: number;
    bars: ClientFootprintBar[];
}

export function formatCompactVolume(val: number): string {
    if (val === 0) return '0';
    const abs = Math.abs(val);
    if (abs >= 1000000) return `${(val / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${(val / 1000).toFixed(1)}k`;
    if (abs < 0.1) return val.toFixed(3);
    if (abs < 1) return val.toFixed(2);
    return val.toFixed(1);
}

function cleanSymbol(sym: string): string {
    const raw = sym.includes(':') ? sym.split(':')[1]! : sym;
    return raw.replace(/\.P$/i, '').toUpperCase().trim();
}

/**
 * DataEngine for Footprint chart type:
 * Fetches real trade footprint bars from /api/footprint and subscribes to /api/footprint/live.
 */
export class FootprintDataEngine implements SeriesDataEngine {
    private host: SeriesDataEngineHost | null = null;
    private sse: EventSource | null = null;
    private bars: ClientFootprintBar[] = [];
    private bucketSize: number = 1.0;
    private active = false;

    start(host: SeriesDataEngineHost): void {
        this.host = host;
        this.active = true;
        this.loadHistory();
        this.connectLive();
    }

    suspend(): void {
        this.active = false;
        if (this.sse) {
            this.sse.close();
            this.sse = null;
        }
    }

    resume(): void {
        this.active = true;
        this.loadHistory();
        this.connectLive();
    }

    stop(): void {
        this.active = false;
        if (this.sse) {
            this.sse.close();
            this.sse = null;
        }
        this.bars = [];
        this.host = null;
    }

    onBars(): void {
        if (!this.host || !this.active) return;
        this.pushCurrent();
    }

    onViewport(_range: { from: number; to: number }): void {
        // Viewport pan/zoom
    }

    private async loadHistory(): Promise<void> {
        if (!this.host) return;
        const symbol = cleanSymbol(this.host.symbol || 'BTCUSDT');
        const timeframe = this.host.timeframe || '1m';

        try {
            const url = `/api/footprint?symbol=${symbol}&timeframe=${timeframe}`;
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json() as { bars: ClientFootprintBar[]; bucketSize: number };
            this.bars = data.bars || [];
            this.bucketSize = data.bucketSize || 1.0;
            this.pushCurrent();
        } catch (err) {
            console.error('[FootprintDataEngine] Failed to load history:', err);
        }
    }

    private connectLive(): void {
        if (!this.host || typeof window === 'undefined' || !window.EventSource) return;
        const symbol = cleanSymbol(this.host.symbol || 'BTCUSDT');
        const timeframe = this.host.timeframe || '1m';

        if (this.sse) {
            this.sse.close();
            this.sse = null;
        }

        try {
            const sseUrl = `/api/footprint/live?symbol=${symbol}&timeframe=${timeframe}`;
            this.sse = new EventSource(sseUrl);

            this.sse.onmessage = (event) => {
                if (!event.data || !this.active) return;
                try {
                    const parsed = JSON.parse(event.data);
                    if (parsed.type === 'bar' && parsed.data) {
                        const newBar = parsed.data as ClientFootprintBar;
                        const existingIdx = this.bars.findIndex((b) => b.time === newBar.time);
                        if (existingIdx >= 0) {
                            this.bars[existingIdx] = newBar;
                        } else {
                            this.bars.push(newBar);
                        }
                        this.pushCurrent();
                    }
                } catch {}
            };
        } catch (err) {
            console.warn('[FootprintDataEngine] SSE connection warning:', err);
        }
    }

    private pushCurrent(): void {
        if (!this.host) return;
        const payload: FootprintPayload = {
            symbol: cleanSymbol(this.host.symbol || 'BTCUSDT'),
            timeframe: this.host.timeframe || '1m',
            bucketSize: this.bucketSize,
            bars: this.bars,
        };
        this.host.pushData(payload);
    }
}

/**
 * RendererLayer for Footprint:
 * Draws bid x ask ladder, imbalances, POC, "no data" states, and docked stats table.
 */
export class FootprintRendererLayer implements RendererLayerInstance {
    private canvas: HTMLCanvasElement | null = null;
    private imbalanceRatio = 3.0;

    mount(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
    }

    destroy(): void {
        this.canvas = null;
    }

    render(args: RendererLayerArgs): void {
        if (!this.canvas || args.priceStyle !== 'footprint') return;

        const { coords, scale, bounds } = args;
        const dpr = coords.dpr || 1;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, coords.width, coords.height);

        const payload = args.data as FootprintPayload | undefined;
        const fpBars = payload?.bars || [];
        const bucketSize = payload?.bucketSize || 1.0;

        // Map footprint bars by timestamp
        const barMap = new Map<number, ClientFootprintBar>();
        for (const b of fpBars) {
            barMap.set(b.time, b);
        }

        const statsTableHeight = 72;
        const statsRowHeight = 14;
        const tableTop = bounds.top + bounds.height - statsTableHeight;

        // --- 1. RENDER LADDERS (clipped strictly above stats table) ---
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, bounds.top, coords.width, Math.max(10, bounds.height - statsTableHeight));
        ctx.clip();

        const bodySpacing = coords.bodySpacing();
        const barWidth = Math.max(14, Math.min(180, bodySpacing * 0.86));
        const showFullLadder = barWidth >= 36;

        for (let i = 0; i < args.bars.length; i++) {
            const chartBar = args.bars[i]!;
            const x = coords.timeToX(chartBar.time);

            // Viewport culling
            if (x + barWidth < 0 || x - barWidth > coords.width) continue;

            const fpBar = barMap.get(chartBar.time);

            if (!fpBar || !fpBar.levels || fpBar.levels.length === 0) {
                // "NO DATA" State: No trade data available for this bar (never fake numbers)
                const yHigh = coords.priceToY(chartBar.high, scale, bounds);
                const yLow = coords.priceToY(chartBar.low, scale, bounds);
                const yOpen = coords.priceToY(chartBar.open, scale, bounds);
                const yClose = coords.priceToY(chartBar.close, scale, bounds);

                // Draw faded wick
                ctx.strokeStyle = 'rgba(117, 120, 130, 0.4)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, yHigh);
                ctx.lineTo(x, yLow);
                ctx.stroke();

                // Draw faded hollow body
                const bodyY = Math.min(yOpen, yClose);
                const bodyH = Math.max(2, Math.abs(yClose - yOpen));
                ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                ctx.fillRect(x - barWidth / 2, bodyY, barWidth, bodyH);
                ctx.strokeStyle = 'rgba(117, 120, 130, 0.4)';
                ctx.strokeRect(x - barWidth / 2, bodyY, barWidth, bodyH);

                // "no data" text
                if (barWidth >= 40 && bodyH >= 12) {
                    ctx.fillStyle = NEUTRAL;
                    ctx.font = '9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('no data', x, bodyY + bodyH / 2);
                }
                continue;
            }

            // Real Footprint Bar Ladder
            const left = x - barWidth / 2;
            const halfWidth = barWidth / 2;

            // Map levels by integer bucket index for robust diagonal lookup: k = round(price / bucketSize)
            const indexMap = new Map<number, PriceBucketLevel>();
            for (const lvl of fpBar.levels) {
                indexMap.set(Math.round(lvl.price / bucketSize), lvl);
            }

            for (const lvl of fpBar.levels) {
                const yTop = coords.priceToY(lvl.price + bucketSize, scale, bounds);
                const yBottom = coords.priceToY(lvl.price, scale, bounds);
                const cellY = Math.min(yTop, yBottom);
                const cellH = Math.max(1.5, Math.abs(yBottom - yTop));

                const isPoc = (lvl.price === fpBar.poc);
                const k = Math.round(lvl.price / bucketSize);

                // Diagonal imbalance detection
                // Buy Imbalance: Ask at price P (index k) vs Bid at price P - 1 bucket (index k - 1)
                const lvlBelow = indexMap.get(k - 1);
                const buyImbalance = Boolean(
                    lvlBelow &&
                    lvl.askVolume > 0 &&
                    (lvlBelow.bidVolume === 0 || lvl.askVolume >= lvlBelow.bidVolume * this.imbalanceRatio)
                );

                // Sell Imbalance: Bid at price P (index k) vs Ask at price P + 1 bucket (index k + 1)
                const lvlAbove = indexMap.get(k + 1);
                const sellImbalance = Boolean(
                    lvlAbove &&
                    lvl.bidVolume > 0 &&
                    (lvlAbove.askVolume === 0 || lvl.bidVolume >= lvlAbove.askVolume * this.imbalanceRatio)
                );

                // Bid cell background (left column)
                if (sellImbalance) {
                    ctx.fillStyle = 'rgba(246, 70, 93, 0.28)';
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                }
                ctx.fillRect(left, cellY, halfWidth, cellH);

                // Ask cell background (right column)
                if (buyImbalance) {
                    ctx.fillStyle = 'rgba(14, 203, 129, 0.28)';
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                }
                ctx.fillRect(x, cellY, halfWidth, cellH);

                // Divider line between bid and ask
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, cellY);
                ctx.lineTo(x, cellY + cellH);
                ctx.stroke();

                // POC Highlight (gold outline around entire bar level)
                if (isPoc) {
                    ctx.strokeStyle = HIGHLIGHT;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(left, cellY, barWidth, cellH);
                }

                // Ladder Text
                if (showFullLadder && cellH >= 9) {
                    const fontSize = Math.min(10, Math.max(8, Math.floor(cellH - 2)));
                    ctx.font = `${fontSize}px monospace`;
                    ctx.textBaseline = 'middle';

                    // Bid Volume (left column, right aligned)
                    ctx.textAlign = 'right';
                    ctx.fillStyle = sellImbalance ? INVALID : '#cbd5e1';
                    ctx.fillText(formatCompactVolume(lvl.bidVolume), x - 4, cellY + cellH / 2);

                    // Ask Volume (right column, left aligned)
                    ctx.textAlign = 'left';
                    ctx.fillStyle = buyImbalance ? VALID : '#cbd5e1';
                    ctx.fillText(formatCompactVolume(lvl.askVolume), x + 4, cellY + cellH / 2);
                }
            }
        }
        ctx.restore();

        // --- 2. RENDER STATS TABLE (docked beneath bars at bottom of price pane) ---
        ctx.save();
        // Table container background
        ctx.fillStyle = 'rgba(18, 20, 26, 0.94)';
        ctx.fillRect(0, tableTop, coords.width, statsTableHeight);

        // Top divider border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, tableTop);
        ctx.lineTo(coords.width, tableTop);
        ctx.stroke();

        // Row names pinned on left
        const rowLabels = ['Delta', 'Min Delta', 'Max Delta', 'Cum Delta', 'Volume'];
        const labelColWidth = 75;

        // Label column plate
        ctx.fillStyle = 'rgba(24, 27, 34, 0.98)';
        ctx.fillRect(0, tableTop, labelColWidth, statsTableHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.strokeRect(0, tableTop, labelColWidth, statsTableHeight);

        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = NEUTRAL;

        for (let r = 0; r < rowLabels.length; r++) {
            const rowY = tableTop + r * statsRowHeight + statsRowHeight / 2;
            ctx.fillText(rowLabels[r]!, 6, rowY);

            // Horizontal inner divider
            if (r > 0) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
                ctx.beginPath();
                ctx.moveTo(0, tableTop + r * statsRowHeight);
                ctx.lineTo(coords.width, tableTop + r * statsRowHeight);
                ctx.stroke();
            }
        }

        // Render stats for visible bars
        ctx.textAlign = 'center';
        ctx.font = '10px monospace';

        for (let i = 0; i < args.bars.length; i++) {
            const chartBar = args.bars[i]!;
            const x = coords.timeToX(chartBar.time);

            if (x + barWidth / 2 < labelColWidth || x - barWidth / 2 > coords.width) continue;

            const fpBar = barMap.get(chartBar.time);

            if (fpBar) {
                // Row 0: Delta
                const deltaY = tableTop + 0 * statsRowHeight + statsRowHeight / 2;
                ctx.fillStyle = fpBar.delta > 0 ? VALID : fpBar.delta < 0 ? INVALID : NEUTRAL;
                ctx.fillText(formatCompactVolume(fpBar.delta), x, deltaY);

                // Row 1: Min Delta
                const minDeltaY = tableTop + 1 * statsRowHeight + statsRowHeight / 2;
                ctx.fillStyle = fpBar.minDelta < 0 ? INVALID : NEUTRAL;
                ctx.fillText(formatCompactVolume(fpBar.minDelta), x, minDeltaY);

                // Row 2: Max Delta
                const maxDeltaY = tableTop + 2 * statsRowHeight + statsRowHeight / 2;
                ctx.fillStyle = fpBar.maxDelta > 0 ? VALID : NEUTRAL;
                ctx.fillText(formatCompactVolume(fpBar.maxDelta), x, maxDeltaY);

                // Row 3: Cum Delta
                const cumDeltaY = tableTop + 3 * statsRowHeight + statsRowHeight / 2;
                const cumVal = fpBar.cumDelta ?? fpBar.delta;
                ctx.fillStyle = cumVal > 0 ? VALID : cumVal < 0 ? INVALID : NEUTRAL;
                ctx.fillText(formatCompactVolume(cumVal), x, cumDeltaY);

                // Row 4: Volume
                const volY = tableTop + 4 * statsRowHeight + statsRowHeight / 2;
                ctx.fillStyle = '#e2e8f0';
                ctx.fillText(formatCompactVolume(fpBar.volume), x, volY);
            } else {
                // No trade data dash
                ctx.fillStyle = MUTED;
                for (let r = 0; r < 5; r++) {
                    const rowY = tableTop + r * statsRowHeight + statsRowHeight / 2;
                    ctx.fillText('–', x, rowY);
                }
            }
        }

        ctx.restore();
    }
}

const FOOTPRINT_ICON = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="3" width="6" height="12" stroke="currentColor" stroke-width="1.2" fill="none" />
  <rect x="10" y="3" width="6" height="12" stroke="currentColor" stroke-width="1.2" fill="none" />
  <line x1="2" y1="7" x2="8" y2="7" stroke="currentColor" stroke-width="1.2" />
  <line x1="10" y1="7" x2="16" y2="7" stroke="currentColor" stroke-width="1.2" />
  <line x1="2" y1="11" x2="8" y2="11" stroke="currentColor" stroke-width="1.2" />
  <line x1="10" y1="11" x2="16" y2="11" stroke="currentColor" stroke-width="1.2" />
</svg>`;

/**
 * Registers Footprint as a public chart type and renderer layer in Vela.
 */
export function registerFootprintPlugin(): void {
    registerChartType({
        id: 'footprint',
        label: 'Footprint',
        icon: FOOTPRINT_ICON,
        basePainting: 'none', // Suppresses default candle painting
        dataEngine: () => new FootprintDataEngine(),
    });

    registerRendererLayer({
        id: 'footprint',
        placement: 'above-data',
        create: () => new FootprintRendererLayer(),
    });

    console.log('[FootprintPlugin] Registered chart type "footprint" and renderer layer "footprint" successfully.');
}
