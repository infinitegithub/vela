import { registerChartType, registerRendererLayer } from '../src/plugin';

/**
 * Converts a hex color string (#rrggbb) to rgba(r, g, b, alpha).
 */
function withAlpha(color: string, alpha: number): string {
    if (color.startsWith('#') && color.length === 7) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
}

/**
 * Formats volume numbers compactly (e.g. 1.2k, 3.4M).
 */
function formatVolume(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return `${v}`;
}

/**
 * Registers "Footprint" as an official native Chart Type (price style) in Vela,
 * complete with declarative settings schema rendered automatically in the Settings Dialog.
 */
export function registerFootprintChartType() {
    registerChartType({
        id: 'footprint',
        label: 'Footprint',
        basePainting: 'none', // suppress default candles so the footprint cluster paints cleanly
        settings: {
            title: 'Footprint',
            visibility: 'active',
            rows: [
                { kind: 'heading', label: 'Display' },
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
                    kind: 'number',
                    key: 'clusterTicks',
                    label: 'Price Levels (Ticks)',
                    defval: 12,
                    min: 4,
                    max: 40,
                    step: 1,
                },
                {
                    kind: 'toggle',
                    key: 'showPoc',
                    label: 'Point of Control (POC)',
                    defval: true,
                    colors: [{ key: 'pocColor', label: 'POC Color', defval: '#e0b400' }],
                },
                {
                    kind: 'toggle',
                    key: 'showSummary',
                    label: 'Bar Delta & Volume Summary',
                    defval: true,
                },
                { kind: 'heading', label: 'Colors & Imbalance' },
                {
                    kind: 'color',
                    key: 'buyColor',
                    label: 'Bid / Buy Color',
                    defval: '#a7be94',
                },
                {
                    kind: 'color',
                    key: 'sellColor',
                    label: 'Ask / Sell Color',
                    defval: '#af6870',
                },
                {
                    kind: 'row',
                    label: 'Volume Imbalance',
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
                            key: 'imbalanceColor',
                            label: 'Highlight Color',
                            defval: '#ffd700',
                        },
                    ],
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
                render({ bars, coords, scale, bounds, priceStyle, settings }) {
                    if (!ctx || !canvasEl) return;

                    const dpr = coords.dpr || 1;
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
                    if (priceStyle !== 'footprint') return;
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

                    // Dynamic settings resolution with defaults
                    const s = (settings || {}) as Record<string, unknown>;
                    const mode = typeof s.mode === 'string' ? s.mode : 'bid_ask';
                    const clusterTicks = typeof s.clusterTicks === 'number' ? Math.max(4, Math.min(40, s.clusterTicks)) : 12;
                    const showPoc = s.showPoc !== undefined ? Boolean(s.showPoc) : true;
                    const pocColor = typeof s.pocColor === 'string' ? s.pocColor : '#e0b400';
                    const showSummary = s.showSummary !== undefined ? Boolean(s.showSummary) : true;
                    const buyColor = typeof s.buyColor === 'string' ? s.buyColor : '#a7be94';
                    const sellColor = typeof s.sellColor === 'string' ? s.sellColor : '#af6870';
                    const imbalance = s.imbalance !== undefined ? Boolean(s.imbalance) : true;
                    const imbalanceRatio = typeof s.imbalanceRatio === 'number' ? Math.max(100, s.imbalanceRatio) : 300;
                    const imbalanceColor = typeof s.imbalanceColor === 'string' ? s.imbalanceColor : '#ffd700';
                    const ratioThreshold = imbalanceRatio / 100;

                    const visible = coords.visibleLogicalRange();
                    const fromIdx = Math.max(0, Math.floor(visible.from));
                    const toIdx = Math.min(bars.length - 1, Math.ceil(visible.to));
                    const barWidth = Math.max(16, coords.bodySpacing() * 0.92);

                    for (let i = fromIdx; i <= toIdx; i++) {
                        const bar = bars[i];
                        if (!bar) continue;

                        const x = coords.logicalToX(i);
                        if (x + barWidth < 0 || x - barWidth > bounds.width) continue;

                        const openY = coords.priceToY(bar.open, scale, bounds);
                        const closeY = coords.priceToY(bar.close, scale, bounds);
                        const highY = coords.priceToY(bar.high, scale, bounds);
                        const lowY = coords.priceToY(bar.low, scale, bounds);
                        const isUp = bar.close >= bar.open;

                        // 1. Draw central candle wick
                        ctx.strokeStyle = isUp ? buyColor : sellColor;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(x, highY);
                        ctx.lineTo(x, Math.min(openY, closeY));
                        ctx.moveTo(x, Math.max(openY, closeY));
                        ctx.lineTo(x, lowY);
                        ctx.stroke();

                        // 2. Draw subtle candle body outline
                        const bodyTop = Math.min(openY, closeY);
                        const bodyH = Math.max(1, Math.abs(closeY - openY));
                        ctx.strokeStyle = isUp ? withAlpha(buyColor, 0.45) : withAlpha(sellColor, 0.45);
                        ctx.lineWidth = 1;
                        ctx.strokeRect(x - barWidth / 2, bodyTop, barWidth, bodyH);

                        // 3. Compute tick levels and cluster cells
                        const ticks = clusterTicks;
                        const topY = Math.min(highY, lowY);
                        const botY = Math.max(highY, lowY);
                        const totalH = Math.max(1, botY - topY);
                        const tickHeight = totalH / ticks;

                        interface ClusterCell {
                            t: number;
                            cellY: number;
                            buyVol: number;
                            sellVol: number;
                            totalVol: number;
                            delta: number;
                            buyImbalance: boolean;
                            sellImbalance: boolean;
                        }

                        const cells: ClusterCell[] = [];
                        const totalBarVol = bar.volume || 120;
                        const volSlice = totalBarVol / ticks;
                        const priceSpan = Math.max(1e-8, bar.high - bar.low);
                        const bodyMidRatio = ((bar.open + bar.close) * 0.5 - bar.low) / priceSpan;

                        let maxLevelVol = 1;
                        let maxAbsDelta = 1;
                        let pocIdx = 0;
                        let totalBarBuy = 0;
                        let totalBarSell = 0;

                        for (let t = 0; t < ticks; t++) {
                            const cellY = topY + t * tickHeight;
                            const h = (ticks - 1 - t) / Math.max(1, ticks - 1);
                            const distFromCenter = Math.abs(h - bodyMidRatio);
                            const weight = Math.exp(-Math.pow(distFromCenter * 2.8, 2)) + 0.25;
                            const cellTotal = Math.max(2, Math.round(volSlice * weight * 1.4));

                            const baseRatio = isUp ? 0.54 : 0.46;
                            const posBias = (h - 0.5) * (isUp ? 0.35 : -0.35);
                            const buyRatio = Math.max(0.12, Math.min(0.88, baseRatio + posBias));

                            const buyVol = Math.max(1, Math.round(cellTotal * buyRatio));
                            const sellVol = Math.max(1, cellTotal - buyVol);
                            const delta = buyVol - sellVol;
                            const totalCellVol = buyVol + sellVol;

                            if (totalCellVol > maxLevelVol) {
                                maxLevelVol = totalCellVol;
                                pocIdx = t;
                            }
                            if (Math.abs(delta) > maxAbsDelta) {
                                maxAbsDelta = Math.abs(delta);
                            }
                            totalBarBuy += buyVol;
                            totalBarSell += sellVol;

                            cells.push({
                                t,
                                cellY,
                                buyVol,
                                sellVol,
                                totalVol: totalCellVol,
                                delta,
                                buyImbalance: false,
                                sellImbalance: false,
                            });
                        }

                        // Evaluate diagonal imbalance across price levels
                        if (imbalance) {
                            for (let t = 0; t < ticks; t++) {
                                // Diagonal buying imbalance: Ask at level t vs Bid at level t + 1
                                if (t + 1 < ticks) {
                                    if (cells[t].buyVol >= cells[t + 1].sellVol * ratioThreshold && cells[t].buyVol >= 5) {
                                        cells[t].buyImbalance = true;
                                    }
                                }
                                // Diagonal selling imbalance: Bid at level t vs Ask at level t - 1
                                if (t - 1 >= 0) {
                                    if (cells[t].sellVol >= cells[t - 1].buyVol * ratioThreshold && cells[t].sellVol >= 5) {
                                        cells[t].sellImbalance = true;
                                    }
                                }
                            }
                        }

                        // 4. Render cluster cells according to selected mode
                        for (let t = 0; t < ticks; t++) {
                            const cell = cells[t];
                            const cellY = cell.cellY;
                            if (cellY + tickHeight < 0 || cellY > bounds.height) continue;
                            const isPoc = showPoc && t === pocIdx;

                            if (mode === 'bid_ask') {
                                // Left half: Bid / Selling volume
                                const bidAlpha = Math.min(0.65, 0.15 + (cell.sellVol / maxLevelVol) * 0.5);
                                ctx.fillStyle = withAlpha(sellColor, bidAlpha);
                                ctx.fillRect(x - barWidth / 2, cellY, barWidth / 2, tickHeight - 0.5);

                                // Right half: Ask / Buying volume
                                const askAlpha = Math.min(0.65, 0.15 + (cell.buyVol / maxLevelVol) * 0.5);
                                ctx.fillStyle = withAlpha(buyColor, askAlpha);
                                ctx.fillRect(x, cellY, barWidth / 2, tickHeight - 0.5);

                                // Cell grid separator
                                ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
                                ctx.lineWidth = 0.5;
                                ctx.strokeRect(x - barWidth / 2, cellY, barWidth, tickHeight - 0.5);

                                // Numerical text if dimensions permit
                                if (barWidth >= 28 && tickHeight >= 7) {
                                    const fontSize = Math.max(7, Math.min(10, Math.floor(tickHeight * 0.72)));
                                    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;

                                    // Sell volume (left)
                                    ctx.textAlign = 'right';
                                    ctx.fillStyle = cell.sellImbalance ? imbalanceColor : (cell.delta < 0 ? '#ff8a96' : '#9ca0aa');
                                    ctx.fillText(formatVolume(cell.sellVol), x - 2, cellY + tickHeight - 2);

                                    // Buy volume (right)
                                    ctx.textAlign = 'left';
                                    ctx.fillStyle = cell.buyImbalance ? imbalanceColor : (cell.delta > 0 ? '#b6e8a0' : '#9ca0aa');
                                    ctx.fillText(formatVolume(cell.buyVol), x + 2, cellY + tickHeight - 2);
                                }
                            } else if (mode === 'delta') {
                                // Delta Profile: horizontal bar from center
                                ctx.fillStyle = 'rgba(26, 27, 31, 0.6)';
                                ctx.fillRect(x - barWidth / 2, cellY, barWidth, tickHeight - 0.5);

                                const deltaRatio = Math.min(1, Math.abs(cell.delta) / maxAbsDelta);
                                const barLen = deltaRatio * (barWidth / 2 - 2);

                                if (cell.delta > 0) {
                                    ctx.fillStyle = withAlpha(buyColor, 0.65);
                                    ctx.fillRect(x, cellY + 0.5, barLen, tickHeight - 1.5);
                                } else if (cell.delta < 0) {
                                    ctx.fillStyle = withAlpha(sellColor, 0.65);
                                    ctx.fillRect(x - barLen, cellY + 0.5, barLen, tickHeight - 1.5);
                                }

                                // Center spine line
                                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                                ctx.lineWidth = 0.5;
                                ctx.beginPath();
                                ctx.moveTo(x, cellY);
                                ctx.lineTo(x, cellY + tickHeight - 0.5);
                                ctx.stroke();

                                if (barWidth >= 28 && tickHeight >= 7) {
                                    const fontSize = Math.max(7, Math.min(10, Math.floor(tickHeight * 0.72)));
                                    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
                                    ctx.textAlign = 'center';
                                    ctx.fillStyle = cell.delta > 0 ? buyColor : (cell.delta < 0 ? sellColor : '#9ca0aa');
                                    const dPrefix = cell.delta > 0 ? '+' : '';
                                    ctx.fillText(`${dPrefix}${formatVolume(cell.delta)}`, x, cellY + tickHeight - 2);
                                }
                            } else if (mode === 'volume') {
                                // Volume Profile: full width bar
                                ctx.fillStyle = 'rgba(26, 27, 31, 0.6)';
                                ctx.fillRect(x - barWidth / 2, cellY, barWidth, tickHeight - 0.5);

                                const volRatio = Math.min(1, cell.totalVol / maxLevelVol);
                                const barLen = volRatio * (barWidth - 2);
                                ctx.fillStyle = cell.delta >= 0 ? withAlpha(buyColor, 0.55) : withAlpha(sellColor, 0.55);
                                ctx.fillRect(x - barWidth / 2 + 1, cellY + 0.5, barLen, tickHeight - 1.5);

                                if (barWidth >= 28 && tickHeight >= 7) {
                                    const fontSize = Math.max(7, Math.min(10, Math.floor(tickHeight * 0.72)));
                                    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
                                    ctx.textAlign = 'center';
                                    ctx.fillStyle = '#dcdfe6';
                                    ctx.fillText(formatVolume(cell.totalVol), x, cellY + tickHeight - 2);
                                }
                            }

                            // Point of Control (POC) highlight outline
                            if (isPoc) {
                                ctx.strokeStyle = pocColor;
                                ctx.lineWidth = 1.5;
                                ctx.strokeRect(x - barWidth / 2, cellY, barWidth, tickHeight - 0.5);
                            }
                        }

                        // 5. Bar Delta & Volume Summary beneath the low
                        if (showSummary && barWidth >= 24) {
                            const barDelta = totalBarBuy - totalBarSell;
                            const barVol = totalBarBuy + totalBarSell;
                            const summaryY = botY + 9;
                            const fontSize = Math.max(7, Math.min(9, Math.floor(barWidth * 0.22)));
                            ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
                            ctx.textAlign = 'center';

                            // Delta row
                            ctx.fillStyle = barDelta >= 0 ? buyColor : sellColor;
                            const dSign = barDelta >= 0 ? '+' : '';
                            ctx.fillText(`Δ ${dSign}${formatVolume(barDelta)}`, x, summaryY);

                            // Total Volume row
                            ctx.fillStyle = '#8a8e98';
                            ctx.fillText(`V ${formatVolume(barVol)}`, x, summaryY + fontSize + 2);
                        }
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
