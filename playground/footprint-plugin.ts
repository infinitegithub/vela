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
    barFraction,
    formatVol,
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

export class FootprintDataEngine implements SeriesDataEngine {
    private host: SeriesDataEngineHost | null = null;
    private bars: ParsedFootprintBar[] = [];
    private step: number = 0.5;
    private stackedZones: StackedImbalanceZone[] = [];
    private nakedPocs: NakedPocRay[] = [];
    private active = false;
    private loadedSymbol = '';
    private loadedTimeframe = '';
    private refreshTimer: ReturnType<typeof setInterval> | null = null;
    private unsubscribeTick: (() => void) | null = null;
    private unsubscribeMarket: (() => void) | null = null;

    start(host: SeriesDataEngineHost): void {
        this.host = host;
        this.active = true;
        this.loadedSymbol = this.host.symbol || 'BTCUSDT';
        this.loadedTimeframe = normalizeTimeframe(this.host.timeframe || '1h');
        void this.loadData();

        this.unsubscribeTick = LiquidityClient.get().onTick((_price, _time) => {
            if (this.active) this.onBars();
        });

        this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch((_sym) => {
            if (this.active) {
                this.loadedSymbol = '';
                void this.loadData();
            }
        });

        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = setInterval(() => {
            if (this.active) void this.loadData();
        }, 8000);
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
        if (this.unsubscribeMarket) {
            this.unsubscribeMarket();
            this.unsubscribeMarket = null;
        }
    }

    resume(): void {
        this.active = true;
        this.loadedSymbol = this.host?.symbol || 'BTCUSDT';
        this.loadedTimeframe = normalizeTimeframe(this.host?.timeframe || '1h');
        void this.loadData();
        this.unsubscribeTick = LiquidityClient.get().onTick((_price, _time) => {
            if (this.active) this.onBars();
        });
        this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch(() => {
            if (this.active) {
                this.loadedSymbol = '';
                void this.loadData();
            }
        });
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = setInterval(() => {
            if (this.active) void this.loadData();
        }, 8000);
    }

    stop(): void {
        this.active = false;
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        if (this.unsubscribeTick) {
            this.unsubscribeTick();
            this.unsubscribeTick = null;
        }
        if (this.unsubscribeMarket) {
            this.unsubscribeMarket();
            this.unsubscribeMarket = null;
        }
        this.bars = [];
        this.loadedSymbol = '';
        this.loadedTimeframe = '';
        this.host = null;
    }

    onBars(): void {
        if (!this.host || !this.active) return;
        const currentSym = this.host.symbol || 'BTCUSDT';
        const currentTf = normalizeTimeframe(this.host.timeframe || '1h');
        if (this.bars.length === 0 || currentSym !== this.loadedSymbol || currentTf !== this.loadedTimeframe) {
            this.loadedSymbol = currentSym;
            this.loadedTimeframe = currentTf;
            void this.loadData();
            return;
        }
        this.pushCurrent();
    }

    onViewport(_range: { from: number; to: number }): void {}

    private async loadData(): Promise<void> {
        if (!this.host) return;
        const symbol = this.host.symbol || 'BTCUSDT';
        const timeframe = normalizeTimeframe(this.host.timeframe || '1h');

        try {
            const result = await LiquidityClient.get().fetchFootprint(symbol, timeframe);
            this.bars = result.bars;
            this.step = result.step;
            this.stackedZones = result.stackedZones;
            this.nakedPocs = result.nakedPocs;
            this.loadedSymbol = symbol;
            this.loadedTimeframe = timeframe;
            this.pushCurrent();
        } catch (err) {
            console.error('[FootprintDataEngine] Failed to load data:', err);
        }
    }

    private pushCurrent(): void {
        if (!this.host) return;
        const payload: FootprintPayload = {
            symbol: this.host.symbol || 'BTCUSDT',
            timeframe: normalizeTimeframe(this.host.timeframe || '1h'),
            step: this.step,
            bars: this.bars,
            stackedZones: this.stackedZones,
            nakedPocs: this.nakedPocs,
        };
        this.host.pushData(payload);
    }
}

export class FootprintRendererLayer implements RendererLayerInstance {
    private canvas: HTMLCanvasElement | null = null;
    private imbRatio = 3.0;

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

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const payload = args.data as FootprintPayload | undefined;
        const fpBars = payload?.bars || [];
        const stackedZones = payload?.stackedZones || [];
        const nakedPocs = payload?.nakedPocs || [];

        // Estimate step dynamically if not in payload
        const lastClose = args.bars.length > 0 ? args.bars[args.bars.length - 1]!.close : 80000;
        const step = (payload?.step && payload.step > 0) ? payload.step : gridStepFor(lastClose);

        const barMap = new Map<number, ParsedFootprintBar>();
        for (const b of fpBars) {
            barMap.set(b.time, b);
        }

        const tfMs = timeframeToMs(payload?.timeframe || '1h');

        // Pre-reconcile nearest footprint bars for chart candles
        const chartBarFpMap = new Map<number, ParsedFootprintBar>();
        for (let i = 0; i < args.bars.length; i++) {
            const chartBar = args.bars[i]!;
            let fpBar = barMap.get(chartBar.time);
            if (!fpBar) {
                for (const [t, b] of barMap.entries()) {
                    if (Math.abs(t - chartBar.time) <= tfMs / 2) {
                        fpBar = b;
                        break;
                    }
                }
            }
            if (fpBar) chartBarFpMap.set(chartBar.time, fpBar);
        }

        const statsTableHeight = 66;
        const chartAreaHeight = Math.max(10, bounds.height - statsTableHeight);

        // busiestRowVol will be derived dynamically after dyadic row grouping

        // --- 1. RENDER STACKED IMBALANCE ZONES & NAKED POCS ---
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, bounds.top, coords.width, chartAreaHeight);
        ctx.clip();

        // A. Draw Stacked Imbalance Zones (1:1 with LiquidityMapper runs.ts)
        for (const zone of stackedZones) {
            const startX = coords.timeToX(zone.startTime);
            const endX = zone.endTime ? coords.timeToX(zone.endTime) : coords.width + 4;
            if (endX < 0 || startX > coords.width) continue;

            const yTop = coords.priceToY(zone.topPrice, scale, bounds);
            const yBottom = coords.priceToY(zone.bottomPrice, scale, bounds);
            const zoneY = Math.min(yTop, yBottom);
            const zoneH = Math.max(2, Math.abs(yBottom - yTop));
            const zoneW = Math.max(4, endX - startX);

            const isBuy = zone.side === 'buy';
            const color = isBuy ? '#2ebd85' : '#f6465d';

            // Faint band (alpha 0.14)
            ctx.fillStyle = isBuy ? 'rgba(46, 189, 133, 0.14)' : 'rgba(246, 70, 93, 0.14)';
            ctx.fillRect(startX, zoneY, zoneW, zoneH);

            // Firm top and bottom boundary lines (alpha 0.60)
            ctx.strokeStyle = isBuy ? 'rgba(46, 189, 133, 0.60)' : 'rgba(246, 70, 93, 0.60)';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(startX, Math.round(zoneY) + 0.5);
            ctx.lineTo(startX + zoneW, Math.round(zoneY) + 0.5);
            ctx.moveTo(startX, Math.round(zoneY + zoneH) - 0.5);
            ctx.lineTo(startX + zoneW, Math.round(zoneY + zoneH) - 0.5);
            ctx.stroke();
        }

        // B. Draw Naked Points of Control (nPOC)
        for (const np of nakedPocs) {
            const startX = coords.timeToX(np.startTime);
            const endX = np.mitigatedTime ? coords.timeToX(np.mitigatedTime) : coords.width;
            if (endX < 0 || startX > coords.width) continue;

            const y = Math.round(coords.priceToY(np.price, scale, bounds)) + 0.5;
            ctx.strokeStyle = np.mitigatedTime ? 'rgba(224, 180, 0, 0.25)' : '#e0b400';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
            ctx.setLineDash([]);

            if (!np.mitigatedTime && endX - startX > 45) {
                ctx.fillStyle = '#e0b400';
                ctx.font = '9px monospace';
                ctx.textAlign = 'right';
                ctx.fillText(`nPOC ${np.price.toFixed(1)}`, endX - 6, y - 3);
            }
        }

        // --- 2. RENDER FOOTPRINT BARS ---
        // Dynamic Dyadic Row Grouping (1:1 with LiquidityMapper FootprintLod)
        // Measures the pixel height of 1 fine step on canvas:
        const y0 = coords.priceToY(0, scale, bounds);
        const yStep = coords.priceToY(step, scale, bounds);
        const fineRowPx = Math.abs(yStep - y0);

        let multiplier = 1;
        if (fineRowPx > 0) {
            // Dyadically group levels until row height reaches comfortable threshold (13px - 26px)
            while (fineRowPx * multiplier < 13 && multiplier < 4096) {
                multiplier *= 2;
            }
        }
        const effectiveStep = step * multiplier;

        interface GroupedLevel {
            price: number;
            askVolume: number;
            bidVolume: number;
            totalVolume: number;
        }

        interface GroupedBarData {
            levels: GroupedLevel[];
            pocPrice: number;
        }

        const groupedBars = new Map<number, GroupedBarData>();
        let busiestRowVol = 0;

        for (const [time, fp] of chartBarFpMap.entries()) {
            const grpMap = new Map<number, GroupedLevel>();
            for (const lvl of fp.levels) {
                const k = Math.floor(lvl.price / effectiveStep);
                const bPrice = k * effectiveStep;
                let g = grpMap.get(k);
                if (!g) {
                    g = { price: bPrice, askVolume: 0, bidVolume: 0, totalVolume: 0 };
                    grpMap.set(k, g);
                }
                g.askVolume += lvl.askVolume;
                g.bidVolume += lvl.bidVolume;
                g.totalVolume += lvl.totalVolume;
            }
            const levels = Array.from(grpMap.values()).sort((a, b) => a.price - b.price);
            let pocPrice = levels[0]?.price ?? 0;
            let maxV = 0;
            for (const g of levels) {
                if (g.totalVolume > maxV) {
                    maxV = g.totalVolume;
                    pocPrice = g.price;
                }
                if (g.totalVolume > busiestRowVol) {
                    busiestRowVol = g.totalVolume;
                }
            }
            groupedBars.set(time, { levels, pocPrice });
        }
        if (busiestRowVol <= 0) busiestRowVol = 1;

        const bodySpacing = coords.bodySpacing();
        const barWidth = Math.max(16, Math.min(240, bodySpacing * 0.90));
        const showDetailedNumbers = barWidth >= 48;

        for (let i = 0; i < args.bars.length; i++) {
            const chartBar = args.bars[i]!;
            const x = coords.timeToX(chartBar.time);
            if (x + barWidth < 0 || x - barWidth > coords.width) continue;

            const fpBar = chartBarFpMap.get(chartBar.time);
            const grpData = groupedBars.get(chartBar.time);

            if (!fpBar || !grpData || grpData.levels.length === 0) {
                // Fallback ghost candle
                const yHigh = coords.priceToY(chartBar.high, scale, bounds);
                const yLow = coords.priceToY(chartBar.low, scale, bounds);
                const yOpen = coords.priceToY(chartBar.open, scale, bounds);
                const yClose = coords.priceToY(chartBar.close, scale, bounds);

                ctx.strokeStyle = "rgba(117, 120, 130, 0.3)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, yHigh);
                ctx.lineTo(x, yLow);
                ctx.stroke();

                const bodyY = Math.min(yOpen, yClose);
                const bodyH = Math.max(2, Math.abs(yClose - yOpen));
                ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
                ctx.fillRect(x - barWidth / 2, bodyY, barWidth, bodyH);
                continue;
            }

            const left = x - barWidth / 2;
            const halfWidth = barWidth / 2;

            // Map grouped levels for diagonal lookup
            const groupIndexMap = new Map<number, GroupedLevel>();
            for (const g of grpData.levels) {
                groupIndexMap.set(Math.round(g.price / effectiveStep), g);
            }

            for (const lvl of grpData.levels) {
                const yTop = coords.priceToY(lvl.price + effectiveStep, scale, bounds);
                const yBottom = coords.priceToY(lvl.price, scale, bounds);
                const cellY = Math.min(yTop, yBottom);
                const cellH = Math.max(2, Math.abs(yBottom - yTop));

                const isPoc = (lvl.price === grpData.pocPrice);
                const k = Math.round(lvl.price / effectiveStep);

                // Diagonal Imbalance evaluated on effective rows
                const lvlBelow = groupIndexMap.get(k - 1);
                const buyImbalance = Boolean(
                    lvlBelow &&
                    lvl.askVolume > 0 &&
                    (lvlBelow.bidVolume === 0 || lvl.askVolume >= lvlBelow.bidVolume * this.imbRatio)
                );

                const lvlAbove = groupIndexMap.get(k + 1);
                const sellImbalance = Boolean(
                    lvlAbove &&
                    lvl.bidVolume > 0 &&
                    (lvlAbove.askVolume === 0 || lvl.bidVolume >= lvlAbove.askVolume * this.imbRatio)
                );

                // Row volume bar: proportional sqrt width behind cell text (LiquidityMapper standard)
                const frac = barFraction(lvl.totalVolume, busiestRowVol, "sqrt");
                if (frac > 0) {
                    const rowBarW = Math.max(2, Math.min(barWidth, barWidth * frac));
                    // Tint bar with dominant side color
                    if (lvl.askVolume >= 1.15 * lvl.bidVolume) {
                        ctx.fillStyle = "rgba(46, 189, 133, 0.24)";
                    } else if (lvl.bidVolume >= 1.15 * lvl.askVolume) {
                        ctx.fillStyle = "rgba(246, 70, 93, 0.24)";
                    } else {
                        ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
                    }
                    ctx.fillRect(left, cellY, rowBarW, cellH);
                }

                // Diagonal Imbalance Outline Rectangles (1:1 with LiquidityMapper)
                if (cellH >= 3) {
                    if (sellImbalance) {
                        ctx.strokeStyle = "#f6465d";
                        ctx.lineWidth = cellH >= 8 ? 1.5 : 1;
                        ctx.strokeRect(left + 0.75, cellY + 0.75, halfWidth - 1.5, cellH - 1.5);
                    }
                    if (buyImbalance) {
                        ctx.strokeStyle = "#2ebd85";
                        ctx.lineWidth = cellH >= 8 ? 1.5 : 1;
                        ctx.strokeRect(left + halfWidth + 0.75, cellY + 0.75, halfWidth - 1.5, cellH - 1.5);
                    }
                }

                // POC Highlight border on candle
                if (isPoc) {
                    ctx.strokeStyle = "#e0b400";
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(left + 0.5, cellY + 0.5, barWidth - 1, cellH - 1);
                }

                // Volume text (when candle has room)
                if (cellH >= 10) {
                    ctx.textBaseline = "middle";
                    const yText = cellY + cellH / 2;

                    if (showDetailedNumbers) {
                        // Bid volume text (left side, right-aligned)
                        ctx.textAlign = "right";
                        ctx.font = sellImbalance ? "bold 10px monospace" : "10px monospace";
                        ctx.fillStyle = sellImbalance ? "#ff6675" : "#d1d4dc";
                        ctx.fillText(formatVol(lvl.bidVolume), left + halfWidth - 4, yText);

                        // Ask volume text (right side, left-aligned)
                        ctx.textAlign = "left";
                        ctx.font = buyImbalance ? "bold 10px monospace" : "10px monospace";
                        ctx.fillStyle = buyImbalance ? "#32e09b" : "#d1d4dc";
                        ctx.fillText(formatVol(lvl.askVolume), left + halfWidth + 4, yText);
                    } else if (barWidth >= 28) {
                        // Intermediate zoom: show delta centered in cell
                        const rowDelta = lvl.askVolume - lvl.bidVolume;
                        ctx.textAlign = "center";
                        ctx.font = "9px monospace";
                        ctx.fillStyle = rowDelta >= 0 ? "#2ebd85" : "#f6465d";
                        const sign = rowDelta > 0 ? "+" : "";
                        ctx.fillText(`${sign}${formatVol(rowDelta)}`, left + halfWidth, yText);
                    }
                }
            }

            // High/Low Wick lines
            const yHigh = coords.priceToY(chartBar.high, scale, bounds);
            const yLow = coords.priceToY(chartBar.low, scale, bounds);
            const grpPrices = grpData.levels.map(l => coords.priceToY(l.price, scale, bounds));
            const topLevelY = Math.min(...grpPrices);
            const btmLevelY = Math.max(...grpPrices);
            ctx.strokeStyle = fpBar.delta >= 0 ? "#2ebd85" : "#f6465d";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, yHigh);
            ctx.lineTo(x, Math.min(yHigh, topLevelY));
            ctx.moveTo(x, Math.max(yLow, btmLevelY));
            ctx.lineTo(x, yLow);
            ctx.stroke();
        }
        ctx.restore();

        // --- 3. DOCKED FOOTPRINT BAR STATS FOOTER ---
        const tableTop = bounds.top + chartAreaHeight;
        ctx.fillStyle = '#14151a';
        ctx.fillRect(0, tableTop, coords.width, statsTableHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, tableTop);
        ctx.lineTo(coords.width, tableTop);
        ctx.stroke();

        // Row divider lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.moveTo(0, tableTop + 22);
        ctx.lineTo(coords.width, tableTop + 22);
        ctx.moveTo(0, tableTop + 44);
        ctx.lineTo(coords.width, tableTop + 44);
        ctx.stroke();

        // Labels column (left sticky)
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#787b86';
        ctx.fillText('Delta', 12, tableTop + 11);
        ctx.fillText('Cum Delta', 12, tableTop + 33);
        ctx.fillText('Volume', 12, tableTop + 55);

        let runningCumDelta = 0;
        for (let i = 0; i < args.bars.length; i++) {
            const chartBar = args.bars[i]!;
            const x = coords.timeToX(chartBar.time);
            if (x < 70 || x > coords.width) continue;

            const fpBar = chartBarFpMap.get(chartBar.time);
            const delta = fpBar ? fpBar.delta : 0;
            const volume = fpBar ? fpBar.totalVolume : chartBar.volume || 0;
            runningCumDelta += delta;

            ctx.font = '10px monospace';
            ctx.textAlign = 'center';

            // Delta
            ctx.fillStyle = delta >= 0 ? '#2ebd85' : '#f6465d';
            ctx.fillText((delta >= 0 ? '+' : '') + formatVol(delta), x, tableTop + 11);

            // Cumulative Delta
            ctx.fillStyle = runningCumDelta >= 0 ? '#2ebd85' : '#f6465d';
            ctx.fillText((runningCumDelta >= 0 ? '+' : '') + formatVol(runningCumDelta), x, tableTop + 33);

            // Volume
            ctx.fillStyle = '#d1d4dc';
            ctx.fillText(formatVol(volume), x, tableTop + 55);
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
        dataEngine: () => new FootprintDataEngine(),
    });

    registerRendererLayer({
        id: 'footprint',
        placement: 'above-data',
        repaintOnCursor: true,
        create: () => new FootprintRendererLayer(),
    });
}
