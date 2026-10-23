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

    start(ctx: NativeIndicatorContext, inputs: Record<string, InputValue>): void {
        this.ctx = ctx;
        this.inputs = inputs;
        this.loadData();
        this.unsubscribeTick = LiquidityClient.get().onTick(() => {
            this.recompute();
        });
        this.unsubscribeFlow = LiquidityClient.get().onFlow((items) => {
            if (Array.isArray(items) && items.length > 0) {
                this.recompute();
            }
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
    }

    resume(): void {
        if (!this.unsubscribeTick) {
            this.unsubscribeTick = LiquidityClient.get().onTick(() => this.recompute());
        }
        if (!this.unsubscribeFlow) {
            this.unsubscribeFlow = LiquidityClient.get().onFlow(() => this.recompute());
        }
        this.recompute();
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
                // Approximate from price movement
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
// 2. Net Longs / Net Shorts Institutional Indicator
// ============================================================================

export class NetLongShortIndicator implements NativeIndicator {
    private ctx: NativeIndicatorContext | null = null;
    private inputs: Record<string, InputValue> = {};
    private points: LongShortPoint[] = [];

    start(ctx: NativeIndicatorContext, inputs: Record<string, InputValue>): void {
        this.ctx = ctx;
        this.inputs = inputs;
        this.loadData();
    }

    private async loadData(): Promise<void> {
        if (!this.ctx) return;
        this.ctx.setStatus('loading');
        const metric = String(this.inputs['metric'] || 'topPositions');
        this.points = await LiquidityClient.get().fetchLongShort(this.ctx.symbol, '1h', metric);
        this.recompute();
        if (this.ctx) this.ctx.setStatus('live');
    }

    onBars(): void {
        this.recompute();
    }

    onViewport(_range: VisibleRange): void {}

    setInputs(inputs: Record<string, InputValue>): void {
        this.inputs = inputs;
        this.loadData();
    }

    suspend(): void {}
    resume(): void { this.recompute(); }
    stop(): void { this.ctx = null; }

    private recompute(): void {
        if (!this.ctx) return;
        const bars = this.ctx.bars();
        if (bars.length === 0) return;

        const instanceId = this.ctx.id;
        const pts: SeriesPoint[] = [];

        // Align long/short points to chart bars
        let pointIdx = 0;
        let lastRatio = 0.5;

        for (let i = 0; i < bars.length; i++) {
            const bar = bars[i]!;
            while (pointIdx < this.points.length && this.points[pointIdx]!.t <= bar.time) {
                lastRatio = this.points[pointIdx]!.long;
                pointIdx++;
            }

            // Net Long %: (long - 0.5) * 100
            // E.g. 62% long -> +12% Net Long
            // E.g. 40% long -> -10% Net Short
            const netPct = (lastRatio - 0.5) * 100;
            pts.push({
                time: bar.time,
                value: netPct,
                color: netPct >= 0 ? '#d4a106' : '#7a5af8'
            });
        }

        const series: SeriesSpec[] = [
            {
                id: stableSeriesId({ instanceId, kind: 'line', title: 'Net Long %', ordinal: 0 }),
                title: 'Institutional Net Long %',
                paneId: '',
                kind: 'line',
                points: pts,
                style: {
                    color: '#d4a106',
                    width: 2,
                    lineStyle: 'solid'
                }
            }
        ];

        const priceLines: PriceLine[] = [
            {
                id: stableSeriesId({ instanceId, kind: 'hline', title: 'Neutral', ordinal: 0 }),
                paneId: '',
                price: 0,
                color: 'rgba(255, 255, 255, 0.3)',
                lineStyle: 'dashed',
                width: 1,
                title: 'Neutral (50/50)'
            },
            {
                id: stableSeriesId({ instanceId, kind: 'hline', title: 'Overweight Long', ordinal: 1 }),
                paneId: '',
                price: 10,
                color: 'rgba(46, 189, 133, 0.5)',
                lineStyle: 'dotted',
                width: 1,
                title: '+10% Net Long'
            },
            {
                id: stableSeriesId({ instanceId, kind: 'hline', title: 'Overweight Short', ordinal: 2 }),
                paneId: '',
                price: -10,
                color: 'rgba(246, 70, 93, 0.5)',
                lineStyle: 'dotted',
                width: 1,
                title: '-10% Net Short'
            }
        ];

        this.ctx.emit({ series, priceLines });
    }
}

export const nlnsDescriptor: NativeIndicatorDescriptor = {
    type: 'lux-liquidity-nlns',
    title: 'Net Longs / Net Shorts (Institutional)',
    shortTitle: 'NL/NS',
    paneHint: 'new',
    overlay: false,
    multiInstance: true,
    inputsSchema: () => [
        {
            key: 'metric',
            title: 'Traders Population',
            type: 'string',
            defval: 'topPositions',
            options: ['topPositions', 'topAccounts', 'accounts']
        }
    ],
    defaultInputs: () => ({
        metric: 'topPositions'
    }),
    create: () => new NetLongShortIndicator()
};


// ============================================================================
// 3. Forced Liquidations ($) Indicator
// ============================================================================

export class LiquidationsIndicator implements NativeIndicator {
    private ctx: NativeIndicatorContext | null = null;
    private inputs: Record<string, InputValue> = {};
    private liqList: LiquidationItem[] = [];
    private unsubscribeLiq: (() => void) | null = null;

    start(ctx: NativeIndicatorContext, inputs: Record<string, InputValue>): void {
        this.ctx = ctx;
        this.inputs = inputs;
        this.loadData();
        this.unsubscribeLiq = LiquidityClient.get().onLiquidations((items) => {
            if (Array.isArray(items) && items.length > 0) {
                this.loadData();
            }
        });
    }

    private async loadData(): Promise<void> {
        if (!this.ctx) return;
        this.ctx.setStatus('loading');
        this.liqList = await LiquidityClient.get().fetchLiquidations();
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
    }

    resume(): void {
        if (!this.unsubscribeLiq) {
            this.unsubscribeLiq = LiquidityClient.get().onLiquidations(() => this.loadData());
        }
        this.recompute();
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
        const floor = Number(this.inputs['floor'] || 1000);

        // Group liquidations into bar buckets
        const shortLiqPoints: SeriesPoint[] = [];
        const longLiqPoints: SeriesPoint[] = [];

        let liqIdx = 0;
        const sortedLiqs = [...this.liqList].sort((a, b) => a.time - b.time);

        for (let i = 0; i < bars.length; i++) {
            const bar = bars[i]!;
            const nextTime = i < bars.length - 1 ? bars[i + 1]!.time : bar.time + 60000;

            let longVol = 0;
            let shortVol = 0;

            while (liqIdx < sortedLiqs.length && sortedLiqs[liqIdx]!.time < nextTime) {
                const item = sortedLiqs[liqIdx]!;
                if (item.time >= bar.time && item.usd >= floor) {
                    if (item.side === 'long') longVol += item.usd;
                    else shortVol += item.usd;
                }
                liqIdx++;
            }

            shortLiqPoints.push({
                time: bar.time,
                value: shortVol > 0 ? shortVol : null,
                color: '#2ebd85'
            });

            longLiqPoints.push({
                time: bar.time,
                value: longVol > 0 ? -longVol : null,
                color: '#f6465d'
            });
        }

        const series: SeriesSpec[] = [
            {
                id: stableSeriesId({ instanceId, kind: 'histogram', title: 'Short Liquidations', ordinal: 0 }),
                title: 'Short Liq (Forced Buys)',
                paneId: '',
                kind: 'histogram',
                points: shortLiqPoints,
                style: {
                    color: '#2ebd85',
                    width: 1,
                    lineStyle: 'solid',
                    base: 0
                }
            },
            {
                id: stableSeriesId({ instanceId, kind: 'histogram', title: 'Long Liquidations', ordinal: 1 }),
                title: 'Long Liq (Forced Sells)',
                paneId: '',
                kind: 'histogram',
                points: longLiqPoints,
                style: {
                    color: '#f6465d',
                    width: 1,
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
                color: 'rgba(255, 255, 255, 0.15)',
                lineStyle: 'solid',
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
    inputsSchema: () => [
        {
            key: 'floor',
            title: 'Minimum Size ($USD)',
            type: 'integer',
            defval: 1000,
            min: 100,
            max: 1000000
        }
    ],
    defaultInputs: () => ({
        floor: 1000
    }),
    create: () => new LiquidationsIndicator()
};


// ============================================================================
// 4. Open Interest (Multi-Venue) Indicator
// ============================================================================

export class OpenInterestIndicator implements NativeIndicator {
    private ctx: NativeIndicatorContext | null = null;
    private inputs: Record<string, InputValue> = {};
    private oiBars: OpenInterestBar[] = [];

    start(ctx: NativeIndicatorContext, inputs: Record<string, InputValue>): void {
        this.ctx = ctx;
        this.inputs = inputs;
        this.loadData();
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

    suspend(): void {}
    resume(): void { this.recompute(); }
    stop(): void { this.ctx = null; }

    private recompute(): void {
        if (!this.ctx) return;
        const bars = this.ctx.bars();
        if (bars.length === 0) return;

        const instanceId = this.ctx.id;
        const maPeriod = Number(this.inputs['period'] || 20);

        const oiPoints: SeriesPoint[] = [];
        const maPoints: SeriesPoint[] = [];

        let oiIdx = 0;
        let lastOi = 0;
        const oiBuffer: number[] = [];

        for (let i = 0; i < bars.length; i++) {
            const bar = bars[i]!;
            while (oiIdx < this.oiBars.length && this.oiBars[oiIdx]!.time <= bar.time) {
                lastOi = this.oiBars[oiIdx]!.close;
                oiIdx++;
            }

            oiPoints.push({
                time: bar.time,
                value: lastOi > 0 ? lastOi : null,
                color: '#7a5af8'
            });

            if (lastOi > 0) {
                oiBuffer.push(lastOi);
                if (oiBuffer.length > maPeriod) oiBuffer.shift();
                const sum = oiBuffer.reduce((a, b) => a + b, 0);
                maPoints.push({
                    time: bar.time,
                    value: sum / oiBuffer.length,
                    color: '#ffb648'
                });
            } else {
                maPoints.push({
                    time: bar.time,
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
