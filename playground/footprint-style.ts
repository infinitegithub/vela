import { registerChartType, registerRendererLayer } from '../src/plugin';
import type { RendererLayerArgs } from '../src/renderers/native/layers';
import type { OHLCV } from '../src/core/model/ohlcv';
import {
    buildFootprintBarModel,
    buildDeltaSummaryColumns,
    clusterOrderFlowBarsByMintick,
    resolveColorScale,
    withAlpha,
    formatCompactNumericValue,
    formatNumericValue,
    ORDER_FLOW_STYLE_PRESETS,
    ORDER_FLOW_THEME_PRESETS,
    DEFAULT_FOOTPRINT_SERIES_OPTIONS,
    DEFAULT_DELTA_SUMMARY_SERIES_OPTIONS,
    type OrderFlowBar,
    type FootprintBarModel,
    type FootprintLevelModel,
    type FootprintSeriesOptions,
    type DeltaSummaryColumnModel,
    type DeltaSummaryColumnKey,
} from 'lightweight-orderflow-charts';

import { globalBinanceOrderFlow, roundToTick } from './orderflow/binance-feed';
import {
    classicBars,
    cornBars,
    demoBars,
    volumeFootprintBars,
    shadesBars,
} from './orderflow/fixtures';

// --- Density & Layout Engine (mirror of lightweight-orderflow-charts) ---

export type FootprintDensity = 'full' | 'compact' | 'heatmap';

export function resolveFootprintDensity(barSpacing: number): FootprintDensity {
    if (barSpacing >= 32) return 'full';
    if (barSpacing >= 18) return 'compact';
    return 'heatmap';
}

export function resolveFootprintFontSize(baseFontSize: number, barWidth: number): number {
    return Math.max(7, Math.min(baseFontSize, Math.floor(barWidth * 0.28)));
}

export interface FootprintRegion {
    left: number;
    width: number;
    centerX: number;
}

export interface FootprintBarLayout {
    left: number;
    width: number;
    right: number;
    candle: FootprintRegion | null;
    bidArea: FootprintRegion | null;
    askArea: FootprintRegion | null;
    separator: FootprintRegion | null;
    singleCellSegments: FootprintRegion[];
    singleCellTextCenterX: number;
}

function createRegion(left: number, width: number): FootprintRegion | null {
    if (width <= 0) return null;
    return { left, width, centerX: left + width / 2 };
}

export function resolveFootprintBarLayout(
    centerX: number,
    barWidth: number,
    options: Pick<FootprintSeriesOptions, 'candle' | 'ladder'>,
): FootprintBarLayout {
    const left = centerX - barWidth / 2;
    const right = left + barWidth;
    const separatorGap = options.ladder.separatorMode === 'letter' ? Math.max(0, Math.min(options.ladder.separatorGap, Math.floor(barWidth / 3))) : 0;

    if (!options.candle.visible || options.candle.position === 'none') {
        const splitWidth = Math.max(barWidth - separatorGap, 2);
        const bidWidth = Math.max(Math.floor(splitWidth / 2), 1);
        const askWidth = Math.max(splitWidth - bidWidth, 1);

        return {
            left,
            width: barWidth,
            right,
            candle: null,
            bidArea: createRegion(left, bidWidth),
            askArea: createRegion(left + bidWidth + separatorGap, askWidth),
            separator: createRegion(left + bidWidth, separatorGap),
            singleCellSegments: [createRegion(left, barWidth)].filter((v): v is FootprintRegion => Boolean(v)),
            singleCellTextCenterX: centerX,
        };
    }

    const candleWidth = Math.max(
        options.candle.minWidth,
        Math.min(
            options.candle.maxWidth,
            Math.max(barWidth - 2, options.candle.minWidth),
            Math.floor(barWidth * options.candle.widthRatio)
        )
    );
    const gap = Math.max(0, Math.min(options.candle.gap, Math.floor(barWidth / 4)));
    const candleSpan = candleWidth + gap * 2;

    if (options.candle.position === 'middle') {
        const leftWidth = Math.max(Math.floor((barWidth - candleSpan) / 2), 1);
        const rightWidth = Math.max(barWidth - leftWidth - candleSpan, 1);
        const bidArea = createRegion(left, leftWidth);
        const candle = createRegion(left + leftWidth + gap, candleWidth);
        const askArea = createRegion((candle?.left ?? left) + candleWidth + gap, rightWidth);
        const singleCellSegments = [bidArea, askArea].filter((v): v is FootprintRegion => Boolean(v));

        return {
            left,
            width: barWidth,
            right,
            candle,
            bidArea,
            askArea,
            separator: null,
            singleCellSegments,
            singleCellTextCenterX: askArea?.centerX ?? bidArea?.centerX ?? centerX,
        };
    }

    const candleLeft = options.candle.position === 'left' ? left : right - candleWidth;
    const candle = createRegion(candleLeft, candleWidth);
    const ladderLeft = options.candle.position === 'left' ? candleLeft + candleWidth + gap : left;
    const ladderRight = options.candle.position === 'left' ? right : Math.max(candleLeft - gap, ladderLeft + 1);
    const ladderWidth = Math.max(ladderRight - ladderLeft, 1);
    const splitWidth = Math.max(ladderWidth - separatorGap, 2);
    const bidWidth = Math.max(Math.floor(splitWidth / 2), 1);
    const askWidth = Math.max(splitWidth - bidWidth, 1);
    const bidArea = createRegion(ladderLeft, bidWidth);
    const separator = createRegion(ladderLeft + bidWidth, separatorGap);
    const askArea = createRegion(ladderLeft + bidWidth + separatorGap, askWidth);
    const singleCellSegment = createRegion(ladderLeft, ladderWidth);

    return {
        left,
        width: barWidth,
        right,
        candle,
        bidArea,
        askArea,
        separator,
        singleCellSegments: singleCellSegment ? [singleCellSegment] : [],
        singleCellTextCenterX: singleCellSegment?.centerX ?? centerX,
    };
}

export function formatCompactFootprintValue(value: number, options: FootprintSeriesOptions['style']): string {
    const absVal = Math.abs(value);
    const dec = (absVal > 0 && absVal < 10) ? 2 : options.valueDecimalDigits;
    return formatCompactNumericValue(value, {
        integerDigits: options.valueIntegerDigits,
        decimalDigits: dec,
        rounding: options.valueRounding,
        suffixVisible: options.valueUnitVisible,
    });
}

function resolveRowBounds(
    model: FootprintBarModel,
    level: FootprintLevelModel,
    index: number,
    currentY: number,
    priceConverter: (price: number) => number,
    fallbackRowHeight: number,
): { top: number; bottom: number } {
    if (model.priceStep && model.priceStep > 0) {
        const upperY = priceConverter(level.price + model.priceStep / 2);
        const lowerY = priceConverter(level.price - model.priceStep / 2);

        if (Number.isFinite(upperY) && Number.isFinite(lowerY)) {
            return {
                top: Math.min(upperY, lowerY),
                bottom: Math.max(upperY, lowerY),
            };
        }
    }

    const prevY = index > 0 ? priceConverter(model.levels[index - 1].price) : currentY + fallbackRowHeight;
    const nextY = index < model.levels.length - 1 ? priceConverter(model.levels[index + 1].price) : currentY - fallbackRowHeight;

    return {
        top: Math.min((currentY + nextY) / 2, (currentY + prevY) / 2),
        bottom: Math.max((currentY + nextY) / 2, (currentY + prevY) / 2),
    };
}

function fillCenteredText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
}

/**
 * Registers "Footprint" as a native Chart Type in Vela.
 */
export function registerFootprintChartType() {
    registerChartType({
        id: 'footprint',
        label: 'Footprint',
        basePainting: 'none',
        settings: {
            title: 'Footprint Order Flow',
            visibility: 'active',
            rows: [
                { kind: 'heading', label: 'Preset & Data Source' },
                {
                    kind: 'select',
                    key: 'preset',
                    label: 'Style Preset',
                    options: [
                        ['shadedReference', 'Shaded Reference (Standard)'],
                        ['orderFlowReference', 'Order Flow Reference (Classic)'],
                        ['modernDark', 'Modern Dark Terminal'],
                    ],
                    defval: 'shadedReference',
                },
                {
                    kind: 'select',
                    key: 'dataSource',
                    label: 'Data Source',
                    options: [
                        ['binance_live', 'Binance Live (Real Order Flow)'],
                        ['classic_reference', 'Classic Reference Fixture (ZC 12-15)'],
                        ['corn_reference', 'Corn Reference Fixture (CORN)'],
                        ['demo_es', 'E-mini S&P 500 Fixture (ESM6)'],
                        ['shades_reference', 'Absorption Reference Fixture'],
                    ],
                    defval: 'binance_live',
                },
                { kind: 'heading', label: 'Cluster Mode & Candle' },
                {
                    kind: 'select',
                    key: 'mode',
                    label: 'Cluster Mode',
                    options: [
                        ['bid_ask', 'Bid × Ask'],
                        ['delta', 'Delta Profile'],
                        ['volume', 'Volume Profile'],
                    ],
                    defval: 'bid_ask',
                },
                {
                    kind: 'select',
                    key: 'candlePosition',
                    label: 'Candle Position',
                    options: [
                        ['middle', 'Middle (Between Bid & Ask)'],
                        ['left', 'Left'],
                        ['right', 'Right'],
                        ['none', 'Hidden'],
                    ],
                    defval: 'middle',
                },
                {
                    kind: 'toggle',
                    key: 'showWicks',
                    label: 'Show Candle Wicks',
                    defval: true,
                },
                {
                    kind: 'select',
                    key: 'priceStep',
                    label: 'Price Step (Ticks)',
                    options: [
                        ['auto', 'Auto (Instrument Mintick)'],
                        ['0.1', '0.10'],
                        ['0.5', '0.50'],
                        ['1', '1.00'],
                        ['5', '5.00'],
                        ['10', '10.00'],
                    ],
                    defval: 'auto',
                },
                { kind: 'heading', label: 'Point of Control (POC)' },
                {
                    kind: 'toggle',
                    key: 'showPoc',
                    label: 'Highlight POC Level',
                    defval: true,
                    colors: [{ key: 'pocColor', label: 'POC Color', defval: '#ffd700' }],
                },
                {
                    kind: 'select',
                    key: 'pocStyle',
                    label: 'POC Style',
                    options: [
                        ['outline', 'Bounding Box Outline'],
                        ['filled', 'Solid Highlight Fill'],
                    ],
                    defval: 'outline',
                },
                { kind: 'heading', label: 'Imbalances & Order Flow' },
                {
                    kind: 'row',
                    label: 'Diagonal Imbalances',
                    toggle: { key: 'imbalance', defval: true },
                    controls: [
                        {
                            kind: 'number',
                            key: 'imbalanceRatio',
                            label: 'Threshold (%)',
                            defval: 300,
                            min: 150,
                            max: 1000,
                            step: 25,
                        },
                        {
                            kind: 'color',
                            key: 'buyImbalanceColor',
                            label: 'Buy Imbalance',
                            defval: '#38bdf8',
                        },
                        {
                            kind: 'color',
                            key: 'sellImbalanceColor',
                            label: 'Sell Imbalance',
                            defval: '#f87171',
                        },
                    ],
                },
                {
                    kind: 'toggle',
                    key: 'stackedImbalance',
                    label: 'Stacked Imbalances (3+ Levels)',
                    defval: true,
                },
                { kind: 'heading', label: 'Metrics & Subcharts' },
                {
                    kind: 'toggle',
                    key: 'showSummaryBadges',
                    label: 'Per-Bar Delta & Volume Badges',
                    defval: true,
                },
                {
                    kind: 'toggle',
                    key: 'showDeltaSummary',
                    label: 'Delta Summary Table (Bottom Dock)',
                    defval: true,
                },
            ],
        },
    });

    registerRendererLayer({
        id: 'footprint',
        placement: 'above-data',
        create: () => {
            let ctx: CanvasRenderingContext2D | null = null;
            let canvasEl: HTMLCanvasElement | null = null;

            return {
                mount(canvas: HTMLCanvasElement) {
                    canvasEl = canvas;
                    ctx = canvas.getContext('2d');
                },
                render({ bars, coords, scale, bounds, priceStyle, settings, theme }: RendererLayerArgs) {
                    if (!ctx || !canvasEl) return;

                    const dpr = coords.dpr || 1;
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
                    if (priceStyle !== 'footprint') return;
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

                    const s = (settings || {}) as Record<string, unknown>;
                    const presetName = typeof s.preset === 'string' ? s.preset : 'shadedReference';
                    const dataSource = typeof s.dataSource === 'string' && s.dataSource !== 'demo_es' ? s.dataSource : 'binance_live';
                    const mode = typeof s.mode === 'string' ? s.mode : 'bid_ask';
                    const candlePosition = typeof s.candlePosition === 'string' ? s.candlePosition : 'middle';
                    const showWicks = s.showWicks !== undefined ? Boolean(s.showWicks) : true;
                    const showPoc = s.showPoc !== undefined ? Boolean(s.showPoc) : true;
                    const pocColor = typeof s.pocColor === 'string' ? s.pocColor : '#ffd700';
                    const pocStyle = typeof s.pocStyle === 'string' ? s.pocStyle : 'outline';
                    const imbalance = s.imbalance !== undefined ? Boolean(s.imbalance) : true;
                    const imbalanceRatio = typeof s.imbalanceRatio === 'number' ? Math.max(100, s.imbalanceRatio) : 300;
                    const buyImbalanceColor = typeof s.buyImbalanceColor === 'string' ? s.buyImbalanceColor : '#38bdf8';
                    const sellImbalanceColor = typeof s.sellImbalanceColor === 'string' ? s.sellImbalanceColor : '#f87171';
                    const stackedImbalance = s.stackedImbalance !== undefined ? Boolean(s.stackedImbalance) : true;
                    const showSummaryBadges = s.showSummaryBadges !== undefined ? Boolean(s.showSummaryBadges) : true;
                    const showDeltaSummary = s.showDeltaSummary !== undefined ? Boolean(s.showDeltaSummary) : true;

                    // Resolve base options from presets
                    const basePreset = (ORDER_FLOW_STYLE_PRESETS as Record<string, any>)[presetName] || ORDER_FLOW_STYLE_PRESETS.shadedReference;
                    const options: FootprintSeriesOptions = {
                        ...DEFAULT_FOOTPRINT_SERIES_OPTIONS,
                        ...(basePreset.footprint || {}),
                        candle: {
                            ...DEFAULT_FOOTPRINT_SERIES_OPTIONS.candle,
                            ...(basePreset.footprint?.candle || {}),
                            visible: candlePosition !== 'none',
                            position: candlePosition as any,
                            showWicks,
                        },
                        ladder: {
                            ...DEFAULT_FOOTPRINT_SERIES_OPTIONS.ladder,
                            ...(basePreset.footprint?.ladder || {}),
                            textMode: mode === 'delta' ? 'delta' : mode === 'volume' ? 'total' : 'bid-ask',
                            highlightImbalances: imbalance,
                            highlightStackedImbalances: stackedImbalance,
                            imbalanceRatio: imbalanceRatio / 100,
                            cellBorderWidth: 1,
                        },
                        pointOfControl: {
                            ...DEFAULT_FOOTPRINT_SERIES_OPTIONS.pointOfControl,
                            ...(basePreset.footprint?.pointOfControl || {}),
                            visible: showPoc,
                            borderColor: pocColor,
                            backgroundColor: pocStyle === 'filled' ? withAlpha(pocColor, 0.22) : 'transparent',
                            borderWidth: 1.5,
                        },
                        style: {
                            ...DEFAULT_FOOTPRINT_SERIES_OPTIONS.style,
                            ...(basePreset.footprint?.style || {}),
                            buyImbalanceColor,
                            sellImbalanceColor,
                            positiveImbalanceTextColor: buyImbalanceColor,
                            negativeImbalanceTextColor: sellImbalanceColor,
                            bidTextColor: '#f87171',
                            askTextColor: '#38bdf8',
                            neutralTextColor: '#cbd5e1',
                            cellBorderColor: 'rgba(148, 163, 184, 0.18)',
                            ladderBorderColor: 'rgba(148, 163, 184, 0.38)',
                        },
                    };

                    // Determine Price Step / Mintick
                    let instrumentStep = 1.0;
                    if (typeof s.priceStep === 'string' && s.priceStep !== 'auto') {
                        instrumentStep = parseFloat(s.priceStep) || 1.0;
                    } else {
                        const activeSym = (coords as any).symbol || 'BTCUSDT';
                        if (activeSym.includes('BTC')) instrumentStep = 5.0;
                        else if (activeSym.includes('ETH')) instrumentStep = 0.5;
                        else if (activeSym.includes('SOL')) instrumentStep = 0.1;
                        else instrumentStep = 0.5;
                    }
                    options.ladder.priceStep = instrumentStep;

                    // OrderFlow Bars determination
                    let orderFlowBars: OrderFlowBar[] = [];

                    if (dataSource === 'classic_reference') {
                        orderFlowBars = classicBars;
                    } else if (dataSource === 'corn_reference') {
                        orderFlowBars = cornBars;
                    } else if (dataSource === 'demo_es') {
                        orderFlowBars = demoBars;
                    } else if (dataSource === 'shades_reference') {
                        orderFlowBars = shadesBars;
                    } else {
                        globalBinanceOrderFlow.configure((coords as any).symbol || 'BTCUSDT', 60, instrumentStep);
                        orderFlowBars = bars.map((b) => globalBinanceOrderFlow.getOrderFlowBar(b, instrumentStep));
                    }

                    const visible = coords.visibleLogicalRange();
                    const fromIdx = Math.max(0, Math.floor(visible.from));
                    const toIdx = Math.min(bars.length - 1, Math.ceil(visible.to));
                    const barSpacing = coords.bodySpacing();
                    const barWidth = Math.max(2, Math.min(320, barSpacing * 0.94));
                    const density = resolveFootprintDensity(barSpacing);

                    // Delta Summary subchart metrics
                    const deltaSummaryColumns = buildDeltaSummaryColumns(orderFlowBars);
                    const summaryTableHeight = showDeltaSummary ? 95 : 0;
                    const chartMediaHeight = Math.max(10, bounds.height - summaryTableHeight);
                    const plotWidth = coords.width || (canvasEl.width / dpr);
                    const effectiveBounds = { ...bounds, height: chartMediaHeight };
                    const priceConverter = (price: number) => coords.priceToY(price, scale, effectiveBounds);

                    // --- 1. RENDER FOOTPRINT BARS (Clipped above Delta Summary Table) ---
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, plotWidth, chartMediaHeight);
                    ctx.clip();

                    for (let i = fromIdx; i <= toIdx; i++) {
                        const bar = bars[i];
                        let ofBar: OrderFlowBar | undefined;

                        if (dataSource === 'binance_live') {
                            ofBar = orderFlowBars[i];
                        } else if (orderFlowBars.length > 0) {
                            const fixtureIdx = ((i - fromIdx) % orderFlowBars.length + orderFlowBars.length) % orderFlowBars.length;
                            const rawFixture = orderFlowBars[fixtureIdx];
                            if (rawFixture && bar) {
                                const fixtureSpread = Math.max(1, rawFixture.high - rawFixture.low);
                                const barSpread = Math.max(16 * instrumentStep, bar.high - bar.low);
                                const scaleFactor = Math.max(1, barSpread / fixtureSpread);
                                
                                ofBar = {
                                    ...rawFixture,
                                    open: roundToTick(bar.close + (rawFixture.open - rawFixture.close) * scaleFactor, instrumentStep, 2),
                                    high: roundToTick(bar.close + (rawFixture.high - rawFixture.close) * scaleFactor, instrumentStep, 2),
                                    low: roundToTick(bar.close + (rawFixture.low - rawFixture.close) * scaleFactor, instrumentStep, 2),
                                    close: bar.close,
                                    levels: rawFixture.levels.map(l => ({
                                        ...l,
                                        price: roundToTick(bar.close + (l.price - rawFixture.close) * scaleFactor, instrumentStep, 2),
                                    })),
                                };
                            } else {
                                ofBar = rawFixture;
                            }
                        }

                        if (!bar || !ofBar) continue;

                        const x = coords.logicalToX(i);
                        if (x + barWidth < 0 || x - barWidth > plotWidth) continue;

                        const model: FootprintBarModel = buildFootprintBarModel(ofBar, options);
                        if (i === toIdx) {
                            console.log('[FP_RENDER_TRACE]', {
                                i,
                                x,
                                barWidth,
                                ofBarLevels: ofBar.levels.length,
                                modelLevels: model.levels.length,
                                scaleMin: scale.min,
                                scaleMax: scale.max,
                                chartMediaHeight,
                                levelsPrices: model.levels.map(l => l.price),
                                currentYs: model.levels.map(l => priceConverter(l.price)),
                            });
                        }
                        if (!model.levels.length) continue;

                        const layout = resolveFootprintBarLayout(x, barWidth, options);
                        const fontTargetWidth = Math.max(
                            layout.bidArea?.width ?? 0,
                            layout.askArea?.width ?? 0,
                            ...layout.singleCellSegments.map((s) => s.width)
                        );
                        const fontSize = resolveFootprintFontSize(options.style.fontSize, fontTargetWidth);

                        let barTop = Number.POSITIVE_INFINITY;
                        let barBottom = Number.NEGATIVE_INFINITY;

                        // Render cluster levels
                        for (let lIdx = 0; lIdx < model.levels.length; lIdx++) {
                            const level = model.levels[lIdx];
                            const currentY = priceConverter(level.price);
                            if (currentY + 20 < 0 || currentY - 20 > chartMediaHeight) continue;

                            const { top, bottom } = resolveRowBounds(model, level, lIdx, currentY, priceConverter, 14);
                            const height = Math.max(bottom - top, 1);
                            barTop = Math.min(barTop, top);
                            barBottom = Math.max(barBottom, bottom);

                            if (options.ladder.textMode === 'bid-ask' && layout.bidArea && layout.askArea) {
                                // Shading
                                const bidShade = resolveColorScale(options.shading.bidScale, level.volumeRatioToMax);
                                const askShade = resolveColorScale(options.shading.askScale, level.volumeRatioToMax);

                                if (options.ladder.showHeatmap) {
                                    ctx.fillStyle = bidShade;
                                    ctx.fillRect(layout.bidArea.left, top, layout.bidArea.width, height);
                                    ctx.fillStyle = askShade;
                                    ctx.fillRect(layout.askArea.left, top, layout.askArea.width, height);
                                }

                                // Imbalances
                                if (options.ladder.highlightImbalances && level.imbalanceSide !== 'none') {
                                    ctx.save();
                                    if (level.imbalanceSide === 'buy') {
                                        ctx.fillStyle = withAlpha(buyImbalanceColor, 0.22);
                                        ctx.fillRect(layout.askArea.left, top, layout.askArea.width, height);
                                    } else if (level.imbalanceSide === 'sell') {
                                        ctx.fillStyle = withAlpha(sellImbalanceColor, 0.22);
                                        ctx.fillRect(layout.bidArea.left, top, layout.bidArea.width, height);
                                    }
                                    ctx.restore();
                                }

                                // Stacked Imbalances
                                if (options.ladder.highlightStackedImbalances && level.isStackedImbalance) {
                                    ctx.save();
                                    ctx.strokeStyle = level.imbalanceSide === 'buy' ? buyImbalanceColor : sellImbalanceColor;
                                    ctx.lineWidth = 1.2;
                                    ctx.strokeRect(layout.left, top, layout.width, height);
                                    ctx.restore();
                                }

                                // Cell grid separator outline
                                if (options.ladder.cellBorderWidth > 0) {
                                    ctx.strokeStyle = options.style.cellBorderColor || 'rgba(148, 163, 184, 0.18)';
                                    ctx.lineWidth = 0.5;
                                    ctx.strokeRect(layout.bidArea.left, top, layout.bidArea.width, height);
                                    ctx.strokeRect(layout.askArea.left, top, layout.askArea.width, height);
                                }

                                // Point of Control (POC)
                                if (options.pointOfControl.visible && level.isPointOfControl) {
                                    ctx.save();
                                    if (pocStyle === 'filled') {
                                        ctx.fillStyle = withAlpha(pocColor, 0.22);
                                        ctx.fillRect(layout.left, top, layout.width, height);
                                    }
                                    ctx.strokeStyle = pocColor;
                                    ctx.lineWidth = 1.5;
                                    ctx.strokeRect(layout.left, top, layout.width, height);
                                    ctx.restore();
                                }

                                // Text numbers
                                if (density === 'full') {
                                    const centerY = top + height / 2;
                                    const font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
                                    ctx.font = font;

                                    // Bid text
                                    const isSellImb = level.imbalanceSide === 'sell';
                                    const bidTextColor = isSellImb ? sellImbalanceColor : (options.style.bidTextColor || '#f87171');
                                    fillCenteredText(ctx, formatCompactFootprintValue(level.bidVolume, options.style), layout.bidArea.centerX, centerY, bidTextColor);

                                    // Ask text
                                    const isBuyImb = level.imbalanceSide === 'buy';
                                    const askTextColor = isBuyImb ? buyImbalanceColor : (options.style.askTextColor || '#38bdf8');
                                    fillCenteredText(ctx, formatCompactFootprintValue(level.askVolume, options.style), layout.askArea.centerX, centerY, askTextColor);
                                } else if (density === 'compact' && height >= 6) {
                                    const centerY = top + height / 2;
                                    ctx.font = `600 ${Math.max(7, fontSize - 1)}px ui-monospace, monospace`;
                                    fillCenteredText(ctx, formatCompactFootprintValue(level.totalVolume, options.style), layout.singleCellTextCenterX, centerY, options.style.neutralTextColor || '#cbd5e1');
                                }
                            } else {
                                // Single Cell mode (Delta or Volume)
                                const isDelta = options.ladder.textMode === 'delta';
                                const fillRatio = isDelta ? level.absoluteDeltaRatioToMaxAbs : level.volumeRatioToMax;
                                const scaleObj = isDelta ? (level.delta >= 0 ? options.shading.positiveDeltaScale : options.shading.negativeDeltaScale) : options.shading.neutralScale;
                                const fillColor = resolveColorScale(scaleObj, fillRatio);

                                for (const segment of layout.singleCellSegments) {
                                    ctx.fillStyle = fillColor;
                                    ctx.fillRect(segment.left, top, segment.width, height);

                                    if (options.ladder.cellBorderWidth > 0) {
                                        ctx.strokeStyle = options.style.cellBorderColor || 'rgba(148, 163, 184, 0.18)';
                                        ctx.lineWidth = 0.5;
                                        ctx.strokeRect(segment.left, top, segment.width, height);
                                    }
                                }

                                if (options.pointOfControl.visible && level.isPointOfControl) {
                                    ctx.save();
                                    if (pocStyle === 'filled') {
                                        ctx.fillStyle = withAlpha(pocColor, 0.22);
                                        ctx.fillRect(layout.left, top, layout.width, height);
                                    }
                                    ctx.strokeStyle = pocColor;
                                    ctx.lineWidth = 1.5;
                                    ctx.strokeRect(layout.left, top, layout.width, height);
                                    ctx.restore();
                                }

                                if (density !== 'heatmap') {
                                    const centerY = top + height / 2;
                                    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
                                    const val = isDelta ? level.delta : level.totalVolume;
                                    const prefix = isDelta && val > 0 ? '+' : '';
                                    const color = isDelta ? (val >= 0 ? options.style.positiveDeltaColor : options.style.negativeDeltaColor) : (options.style.neutralTextColor || '#e2e8f0');
                                    fillCenteredText(ctx, `${prefix}${formatCompactFootprintValue(val, options.style)}`, layout.singleCellTextCenterX, centerY, color);
                                }
                            }
                        }

                        // Outer Ladder Border
                        if (options.ladder.borderWidth > 0 && Number.isFinite(barTop) && Number.isFinite(barBottom)) {
                            ctx.save();
                            ctx.strokeStyle = options.style.ladderBorderColor || 'rgba(148, 163, 184, 0.38)';
                            ctx.lineWidth = options.ladder.borderWidth;
                            ctx.strokeRect(layout.left, barTop, layout.width, Math.max(barBottom - barTop, 1));
                            ctx.restore();
                        }

                        // Embedded Candlestick
                        if (layout.candle && options.candle.visible) {
                            const openY = priceConverter(model.open);
                            const highY = priceConverter(model.high);
                            const lowY = priceConverter(model.low);
                            const closeY = priceConverter(model.close);

                            if (Number.isFinite(openY) && Number.isFinite(closeY)) {
                                const isBull = model.close >= model.open;
                                const candleColor = isBull ? (options.style.bullishCandleColor || '#22c55e') : (options.style.bearishCandleColor || '#ef4444');
                                const candleCenterX = layout.candle.centerX;

                                ctx.save();
                                // Wicks
                                if (options.candle.showWicks && Number.isFinite(highY) && Number.isFinite(lowY)) {
                                    ctx.strokeStyle = options.style.candleWickColor || candleColor;
                                    ctx.lineWidth = 1;
                                    ctx.beginPath();
                                    ctx.moveTo(candleCenterX, highY);
                                    ctx.lineTo(candleCenterX, lowY);
                                    ctx.stroke();
                                }

                                // Body
                                const bodyTop = Math.min(openY, closeY);
                                const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
                                const bodyWidth = Math.max(Math.floor(layout.candle.width * 0.8), 2);
                                const bodyLeft = candleCenterX - bodyWidth / 2;

                                ctx.fillStyle = candleColor;
                                ctx.fillRect(bodyLeft, bodyTop, bodyWidth, bodyHeight);
                                ctx.strokeStyle = options.style.candleBorderColor || 'rgba(0,0,0,0.4)';
                                ctx.lineWidth = 0.5;
                                ctx.strokeRect(bodyLeft, bodyTop, bodyWidth, bodyHeight);
                                ctx.restore();
                            }
                        }

                        // Summary Badges underneath the low
                        if (showSummaryBadges && Number.isFinite(barBottom) && barWidth >= 24) {
                            const deltaVal = model.delta;
                            const volVal = model.totalVolume;
                            const deltaText = `D ${deltaVal >= 0 ? '+' : ''}${formatCompactFootprintValue(deltaVal, options.style)}`;
                            const volText = `V ${formatCompactFootprintValue(volVal, options.style)}`;
                            const badgeFontSize = Math.max(7, Math.min(10, Math.floor(barWidth * 0.16)));
                            const badgeHeight = badgeFontSize + 4;
                            let badgeY = barBottom + 6;

                            ctx.save();
                            ctx.font = `700 ${badgeFontSize}px ui-monospace, monospace`;

                            // Delta Badge
                            const deltaWidth = Math.min(barWidth, Math.max(34, ctx.measureText(deltaText).width + 8));
                            const deltaLeft = x - deltaWidth / 2;
                            const deltaBg = deltaVal >= 0 ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)';
                            const deltaBorder = deltaVal >= 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';
                            const deltaTextColor = deltaVal >= 0 ? '#4ade80' : '#f87171';

                            ctx.fillStyle = deltaBg;
                            ctx.fillRect(deltaLeft, badgeY, deltaWidth, badgeHeight);
                            ctx.strokeStyle = deltaBorder;
                            ctx.lineWidth = 0.5;
                            ctx.strokeRect(deltaLeft, badgeY, deltaWidth, badgeHeight);
                            fillCenteredText(ctx, deltaText, x, badgeY + badgeHeight / 2, deltaTextColor);

                            // Volume Badge
                            badgeY += badgeHeight + 2;
                            const volWidth = Math.min(barWidth, Math.max(34, ctx.measureText(volText).width + 8));
                            const volLeft = x - volWidth / 2;
                            ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
                            ctx.fillRect(volLeft, badgeY, volWidth, badgeHeight);
                            ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
                            ctx.lineWidth = 0.5;
                            ctx.strokeRect(volLeft, badgeY, volWidth, badgeHeight);
                            fillCenteredText(ctx, volText, x, badgeY + badgeHeight / 2, '#94a3b8');

                            ctx.restore();
                        }
                    }

                    ctx.restore(); // end clip

                    // --- 2. RENDER DELTA SUMMARY SUBCHART TABLE DOCKED AT BOTTOM ---
                    if (showDeltaSummary && deltaSummaryColumns.length > 0) {
                        const tableTop = bounds.height - summaryTableHeight;
                        const rowKeys: { key: DeltaSummaryColumnKey; label: string }[] = [
                            { key: 'delta', label: 'Delta' },
                            { key: 'maxDelta', label: 'Max. Delta' },
                            { key: 'minDelta', label: 'Min. Delta' },
                            { key: 'cumulativeDelta', label: 'Cum. Delta' },
                            { key: 'volume', label: 'Volume' },
                        ];
                        const rowH = Math.floor(summaryTableHeight / rowKeys.length);
                        const labelColWidth = 92;

                        ctx.save();

                        // Table background strip
                        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
                        ctx.fillRect(0, tableTop, plotWidth, summaryTableHeight);
                        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(0, tableTop);
                        ctx.lineTo(plotWidth, tableTop);
                        ctx.stroke();

                        // Find maximum absolute values for row scaling
                        const maxValues: Record<string, number> = {};
                        for (const rk of rowKeys) {
                            maxValues[rk.key] = deltaSummaryColumns.reduce((m, c) => Math.max(m, Math.abs((c as any)[rk.key] || 0)), 1);
                        }

                        // Render row header labels on the left
                        ctx.fillStyle = 'rgba(30, 41, 59, 0.96)';
                        ctx.fillRect(0, tableTop, labelColWidth, summaryTableHeight);
                        ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(0, tableTop, labelColWidth, summaryTableHeight);

                        for (let r = 0; r < rowKeys.length; r++) {
                            const rY = tableTop + r * rowH;
                            ctx.font = '600 10px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = '#94a3b8';
                            ctx.fillText(rowKeys[r].label, 8, rY + rowH / 2);

                            ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
                            ctx.lineWidth = 0.5;
                            ctx.beginPath();
                            ctx.moveTo(0, rY + rowH);
                            ctx.lineTo(plotWidth, rY + rowH);
                            ctx.stroke();
                        }

                        // Render columns aligned with visible bars
                        for (let i = fromIdx; i <= toIdx; i++) {
                            const col = dataSource === 'binance_live'
                                ? deltaSummaryColumns[i]
                                : deltaSummaryColumns[((i - fromIdx) % deltaSummaryColumns.length + deltaSummaryColumns.length) % deltaSummaryColumns.length];
                            if (!col) continue;

                            const x = coords.logicalToX(i);
                            if (x + barWidth < labelColWidth || x - barWidth > plotWidth) continue;

                            const colLeft = x - barWidth / 2;
                            const colW = barWidth;

                            for (let r = 0; r < rowKeys.length; r++) {
                                const rk = rowKeys[r].key;
                                const val = (col as any)[rk] || 0;
                                const rY = tableTop + r * rowH;
                                const maxVal = maxValues[rk] || 1;
                                const ratio = Math.min(1, Math.abs(val) / maxVal);

                                let cellBg = 'transparent';
                                let textColor = '#cbd5e1';

                                if (rk === 'volume') {
                                    cellBg = withAlpha('#2563eb', Math.max(0.12, ratio * 0.5));
                                    textColor = '#dbeafe';
                                } else if (rk === 'maxDelta') {
                                    cellBg = withAlpha('#86efac', Math.max(0.12, ratio * 0.45));
                                    textColor = '#bbf7d0';
                                } else if (rk === 'minDelta') {
                                    cellBg = withAlpha('#fca5a5', Math.max(0.12, ratio * 0.45));
                                    textColor = '#fecaca';
                                } else if (val > 0) {
                                    cellBg = withAlpha('#22c55e', Math.max(0.14, ratio * 0.55));
                                    textColor = '#bbf7d0';
                                } else if (val < 0) {
                                    cellBg = withAlpha('#ef4444', Math.max(0.14, ratio * 0.55));
                                    textColor = '#fecaca';
                                } else {
                                    cellBg = 'rgba(148, 163, 184, 0.08)';
                                    textColor = '#94a3b8';
                                }

                                ctx.fillStyle = cellBg;
                                ctx.fillRect(colLeft, rY, colW, rowH);

                                ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
                                ctx.lineWidth = 0.5;
                                ctx.strokeRect(colLeft, rY, colW, rowH);

                                // Cell text value
                                if (colW >= 24) {
                                    const fontSize = Math.max(7, Math.min(9, Math.floor(colW * 0.22)));
                                    ctx.font = `600 ${fontSize}px ui-monospace, monospace`;
                                    const prefix = val > 0 && rk !== 'volume' ? '+' : '';
                                    const displayVal = `${prefix}${formatCompactNumericValue(val, {
                                        integerDigits: 3,
                                        decimalDigits: 1,
                                        rounding: 'round',
                                        suffixVisible: true,
                                    })}`;
                                    fillCenteredText(ctx, displayVal, colLeft + colW / 2, rY + rowH / 2, textColor);
                                }
                            }
                        }

                        ctx.restore();
                    }
                },
                destroy() {
                    ctx = null;
                    canvasEl = null;
                },
            };
        },
    });
}
