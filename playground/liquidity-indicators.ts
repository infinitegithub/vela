import {
    registerNativeIndicator,
    type NativeIndicator,
    type NativeIndicatorDescriptor,
    type NativeIndicatorContext,
    type NativeIndicatorOutput,
    stableSeriesId,
    type InputSchema,
    type InputValue,
    type SeriesSpec,
    type SeriesPoint,
    type MarkerPoint,
    type PriceLine,
    type VisibleRange
} from '../src/plugin';
import {
    LiquidityClient,
    type LongShortPoint,
    type OpenInterestBar,
    type LiquidationItem
} from './liquidity-client';

// ============================================================================
// 1. CVD (Multi-Venue Flow) Indicator
// ============================================================================

export class CvdIndicator implements NativeIndicator {
    private ctx: NativeIndicatorContext | null = null;
    private inputs: Record<string, InputValue> = {};
    private flowMap = new Map<number, { delta: number; cumDelta: number }>();
    private unsubscribeTick: (() => void) | null = null;
    private unsubscribeFlow: (() => void) | null = null;
    private unsubscribeMarket: (() => void) | null = null;

    start(ctx: NativeIndicatorContext, inputs: Record<string, InputValue>): void {
        this.ctx = ctx;
        this.inputs = inputs;
        void this.loadData();

        this.unsubscribeTick = LiquidityClient.get().onTick(() => {
            this.recompute();
        });
        this.unsubscribeFlow = LiquidityClient.get().onFlow((items) => {
            if (Array.isArray(items) && items.length > 0) {
                this.recompute();
            }
        });
        this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch(() => {
            void this.loadData();
        });
    }

    private async loadData(): Promise<void> {
        if (!this.ctx) return;
        this.ctx.setStatus('loading');
        const flows = await LiquidityClient.get().fetchFlowDelta(this.ctx.symbol, this.ctx.timeframe);
        this.flowMap.clear();
        for (const f of flows) {
            this.flowMap.set(f.time, f);
        }
        this.recompute();
        if (this.ctx) this.ctx.setStatus('live');
    }

    onBars(): void {
        this.recompute();
    }

    onViewport(_range: VisibleRange): void {}

    setInputs(inputs: Record<string, InputValue>): void {
        this.inputs = inputs;
        this.recompute();
    }

    suspend(): void {
        if (this.unsubscribeTick) {
            this.unsubscribeTick();
            this.unsubscribeTick = null;
        }
        if (this.unsubscribeFlow) {
            this.unsubscribeFlow();
            this.unsubscribeFlow = null;
        }
        if (this.unsubscribeMarket) {
            this.unsubscribeMarket();
            this.unsubscribeMarket = null;
        }
    }

    resume(): void {
        if (!this.unsubscribeTick) {
            this.unsubscribeTick = LiquidityClient.get().onTick(() => this.recompute());
        }
        if (!this.unsubscribeFlow) {
            this.unsubscribeFlow = LiquidityClient.get().onFlow(() => this.recompute());
        }
        if (!this.unsubscribeMarket) {
            this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch(() => void this.loadData());
        }
        void this.loadData();
    }

    stop(): void {
        this.suspend();
        this.ctx = null;
    }

    private recompute(): void {
        if (!this.ctx) return;
        const bars = this.ctx.bars();
        if (bars.length === 0) return;

        const showDelta = this.inputs['showDelta'] !== false;
        const showDivs = this.inputs['showDivergences'] !== false;
        const instanceId = this.ctx.id;

        const cvdPoints: SeriesPoint[] = [];
        const deltaPoints: SeriesPoint[] = [];
        const markers: MarkerPoint[] = [];

        let runningCumDelta = 0;

        for (let i = 0; i < bars.length; i++) {
            const bar = bars[i]!;
            let delta = 0;

            const cached = this.flowMap.get(bar.time);
            if (cached) {
                delta = cached.delta;
            } else {
                const range = bar.high - bar.low;
                const ratio = range > 0 ? (bar.close - bar.open) / range : 0;
                delta = (bar.volume || 100) * ratio;
            }

            runningCumDelta += delta;

            cvdPoints.push({
                time: bar.time,
                value: runningCumDelta,
            });

            if (showDelta) {
                deltaPoints.push({
                    time: bar.time,
                    value: delta,
                    color: delta >= 0 ? '#2ebd85' : '#f6465d'
                });
            }

            // Swing Divergence Detection (over last 5 bars)
            if (showDivs && i >= 5) {
                const prevBar = bars[i - 5]!;
                const prevCvd = cvdPoints[i - 5]?.value ?? 0;

                // Regular Bearish Divergence: Price Higher High, CVD Lower High
                if (bar.close > prevBar.close && runningCumDelta < prevCvd && delta < 0) {
                    markers.push({
                        time: bar.time,
                        position: 'aboveBar',
                        shape: 'arrowDown',
                        color: '#f6465d',
                        text: 'Bear Div'
                    });
                }
                // Regular Bullish Divergence: Price Lower Low, CVD Higher Low
                else if (bar.close < prevBar.close && runningCumDelta > prevCvd && delta > 0) {
                    markers.push({
                        time: bar.time,
                        position: 'belowBar',
                        shape: 'arrowUp',
                        color: '#2ebd85',
                        text: 'Bull Div'
                    });
                }
            }
        }

        const series: SeriesSpec[] = [
            {
                id: stableSeriesId({ instanceId, kind: 'line', title: 'CVD', ordinal: 0 }),
                title: 'Cumulative Volume Delta',
                paneId: '',
                kind: 'line',
                points: cvdPoints,
                style: {
                    color: '#ffb648',
                    width: 2,
                    lineStyle: 'solid'
                }
            }
        ];

        if (showDelta) {
            series.push({
                id: stableSeriesId({ instanceId, kind: 'histogram', title: 'Bar Delta', ordinal: 1 }),
                title: 'Bar Delta',
                paneId: '',
                kind: 'histogram',
                points: deltaPoints,
                style: {
                    color: '#2ebd85',
                    width: 1,
                    lineStyle: 'solid',
                    base: 0
                }
            });
        }

        if (markers.length > 0) {
            series.push({
                id: stableSeriesId({ instanceId, kind: 'markers', title: 'Divergences', ordinal: 2 }),
                title: 'Divergences',
                paneId: '',
                kind: 'markers',
                markers
            });
        }

        const priceLines: PriceLine[] = [
            {
                id: stableSeriesId({ instanceId, kind: 'hline', title: 'Zero', ordinal: 0 }),
                paneId: '',
                price: 0,
                color: 'rgba(255, 255, 255, 0.15)',
                lineStyle: 'dashed',
                width: 1
            }
        ];

        this.ctx.emit({ series, priceLines });
    }
}

export const cvdDescriptor: NativeIndicatorDescriptor = {
    type: 'lux-liquidity-cvd',
    title: 'CVD (Multi-Venue Flow)',
    shortTitle: 'CVD',
    paneHint: 'new',
    overlay: false,
    multiInstance: true,
    inputsSchema: () => [
        {
            key: 'showDelta',
            title: 'Show Bar Delta Histogram',
            type: 'boolean',
            defval: true
        },
        {
            key: 'showDivergences',
            title: 'Detect Flow Divergences',
            type: 'boolean',
            defval: true
        }
    ],
    defaultInputs: () => ({
        showDelta: true,
        showDivergences: true
    }),
    create: () => new CvdIndicator()
};

// ============================================================================
// 2. Net Long / Net Short (Institutional Positions)
// ============================================================================

export class NetLongShortIndicator implements NativeIndicator {
    private ctx: NativeIndicatorContext | null = null;
    private inputs: Record<string, InputValue> = {};
    private points: LongShortPoint[] = [];
    private unsubscribeMarket: (() => void) | null = null;

    start(ctx: NativeIndicatorContext, inputs: Record<string, InputValue>): void {
        this.ctx = ctx;
        this.inputs = inputs;
        void this.loadData();
        this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch(() => {
            void this.loadData();
        });
    }

    private async loadData(): Promise<void> {
        if (!this.ctx) return;
        this.ctx.setStatus('loading');
        const metric = String(this.inputs['metric'] || 'topPositions');
        this.points = await LiquidityClient.get().fetchLongShort(this.ctx.symbol, this.ctx.timeframe, metric);
        this.recompute();
        if (this.ctx) this.ctx.setStatus('live');
    }

    onBars(): void {
        this.recompute();
    }

    onViewport(_range: VisibleRange): void {}

    setInputs(inputs: Record<string, InputValue>): void {
        this.inputs = inputs;
        void this.loadData();
    }

    suspend(): void {
        if (this.unsubscribeMarket) {
            this.unsubscribeMarket();
            this.unsubscribeMarket = null;
        }
    }

    resume(): void {
        if (!this.unsubscribeMarket) {
            this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch(() => void this.loadData());
        }
        void this.loadData();
    }

    stop(): void {
        this.suspend();
        this.ctx = null;
    }

    private recompute(): void {
        if (!this.ctx) return;
        const bars = this.ctx.bars();
        if (bars.length === 0) return;

        const instanceId = this.ctx.id;
        const ptsMap = new Map<number, number>();
        for (const p of this.points) {
            ptsMap.set(p.t, p.long * 100);
        }

        let lastVal = 50.0;
        const seriesPoints: SeriesPoint[] = [];

        for (const b of bars) {
            const val = ptsMap.get(b.time);
            if (typeof val === 'number') {
                lastVal = val;
            }
            seriesPoints.push({
                time: b.time,
                value: lastVal,
                color: lastVal >= 50 ? '#2ebd85' : '#f6465d'
            });
        }

        const series: SeriesSpec[] = [
            {
                id: stableSeriesId({ instanceId, kind: 'line', title: 'Top Long %', ordinal: 0 }),
                title: 'Long Share (%)',
                paneId: '',
                kind: 'line',
                points: seriesPoints,
                style: {
                    color: '#2ebd85',
                    width: 2,
                    lineStyle: 'solid'
                }
            }
        ];

        const priceLines: PriceLine[] = [
            {
                id: stableSeriesId({ instanceId, kind: 'hline', title: 'Neutral 50%', ordinal: 0 }),
                paneId: '',
                price: 50,
                color: 'rgba(255, 255, 255, 0.25)',
                lineStyle: 'dashed',
                width: 1
            }
        ];

        this.ctx.emit({ series, priceLines });
    }
}

export const nlnsDescriptor: NativeIndicatorDescriptor = {
    type: 'lux-liquidity-nlns',
    title: 'Net Long / Net Short (Institutional)',
    shortTitle: 'NL/NS',
    paneHint: 'new',
    overlay: false,
    multiInstance: true,
    inputsSchema: () => [
        {
            key: 'metric',
            title: 'Positioning Metric',
            type: 'string',
            defval: 'topPositions',
            options: [
                { value: 'topPositions', label: 'Top Trader Positions' },
                { value: 'topAccounts', label: 'Top Trader Accounts' },
                { value: 'global', label: 'Global Long/Short Ratio' }
            ]
        }
    ],
    defaultInputs: () => ({
        metric: 'topPositions'
    }),
    create: () => new NetLongShortIndicator()
};

// ============================================================================
// 3. Forced Liquidations ($)
// ============================================================================

export class LiquidationsIndicator implements NativeIndicator {
    private ctx: NativeIndicatorContext | null = null;
    private inputs: Record<string, InputValue> = {};
    private liqList: LiquidationItem[] = [];
    private unsubscribeMarket: (() => void) | null = null;
    private unsubscribeLiq: (() => void) | null = null;

    start(ctx: NativeIndicatorContext, inputs: Record<string, InputValue>): void {
        this.ctx = ctx;
        this.inputs = inputs;
        void this.loadData();

        this.unsubscribeLiq = LiquidityClient.get().onLiquidations((items) => {
            if (Array.isArray(items) && items.length > 0) {
                for (const it of items) {
                    this.liqList.push({
                        time: it[0],
                        inst: it[1],
                        side: it[2],
                        price: it[3],
                        usd: it[4]
                    });
                }
                this.recompute();
            }
        });

        this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch(() => {
            void this.loadData();
        });
    }

    private async loadData(): Promise<void> {
        if (!this.ctx) return;
        this.ctx.setStatus('loading');
        this.liqList = await LiquidityClient.get().fetchLiquidations(this.ctx.symbol);
        this.recompute();
        if (this.ctx) this.ctx.setStatus('live');
    }

    onBars(): void {
        this.recompute();
    }

    onViewport(_range: VisibleRange): void {}

    setInputs(inputs: Record<string, InputValue>): void {
        this.inputs = inputs;
        this.recompute();
    }

    suspend(): void {
        if (this.unsubscribeLiq) {
            this.unsubscribeLiq();
            this.unsubscribeLiq = null;
        }
        if (this.unsubscribeMarket) {
            this.unsubscribeMarket();
            this.unsubscribeMarket = null;
        }
    }

    resume(): void {
        if (!this.unsubscribeLiq) {
            this.unsubscribeLiq = LiquidityClient.get().onLiquidations(() => this.recompute());
        }
        if (!this.unsubscribeMarket) {
            this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch(() => void this.loadData());
        }
        void this.loadData();
    }

    stop(): void {
        this.suspend();
        this.ctx = null;
    }

    private recompute(): void {
        if (!this.ctx) return;
        const bars = this.ctx.bars();
        if (bars.length === 0) return;

        const instanceId = this.ctx.id;
        const tfMs = bars.length > 1 ? (bars[1]!.time - bars[0]!.time) : 3600_000;

        const shortLiqMap = new Map<number, number>(); // forced buys -> green
        const longLiqMap = new Map<number, number>();  // forced sells -> red

        for (const l of this.liqList) {
            const barTime = Math.floor(l.time / tfMs) * tfMs;
            if (l.side === 'short') {
                shortLiqMap.set(barTime, (shortLiqMap.get(barTime) || 0) + l.usd);
            } else {
                longLiqMap.set(barTime, (longLiqMap.get(barTime) || 0) + l.usd);
            }
        }

        const shortLiqPoints: SeriesPoint[] = [];
        const longLiqPoints: SeriesPoint[] = [];

        for (const b of bars) {
            const shortUsd = shortLiqMap.get(b.time) || 0;
            const longUsd = longLiqMap.get(b.time) || 0;

            shortLiqPoints.push({
                time: b.time,
                value: shortUsd,
                color: '#2ebd85'
            });

            longLiqPoints.push({
                time: b.time,
                value: -longUsd,
                color: '#f6465d'
            });
        }

        const series: SeriesSpec[] = [
            {
                id: stableSeriesId({ instanceId, kind: 'histogram', title: 'Shorts Liquidated (Forced Buys)', ordinal: 0 }),
                title: 'Shorts Liquidated ($)',
                paneId: '',
                kind: 'histogram',
                points: shortLiqPoints,
                style: {
                    color: '#2ebd85',
                    width: 2,
                    lineStyle: 'solid',
                    base: 0
                }
            },
            {
                id: stableSeriesId({ instanceId, kind: 'histogram', title: 'Longs Liquidated (Forced Sells)', ordinal: 1 }),
                title: 'Longs Liquidated ($)',
                paneId: '',
                kind: 'histogram',
                points: longLiqPoints,
                style: {
                    color: '#f6465d',
                    width: 2,
                    lineStyle: 'solid',
                    base: 0
                }
            }
        ];

        const priceLines: PriceLine[] = [
            {
                id: stableSeriesId({ instanceId, kind: 'hline', title: 'Zero', ordinal: 0 }),
                paneId: '',
                price: 0,
                color: 'rgba(255, 255, 255, 0.2)',
                lineStyle: 'dashed',
                width: 1
            }
        ];

        this.ctx.emit({ series, priceLines });
    }
}

export const liqDescriptor: NativeIndicatorDescriptor = {
    type: 'lux-liquidity-liq',
    title: 'Forced Liquidations ($)',
    shortTitle: 'Liquidations',
    paneHint: 'new',
    overlay: false,
    multiInstance: true,
    inputsSchema: () => [],
    defaultInputs: () => ({}),
    create: () => new LiquidationsIndicator()
};

// ============================================================================
// 4. Open Interest (Multi-Venue)
// ============================================================================

export class OpenInterestIndicator implements NativeIndicator {
    private ctx: NativeIndicatorContext | null = null;
    private inputs: Record<string, InputValue> = {};
    private oiBars: OpenInterestBar[] = [];
    private unsubscribeMarket: (() => void) | null = null;

    start(ctx: NativeIndicatorContext, inputs: Record<string, InputValue>): void {
        this.ctx = ctx;
        this.inputs = inputs;
        void this.loadData();
        this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch(() => {
            void this.loadData();
        });
    }

    private async loadData(): Promise<void> {
        if (!this.ctx) return;
        this.ctx.setStatus('loading');
        this.oiBars = await LiquidityClient.get().fetchOpenInterest(this.ctx.symbol, this.ctx.timeframe);
        this.recompute();
        if (this.ctx) this.ctx.setStatus('live');
    }

    onBars(): void {
        this.recompute();
    }

    onViewport(_range: VisibleRange): void {}

    setInputs(inputs: Record<string, InputValue>): void {
        this.inputs = inputs;
        this.recompute();
    }

    suspend(): void {
        if (this.unsubscribeMarket) {
            this.unsubscribeMarket();
            this.unsubscribeMarket = null;
        }
    }

    resume(): void {
        if (!this.unsubscribeMarket) {
            this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch(() => void this.loadData());
        }
        void this.loadData();
    }

    stop(): void {
        this.suspend();
        this.ctx = null;
    }

    private recompute(): void {
        if (!this.ctx) return;
        const bars = this.ctx.bars();
        if (bars.length === 0) return;

        const instanceId = this.ctx.id;
        const maPeriod = Number(this.inputs['period'] || 20);

        const oiMap = new Map<number, number>();
        for (const b of this.oiBars) {
            oiMap.set(b.time, b.close);
        }

        const oiPoints: SeriesPoint[] = [];
        const maPoints: SeriesPoint[] = [];
        const oiBuffer: number[] = [];

        let lastOi = 0;
        for (const b of bars) {
            const val = oiMap.get(b.time);
            if (typeof val === 'number') lastOi = val;

            oiPoints.push({
                time: b.time,
                value: lastOi || null
            });

            if (lastOi > 0) {
                oiBuffer.push(lastOi);
                if (oiBuffer.length > maPeriod) oiBuffer.shift();
                const sum = oiBuffer.reduce((a, b) => a + b, 0);
                maPoints.push({
                    time: b.time,
                    value: sum / oiBuffer.length,
                    color: '#ffb648'
                });
            } else {
                maPoints.push({
                    time: b.time,
                    value: null
                });
            }
        }

        const series: SeriesSpec[] = [
            {
                id: stableSeriesId({ instanceId, kind: 'line', title: 'Open Interest', ordinal: 0 }),
                title: 'Open Interest',
                paneId: '',
                kind: 'line',
                points: oiPoints,
                style: {
                    color: '#7a5af8',
                    width: 2,
                    lineStyle: 'solid'
                }
            },
            {
                id: stableSeriesId({ instanceId, kind: 'line', title: 'OI MA', ordinal: 1 }),
                title: `OI ${maPeriod} MA`,
                paneId: '',
                kind: 'line',
                points: maPoints,
                style: {
                    color: '#ffb648',
                    width: 1,
                    lineStyle: 'dashed'
                }
            }
        ];

        this.ctx.emit({ series });
    }
}

export const oiDescriptor: NativeIndicatorDescriptor = {
    type: 'lux-liquidity-oi',
    title: 'Open Interest (Multi-Venue)',
    shortTitle: 'Open Interest',
    paneHint: 'new',
    overlay: false,
    multiInstance: true,
    inputsSchema: () => [
        {
            key: 'period',
            title: 'Smoothing MA Period',
            type: 'integer',
            defval: 20,
            min: 5,
            max: 100
        }
    ],
    defaultInputs: () => ({
        period: 20
    }),
    create: () => new OpenInterestIndicator()
};

// ============================================================================
// Registration Entrypoint
// ============================================================================

export function registerLiquidityIndicators(): void {
    registerNativeIndicator(cvdDescriptor);
    registerNativeIndicator(nlnsDescriptor);
    registerNativeIndicator(liqDescriptor);
    registerNativeIndicator(oiDescriptor);
}
