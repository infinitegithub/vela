import { registerRendererLayer } from '../src/plugin';
import type { RendererLayerArgs } from '../src/renderers/native/layers';
import { state, fetchAccount, fetchOrders, getWorkspaceInstance, closePosition, isSymbolInCloseCooldown } from './trade-suite';

function ensureStyles() {
    if (typeof document === 'undefined' || document.getElementById('vela-trading-lines-styles')) return;
    const style = document.createElement('style');
    style.id = 'vela-trading-lines-styles';
    style.textContent = `
        .vela-tl-overlay {
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 40;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            user-select: none;
        }
        .vela-tl-badge {
            position: absolute;
            right: calc(var(--vela-scale-gutter, 65px) + 8px);
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 2.5px 7px;
            border-radius: 4px;
            font-size: 10.5px;
            font-weight: 500;
            letter-spacing: 0.1px;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            pointer-events: auto;
            transform: translateY(-50%);
            transition: border-color 0.15s ease, background-color 0.15s ease;
        }
        .vela-tl-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 1.5px 5px;
            border-radius: 3px;
            font-size: 9.5px;
            font-weight: 700;
            border: 1px solid transparent;
            user-select: none;
            transition: all 0.15s ease;
        }
        .vela-tl-btn-tp {
            background: rgba(167, 190, 148, 0.18);
            color: #a7be94;
            border-color: rgba(167, 190, 148, 0.45);
            cursor: ns-resize;
        }
        .vela-tl-btn-tp:hover {
            background: rgba(167, 190, 148, 0.38);
            border-color: #a7be94;
            color: #fff;
        }
        .vela-tl-btn-sl {
            background: rgba(175, 104, 112, 0.18);
            color: #af6870;
            border-color: rgba(175, 104, 112, 0.45);
            cursor: ns-resize;
        }
        .vela-tl-btn-sl:hover {
            background: rgba(175, 104, 112, 0.38);
            border-color: #af6870;
            color: #fff;
        }
        .vela-tl-btn-drag {
            background: rgba(255, 255, 255, 0.08);
            color: #cbd5e1;
            border-color: rgba(255, 255, 255, 0.18);
            cursor: ns-resize;
            padding: 1.5px 4px;
        }
        .vela-tl-btn-drag:hover {
            background: rgba(255, 255, 255, 0.22);
            color: #fff;
        }
        .vela-tl-btn-cancel {
            background: rgba(255, 255, 255, 0.06);
            color: #94a3b8;
            border-color: transparent;
            padding: 1.5px 4.5px;
            cursor: pointer;
        }
        .vela-tl-btn-cancel:hover {
            background: rgba(175, 104, 112, 0.35);
            color: #af6870;
        }
        .vela-tl-ghost {
            position: absolute;
            right: calc(var(--vela-scale-gutter, 65px) + 8px);
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 10.5px;
            font-weight: 600;
            white-space: nowrap;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            pointer-events: none;
            transform: translateY(-50%);
            z-index: 50;
        }
    `;
    document.head.appendChild(style);
}

function showToast(msg: string, type: 'info' | 'success' | 'error' = 'info') {
    if (typeof document === 'undefined') return;
    let container = document.getElementById('vela-trade-toasts');
    if (!container) {
        container = document.createElement('div');
        container.id = 'vela-trade-toasts';
        container.style.cssText = 'position:fixed;bottom:36px;right:18px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const color = type === 'success' ? '#a7be94' : type === 'error' ? '#af6870' : '#e5b97c';
    toast.style.cssText = `background:rgba(20,24,28,0.85);backdrop-filter:blur(8px);border:1px solid ${color};color:#f1f5f9;padding:6px 11px;border-radius:4px;font-size:11px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:flex;align-items:center;gap:6px;pointer-events:auto;transition:opacity 0.25s ease;font-family:-apple-system,BlinkMacSystemFont,sans-serif;`;
    toast.innerHTML = `<span style="color:${color}">●</span> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 250);
    }, 3200);
}

function getPriceConstraints(price: number) {
    if (price >= 10000) return { tickSize: 0.1, precision: 1 };
    if (price >= 1000) return { tickSize: 0.05, precision: 2 };
    if (price >= 10) return { tickSize: 0.01, precision: 2 };
    if (price >= 1) return { tickSize: 0.001, precision: 3 };
    return { tickSize: 0.0001, precision: 4 };
}

export function getOrderPrice(ord: any): number {
    if (!ord) return 0;
    const stop = parseFloat(ord.stopPrice || ord.triggerPrice || '0');
    if (stop > 0) return stop;
    const p = parseFloat(ord.price || '0');
    if (p > 0) return p;
    return 0;
}

function getBracketKey(symbol: string): string {
    const env = state.isTestnet ? 'testnet' : 'prod';
    return `${env}_${symbol}`;
}

// Persistent local bracket store per symbol to keep lines alive across frames and tab switches
const localBrackets = new Map<string, { tpPrice?: number; slPrice?: number }>();

export function clearAllLocalBrackets(sym?: string) {
    if (sym) {
        const clean = sym.replace(/.*:/, '').replace(/\.P$/i, '').replace(/[-_]/g, '').toUpperCase();
        localBrackets.delete(`testnet_${clean}`);
        localBrackets.delete(`prod_${clean}`);
    } else {
        localBrackets.clear();
    }
}

interface DragState {
    active: boolean;
    isDragging: boolean;
    type: 'TP' | 'SL';
    position: any;
    isPlanning: boolean;
    startY: number;
    currentY: number;
    currentPrice: number;
    oldOrderId?: number | string;
    oldPrice?: number;
    isValid: boolean;
    symbol: string;
    pointerId?: number;
}

/**
 * Registers "trading-lines" as an official native renderer layer in Vela.
 * Provides interactive TradingView-style draggable Stop Loss (SL) and Take Profit (TP)
 * directly on the chart canvas with real-time projected PnL calculations.
 */
export function registerTradingLinesLayer() {
    registerRendererLayer({
        id: 'trading-lines',
        placement: 'above-data',
        repaintOnCursor: true,
        create: () => {
            let ctx: CanvasRenderingContext2D | null = null;
            let canvasEl: HTMLCanvasElement | null = null;
            let overlayEl: HTMLDivElement | null = null;
            let lastArgs: RendererLayerArgs | null = null;
            let lastRenderedHtml = '';

            let dragState: DragState = {
                active: false,
                isDragging: false,
                type: 'TP',
                position: null,
                isPlanning: false,
                startY: 0,
                currentY: 0,
                currentPrice: 0,
                isValid: true,
                symbol: 'BTCUSDT'
            };

            function getCellSymbol(): string {
                if (!canvasEl) return state.symbol || 'BTCUSDT';
                const cellEl = canvasEl.closest('.vela-cell');
                const cellId = cellEl?.getAttribute('data-cell-id');
                const ws = getWorkspaceInstance();
                const cell = cellId && ws ? (ws.cell ? ws.cell(cellId) : (ws as any).cellsById?.get(cellId)) : null;
                const raw = cell?.symbol || state.symbol || 'BTCUSDT';
                return raw.replace(/.*:/, '').replace(/\.P$/i, '').replace(/[-_]/g, '').toUpperCase();
            }

            function paintCanvas(args: RendererLayerArgs) {
                if (!ctx || !canvasEl) return;
                const { coords, scale, bounds } = args;

                const dpr = coords.dpr || 1;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

                const startX = 0;
                const endX = coords.width;
                const cleanSymbol = getCellSymbol();
                const isClosed = isSymbolInCloseCooldown(cleanSymbol);

                // 1. Position Line
                const pos = !isClosed ? state.activePositions?.find((p: any) => p && p.symbol === cleanSymbol) : null;
                if (pos && pos.entryPrice > 0 && pos.entryPrice >= scale.min && pos.entryPrice <= scale.max) {
                    const isLong = pos.side === 'LONG';
                    const entryY = Math.round(coords.priceToY(pos.entryPrice, scale, bounds)) + 0.5;

                    ctx.strokeStyle = isLong ? '#a7be94' : '#af6870';
                    ctx.lineWidth = 1.4;
                    ctx.setLineDash([]);
                    ctx.beginPath();
                    ctx.moveTo(startX, entryY);
                    ctx.lineTo(endX, entryY);
                    ctx.stroke();
                }

                // 2. Open Orders from Binance
                const orders = !isClosed ? (state.openOrders || []).filter((o: any) => o && o.symbol === cleanSymbol) : [];
                let renderedTp = false;
                let renderedSl = false;

                for (const ord of orders) {
                    const price = getOrderPrice(ord);
                    if (price <= 0 || price < scale.min || price > scale.max) continue;

                    const isTp = ord.type === 'TAKE_PROFIT_MARKET' || ord.type === 'TAKE_PROFIT' || ord.type === 'TAKE_PROFIT_LIMIT';
                    const isSl = ord.type === 'STOP_MARKET' || ord.type === 'STOP_LOSS' || ord.type === 'STOP' || ord.type === 'STOP_LOSS_LIMIT' || ord.type === 'TRAILING_STOP_MARKET';
                    const isBracket = isTp || isSl || ord.closePosition === true || ord.closePosition === 'true';

                    // Brackets (TP/SL) only belong to an active position. If position is closed, do NOT draw orphan brackets!
                    if (isBracket && (!pos || pos.entryPrice <= 0)) {
                        continue;
                    }

                    const ordY = Math.round(coords.priceToY(price, scale, bounds)) + 0.5;

                    if (isTp) {
                        renderedTp = true;
                        ctx.strokeStyle = '#a7be94';
                        ctx.lineWidth = 1.3;
                        ctx.setLineDash([]);
                    } else if (isSl) {
                        renderedSl = true;
                        ctx.strokeStyle = '#af6870';
                        ctx.lineWidth = 1.3;
                        ctx.setLineDash([]);
                    } else {
                        ctx.strokeStyle = '#fde047';
                        ctx.lineWidth = 1.2;
                        ctx.setLineDash([]);
                    }

                    ctx.beginPath();
                    ctx.moveTo(startX, ordY);
                    ctx.lineTo(endX, ordY);
                    ctx.stroke();
                }

                // 3. Persistent Local Bracket Lines (ONLY if an active position exists!)
                if (pos && pos.entryPrice > 0) {
                    const hasServerTp = orders.some((o: any) => o.type === 'TAKE_PROFIT_MARKET' || o.type === 'TAKE_PROFIT');
                    const hasServerSl = orders.some((o: any) => o.type === 'STOP_MARKET' || o.type === 'STOP_LOSS' || o.type === 'STOP');

                    const bracket = localBrackets.get(getBracketKey(cleanSymbol));
                    const tpCandidate = !hasServerTp && bracket?.tpPrice ? bracket.tpPrice : 0;
                    if (tpCandidate && tpCandidate >= scale.min && tpCandidate <= scale.max) {
                        const tpY = Math.round(coords.priceToY(tpCandidate, scale, bounds)) + 0.5;
                        ctx.strokeStyle = '#a7be94';
                        ctx.lineWidth = 1.3;
                        ctx.setLineDash([]);
                        ctx.beginPath();
                        ctx.moveTo(startX, tpY);
                        ctx.lineTo(endX, tpY);
                        ctx.stroke();
                    }

                    const slCandidate = !hasServerSl && bracket?.slPrice ? bracket.slPrice : 0;
                    if (slCandidate && slCandidate >= scale.min && slCandidate <= scale.max) {
                        const slY = Math.round(coords.priceToY(slCandidate, scale, bounds)) + 0.5;
                        ctx.strokeStyle = '#af6870';
                        ctx.lineWidth = 1.3;
                        ctx.setLineDash([]);
                        ctx.beginPath();
                        ctx.moveTo(startX, slY);
                        ctx.lineTo(endX, slY);
                        ctx.stroke();
                    }
                } else {
                    // No active position: clear any cached local brackets for this symbol
                    localBrackets.delete(getBracketKey(cleanSymbol));
                }

                // 4. Ghost Drag Line (Active Interactive Dragging)
                if (dragState.active && dragState.isDragging) {
                    const ghostY = Math.round(dragState.currentY) + 0.5;
                    const ghostColor = !dragState.isValid ? '#e5b97c' : (dragState.type === 'TP' ? '#a7be94' : '#af6870');

                    ctx.strokeStyle = ghostColor;
                    ctx.lineWidth = 1.8;
                    ctx.setLineDash([]);
                    ctx.beginPath();
                    ctx.moveTo(startX, ghostY);
                    ctx.lineTo(endX, ghostY);
                    ctx.stroke();
                }
            }

            function syncOverlay(args: RendererLayerArgs) {
                if (!overlayEl) return;
                ensureStyles();

                const { coords, scale, bounds } = args;
                const cleanSymbol = getCellSymbol();

                // If currently dragging, update ONLY the ghost badge so background handles are NEVER re-rendered
                if (dragState.active && dragState.isDragging) {
                    let ghostEl = overlayEl.querySelector('.vela-tl-ghost') as HTMLElement;
                    if (!ghostEl) {
                        ghostEl = document.createElement('div');
                        ghostEl.className = 'vela-tl-ghost';
                        overlayEl.appendChild(ghostEl);
                    }

                    const { precision } = getPriceConstraints(dragState.currentPrice);
                    const pos = dragState.position;
                    const isLong = pos?.side === 'LONG';
                    const entryPrice = pos?.entryPrice || 0;
                    const diff = isLong ? (dragState.currentPrice - entryPrice) : (entryPrice - dragState.currentPrice);
                    const pnlVal = entryPrice > 0 ? diff * (pos.size || 1) : 0;
                    const roeVal = entryPrice > 0 ? (diff / entryPrice) * 100 * (pos.leverage || 1) : 0;
                    const pnlSign = pnlVal >= 0 ? '+' : '';
                    const ghostColor = !dragState.isValid ? '#e5b97c' : (dragState.type === 'TP' ? '#a7be94' : '#af6870');

                    ghostEl.style.top = `${dragState.currentY}px`;
                    ghostEl.style.border = `1px solid ${ghostColor}`;
                    ghostEl.style.background = 'rgba(18, 22, 25, 0.68)';
                    ghostEl.style.display = 'inline-flex';

                    if (!dragState.isValid) {
                        ghostEl.innerHTML = `
                            <span style="color:#e5b97c;">⚠ Invalid ${dragState.type}</span>
                            <span style="color:#94a3b8;font-size:9.5px;">Must be ${isLong ? (dragState.type === 'TP' ? '> entry' : '< entry') : (dragState.type === 'TP' ? '< entry' : '> entry')}</span>
                        `;
                    } else if (entryPrice > 0) {
                        ghostEl.innerHTML = `
                            <span style="color:${ghostColor};">${dragState.type}: ${dragState.currentPrice.toFixed(precision)}</span>
                            <span style="color:${pnlVal >= 0 ? '#a7be94' : '#af6870'};font-size:10px;">(${pnlSign}$${pnlVal.toFixed(2)} | ${pnlSign}${roeVal.toFixed(1)}%)</span>
                        `;
                    } else {
                        ghostEl.innerHTML = `
                            <span style="color:${ghostColor};">${dragState.type}: ${dragState.currentPrice.toFixed(precision)}</span>
                        `;
                    }
                    return;
                }

                // If not dragging, remove any stale ghost badge
                const staleGhost = overlayEl.querySelector('.vela-tl-ghost');
                if (staleGhost) staleGhost.remove();

                // Gather data for badges
                const isClosed = isSymbolInCloseCooldown(cleanSymbol);
                const pos = !isClosed ? state.activePositions?.find((p: any) => p && p.symbol === cleanSymbol) : null;
                const orders = !isClosed ? (state.openOrders || []).filter((o: any) => o && o.symbol === cleanSymbol) : [];

                const isBracketOrd = (o: any) =>
                    o.type === 'TAKE_PROFIT_MARKET' || o.type === 'TAKE_PROFIT' || o.type === 'TAKE_PROFIT_LIMIT' ||
                    o.type === 'STOP_MARKET' || o.type === 'STOP_LOSS' || o.type === 'STOP' || o.type === 'STOP_LOSS_LIMIT' ||
                    o.type === 'TRAILING_STOP_MARKET' || o.closePosition === true || o.closePosition === 'true';

                // Brackets only belong to an active position. If no active position, serverTp/serverSl should not be displayed!
                const serverTp = (pos && pos.entryPrice > 0) ? orders.find((o: any) => o.type?.startsWith('TAKE_PROFIT')) : null;
                const serverSl = (pos && pos.entryPrice > 0) ? orders.find((o: any) => o.type?.startsWith('STOP') || o.type === 'TRAILING_STOP_MARKET') : null;
                const limitOrders = orders.filter((o: any) => !isBracketOrd(o));

                const bracket = (pos && pos.entryPrice > 0) ? localBrackets.get(getBracketKey(cleanSymbol)) : null;
                const hasTp = Boolean(serverTp || bracket?.tpPrice);
                const hasSl = Boolean(serverSl || bracket?.slPrice);

                let html = '';

                // 1. Position Entry Badge with [+TP], [+SL], and [✕ Close] buttons
                if (pos && pos.entryPrice > 0 && pos.entryPrice >= scale.min && pos.entryPrice <= scale.max) {
                    const entryY = Math.round(coords.priceToY(pos.entryPrice, scale, bounds));
                    const isLong = pos.side === 'LONG';
                    const sideColor = isLong ? '#a7be94' : '#af6870';
                    const pnlVal = pos.pnl || 0;
                    const pnlSign = pnlVal >= 0 ? '+' : '';
                    const pnlColor = pnlVal >= 0 ? '#a7be94' : '#af6870';
                    const roeVal = pos.roe || 0;

                    html += `
                        <div class="vela-tl-badge" style="top: ${entryY}px; border: 1px solid ${isLong ? 'rgba(167, 190, 148, 0.35)' : 'rgba(175, 104, 112, 0.35)'}; background: ${isLong ? 'rgba(24, 32, 28, 0.65)' : 'rgba(34, 24, 28, 0.65)'};">
                            <span style="color: ${sideColor}; font-weight: 700;">${pos.side} ${pos.size}</span>
                            <span style="color: #94a3b8;">@ ${pos.entryPrice.toFixed(2)}</span>
                            <span style="color: ${pnlColor}; margin-left: 3px;">${pnlSign}$${pnlVal.toFixed(2)} (${pnlSign}${roeVal.toFixed(1)}%)</span>
                            ${!hasTp ? '<button class="vela-tl-btn vela-tl-btn-tp" data-role="drag-tp" title="Drag to set Take Profit">+TP</button>' : ''}
                            ${!hasSl ? '<button class="vela-tl-btn vela-tl-btn-sl" data-role="drag-sl" title="Drag to set Stop Loss">+SL</button>' : ''}
                            <button class="vela-tl-btn vela-tl-btn-cancel" data-role="close-position" data-symbol="${cleanSymbol}" data-side="${pos.side}" data-size="${pos.size}" title="Close Position">✕</button>
                        </div>
                    `;
                }

                // 2. TP Badge (Render ONLY if active position exists!)
                if (pos && pos.entryPrice > 0) {
                    const tpPrice = serverTp ? getOrderPrice(serverTp) : (bracket?.tpPrice || 0);
                    if (tpPrice && tpPrice >= scale.min && tpPrice <= scale.max) {
                        const tpY = Math.round(coords.priceToY(tpPrice, scale, bounds));
                        const isLong = pos.side === 'LONG';
                        const diff = isLong ? (tpPrice - pos.entryPrice) : (pos.entryPrice - tpPrice);
                        const pnlEst = diff * pos.size;
                        const roeEst = (diff / pos.entryPrice) * 100 * (pos.leverage || 1);
                        const pnlText = `| +$${pnlEst.toFixed(2)} (+${roeEst.toFixed(1)}%)`;

                        html += `
                            <div class="vela-tl-badge" data-role="drag-existing-tp" data-order-id="${serverTp?.orderId || ''}" data-order-price="${tpPrice}" style="cursor: ns-resize; top: ${tpY}px; border: 1px solid rgba(167, 190, 148, 0.4); background: rgba(20, 28, 24, 0.65);" title="Drag anywhere on badge to adjust Take Profit">
                                <span style="color: #a7be94;">TP: ${tpPrice.toFixed(2)}</span>
                                <span style="color: #8da47c; font-size: 9.5px;">${pnlText}</span>
                                <span class="vela-tl-btn vela-tl-btn-drag" title="Drag to adjust TP">↕</span>
                                <button class="vela-tl-btn vela-tl-btn-cancel" data-role="cancel-tp" data-order-id="${serverTp?.orderId || ''}" title="Cancel TP">✕</button>
                            </div>
                        `;
                    }
                }

                // 3. SL Badge (Render ONLY if active position exists!)
                if (pos && pos.entryPrice > 0) {
                    const slPrice = serverSl ? getOrderPrice(serverSl) : (bracket?.slPrice || 0);
                    if (slPrice && slPrice >= scale.min && slPrice <= scale.max) {
                        const slY = Math.round(coords.priceToY(slPrice, scale, bounds));
                        const isLong = pos.side === 'LONG';
                        const diff = isLong ? (slPrice - pos.entryPrice) : (pos.entryPrice - slPrice);
                        const pnlEst = diff * pos.size;
                        const roeEst = (diff / pos.entryPrice) * 100 * (pos.leverage || 1);
                        const pnlText = `| -$${Math.abs(pnlEst).toFixed(2)} (${roeEst.toFixed(1)}%)`;

                        html += `
                            <div class="vela-tl-badge" data-role="drag-existing-sl" data-order-id="${serverSl?.orderId || ''}" data-order-price="${slPrice}" style="cursor: ns-resize; top: ${slY}px; border: 1px solid rgba(175, 104, 112, 0.4); background: rgba(30, 22, 24, 0.65);" title="Drag anywhere on badge to adjust Stop Loss">
                                <span style="color: #af6870;">SL: ${slPrice.toFixed(2)}</span>
                                <span style="color: #a2646b; font-size: 9.5px;">${pnlText}</span>
                                <span class="vela-tl-btn vela-tl-btn-drag" title="Drag to adjust SL">↕</span>
                                <button class="vela-tl-btn vela-tl-btn-cancel" data-role="cancel-sl" data-order-id="${serverSl?.orderId || ''}" title="Cancel SL">✕</button>
                            </div>
                        `;
                    }
                }

                // 4. Limit Orders Badges
                for (const ord of limitOrders) {
                    const ordPrice = getOrderPrice(ord);
                    if (ordPrice < scale.min || ordPrice > scale.max) continue;
                    const ordY = Math.round(coords.priceToY(ordPrice, scale, bounds));

                    html += `
                        <div class="vela-tl-badge" style="top: ${ordY}px; border: 1px solid rgba(253, 224, 71, 0.35); background: rgba(28, 26, 18, 0.65);">
                            <span style="color: #fde047;">LIMIT ${ord.side} ${ord.origQty} @ ${ordPrice.toFixed(2)}</span>
                            <button class="vela-tl-btn vela-tl-btn-cancel" data-role="cancel-order" data-order-id="${ord.orderId}" title="Cancel Order">✕</button>
                        </div>
                    `;
                }

                // Crucial: Only update DOM if the generated HTML changed, avoiding 60fps DOM thrashing
                if (!html) {
                    if (overlayEl.innerHTML !== '') {
                        overlayEl.innerHTML = '';
                    }
                    lastRenderedHtml = '';
                    return;
                }
                if (lastRenderedHtml !== html) {
                    overlayEl.innerHTML = html;
                    lastRenderedHtml = html;
                }
            }

            function startDrag(
                e: PointerEvent,
                type: 'TP' | 'SL',
                pos: any,
                symbol: string,
                oldOrderId?: number | string,
                oldPrice?: number
            ) {
                if (!canvasEl || !lastArgs) return;
                e.stopPropagation();
                e.preventDefault();

                const { coords, scale, bounds } = lastArgs;
                const rect = canvasEl.getBoundingClientRect();
                const localY = Math.max(bounds.top, Math.min(bounds.top + bounds.height, e.clientY - rect.top));
                const initPrice = coords.yToPrice(localY, scale, bounds);

                dragState = {
                    active: true,
                    isDragging: false,
                    type,
                    position: pos,
                    isPlanning: !pos || pos.entryPrice <= 0,
                    startY: e.clientY,
                    currentY: localY,
                    currentPrice: initPrice,
                    oldOrderId,
                    oldPrice,
                    isValid: true,
                    symbol,
                    pointerId: e.pointerId
                };

                const onPointerMove = (ev: PointerEvent) => {
                    if (!dragState.active || !lastArgs || !canvasEl) return;
                    ev.stopPropagation();
                    ev.preventDefault();

                    if (Math.abs(ev.clientY - dragState.startY) > 3) {
                        dragState.isDragging = true;
                    }

                    const { coords: c, scale: s, bounds: b } = lastArgs;
                    const currentRect = canvasEl.getBoundingClientRect();
                    const curY = Math.max(b.top, Math.min(b.top + b.height, ev.clientY - currentRect.top));
                    dragState.currentY = curY;

                    const rawPrice = c.yToPrice(curY, s, b);
                    const { tickSize, precision } = getPriceConstraints(rawPrice);
                    const snappedPrice = Number((Math.round(rawPrice / tickSize) * tickSize).toFixed(precision));
                    dragState.currentPrice = snappedPrice;

                    // Directional Validation only if an active position is open
                    if (dragState.position && dragState.position.entryPrice > 0 && !dragState.isPlanning) {
                        const isLong = dragState.position.side === 'LONG';
                        const currentMarket = dragState.position.markPrice || dragState.position.entryPrice;
                        if (dragState.type === 'TP') {
                            dragState.isValid = isLong ? snappedPrice > currentMarket : snappedPrice < currentMarket;
                        } else {
                            dragState.isValid = isLong ? snappedPrice < currentMarket : snappedPrice > currentMarket;
                        }
                    } else {
                        // When planning orders without an active position, allow adjusting anywhere freely
                        dragState.isValid = true;
                    }

                    paintCanvas(lastArgs);
                    syncOverlay(lastArgs);
                };

                const onPointerUp = async (ev: PointerEvent) => {
                    ev.stopPropagation();
                    ev.preventDefault();

                    window.removeEventListener('pointermove', onPointerMove, { capture: true });
                    window.removeEventListener('pointerup', onPointerUp, { capture: true });
                    window.removeEventListener('pointercancel', onPointerCancel, { capture: true });

                    const wasDragging = dragState.isDragging;
                    const isValid = dragState.isValid;
                    const priceToCommit = dragState.currentPrice;
                    const sym = dragState.symbol;
                    const dragType = dragState.type;
                    const oldId = dragState.oldOrderId;
                    const oldP = dragState.oldPrice;

                    dragState.active = false;
                    dragState.isDragging = false;

                    if (!wasDragging) {
                        if (lastArgs) {
                            paintCanvas(lastArgs);
                            syncOverlay(lastArgs);
                        }
                        return;
                    }

                    if (!isValid) {
                        showToast(`Cannot place ${dragType}: Price is on wrong side of entry`, 'error');
                        if (lastArgs) {
                            paintCanvas(lastArgs);
                            syncOverlay(lastArgs);
                        }
                        return;
                    }

                    // 1. Immediately persist to local bracket state so line NEVER vanishes
                    const bKey = getBracketKey(sym);
                    const curBracket = localBrackets.get(bKey) || {};
                    if (dragType === 'TP') curBracket.tpPrice = priceToCommit;
                    else curBracket.slPrice = priceToCommit;
                    localBrackets.set(bKey, curBracket);

                    // 2. Sync with order ticket inputs & state
                    if (dragType === 'TP') {
                        state.takeProfit = priceToCommit.toFixed(2);
                        const chkTp = document.querySelector('#chk-tp') as HTMLInputElement | null;
                        const inputTp = document.querySelector('#input-tp') as HTMLInputElement | null;
                        if (chkTp && inputTp) { chkTp.checked = true; inputTp.disabled = false; inputTp.value = priceToCommit.toFixed(2); }
                    } else {
                        state.stopLoss = priceToCommit.toFixed(2);
                        const chkSl = document.querySelector('#chk-sl') as HTMLInputElement | null;
                        const inputSl = document.querySelector('#input-sl') as HTMLInputElement | null;
                        if (chkSl && inputSl) { chkSl.checked = true; inputSl.disabled = false; inputSl.value = priceToCommit.toFixed(2); }
                    }

                    // 3. Immediately redraw with updated local state
                    lastRenderedHtml = '__FORCE__'; // force DOM update
                    if (lastArgs) {
                        paintCanvas(lastArgs);
                        syncOverlay(lastArgs);
                    }

                    // 4. If an active position exists on Binance, submit replacement bracket to Binance
                    const activePos = state.activePositions?.find((p: any) => p && p.symbol === sym);
                    if (activePos && activePos.entryPrice > 0) {
                        const orderType = dragType === 'TP' ? 'TAKE_PROFIT_MARKET' : 'STOP_MARKET';
                        const oppSide = activePos.side === 'LONG' ? 'SELL' : 'BUY';

                        showToast(`Submitting ${dragType} at ${priceToCommit.toFixed(2)} USDT...`, 'info');
                        try {
                            const res = await fetch('/api/binance/order/replace-bracket', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    symbol: sym,
                                    side: oppSide,
                                    orderType,
                                    oldOrderId: oldId,
                                    oldPrice: oldP,
                                    newPrice: priceToCommit,
                                    testnet: state.isTestnet
                                })
                            });
                            const data = await res.json();
                            if (!res.ok || data.error) {
                                showToast(`Error: ${data.error || 'Failed to place order'}`, 'error');
                                clearLocalBracket(sym, dragType);
                            } else {
                                showToast(`✓ ${dragType} confirmed at ${priceToCommit.toFixed(2)} USDT`, 'success');
                                await Promise.all([fetchOrders(sym), fetchAccount()]);
                            }
                        } catch (err: any) {
                            showToast(`Network error: ${err.message}`, 'error');
                            clearLocalBracket(sym, dragType);
                        }
                    } else {
                        showToast(`✓ ${dragType} set to ${priceToCommit.toFixed(2)} USDT`, 'success');
                    }
                };

                const onPointerCancel = (ev: PointerEvent) => {
                    window.removeEventListener('pointermove', onPointerMove, { capture: true });
                    window.removeEventListener('pointerup', onPointerUp, { capture: true });
                    window.removeEventListener('pointercancel', onPointerCancel, { capture: true });
                    dragState.active = false;
                    dragState.isDragging = false;
                    if (lastArgs) {
                        paintCanvas(lastArgs);
                        syncOverlay(lastArgs);
                    }
                };

                window.addEventListener('pointermove', onPointerMove, { capture: true });
                window.addEventListener('pointerup', onPointerUp, { capture: true });
                window.addEventListener('pointercancel', onPointerCancel, { capture: true });
            }

            async function cancelOrderApi(sym: string, orderId: number | string) {
                showToast(`Cancelling order #${orderId}...`, 'info');
                try {
                    const res = await fetch('/api/binance/order/cancel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            symbol: sym,
                            orderId,
                            testnet: state.isTestnet
                        })
                    });
                    const data = await res.json();
                    if (data.error) {
                        showToast(`Cancel failed: ${data.error}`, 'error');
                    } else {
                        showToast(`✓ Order canceled`, 'success');
                        await fetchOrders(sym);
                    }
                } catch (e: any) {
                    showToast(`Cancel error: ${e.message}`, 'error');
                }
            }

            function clearLocalBracket(sym: string, type: 'TP' | 'SL') {
                const bKey = getBracketKey(sym);
                const b = localBrackets.get(bKey);
                if (b) {
                    if (type === 'TP') delete b.tpPrice;
                    else delete b.slPrice;
                }
                if (type === 'TP') {
                    state.takeProfit = '';
                    const chkTp = document.querySelector('#chk-tp') as HTMLInputElement | null;
                    const inputTp = document.querySelector('#input-tp') as HTMLInputElement | null;
                    if (chkTp && inputTp) { chkTp.checked = false; inputTp.disabled = true; inputTp.value = ''; }
                } else {
                    state.stopLoss = '';
                    const chkSl = document.querySelector('#chk-sl') as HTMLInputElement | null;
                    const inputSl = document.querySelector('#input-sl') as HTMLInputElement | null;
                    if (chkSl && inputSl) { chkSl.checked = false; inputSl.disabled = true; inputSl.value = ''; }
                }
                lastRenderedHtml = '__FORCE__';
                if (lastArgs) {
                    paintCanvas(lastArgs);
                    syncOverlay(lastArgs);
                }
                showToast(`${type} removed`, 'info');
            }

            function onOverlayPointerDown(e: PointerEvent) {
                // If clicking cancel button, do not start drag
                if ((e.target as HTMLElement).closest('[data-role^="cancel"]')) return;

                const target = (e.target as HTMLElement).closest('[data-role]') as HTMLElement;
                if (!target) return;

                const role = target.getAttribute('data-role');
                const cleanSymbol = getCellSymbol();
                const pos = state.activePositions?.find((p: any) => p && p.symbol === cleanSymbol);

                if (role === 'drag-tp') {
                    startDrag(e, 'TP', pos, cleanSymbol);
                } else if (role === 'drag-sl') {
                    startDrag(e, 'SL', pos, cleanSymbol);
                } else if (role === 'drag-existing-tp') {
                    const orderId = target.getAttribute('data-order-id');
                    const orderPrice = parseFloat(target.getAttribute('data-order-price') || '0');
                    startDrag(e, 'TP', pos, cleanSymbol, orderId || undefined, orderPrice);
                } else if (role === 'drag-existing-sl') {
                    const orderId = target.getAttribute('data-order-id');
                    const orderPrice = parseFloat(target.getAttribute('data-order-price') || '0');
                    startDrag(e, 'SL', pos, cleanSymbol, orderId || undefined, orderPrice);
                }
            }

            function onOverlayClick(e: MouseEvent) {
                const target = (e.target as HTMLElement).closest('[data-role]') as HTMLElement;
                if (!target) return;

                const role = target.getAttribute('data-role');
                const cleanSymbol = getCellSymbol();
                const orderId = target.getAttribute('data-order-id');

                if (role === 'cancel-tp') {
                    e.stopPropagation();
                    e.preventDefault();
                    if (orderId) cancelOrderApi(cleanSymbol, orderId);
                    clearLocalBracket(cleanSymbol, 'TP');
                } else if (role === 'cancel-sl') {
                    e.stopPropagation();
                    e.preventDefault();
                    if (orderId) cancelOrderApi(cleanSymbol, orderId);
                    clearLocalBracket(cleanSymbol, 'SL');
                } else if (role === 'cancel-order') {
                    e.stopPropagation();
                    e.preventDefault();
                    if (orderId) cancelOrderApi(cleanSymbol, orderId);
                } else if (role === 'close-position') {
                    e.stopPropagation();
                    e.preventDefault();
                    const sym = target.getAttribute('data-symbol') || cleanSymbol;
                    const side = target.getAttribute('data-side') || 'LONG';
                    const size = parseFloat(target.getAttribute('data-size') || '0');
                    closePosition(sym, side, size);
                }
            }

            function onWindowKeyDown(e: KeyboardEvent) {
                if (e.key === 'Escape' && dragState.active) {
                    dragState.active = false;
                    dragState.isDragging = false;
                    showToast('Order drag aborted', 'info');
                    if (lastArgs) {
                        paintCanvas(lastArgs);
                        syncOverlay(lastArgs);
                    }
                }
            }

            function onPositionClosed(e: any) {
                const sym = e.detail?.symbol;
                clearAllLocalBrackets(sym);
                if (overlayEl) overlayEl.innerHTML = '';
                lastRenderedHtml = '';
                if (lastArgs) {
                    paintCanvas(lastArgs);
                    syncOverlay(lastArgs);
                }
            }

            function onRepaintLines() {
                if (lastArgs) {
                    paintCanvas(lastArgs);
                    syncOverlay(lastArgs);
                }
            }

            return {
                mount(canvas: HTMLCanvasElement) {
                    canvasEl = canvas;
                    ctx = canvas.getContext('2d');

                    if (canvas.parentElement) {
                        overlayEl = document.createElement('div');
                        overlayEl.className = 'vela-tl-overlay';
                        canvas.parentElement.appendChild(overlayEl);

                        overlayEl.addEventListener('pointerdown', onOverlayPointerDown);
                        overlayEl.addEventListener('click', onOverlayClick);
                    }

                    if (typeof window !== 'undefined') {
                        window.addEventListener('keydown', onWindowKeyDown);
                        window.addEventListener('vela:position-closed', onPositionClosed);
                        window.addEventListener('vela:repaint-lines', onRepaintLines);
                    }
                },
                animating: () => true,
                render(args: RendererLayerArgs) {
                    lastArgs = args;
                    paintCanvas(args);
                    syncOverlay(args);
                },
                destroy() {
                    if (overlayEl) {
                        overlayEl.removeEventListener('pointerdown', onOverlayPointerDown);
                        overlayEl.removeEventListener('click', onOverlayClick);
                        overlayEl.remove();
                        overlayEl = null;
                    }
                    if (typeof window !== 'undefined') {
                        window.removeEventListener('keydown', onWindowKeyDown);
                        window.removeEventListener('vela:position-closed', onPositionClosed);
                        window.removeEventListener('vela:repaint-lines', onRepaintLines);
                    }
                    ctx = null;
                    canvasEl = null;
                    lastArgs = null;
                },
            };
        },
    });
}
