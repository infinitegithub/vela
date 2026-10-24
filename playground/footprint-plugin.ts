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
    type TapeBatch,
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
    private unsubscribeTape: (() => void) | null = null;
    private unsubscribeTick: (() => void) | null = null;
    private unsubscribeMarket: (() => void) | null = null;
    private rafPending = false;

    start(host: SeriesDataEngineHost): void {
        this.host = host;
        this.active = true;
        this.loadedSymbol = this.host.symbol || 'BTCUSDT';
        this.loadedTimeframe = normalizeTimeframe(this.host.timeframe || '1h');
        void this.loadData();

        this.unsubscribeTape = LiquidityClient.get().onTape((batch) => {
            if (this.active) this.ingestTape(batch);
        });

        this.unsubscribeTick = LiquidityClient.get().onTick((price, time) => {
            if (this.active) this.ingestTick(price, time);
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
        }, 15000);
    }

    suspend(): void {
        this.active = false;
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        if (this.unsubscribeTape) { this.unsubscribeTape(); this.unsubscribeTape = null; }
        if (this.unsubscribeTick) { this.unsubscribeTick(); this.unsubscribeTick = null; }
        if (this.unsubscribeMarket) { this.unsubscribeMarket(); this.unsubscribeMarket = null; }
    }

    resume(): void {
        this.active = true;
        this.loadedSymbol = this.host?.symbol || 'BTCUSDT';
        this.loadedTimeframe = normalizeTimeframe(this.host?.timeframe || '1h');
        void this.loadData();

        this.unsubscribeTape = LiquidityClient.get().onTape((batch) => {
            if (this.active) this.ingestTape(batch);
        });
        this.unsubscribeTick = LiquidityClient.get().onTick((price, time) => {
            if (this.active) this.ingestTick(price, time);
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
        }, 15000);
    }

    stop(): void {
        this.active = false;
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        if (this.unsubscribeTape) { this.unsubscribeTape(); this.unsubscribeTape = null; }
        if (this.unsubscribeTick) { this.unsubscribeTick(); this.unsubscribeTick = null; }
        if (this.unsubscribeMarket) { this.unsubscribeMarket(); this.unsubscribeMarket = null; }
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
            void this.loadData();
        } else {
            this.pushCurrent();
        }
    }

    private ingestTick(price: number, time: number): void {
        if (!this.host || this.bars.length === 0) return;
        const currentTfMs = timeframeToMs(this.loadedTimeframe || '1h');
        const activeBarTime = Math.floor(time / currentTfMs) * currentTfMs;

        let activeBar = this.bars.find(b => b.time === activeBarTime);
        if (!activeBar) {
            activeBar = {
                time: activeBarTime,
                open: price,
                high: price,
                low: price,
                close: price,
                totalVolume: 0,
                buyVolume: 0,
                sellVolume: 0,
                totalBuy: 0,
                totalSell: 0,
                maxDelta: 0,
                minDelta: 0,
                delta: 0,
                pocPrice: price,
                levels: []
            };
            this.bars.push(activeBar);
            this.bars.sort((a, b) => a.time - b.time);
        }

        activeBar.close = price;
        if (price > activeBar.high) activeBar.high = price;
        if (price < activeBar.low) activeBar.low = price;
        this.schedulePush();
    }

    private ingestTape(batch: TapeBatch): void {
        if (!this.host || this.bars.length === 0 || !batch || batch.price.length === 0) return;
        const currentTfMs = timeframeToMs(this.loadedTimeframe || '1h');
        let changed = false;

        for (let i = 0; i < batch.price.length; i++) {
            const t = batch.t[i] || Date.now();
            const p = batch.price[i]!;
            const usd = batch.usd[i]!;
            const barTime = Math.floor(t / currentTfMs) * currentTfMs;

            let bar = this.bars.find(b => b.time === barTime);
            if (!bar) {
                bar = {
                    time: barTime,
                    open: p,
                    high: p,
                    low: p,
                    close: p,
                    totalVolume: 0,
                    buyVolume: 0,
                    sellVolume: 0,
                    totalBuy: 0,
                    totalSell: 0,
                    maxDelta: 0,
                    minDelta: 0,
                    delta: 0,
                    pocPrice: p,
                    levels: []
                };
                this.bars.push(bar);
                this.bars.sort((a, b) => a.time - b.time);
            }

            bar.close = p;
            if (p > bar.high) bar.high = p;
            if (p < bar.low) bar.low = p;

            const lvlLow = Math.floor(p / this.step) * this.step;
            let level = bar.levels.find(l => Math.abs(l.price - lvlLow) < 1e-4);
            if (!level) {
                level = {
                    price: lvlLow,
                    bidVolume: 0,
                    askVolume: 0,
                    totalVolume: 0,
                    delta: 0
                };
                bar.levels.push(level);
                bar.levels.sort((a, b) => a.price - b.price);
            }

            const buy = usd > 0 ? usd : 0;
            const sell = usd < 0 ? Math.abs(usd) : 0;
            level.askVolume += buy;
            level.bidVolume += sell;
            level.totalVolume = level.askVolume + level.bidVolume;
            level.delta = level.askVolume - level.bidVolume;

            bar.buyVolume += buy;
            bar.sellVolume += sell;
            bar.totalBuy = bar.buyVolume;
            bar.totalSell = bar.sellVolume;
            bar.totalVolume = bar.buyVolume + bar.sellVolume;
            bar.delta = bar.buyVolume - bar.sellVolume;

            let maxVol = 0;
            let poc = bar.pocPrice;
            for (const l of bar.levels) {
                if (l.totalVolume > maxVol) {
                    maxVol = l.totalVolume;
                    poc = l.price;
                }
            }
            bar.pocPrice = poc;
            changed = true;
        }

        if (changed) {
            this.schedulePush();
        }
    }

    private schedulePush(): void {
        if (this.rafPending) return;
        this.rafPending = true;
        requestAnimationFrame(() => {
            this.rafPending = false;
            this.pushCurrent();
        });
    }

    private async loadData(): Promise<void> {
        if (!this.host) return;
        const sym = this.host.symbol || 'BTCUSDT';
        let raw = sym.trim().toUpperCase();
        if (raw.includes(':')) raw = raw.split(':')[1] || raw;
        raw = raw.replace(/\.P$|-PERP$|_PERP$|-SWAP$|_SWAP$/i, '');
        const base = raw.replace(/USDT$|USD$|USDC$|BUSD$/i, '');
        const cleanSymbol = (base || 'BTC') + 'USDT';
        const timeframe = normalizeTimeframe(this.host.timeframe || '1h');

        try {
            const result = await LiquidityClient.get().fetchFootprint(cleanSymbol, timeframe);
            if (result.bars.length > 0) {
                this.bars = result.bars;
                this.step = result.step;
                this.stackedZones = result.stackedZones;
                this.nakedPocs = result.nakedPocs;
                this.loadedSymbol = this.host.symbol || 'BTCUSDT';
                this.loadedTimeframe = timeframe;
                console.log(`[FootprintDataEngine] Ingested ${this.bars.length} bars for ${cleanSymbol}`);
                this.pushCurrent();
            }
        } catch (err) {
            console.error('[FootprintDataEngine] Failed to load footprint data:', err);
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

// ============================================================================
// Authentic Footprint Renderer Layer (1:1 with LiquidityMapper paintFootprint)
// ============================================================================

export class FootprintRendererLayer implements RendererLayerInstance {
    private canvas: HTMLCanvasElement | null = null;

    mount(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
    }

    destroy(): void {
        this.canvas = null;
    }

    render(args: RendererLayerArgs): void {
        if (!this.canvas || args.priceStyle !== 'footprint') return;

        const { coords, scale, bounds, bars } = args;
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

        const lastClose = bars.length > 0 ? bars[bars.length - 1]!.close : 80000;
        const step = (payload?.step && payload.step > 0) ? payload.step : gridStepFor(lastClose);

        const plotW = Math.max(1, coords.width || (this.canvas.width / dpr));
        const statsTableHeight = 68;
        const chartAreaHeight = Math.max(50, bounds.height - statsTableHeight);

        // Map footprint bars by timestamp (and nearest within 1 timeframe slot)
        const fpMap = new Map<number, ParsedFootprintBar>();
        for (const b of fpBars) fpMap.set(b.time, b);

        const tfMs = timeframeToMs(payload?.timeframe || '1h');
        const getFpBar = (t: number): ParsedFootprintBar | undefined => {
            if (fpMap.has(t)) return fpMap.get(t);
            for (const b of fpBars) {
                if (Math.abs(b.time - t) < tfMs) return b;
            }
            if (fpBars.length > 0 && bars.length > 0) {
                const latestChartT = bars[bars.length - 1]!.time;
                const latestFpT = fpBars[fpBars.length - 1]!.time;
                const offset = latestChartT - latestFpT;
                for (const b of fpBars) {
                    if (Math.abs((b.time + offset) - t) < tfMs) return b;
                }
            }
            return undefined;
        };

        const spacing = coords.bodySpacing();
        const rawRowPx = Math.abs(coords.priceToY(lastClose, scale, bounds) - coords.priceToY(lastClose + step, scale, bounds));

        // Dyadic Grouping: Keep rows roughly 12-18px tall so text is crisp and never overlaps
        let groupLevel = 0;
        while (groupLevel < 10 && rawRowPx * (2 ** groupLevel) < 13) {
            groupLevel++;
        }
        const groupFactor = 2 ** groupLevel;
        const groupedStep = step * groupFactor;
        const groupedRowPx = rawRowPx * groupFactor;

        // Group rows for visible bars
        interface GroupedRow {
            price: number;
            buy: number;
            sell: number;
            total: number;
            delta: number;
            isDiagBuy?: boolean;
            isDiagSell?: boolean;
        }

        interface GroupedBar {
            bar: ParsedFootprintBar;
            chartBar: typeof bars[0];
            rows: GroupedRow[];
            busiestInBar: number;
        }

        const groupedBars: GroupedBar[] = [];
        let globalBusiest = 0;

        for (let i = 0; i < bars.length; i++) {
            const chartBar = bars[i]!;
            const x = coords.timeToX(chartBar.time);
            if (x < -100 || x > plotW + 100) continue;

            const fpBar = getFpBar(chartBar.time);
            if (!fpBar || !fpBar.levels || fpBar.levels.length === 0) continue;

            const rowMap = new Map<number, { buy: number; sell: number }>();
            for (const lvl of fpBar.levels) {
                const bin = Math.floor(lvl.price / groupedStep) * groupedStep;
                const cur = rowMap.get(bin) || { buy: 0, sell: 0 };
                cur.buy += lvl.askVolume;
                cur.sell += lvl.bidVolume;
                rowMap.set(bin, cur);
            }

            const sortedBins = [...rowMap.keys()].sort((a, b) => a - b);
            let barBusiest = 0;
            const rows: GroupedRow[] = [];

            for (const p of sortedBins) {
                const c = rowMap.get(p)!;
                const tot = c.buy + c.sell;
                if (tot > barBusiest) barBusiest = tot;
                if (tot > globalBusiest) globalBusiest = tot;

                // Check diagonal imbalance against adjacent rows
                const up = rowMap.get(p + groupedStep);
                const down = rowMap.get(p - groupedStep);
                const isDiagSell = c.sell > 0 && (!up || up.buy === 0 || c.sell >= up.buy * 3.0);
                const isDiagBuy = c.buy > 0 && (!down || down.sell === 0 || c.buy >= down.sell * 3.0);

                rows.push({
                    price: p,
                    buy: c.buy,
                    sell: c.sell,
                    total: tot,
                    delta: c.buy - c.sell,
                    isDiagBuy,
                    isDiagSell,
                });
            }

            groupedBars.push({
                bar: fpBar,
                chartBar,
                rows,
                busiestInBar: barBusiest,
            });
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, bounds.top, plotW, chartAreaHeight);
        ctx.clip();

        // 1. Stacked Imbalance Zones
        for (const zone of stackedZones) {
            const y0 = coords.priceToY(zone.topPrice, scale, bounds);
            const y1 = coords.priceToY(zone.bottomPrice, scale, bounds);
            const x0 = coords.timeToX(zone.startTime);
            const x1 = zone.endTime ? coords.timeToX(zone.endTime) : plotW;
            if (x1 < 0 || x0 > plotW) continue;

            const h = Math.abs(y1 - y0);
            const top = Math.min(y0, y1);
            const isBuy = zone.side === 'buy';
            ctx.fillStyle = isBuy ? 'rgba(46, 189, 133, 0.12)' : 'rgba(246, 70, 93, 0.12)';
            ctx.fillRect(Math.max(0, x0), top, x1 - Math.max(0, x0), h);

            ctx.strokeStyle = isBuy ? 'rgba(46, 189, 133, 0.45)' : 'rgba(246, 70, 93, 0.45)';
            ctx.lineWidth = 1;
            ctx.strokeRect(Math.max(0, x0), top, x1 - Math.max(0, x0), h);
        }

        // 2. Naked POC Rays
        for (const poc of nakedPocs) {
            const y = coords.priceToY(poc.price, scale, bounds);
            const x0 = coords.timeToX(poc.startTime);
            const x1 = poc.mitigatedTime ? coords.timeToX(poc.mitigatedTime) : plotW;
            if (x1 < 0 || x0 > plotW || y < bounds.top || y > bounds.top + chartAreaHeight) continue;

            ctx.strokeStyle = '#f0b90b';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(Math.max(0, x0), y);
            ctx.lineTo(x1, y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 3. Render Each Footprint Candle
        for (const item of groupedBars) {
            const { bar: fpBar, chartBar, rows, busiestInBar } = item;
            const xCenter = coords.timeToX(chartBar.time);
            const slot = Math.max(spacing, 18);
            const slotLeft = xCenter - slot / 2;

            // Authentic LiquidityMapper Footprint Layout (Always full fidelity)
            const candleWidth = Math.min(Math.max(slot * 0.18, 6), 22);
            const candleCenter = slotLeft + candleWidth / 2;
            const colLeft = slotLeft + candleWidth + 4;
            const colWidth = Math.max(16, slot - candleWidth - 6);
            const split = colLeft + colWidth / 2;

            // A. Draw Left-Slid Candle Body & Wicks
            const yOpen = coords.priceToY(chartBar.open, scale, bounds);
            const yClose = coords.priceToY(chartBar.close, scale, bounds);
            const yHigh = coords.priceToY(chartBar.high, scale, bounds);
            const yLow = coords.priceToY(chartBar.low, scale, bounds);
            const isUp = chartBar.close >= chartBar.open;
            const candleColor = isUp ? '#2ebd85' : '#f6465d';

            // Wick
            ctx.strokeStyle = candleColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(candleCenter, yHigh);
            ctx.lineTo(candleCenter, yLow);
            ctx.stroke();

            // Body
            ctx.fillStyle = candleColor;
            const bodyTop = Math.min(yOpen, yClose);
            const bodyH = Math.max(2, Math.abs(yClose - yOpen));
            ctx.fillRect(candleCenter - candleWidth / 2, bodyTop, candleWidth, bodyH);

            // B. Draw Footprint Column Rows
            const printText = colWidth >= 22 && groupedRowPx >= 8;

            for (const r of rows) {
                const y0 = coords.priceToY(r.price, scale, bounds);
                const y1 = coords.priceToY(r.price + groupedStep, scale, bounds);
                const topY = Math.min(y0, y1);
                const h = Math.max(1.2, Math.abs(y1 - y0) - 0.8);

                if (topY + h < bounds.top || topY > bounds.top + chartAreaHeight) continue;

                // 1. Horizontal Volume Fraction Bar
                const fraction = Math.sqrt(r.total / Math.max(1, globalBusiest));
                const barW = Math.max(2, colWidth * fraction);

                const isBuyDom = r.buy >= r.sell * 1.15;
                const isSellDom = r.sell >= r.buy * 1.15;
                ctx.fillStyle = isBuyDom
                    ? 'rgba(46, 189, 133, 0.72)'
                    : isSellDom
                    ? 'rgba(246, 70, 93, 0.72)'
                    : 'rgba(255, 255, 255, 0.10)';
                ctx.fillRect(colLeft, topY, barW, h);

                // Subtle split divider
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.beginPath();
                ctx.moveTo(split, topY);
                ctx.lineTo(split, topY + h);
                ctx.stroke();

                // 2. Diagonal Imbalance Outlines
                if (r.isDiagSell && h >= 4) {
                    ctx.strokeStyle = '#f6465d';
                    ctx.lineWidth = 1.2;
                    ctx.strokeRect(colLeft + 0.5, topY + 0.5, split - colLeft - 1, h - 1);
                }
                if (r.isDiagBuy && h >= 4) {
                    ctx.strokeStyle = '#2ebd85';
                    ctx.lineWidth = 1.2;
                    ctx.strokeRect(split + 0.5, topY + 0.5, colWidth - (split - colLeft) - 1, h - 1);
                }

                // 3. Point of Control (POC) Golden Border
                if (r.total >= busiestInBar && busiestInBar > 0) {
                    ctx.strokeStyle = '#f0b90b';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(colLeft + 0.5, topY + 0.5, colWidth - 1, h - 1);
                }

                // 4. Split Text (Sell x Buy)
                if (printText) {
                    const textY = topY + h / 2;
                    ctx.textBaseline = 'middle';
                    ctx.font = r.isDiagSell || r.isDiagBuy ? 'bold 9.5px monospace' : '9px monospace';

                    // Sell (Left)
                    ctx.textAlign = 'right';
                    ctx.fillStyle = r.isDiagSell ? '#f6465d' : '#f0f0f0';
                    ctx.fillText(formatVol(r.sell), split - 3, textY);

                    // Buy (Right)
                    ctx.textAlign = 'left';
                    ctx.fillStyle = r.isDiagBuy ? '#2ebd85' : '#f0f0f0';
                    ctx.fillText(formatVol(r.buy), split + 3, textY);
                }
            }
        }
        ctx.restore();

        // ====================================================================
        // 4. Docked Footprint Bar Stats Footer (Delta, Cum Delta, Volume)
        // ====================================================================
        const tableTop = bounds.top + chartAreaHeight;
        ctx.fillStyle = '#14151a';
        ctx.fillRect(0, tableTop, plotW, statsTableHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, tableTop);
        ctx.lineTo(plotW, tableTop);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.moveTo(0, tableTop + 22);
        ctx.lineTo(plotW, tableTop + 22);
        ctx.moveTo(0, tableTop + 44);
        ctx.lineTo(plotW, tableTop + 44);
        ctx.stroke();

        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#787b86';
        ctx.fillText('Delta', 12, tableTop + 11);
        ctx.fillText('Cum Delta', 12, tableTop + 33);
        ctx.fillText('Volume', 12, tableTop + 55);

        let runningCumDelta = 0;
        for (let i = 0; i < bars.length; i++) {
            const chartBar = bars[i]!;
            const x = coords.timeToX(chartBar.time);
            if (x < 70 || x > plotW) continue;

            const fpBar = getFpBar(chartBar.time);
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
