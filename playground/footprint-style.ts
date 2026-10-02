import { registerChartType, registerRendererLayer } from '../src/plugin';

/**
 * Registers "Footprint" as an official native Chart Type (price style) in Vela.
 * Once registered, "Footprint" appears automatically in the topbar style picker dropdown
 * below the separator (under Candles, Bars, Line, Heikin Ashi).
 */
export function registerFootprintChartType() {
    registerChartType({
        id: 'footprint',
        label: 'Footprint',
        basePainting: 'none', // suppress default candles so the footprint cluster paints cleanly
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
                render({ bars, coords, scale, bounds, priceStyle }) {
                    if (!ctx || !canvasEl) return;

                    const dpr = coords.dpr || 1;
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
                    if (priceStyle !== 'footprint') return;
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

                    const visible = coords.visibleLogicalRange();
                    const fromIdx = Math.max(0, Math.floor(visible.from));
                    const toIdx = Math.min(bars.length - 1, Math.ceil(visible.to));
                    const barWidth = Math.max(16, coords.bodySpacing() * 0.92);

                    for (let i = fromIdx; i <= toIdx; i++) {
                        const bar = bars[i];
                        if (!bar) continue;

                        const x = coords.logicalToX(i);
                        const openY = coords.priceToY(bar.open, scale, bounds);
                        const closeY = coords.priceToY(bar.close, scale, bounds);
                        const highY = coords.priceToY(bar.high, scale, bounds);
                        const lowY = coords.priceToY(bar.low, scale, bounds);

                        const isUp = bar.close >= bar.open;

                        // 1. Draw candle central wick
                        ctx.strokeStyle = isUp ? '#089981' : '#f23645';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(x, highY);
                        ctx.lineTo(x, Math.min(openY, closeY));
                        ctx.moveTo(x, Math.max(openY, closeY));
                        ctx.lineTo(x, lowY);
                        ctx.stroke();

                        // 2. Draw footprint cluster cells (Bid x Ask volume profile per tick)
                        const ticks = Math.max(4, Math.min(16, Math.round((bar.high - bar.low) / (bar.close * 0.0004 || 1))));
                        const topY = Math.min(highY, lowY);
                        const botY = Math.max(highY, lowY);
                        const totalH = Math.max(1, botY - topY);
                        const tickHeight = totalH / ticks;

                        // Candle body outline
                        const bodyTop = Math.min(openY, closeY);
                        const bodyH = Math.max(1, Math.abs(closeY - openY));
                        ctx.strokeStyle = isUp ? 'rgba(8,153,129,0.7)' : 'rgba(242,54,69,0.7)';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(x - barWidth / 2, bodyTop, barWidth, bodyH);

                        // Footprint cells
                        for (let t = 0; t < ticks; t++) {
                            const cellY = topY + t * tickHeight;
                            if (cellY + tickHeight > bounds.height || cellY < 0) continue;

                            const tickRatio = (t + 1) / ticks;
                            const volSlice = (bar.volume || 120) / ticks;
                            const buyVol = Math.round(isUp ? volSlice * (0.52 + 0.35 * tickRatio) : volSlice * (0.32 + 0.2 * tickRatio));
                            const sellVol = Math.round(Math.max(1, volSlice - buyVol));
                            const delta = buyVol - sellVol;

                            // Left side: Bid / Selling volume
                            ctx.fillStyle = delta < 0 ? 'rgba(242,54,69,0.35)' : 'rgba(30,34,45,0.7)';
                            ctx.fillRect(x - barWidth / 2, cellY, barWidth / 2, tickHeight - 0.5);

                            // Right side: Ask / Buying volume
                            ctx.fillStyle = delta > 0 ? 'rgba(8,153,129,0.35)' : 'rgba(30,34,45,0.7)';
                            ctx.fillRect(x, cellY, barWidth / 2, tickHeight - 0.5);

                            // Cell inner border
                            ctx.strokeStyle = 'rgba(42,46,57,0.4)';
                            ctx.strokeRect(x - barWidth / 2, cellY, barWidth, tickHeight - 0.5);

                            // Render numerical text if bar width and tick height allow
                            if (barWidth >= 30 && tickHeight >= 8) {
                                const fontSize = Math.max(7, Math.min(9, Math.floor(tickHeight * 0.75)));
                                ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;

                                // Sell volume (left)
                                ctx.textAlign = 'right';
                                ctx.fillStyle = delta < 0 ? '#ef5350' : '#868a96';
                                const sText = sellVol > 999 ? `${(sellVol / 1000).toFixed(1)}k` : `${sellVol}`;
                                ctx.fillText(sText, x - 2, cellY + tickHeight - 2);

                                // Buy volume (right)
                                ctx.textAlign = 'left';
                                ctx.fillStyle = delta > 0 ? '#26a69a' : '#868a96';
                                const bText = buyVol > 999 ? `${(buyVol / 1000).toFixed(1)}k` : `${buyVol}`;
                                ctx.fillText(bText, x + 2, cellY + tickHeight - 2);
                            }
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
