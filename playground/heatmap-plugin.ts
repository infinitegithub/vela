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
    maxLevelUsd: number;
    barLevels: Map<number, HeatmapBarLevel[]>;
    liquidations: HeatmapLiquidation[];
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
    private liquidations: HeatmapLiquidation[] = [];
    private step = 50;
    private maxLevelUsd = 100_000;

    start(host: SeriesDataEngineHost): void {
        this.host = host;
        this.active = true;
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
        void this.loadData();
    }

    stop(): void {
        this.suspend();
        this.host = null;
    }

    private async loadData(): Promise<void> {
        if (!this.host) return;
        const symbol = this.host.symbol || 'BTCUSDT';
        const tf = normalizeTimeframe(this.host.timeframe || '1h');
        const tfMs = timeframeToMs(tf);

        try {
            const state = await LiquidityClient.get().getState();
            const currentPrice = state?.markPrice || 81300;
            this.step = gridStepFor(currentPrice);

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
        } catch (e) {
            console.warn('[HeatmapDataEngine] loadData warning:', e);
        }
    }

    private ingestLevels(frame: LevelsFrame): void {
        if (!this.host || !frame) return;
        const tf = normalizeTimeframe(this.host.timeframe || '1h');
        const tfMs = timeframeToMs(tf);
        const barTime = Math.floor(frame.timestamp / tfMs) * tfMs;

        const levels: HeatmapBarLevel[] = [];
        let maxLvl = this.maxLevelUsd;

        for (const b of (frame.bids || [])) {
            const usd = b.usd || (b.size * b.price);
            if (usd > maxLvl) maxLvl = usd;
            levels.push({ price: b.price, bidUsd: usd, askUsd: 0, totalUsd: usd });
        }
        for (const a of (frame.asks || [])) {
            const usd = a.usd || (a.size * a.price);
            if (usd > maxLvl) maxLvl = usd;
            levels.push({ price: a.price, bidUsd: 0, askUsd: usd, totalUsd: usd });
        }

        this.maxLevelUsd = maxLvl;
        this.barLevels.set(barTime, levels);
        this.pushCurrent();
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
            maxLevelUsd: this.maxLevelUsd,
            barLevels: this.barLevels,
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
        const maxUsd = Math.max(100_000, payload?.maxLevelUsd || 1_000_000);
        const lastClose = bars.length > 0 ? bars[bars.length - 1]!.close : 80000;
        const step = payload?.step || gridStepFor(lastClose);

        for (let i = 0; i < bars.length; i++) {
            const bar = bars[i]!;
            const x = coords.timeToX(bar.time);
            if (x < -60 || x > bounds.width + 60) continue;

            const nextX = i + 1 < bars.length ? coords.timeToX(bars[i + 1]!.time) : x + 20;
            const barW = Math.max(2, nextX - x);

            const levels = barLevels?.get(bar.time);
            if (levels && levels.length > 0) {
                for (const lvl of levels) {
                    const y = coords.priceToY(lvl.price, scale, bounds);
                    const yTop = coords.priceToY(lvl.price + step, scale, bounds);
                    const h = Math.max(1.5, Math.abs(yTop - y));

                    const ratio = Math.min(1, lvl.totalUsd / maxUsd);
                    if (ratio < 0.04) continue;

                    if (lvl.bidUsd > lvl.askUsd) {
                        ctx.fillStyle = `rgba(0, 210, 255, ${0.12 + ratio * 0.75})`;
                    } else {
                        ctx.fillStyle = `rgba(255, 110, 40, ${0.12 + ratio * 0.75})`;
                    }
                    ctx.fillRect(x - barW / 2, y - h / 2, barW, h);
                }
            } else {
                const spread = Math.max(step * 4, (bar.high - bar.low) * 1.6);
                const rows = 10;
                const rowStep = spread / rows;
                const centerPrice = (bar.high + bar.low) / 2;

                for (let r = -rows; r <= rows; r++) {
                    const p = centerPrice + r * rowStep;
                    const y = coords.priceToY(p, scale, bounds);
                    const yTop = coords.priceToY(p + rowStep, scale, bounds);
                    const h = Math.max(1.5, Math.abs(yTop - y));

                    const dist = Math.abs(r) / rows;
                    const intensity = (1 - dist) * 0.38 * (bar.volume ? Math.min(1, bar.volume / 400) : 0.6);
                    if (intensity < 0.04) continue;

                    if (r < 0) {
                        ctx.fillStyle = `rgba(0, 210, 255, ${intensity})`;
                    } else {
                        ctx.fillStyle = `rgba(240, 120, 50, ${intensity})`;
                    }
                    ctx.fillRect(x - barW / 2, y - h / 2, barW, h);
                }
            }
        }
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
            if (x < -30 || x > bounds.width + 30 || y < -30 || y > bounds.height + 30) continue;

            const radius = Math.max(11, Math.min(26, Math.log10(liq.usd) * 3.5));
            const isBuy = liq.side === 'buy';
            const mainColor = isBuy ? '#2ebd85' : '#f6465d';
            const glowColor = isBuy ? 'rgba(46, 189, 133, 0.45)' : 'rgba(246, 70, 93, 0.45)';

            // Outer glow
            ctx.beginPath();
            ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
            ctx.fillStyle = glowColor;
            ctx.fill();

            // Inner circle
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#0c0c0e';
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
