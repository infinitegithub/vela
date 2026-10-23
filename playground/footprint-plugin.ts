import {
    registerChartType,
    registerRendererLayer,
    type SeriesDataEngine,
    type SeriesDataEngineHost,
    type RendererLayerInstance,
    type RendererLayerArgs,
} from '../src/plugin';
import { VALID, INVALID, HIGHLIGHT, NEUTRAL, MUTED } from '../src/core/palette';
import {
    LiquidityClient,
    type ParsedFootprintBar,
    type ParsedFootprintLevel,
    type StackedImbalanceZone,
    type NakedPocRay
} from './liquidity-client';

export interface FootprintPayload {
    symbol: string;
    timeframe: string;
    step: number;
    bars: ParsedFootprintBar[];
    stackedZones: StackedImbalanceZone[];
    nakedPocs: NakedPocRay[];
}

export function formatCompactVolume(val: number): string {
    if (val === 0) return '0';
    const abs = Math.abs(val);
    if (abs >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M';
    if (abs >= 1_000) return (val / 1_000).toFixed(1) + 'k';
    if (abs < 0.1) return val.toFixed(3);
    if (abs < 1) return val.toFixed(2);
    return val.toFixed(1);
}

export class FootprintDataEngine implements SeriesDataEngine {
    private host: SeriesDataEngineHost | null = null;
    private bars: ParsedFootprintBar[] = [];
    private step: number = 0.5;
    private stackedZones: StackedImbalanceZone[] = [];
    private nakedPocs: NakedPocRay[] = [];
    private active = false;
    private unsubscribeTick: (() => void) | null = null;

    start(host: SeriesDataEngineHost): void {
        this.host = host;
        this.active = true;
        this.loadData();
        this.unsubscribeTick = LiquidityClient.get().onTick((_price, _time) => {
            if (this.active) this.onBars();
        });
    }

    suspend(): void {
        this.active = false;
        if (this.unsubscribeTick) {
            this.unsubscribeTick();
            this.unsubscribeTick = null;
        }
    }

    resume(): void {
        this.active = true;
        this.loadData();
        this.unsubscribeTick = LiquidityClient.get().onTick((_price, _time) => {
            if (this.active) this.onBars();
        });
    }

    stop(): void {
        this.active = false;
        if (this.unsubscribeTick) {
            this.unsubscribeTick();
            this.unsubscribeTick = null;
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

    private async loadData(): Promise<void> {
        if (!this.host) return;
        const symbol = this.host.symbol || 'BTCUSDT';
        const timeframe = this.host.timeframe || '1m';

        try {
            const result = await LiquidityClient.get().fetchFootprint(symbol, timeframe);
            this.bars = result.bars;
            this.step = result.step;
            this.stackedZones = result.stackedZones;
            this.nakedPocs = result.nakedPocs;
            this.pushCurrent();
        } catch (err) {
            console.error('[FootprintDataEngine] Failed to load data:', err);
        }
    }

    private pushCurrent(): void {
        if (!this.host) return;
        const payload: FootprintPayload = {
            symbol: this.host.symbol || 'BTCUSDT',
            timeframe: this.host.timeframe || '1m',
            step: this.step,
            bars: this.bars,
            stackedZones: this.stackedZones,
            nakedPocs: this.nakedPocs,
        };
        this.host.pushData('footprint', payload);
    }
}

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
        const step = payload?.step || 0.5;
        const stackedZones = payload?.stackedZones || [];
        const nakedPocs = payload?.nakedPocs || [];

        const barMap = new Map<number, ParsedFootprintBar>();
        for (const b of fpBars) {
            barMap.set(b.time, b);
        }

        const statsTableHeight = 64;
        const chartAreaHeight = Math.max(10, bounds.height - statsTableHeight);

        // --- 1. RENDER STACKED IMBALANCE ZONES & NAKED POCS ---
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, bounds.top, coords.width, chartAreaHeight);
        ctx.clip();

        // A. Draw Stacked Imbalance Zones
        for (const zone of stackedZones) {
            const startX = coords.timeToX(zone.startTime);
            const endX = zone.endTime ? coords.timeToX(zone.endTime) : coords.width;
            if (endX < 0 || startX > coords.width) continue;

            const yTop = coords.priceToY(zone.topPrice, scale, bounds);
            const yBottom = coords.priceToY(zone.bottomPrice, scale, bounds);
            const zoneY = Math.min(yTop, yBottom);
            const zoneH = Math.max(2, Math.abs(yBottom - yTop));
            const zoneW = Math.max(4, endX - startX);

            if (zone.side === 'buy') {
                ctx.fillStyle = 'rgba(46, 189, 133, 0.12)';
                ctx.strokeStyle = 'rgba(46, 189, 133, 0.4)';
            } else {
                ctx.fillStyle = 'rgba(246, 70, 93, 0.12)';
                ctx.strokeStyle = 'rgba(246, 70, 93, 0.4)';
            }
            ctx.fillRect(startX, zoneY, zoneW, zoneH);
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(startX, zoneY, zoneW, zoneH);
            ctx.setLineDash([]);
        }

        // B. Draw Naked Points of Control (nPOC)
        for (const np of nakedPocs) {
            const startX = coords.timeToX(np.startTime);
            const endX = np.mitigatedTime ? coords.timeToX(np.mitigatedTime) : coords.width;
            if (endX < 0 || startX > coords.width) continue;

            const y = coords.priceToY(np.price, scale, bounds);
            ctx.strokeStyle = np.mitigatedTime ? 'rgba(224, 180, 0, 0.25)' : 'rgba(224, 180, 0, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash(np.mitigatedTime ? [3, 3] : [6, 3]);
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label
            if (!np.mitigatedTime && endX - startX > 40) {
                ctx.fillStyle = '#e0b400';
                ctx.font = '9px monospace';
                ctx.textAlign = 'right';
                ctx.fillText('nPOC ' + np.price.toFixed(1), endX - 6, y - 3);
            }
        }

        // --- 2. RENDER FOOTPRINT BARS ---
        const bodySpacing = coords.bodySpacing();
        const barWidth = Math.max(12, Math.min(220, bodySpacing * 0.88));
        const showDetailedNumbers = barWidth >= 48;

        for (let i = 0; i < args.bars.length; i++) {
            const chartBar = args.bars[i]!;
            const x = coords.timeToX(chartBar.time);
            if (x + barWidth < 0 || x - barWidth > coords.width) continue;

            const fpBar = barMap.get(chartBar.time);

            if (!fpBar || fpBar.levels.length === 0) {
                // Fallback ghost candle
                const yHigh = coords.priceToY(chartBar.high, scale, bounds);
                const yLow = coords.priceToY(chartBar.low, scale, bounds);
                const yOpen = coords.priceToY(chartBar.open, scale, bounds);
                const yClose = coords.priceToY(chartBar.close, scale, bounds);

                ctx.strokeStyle = 'rgba(117, 120, 130, 0.4)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, yHigh);
                ctx.lineTo(x, yLow);
                ctx.stroke();

                const bodyY = Math.min(yOpen, yClose);
                const bodyH = Math.max(2, Math.abs(yClose - yOpen));
                ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                ctx.fillRect(x - barWidth / 2, bodyY, barWidth, bodyH);
                continue;
            }

            const left = x - barWidth / 2;
            const halfWidth = barWidth / 2;

            // Map levels for diagonal lookup
            const indexMap = new Map<number, ParsedFootprintLevel>();
            for (const lvl of fpBar.levels) {
                indexMap.set(Math.round(lvl.price / step), lvl);
            }

            for (const lvl of fpBar.levels) {
                const yTop = coords.priceToY(lvl.price + step, scale, bounds);
                const yBottom = coords.priceToY(lvl.price, scale, bounds);
                const cellY = Math.min(yTop, yBottom);
                const cellH = Math.max(1.5, Math.abs(yBottom - yTop));

                const isPoc = (lvl.price === fpBar.pocPrice);
                const k = Math.round(lvl.price / step);

                // Diagonal Imbalance
                const lvlBelow = indexMap.get(k - 1);
                const buyImbalance = Boolean(
                    lvlBelow &&
                    lvl.askVolume > 0 &&
                    (lvlBelow.bidVolume === 0 || lvl.askVolume >= lvlBelow.bidVolume * this.imbalanceRatio)
                );

                const lvlAbove = indexMap.get(k + 1);
                const sellImbalance = Boolean(
                    lvlAbove &&
                    lvl.bidVolume > 0 &&
                    (lvlAbove.askVolume === 0 || lvl.bidVolume >= lvlAbove.askVolume * this.imbalanceRatio)
                );

                // Bid cell (left)
                if (sellImbalance) ctx.fillStyle = 'rgba(246, 70, 93, 0.32)';
                else ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                ctx.fillRect(left, cellY, halfWidth - 1, cellH);

                // Ask cell (right)
                if (buyImbalance) ctx.fillStyle = 'rgba(46, 189, 133, 0.32)';
                else ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                ctx.fillRect(left + halfWidth, cellY, halfWidth - 1, cellH);

                // POC Highlight border
                if (isPoc) {
                    ctx.strokeStyle = '#e0b400';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(left, cellY, barWidth - 1, cellH);
                }

                // Volume text (when zoomed in)
                if (showDetailedNumbers && cellH >= 11) {
                    ctx.font = '10px monospace';
                    ctx.textBaseline = 'middle';

                    // Bid volume text
                    ctx.textAlign = 'right';
                    ctx.fillStyle = sellImbalance ? '#ff6675' : '#a0a5b5';
                    ctx.fillText(formatCompactVolume(lvl.bidVolume), left + halfWidth - 4, cellY + cellH / 2);

                    // Ask volume text
                    ctx.textAlign = 'left';
                    ctx.fillStyle = buyImbalance ? '#32e09b' : '#a0a5b5';
                    ctx.fillText(formatCompactVolume(lvl.askVolume), left + halfWidth + 4, cellY + cellH / 2);
                }
            }

            // High/Low Wick lines
            const yHigh = coords.priceToY(fpBar.high, scale, bounds);
            const yLow = coords.priceToY(fpBar.low, scale, bounds);
            ctx.strokeStyle = fpBar.delta >= 0 ? '#2ebd85' : '#f6465d';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, yHigh);
            ctx.lineTo(x, Math.min(...fpBar.levels.map(l => coords.priceToY(l.price, scale, bounds))));
            ctx.moveTo(x, Math.max(...fpBar.levels.map(l => coords.priceToY(l.price, scale, bounds))));
            ctx.lineTo(x, yLow);
            ctx.stroke();
        }
        ctx.restore();

        // --- 3. DOCKED FOOTPRINT BAR STATS FOOTER ---
        const tableTop = bounds.top + chartAreaHeight;
        ctx.fillStyle = '#18191e';
        ctx.fillRect(0, tableTop, coords.width, statsTableHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, tableTop);
        ctx.lineTo(coords.width, tableTop);
        ctx.stroke();

        // Labels column (left sticky)
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#787b86';
        ctx.fillText('Delta', 12, tableTop + 14);
        ctx.fillText('Cum Delta', 12, tableTop + 32);
        ctx.fillText('Volume', 12, tableTop + 50);

        let runningCumDelta = 0;
        for (let i = 0; i < args.bars.length; i++) {
            const chartBar = args.bars[i]!;
            const x = coords.timeToX(chartBar.time);
            if (x < 60 || x > coords.width) continue;

            const fpBar = barMap.get(chartBar.time);
            const delta = fpBar ? fpBar.delta : 0;
            const volume = fpBar ? fpBar.totalVolume : chartBar.volume || 0;
            runningCumDelta += delta;

            ctx.font = '10px monospace';
            ctx.textAlign = 'center';

            // Delta
            ctx.fillStyle = delta >= 0 ? '#2ebd85' : '#f6465d';
            ctx.fillText((delta >= 0 ? '+' : '') + formatCompactVolume(delta), x, tableTop + 14);

            // Cumulative Delta
            ctx.fillStyle = runningCumDelta >= 0 ? '#2ebd85' : '#f6465d';
            ctx.fillText((runningCumDelta >= 0 ? '+' : '') + formatCompactVolume(runningCumDelta), x, tableTop + 32);

            // Volume
            ctx.fillStyle = '#d1d4dc';
            ctx.fillText(formatCompactVolume(volume), x, tableTop + 50);
        }
    }
}

const FOOTPRINT_ICON = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="3" width="6" height="12" rx="1" fill="currentColor" fill-opacity="0.3"/><rect x="10" y="3" width="6" height="12" rx="1" fill="currentColor" fill-opacity="0.7"/><line x1="5" y1="1" x2="5" y2="3" stroke="currentColor" stroke-width="1.2"/><line x1="5" y1="15" x2="5" y2="17" stroke="currentColor" stroke-width="1.2"/><line x1="13" y1="1" x2="13" y2="3" stroke="currentColor" stroke-width="1.2"/><line x1="13" y1="15" x2="13" y2="17" stroke="currentColor" stroke-width="1.2"/></svg>';

export function registerFootprintPlugin(): void {
    registerChartType({
        id: 'footprint',
        label: 'Footprint (Order Flow)',
        icon: FOOTPRINT_ICON,
        basePainting: 'none',
        createEngine: () => new FootprintDataEngine(),
    });

    registerRendererLayer({
        id: 'footprint',
        placement: 'above-data',
        repaintOnCursor: true,
        create: () => new FootprintRendererLayer(),
    });
}
