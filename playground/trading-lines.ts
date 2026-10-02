import { registerRendererLayer } from '../src/plugin';
import { state } from './trade-suite';

/**
 * Registers "trading-lines" as an official native renderer layer in Vela.
 * Paints live visual horizontal lines for:
 *  1. Open Position Entry Price with real-time PnL badge
 *  2. Take Profit (TP) target level
 *  3. Stop Loss (SL) risk level
 *  4. Pending Limit / Stop orders
 */
export function registerTradingLinesLayer() {
    registerRendererLayer({
        id: 'trading-lines',
        placement: 'above-data',
        repaintOnCursor: true,
        create: () => {
            let ctx: CanvasRenderingContext2D | null = null;
            let canvasEl: HTMLCanvasElement | null = null;

            return {
                mount(canvas: HTMLCanvasElement) {
                    canvasEl = canvas;
                    ctx = canvas.getContext('2d');
                },
                animating: () => true,
                render({ coords, scale, bounds }) {
                    if (!ctx || !canvasEl) return;

                    const dpr = coords.dpr || 1;
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

                    const startX = 0;
                    const endX = coords.width;

                    // Match positions for this chart's price scale
                    for (const pos of state.activePositions) {
                        if (!pos || pos.entryPrice <= 0) continue;
                        // Check if position entry is within this pane's visible price scale
                        if (pos.entryPrice < scale.min || pos.entryPrice > scale.max) continue;

                        const isLong = pos.side === 'LONG';
                        const entryY = Math.round(coords.priceToY(pos.entryPrice, scale, bounds)) + 0.5;

                        // ── 1. Render Active Position Entry Line ───────────────────────
                        ctx.strokeStyle = isLong ? '#26a69a' : '#ef5350';
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([]);
                        ctx.beginPath();
                        ctx.moveTo(startX, entryY);
                        ctx.lineTo(endX, entryY);
                        ctx.stroke();

                        // Right-aligned on-chart badge
                        const pnlVal = pos.pnl || 0;
                        const pnlSign = pnlVal >= 0 ? '+' : '';
                        const badgeText = `${pos.side} ${pos.size} @ ${pos.entryPrice.toFixed(2)}  |  PnL: ${pnlSign}${pnlVal.toFixed(2)} USDT`;

                        ctx.font = `bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
                        const textW = ctx.measureText(badgeText).width;
                        const badgeW = textW + 18;
                        const badgeH = 22;
                        const badgeX = endX - badgeW - 10;
                        const badgeY = entryY - badgeH / 2;

                        ctx.fillStyle = isLong ? 'rgba(14, 58, 53, 0.95)' : 'rgba(69, 27, 30, 0.95)';
                        ctx.strokeStyle = isLong ? '#26a69a' : '#ef5350';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
                        ctx.fill();
                        ctx.stroke();

                        ctx.fillStyle = isLong ? '#26a69a' : '#ef5350';
                        ctx.textAlign = 'left';
                        ctx.fillText(badgeText, badgeX + 8, badgeY + 15);
                    }

                    // ── 2. Render Take Profit (TP) Level ──────────────────────────
                    const tpPrice = parseFloat(state.takeProfit || '0');
                    if (tpPrice >= scale.min && tpPrice <= scale.max) {
                        const tpY = Math.round(coords.priceToY(tpPrice, scale, bounds)) + 0.5;
                        ctx.strokeStyle = '#26a69a';
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([6, 4]);
                        ctx.beginPath();
                        ctx.moveTo(startX, tpY);
                        ctx.lineTo(endX, tpY);
                        ctx.stroke();

                        const label = `TP: ${tpPrice.toFixed(2)}`;
                        ctx.font = `bold 10px -apple-system, system-ui, sans-serif`;
                        const textW = ctx.measureText(label).width;
                        const badgeW = textW + 14;
                        const badgeH = 18;
                        const badgeX = endX - badgeW - 10;
                        const badgeY = tpY - badgeH / 2;

                        ctx.fillStyle = 'rgba(14, 58, 53, 0.92)';
                        ctx.strokeStyle = '#26a69a';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
                        ctx.fill();
                        ctx.stroke();

                        ctx.fillStyle = '#26a69a';
                        ctx.textAlign = 'left';
                        ctx.fillText(label, badgeX + 7, badgeY + 13);
                    }

                    // ── 3. Render Stop Loss (SL) Level ────────────────────────────
                    const slPrice = parseFloat(state.stopLoss || '0');
                    if (slPrice >= scale.min && slPrice <= scale.max) {
                        const slY = Math.round(coords.priceToY(slPrice, scale, bounds)) + 0.5;
                        ctx.strokeStyle = '#ef5350';
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([6, 4]);
                        ctx.beginPath();
                        ctx.moveTo(startX, slY);
                        ctx.lineTo(endX, slY);
                        ctx.stroke();

                        const label = `SL: ${slPrice.toFixed(2)}`;
                        ctx.font = `bold 10px -apple-system, system-ui, sans-serif`;
                        const textW = ctx.measureText(label).width;
                        const badgeW = textW + 14;
                        const badgeH = 18;
                        const badgeX = endX - badgeW - 10;
                        const badgeY = slY - badgeH / 2;

                        ctx.fillStyle = 'rgba(69, 27, 30, 0.92)';
                        ctx.strokeStyle = '#ef5350';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
                        ctx.fill();
                        ctx.stroke();

                        ctx.fillStyle = '#ef5350';
                        ctx.textAlign = 'left';
                        ctx.fillText(label, badgeX + 7, badgeY + 13);
                    }

                    // ── 4. Render Open Orders ─────────────────────────────────────
                    for (const ord of state.openOrders) {
                        const price = parseFloat(ord.price || ord.stopPrice || '0');
                        if (price < scale.min || price > scale.max) continue;

                        const ordY = Math.round(coords.priceToY(price, scale, bounds)) + 0.5;
                        ctx.strokeStyle = '#f0b90b';
                        ctx.lineWidth = 1.2;
                        ctx.setLineDash([4, 4]);
                        ctx.beginPath();
                        ctx.moveTo(startX, ordY);
                        ctx.lineTo(endX, ordY);
                        ctx.stroke();

                        const label = `LIMIT ${ord.side} ${parseFloat(ord.origQty || '0')} @ ${price.toFixed(2)}`;
                        ctx.font = `600 10px -apple-system, system-ui, sans-serif`;
                        const textW = ctx.measureText(label).width;
                        const badgeW = textW + 12;
                        const badgeH = 18;
                        const badgeX = endX - badgeW - 10;
                        const badgeY = ordY - badgeH / 2;

                        ctx.fillStyle = 'rgba(42, 38, 20, 0.95)';
                        ctx.strokeStyle = '#f0b90b';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
                        ctx.fill();
                        ctx.stroke();

                        ctx.fillStyle = '#f0b90b';
                        ctx.textAlign = 'left';
                        ctx.fillText(label, badgeX + 6, badgeY + 13);
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
