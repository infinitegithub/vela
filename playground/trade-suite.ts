import { registerSidePanel, registerWidgetAction, registerIcon } from '../src/plugin';
import type { WidgetContext } from '../src/widget/WidgetContext';
import type { VelaWorkspace } from '../src/workspace';
import { Dialog } from '../src/ui';

registerIcon('trade', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>');
registerIcon('code', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>');
registerIcon('replay', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>');

// State management for trading suite
export interface TradeState {
    isTestnet: boolean;
    symbol: string;
    leverage: number;
    marginMode: 'isolated' | 'cross';
    side: 'BUY' | 'SELL';
    orderType: 'LIMIT' | 'MARKET' | 'STOP_MARKET';
    price: string;
    quantity: string;
    takeProfit: string;
    stopLoss: string;
    reduceOnly: boolean;
    availableBalance: number;
    activePositions: any[];
    openOrders: any[];
    orderHistory: any[];
    tradeHistory: any[];
}

export const state: TradeState = {
    isTestnet: true,
    symbol: 'BTCUSDT',
    leverage: 20,
    marginMode: 'isolated',
    side: 'BUY',
    orderType: 'MARKET',
    price: '',
    quantity: '',
    takeProfit: '',
    stopLoss: '',
    reduceOnly: false,
    availableBalance: 0,
    activePositions: [],
    openOrders: [],
    orderHistory: [],
    tradeHistory: []
};

let updateTicketSymbolCallback: (() => void) | null = null;

export function setActiveSymbol(symbol: string) {
    const clean = symbol.replace(/.*:/, '').toUpperCase();
    if (state.symbol === clean) return;
    state.symbol = clean;
    if (updateTicketSymbolCallback) {
        updateTicketSymbolCallback();
    }
    fetchOrders(clean);
    fetchOrderHistory(clean);
    fetchTradeHistory(clean);
}

export async function fetchAccount() {
    try {
        const res = await fetch(`/api/binance/account?testnet=${state.isTestnet}`);
        if (res.ok) {
            const data = await res.json();
            state.availableBalance = data.availableBalance || 0;
            state.activePositions = data.positions || [];
            updatePositionsUI();
            updateAccountBalanceUI();
        }
    } catch (e) {
        console.error('Failed to fetch account', e);
    }
}

export async function fetchOrders(symbol: string) {
    try {
        const res = await fetch(`/api/binance/orders?symbol=${encodeURIComponent(symbol)}&testnet=${state.isTestnet}`);
        if (res.ok) {
            state.openOrders = await res.json();
            updateOrdersUI();
        }
    } catch (e) {
        console.error('Failed to fetch orders', e);
    }
}

function updateAccountBalanceUI() {
    const balEl = document.getElementById('trade-panel-avail');
    if (balEl) balEl.textContent = `$${state.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const stripBalEl = document.getElementById('strip-avail-val');
    if (stripBalEl) stripBalEl.textContent = `$${state.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

let historyContainer: HTMLElement | null = null;
let journalContainer: HTMLElement | null = null;

function formatDateTime(ts: number): string {
    if (!ts) return '--';
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${min}:${ss}`;
}

export async function fetchOrderHistory(symbol: string) {
    try {
        const res = await fetch(`/api/binance/order-history?symbol=${encodeURIComponent(symbol)}&testnet=${state.isTestnet}`);
        if (res.ok) {
            state.orderHistory = await res.json();
            updateHistoryUI();
        }
    } catch (e) {
        console.error('Failed to fetch order history', e);
    }
}

export async function fetchTradeHistory(symbol: string) {
    try {
        const res = await fetch(`/api/binance/trade-history?symbol=${encodeURIComponent(symbol)}&testnet=${state.isTestnet}`);
        if (res.ok) {
            state.tradeHistory = await res.json();
            updateJournalUI();
        }
    } catch (e) {
        console.error('Failed to fetch trade history', e);
    }
}

let positionsContainer: HTMLElement | null = null;
let ordersContainer: HTMLElement | null = null;

function updatePositionsUI() {
    const posCountEl = document.getElementById('pos-count');
    if (posCountEl) posCountEl.textContent = state.activePositions.length.toString();

    if (!positionsContainer) return;
    if (state.activePositions.length === 0) {
        positionsContainer.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--vela-text-muted, #46474b);">No open positions</div>`;
        return;
    }

    let rowsHtml = '';
    for (const p of state.activePositions) {
        const isLong = p.side === 'LONG';
        const pnlColor = p.pnl >= 0 ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
        rowsHtml += `
            <tr style="border-bottom: 1px solid var(--vela-border, #262629); font-size: 12px;">
                <td style="padding: 8px 10px;">
                    <span style="font-weight: 700; color: var(--vela-text-primary, #eeeef1);">${p.symbol}</span>
                    <span style="padding: 1px 4px; border-radius: 2px; font-size: 10px; font-weight: 700; background: ${isLong ? 'var(--vela-up-selected-bg, #363a38)' : 'rgba(175,104,112,0.25)'}; color: ${isLong ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)'}; margin-left: 4px;">${p.side} ${p.leverage}x</span>
                </td>
                <td style="padding: 8px 10px; color: var(--vela-text-secondary, #757882);">${p.size}</td>
                <td style="padding: 8px 10px; color: var(--vela-text-secondary, #757882);">${p.entryPrice.toFixed(2)}</td>
                <td style="padding: 8px 10px; color: var(--vela-text-secondary, #757882);">${p.markPrice.toFixed(2)}</td>
                <td style="padding: 8px 10px; color: var(--vela-down, #af6870);">${p.liqPrice > 0 ? p.liqPrice.toFixed(2) : '--'}</td>
                <td style="padding: 8px 10px; color: ${pnlColor}; font-weight: 600;">
                    ${p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(2)} USDT (${p.roe.toFixed(2)}%)
                </td>
                <td style="padding: 8px 10px; text-align: right;">
                    <button class="close-pos-btn" data-sym="${p.symbol}" data-side="${p.side}" data-size="${p.size}" style="background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-down, #af6870); font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer;">Close</button>
                </td>
            </tr>
        `;
    }

    positionsContainer.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
                <tr style="color: var(--vela-text-muted, #46474b); font-size: 10px; text-transform: uppercase; border-bottom: 1px solid var(--vela-border, #262629);">
                    <th style="padding: 6px 10px;">Symbol</th>
                    <th style="padding: 6px 10px;">Size</th>
                    <th style="padding: 6px 10px;">Entry Price</th>
                    <th style="padding: 6px 10px;">Mark Price</th>
                    <th style="padding: 6px 10px;">Liq. Price</th>
                    <th style="padding: 6px 10px;">PnL (ROE %)</th>
                    <th style="padding: 6px 10px; text-align: right;">Action</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;

    positionsContainer.querySelectorAll('.close-pos-btn').forEach(btn => {
        btn.addEventListener('click', async (e: any) => {
            const sym = e.target.getAttribute('data-sym');
            const side = e.target.getAttribute('data-side');
            const size = parseFloat(e.target.getAttribute('data-size'));
            e.target.textContent = 'Closing...';
            await fetch('/api/binance/position/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: sym, side, quantity: size, testnet: state.isTestnet })
            });
            await fetchAccount();
        });
    });
}

function updateOrdersUI() {
    const ordCountEl = document.getElementById('ord-count');
    if (ordCountEl) ordCountEl.textContent = state.openOrders.length.toString();

    if (!ordersContainer) return;
    if (state.openOrders.length === 0) {
        ordersContainer.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--vela-text-muted, #46474b);">No open orders</div>`;
        return;
    }

    let rowsHtml = '';
    for (const o of state.openOrders) {
        const isBuy = o.side === 'BUY';
        rowsHtml += `
            <tr style="border-bottom: 1px solid var(--vela-border, #262629); font-size: 12px;">
                <td style="padding: 8px 10px; color: var(--vela-text-primary, #eeeef1); font-weight: 700;">${o.symbol}</td>
                <td style="padding: 8px 10px;">
                    <span style="color: ${isBuy ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)'}; font-weight: 700;">${o.side}</span>
                </td>
                <td style="padding: 8px 10px; color: var(--vela-text-secondary, #757882);">${o.type}</td>
                <td style="padding: 8px 10px; color: var(--vela-text-secondary, #757882);">${parseFloat(o.price || '0').toFixed(2)}</td>
                <td style="padding: 8px 10px; color: var(--vela-text-secondary, #757882);">${parseFloat(o.origQty || '0')}</td>
                <td style="padding: 8px 10px; text-align: right;">
                    <button class="cancel-ord-btn" data-sym="${o.symbol}" data-id="${o.orderId}" style="background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-down, #af6870); font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer;">Cancel</button>
                </td>
            </tr>
        `;
    }

    ordersContainer.innerHTML = `
        <div style="padding: 6px 10px; display: flex; justify-content: flex-end;">
            <button id="cancel-all-orders-btn" style="background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-down, #af6870); font-size: 11px; padding: 4px 10px; border-radius: 4px; cursor: pointer;">Cancel All</button>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
                <tr style="color: var(--vela-text-muted, #46474b); font-size: 10px; text-transform: uppercase; border-bottom: 1px solid var(--vela-border, #262629);">
                    <th style="padding: 6px 10px;">Symbol</th>
                    <th style="padding: 6px 10px;">Side</th>
                    <th style="padding: 6px 10px;">Type</th>
                    <th style="padding: 6px 10px;">Price</th>
                    <th style="padding: 6px 10px;">Amount</th>
                    <th style="padding: 6px 10px; text-align: right;">Action</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;

    ordersContainer.querySelector('#cancel-all-orders-btn')?.addEventListener('click', async () => {
        await fetch('/api/binance/order/cancel-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: state.symbol, testnet: state.isTestnet })
        });
        await fetchOrders(state.symbol);
    });

    ordersContainer.querySelectorAll('.cancel-ord-btn').forEach(btn => {
        btn.addEventListener('click', async (e: any) => {
            const sym = e.target.getAttribute('data-sym');
            const id = e.target.getAttribute('data-id');
            await fetch('/api/binance/order/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: sym, orderId: id, testnet: state.isTestnet })
            });
            await fetchOrders(state.symbol);
        });
    });
}


function updateHistoryUI() {
    if (!historyContainer) return;
    if (!Array.isArray(state.orderHistory) || state.orderHistory.length === 0) {
        historyContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--vela-text-muted, #46474b);">No order history for ${state.symbol}</div>`;
        return;
    }

    let rowsHtml = '';
    for (const o of state.orderHistory) {
        const isBuy = o.side === 'BUY';
        const sideColor = isBuy ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
        const status = o.status || 'UNKNOWN';
        let statusBg = 'rgba(117,120,130,0.15)';
        let statusFg = 'var(--vela-text-secondary, #757882)';
        if (status === 'FILLED') {
            statusBg = 'rgba(167,190,148,0.2)';
            statusFg = 'var(--vela-up, #a7be94)';
        } else if (status === 'CANCELED') {
            statusBg = 'rgba(175,104,112,0.15)';
            statusFg = 'var(--vela-down, #af6870)';
        } else if (status === 'NEW') {
            statusBg = 'rgba(253,224,71,0.15)';
            statusFg = 'var(--vela-warning, #fde047)';
        }

        const dateStr = formatDateTime(o.time || o.updateTime);
        const priceStr = parseFloat(o.price || '0') > 0 ? parseFloat(o.price).toFixed(2) : 'Market';
        const avgPriceStr = parseFloat(o.avgPrice || '0') > 0 ? parseFloat(o.avgPrice).toFixed(2) : '--';
        const execQty = parseFloat(o.executedQty || '0');
        const origQty = parseFloat(o.origQty || '0');

        rowsHtml += `
            <tr style="border-bottom: 1px solid var(--vela-border, #262629); font-size: 11px;">
                <td style="padding: 7px 10px; color: var(--vela-text-muted, #757882); white-space: nowrap;">${dateStr}</td>
                <td style="padding: 7px 10px; font-weight: 700; color: var(--vela-text-primary, #eeeef1);">${o.symbol}</td>
                <td style="padding: 7px 10px; font-weight: 700; color: ${sideColor};">${o.side}</td>
                <td style="padding: 7px 10px; color: var(--vela-text-secondary, #757882);">${o.type || 'LIMIT'}</td>
                <td style="padding: 7px 10px; color: var(--vela-text-secondary, #757882);">${priceStr}</td>
                <td style="padding: 7px 10px; color: var(--vela-text-secondary, #757882);">${avgPriceStr}</td>
                <td style="padding: 7px 10px; color: var(--vela-text-primary, #eeeef1);">${execQty} / ${origQty}</td>
                <td style="padding: 7px 10px;">
                    <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; background: ${statusBg}; color: ${statusFg};">${status}</span>
                </td>
            </tr>
        `;
    }

    historyContainer.innerHTML = `
        <div style="padding: 6px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--vela-border, #262629); background: var(--vela-bg-panel, #121215); font-size: 11px;">
            <span style="color: var(--vela-text-muted, #757882);">Recent orders for <strong style="color: var(--vela-text-primary, #eeeef1);">${state.symbol}</strong></span>
            <button id="refresh-history-btn" style="background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 2px 8px; border-radius: 4px; cursor: pointer;">↻ Refresh</button>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
                <tr style="color: var(--vela-text-muted, #46474b); font-size: 10px; text-transform: uppercase; border-bottom: 1px solid var(--vela-border, #262629);">
                    <th style="padding: 6px 10px;">Time</th>
                    <th style="padding: 6px 10px;">Symbol</th>
                    <th style="padding: 6px 10px;">Side</th>
                    <th style="padding: 6px 10px;">Type</th>
                    <th style="padding: 6px 10px;">Order Price</th>
                    <th style="padding: 6px 10px;">Avg Price</th>
                    <th style="padding: 6px 10px;">Filled / Total</th>
                    <th style="padding: 6px 10px;">Status</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;

    historyContainer.querySelector('#refresh-history-btn')?.addEventListener('click', () => {
        fetchOrderHistory(state.symbol);
    });
}

function updateJournalUI() {
    if (!journalContainer) return;
    if (!Array.isArray(state.tradeHistory) || state.tradeHistory.length === 0) {
        journalContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--vela-text-muted, #46474b);">No trade executions recorded in journal for ${state.symbol}</div>`;
        return;
    }

    let totalRealizedPnl = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let totalCommission = 0;
    let rowsHtml = '';

    for (const t of state.tradeHistory) {
        const isBuy = t.side === 'BUY';
        const sideColor = isBuy ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
        const pnl = parseFloat(t.realizedPnl || '0');
        const comm = parseFloat(t.commission || '0');
        const price = parseFloat(t.price || '0');
        const qty = parseFloat(t.qty || '0');

        totalRealizedPnl += pnl;
        totalCommission += Math.abs(comm);
        if (pnl > 0.0001) winningTrades++;
        else if (pnl < -0.0001) losingTrades++;

        const pnlStr = pnl === 0 ? '$0.00' : `${pnl > 0 ? '+' : ''}$${pnl.toFixed(4)} USDT`;
        const pnlColor = pnl > 0 ? 'var(--vela-up, #a7be94)' : (pnl < 0 ? 'var(--vela-down, #af6870)' : 'var(--vela-text-muted, #757882)');
        const dateStr = formatDateTime(t.time);

        rowsHtml += `
            <tr style="border-bottom: 1px solid var(--vela-border, #262629); font-size: 11px;">
                <td style="padding: 7px 10px; color: var(--vela-text-muted, #757882); white-space: nowrap;">${dateStr}</td>
                <td style="padding: 7px 10px; font-weight: 700; color: var(--vela-text-primary, #eeeef1);">${t.symbol}</td>
                <td style="padding: 7px 10px; font-weight: 700; color: ${sideColor};">${t.side}</td>
                <td style="padding: 7px 10px; color: var(--vela-text-secondary, #757882);">$${price.toFixed(2)}</td>
                <td style="padding: 7px 10px; color: var(--vela-text-primary, #eeeef1);">${qty}</td>
                <td style="padding: 7px 10px; font-weight: 700; color: ${pnlColor};">${pnlStr}</td>
                <td style="padding: 7px 10px; color: var(--vela-text-muted, #757882);">${comm.toFixed(4)} ${t.commissionAsset || 'USDT'}</td>
                <td style="padding: 7px 10px; color: var(--vela-text-muted, #46474b); font-family: monospace; font-size: 10px;">#${t.id || t.orderId}</td>
            </tr>
        `;
    }

    const tradeCount = state.tradeHistory.length;
    const closedCount = winningTrades + losingTrades;
    const winRate = closedCount > 0 ? Math.round((winningTrades / closedCount) * 100) : 0;
    const pnlHeaderColor = totalRealizedPnl >= 0 ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';

    journalContainer.innerHTML = `
        <div style="padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--vela-border, #262629); background: var(--vela-bg-panel, #121215); font-size: 11px;">
            <div style="display: flex; gap: 16px; align-items: center;">
                <span>Journal Realized PnL: <strong style="color: ${pnlHeaderColor}; font-size: 12px;">${totalRealizedPnl >= 0 ? '+' : ''}$${totalRealizedPnl.toFixed(2)} USDT</strong></span>
                <span>Win Rate: <strong style="color: var(--vela-text-primary, #eeeef1);">${winRate}%</strong> (${winningTrades}W / ${losingTrades}L)</span>
                <span>Fills: <strong style="color: var(--vela-text-primary, #eeeef1);">${tradeCount}</strong></span>
                <span>Total Fees: <strong style="color: var(--vela-text-muted, #757882);">$${totalCommission.toFixed(3)} USDT</strong></span>
            </div>
            <button id="refresh-journal-btn" style="background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 2px 8px; border-radius: 4px; cursor: pointer;">↻ Refresh</button>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
                <tr style="color: var(--vela-text-muted, #46474b); font-size: 10px; text-transform: uppercase; border-bottom: 1px solid var(--vela-border, #262629);">
                    <th style="padding: 6px 10px;">Time</th>
                    <th style="padding: 6px 10px;">Symbol</th>
                    <th style="padding: 6px 10px;">Side</th>
                    <th style="padding: 6px 10px;">Fill Price</th>
                    <th style="padding: 6px 10px;">Quantity</th>
                    <th style="padding: 6px 10px;">Realized PnL</th>
                    <th style="padding: 6px 10px;">Commission Fee</th>
                    <th style="padding: 6px 10px;">Trade ID</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;

    journalContainer.querySelector('#refresh-journal-btn')?.addEventListener('click', () => {
        fetchTradeHistory(state.symbol);
    });
}

// ── Register Native Side Panel (The Order Ticket) ───────────────────────────────
export function registerTradingSidePanel() {
    registerSidePanel({
        id: 'trade.panel',
        title: 'Binance Perpetual',
        icon: 'trade',
        order: 5,
        width: 330,
        resizable: true,
        minWidth: 280,
        maxWidth: 450,
        button: false, // Suppress redundant panel button; opened exclusively via [⇄ Trade] button
        mount: (ctx, body, header) => {
            header.setTitle('Order Ticket');

            body.innerHTML = `
                <div style="padding: 12px; font-family: -apple-system, system-ui, sans-serif; font-size: 12px; color: var(--vela-text-secondary, #757882); background: var(--vela-bg-panel, #121215);">
                    <!-- Environment switcher -->
                    <div style="display: flex; gap: 6px; margin-bottom: 12px;">
                        <button id="env-testnet-btn" style="flex: 1; padding: 6px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid ${state.isTestnet ? 'var(--vela-warning, #fde047)' : 'var(--vela-border, #262629)'}; background: ${state.isTestnet ? 'var(--vela-warning-bg, #29261a)' : 'var(--vela-bg-card, #232429)'}; color: ${state.isTestnet ? 'var(--vela-warning, #fde047)' : 'var(--vela-text-secondary, #757882)'}; cursor: pointer;">TESTNET</button>
                        <button id="env-prod-btn" style="flex: 1; padding: 6px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid ${!state.isTestnet ? 'var(--vela-up, #a7be94)' : 'var(--vela-border, #262629)'}; background: ${!state.isTestnet ? 'var(--vela-up-selected-bg, #363a38)' : 'var(--vela-bg-card, #232429)'}; color: ${!state.isTestnet ? 'var(--vela-up, #a7be94)' : 'var(--vela-text-secondary, #757882)'}; cursor: pointer;">PRODUCTION LIVE</button>
                    </div>

                    <!-- Margin Mode & Leverage -->
                    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                        <select id="trade-margin-mode" style="flex: 1; background: var(--vela-bg-card, #232429); color: var(--vela-text-primary, #eeeef1); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 6px 8px; font-size: 11px;">
                            <option value="isolated">Isolated</option>
                            <option value="cross">Cross</option>
                        </select>
                        <select id="trade-leverage" style="flex: 1; background: var(--vela-bg-card, #232429); color: var(--vela-text-primary, #eeeef1); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 6px 8px; font-size: 11px; font-weight: 700;">
                            <option value="5">5x</option>
                            <option value="10">10x</option>
                            <option value="20" selected>20x</option>
                            <option value="50">50x</option>
                            <option value="100">100x</option>
                            <option value="125">125x</option>
                        </select>
                    </div>

                    <!-- Buy / Sell Split Buttons -->
                    <div style="display: flex; gap: 8px; margin-bottom: 14px;">
                        <button id="btn-side-buy" style="flex: 1; padding: 10px; font-size: 13px; font-weight: 800; border-radius: 6px; border: none; background: var(--vela-up, #a7be94); color: var(--vela-button-light-text, #121215); cursor: pointer;">BUY / LONG</button>
                        <button id="btn-side-sell" style="flex: 1; padding: 10px; font-size: 13px; font-weight: 800; border-radius: 6px; border: none; background: var(--vela-bg-card, #232429); color: var(--vela-text-secondary, #757882); cursor: pointer;">SELL / SHORT</button>
                    </div>

                    <!-- Order Type Selector -->
                    <div style="display: flex; background: var(--vela-bg-panel, #121215); border: 1px solid var(--vela-border, #262629); border-radius: 6px; margin-bottom: 12px; overflow: hidden;">
                        <button id="type-market-btn" style="flex: 1; padding: 6px; font-size: 11px; font-weight: 700; background: var(--vela-bg-chip, #292a2f); color: var(--vela-text-primary, #eeeef1); border: none; cursor: pointer;">Market</button>
                        <button id="type-limit-btn" style="flex: 1; padding: 6px; font-size: 11px; font-weight: 700; background: transparent; color: var(--vela-text-secondary, #757882); border: none; cursor: pointer;">Limit</button>
                        <button id="type-stop-btn" style="flex: 1; padding: 6px; font-size: 11px; font-weight: 700; background: transparent; color: var(--vela-text-secondary, #757882); border: none; cursor: pointer;">Stop</button>
                    </div>

                    <!-- Price input (Limit/Stop) -->
                    <div id="field-price-group" style="display: none; margin-bottom: 10px;">
                        <label style="display: block; font-size: 11px; color: var(--vela-text-secondary, #757882); margin-bottom: 4px;">Price (USDT)</label>
                        <input id="input-order-price" type="number" step="any" placeholder="Price" style="width: 100%; box-sizing: border-box; background: var(--vela-bg-card, #232429); color: var(--vela-text-primary, #eeeef1); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 8px 10px; font-size: 12px; outline: none;" />
                    </div>

                    <!-- Quantity Input -->
                    <div style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="font-size: 11px; color: var(--vela-text-secondary, #757882);">Amount</span>
                            <span style="font-size: 11px; color: var(--vela-text-secondary, #757882);">Avail: <strong id="trade-panel-avail" style="color: var(--vela-text-primary, #eeeef1);">--</strong></span>
                        </div>
                        <input id="input-order-qty" type="number" step="any" placeholder="Size (e.g. 0.05)" style="width: 100%; box-sizing: border-box; background: var(--vela-bg-card, #232429); color: var(--vela-text-primary, #eeeef1); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 8px 10px; font-size: 12px; outline: none;" />
                    </div>

                    <!-- Quick % Allocation Buttons -->
                    <div style="display: flex; gap: 4px; margin-bottom: 14px;">
                        <button class="pct-btn" data-pct="0.25" style="flex: 1; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 4px 0; border-radius: 4px; cursor: pointer;">25%</button>
                        <button class="pct-btn" data-pct="0.50" style="flex: 1; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 4px 0; border-radius: 4px; cursor: pointer;">50%</button>
                        <button class="pct-btn" data-pct="0.75" style="flex: 1; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 4px 0; border-radius: 4px; cursor: pointer;">75%</button>
                        <button class="pct-btn" data-pct="1.00" style="flex: 1; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 4px 0; border-radius: 4px; cursor: pointer;">100%</button>
                    </div>

                    <!-- Bracket TP / SL -->
                    <div style="background: var(--vela-bg-panel, #121215); border: 1px solid var(--vela-border, #262629); border-radius: 6px; padding: 8px 10px; margin-bottom: 14px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                            <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer;">
                                <input id="chk-tp" type="checkbox" /> Take Profit
                            </label>
                            <input id="input-tp" type="number" step="any" placeholder="TP Price" disabled style="width: 100px; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-up, #a7be94); border-radius: 3px; padding: 3px 6px; font-size: 11px; outline: none; text-align: right;" />
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer;">
                                <input id="chk-sl" type="checkbox" /> Stop Loss
                            </label>
                            <input id="input-sl" type="number" step="any" placeholder="SL Price" disabled style="width: 100px; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-down, #af6870); border-radius: 3px; padding: 3px 6px; font-size: 11px; outline: none; text-align: right;" />
                        </div>
                    </div>

                    <!-- Action Submit Button -->
                    <button id="btn-place-order" style="width: 100%; padding: 12px; font-size: 14px; font-weight: 800; border-radius: 6px; border: none; background: var(--vela-up, #a7be94); color: var(--vela-button-light-text, #121215); cursor: pointer; transition: filter 120ms;">BUY / LONG BTCUSDT</button>

                    <div id="trade-msg" style="margin-top: 8px; font-size: 11px; text-align: center; color: var(--vela-text-muted, #46474b);"></div>
                </div>
            `;

            // Wire UI events
            const envTestnet = body.querySelector('#env-testnet-btn');
            const envProd = body.querySelector('#env-prod-btn');
            const sideBuy = body.querySelector('#btn-side-buy');
            const sideSell = body.querySelector('#btn-side-sell');
            const typeMarket = body.querySelector('#type-market-btn');
            const typeLimit = body.querySelector('#type-limit-btn');
            const typeStop = body.querySelector('#type-stop-btn');
            const priceGroup = body.querySelector('#field-price-group');
            const placeBtn = body.querySelector('#btn-place-order');
            const chkTp = body.querySelector('#chk-tp') as HTMLInputElement;
            const inputTp = body.querySelector('#input-tp') as HTMLInputElement;
            const chkSl = body.querySelector('#chk-sl') as HTMLInputElement;
            const inputSl = body.querySelector('#input-sl') as HTMLInputElement;
            const inputQty = body.querySelector('#input-order-qty') as HTMLInputElement;
            const inputPrice = body.querySelector('#input-order-price') as HTMLInputElement;
            const tradeMsg = body.querySelector('#trade-msg');

            const refreshSideAndButton = () => {
                const isBuy = state.side === 'BUY';
                if (sideBuy && sideSell && placeBtn) {
                    sideBuy.style.background = isBuy ? 'var(--vela-up, #a7be94)' : 'var(--vela-bg-card, #232429)';
                    sideBuy.style.color = isBuy ? 'var(--vela-button-light-text, #121215)' : 'var(--vela-text-secondary, #757882)';
                    sideSell.style.background = !isBuy ? 'var(--vela-down, #af6870)' : 'var(--vela-bg-card, #232429)';
                    sideSell.style.color = !isBuy ? 'var(--vela-button-light-text, #121215)' : 'var(--vela-text-secondary, #757882)';
                    placeBtn.style.background = isBuy ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
                    placeBtn.style.color = 'var(--vela-button-light-text, #121215)';
                    placeBtn.textContent = `${isBuy ? 'BUY / LONG' : 'SELL / SHORT'} ${state.symbol}`;
                }
            };

            updateTicketSymbolCallback = () => {
                refreshSideAndButton();
            };

            envTestnet?.addEventListener('click', () => {
                state.isTestnet = true;
                envTestnet.style.border = '1px solid var(--vela-warning, #fde047)';
                envTestnet.style.background = 'var(--vela-warning-bg, #29261a)';
                envTestnet.style.color = 'var(--vela-warning, #fde047)';
                if (envProd) {
                    envProd.style.border = '1px solid var(--vela-border, #262629)';
                    envProd.style.background = 'var(--vela-bg-card, #232429)';
                    envProd.style.color = 'var(--vela-text-secondary, #757882)';
                }
                const badge = document.getElementById('strip-env-badge');
                if (badge) {
                    badge.textContent = 'BINANCE TESTNET';
                    badge.style.color = 'var(--vela-warning, #fde047)';
                    badge.style.background = 'var(--vela-warning-bg, #29261a)';
                }
                fetchAccount();
                fetchOrders(state.symbol);
            });

            envProd?.addEventListener('click', () => {
                state.isTestnet = false;
                envProd.style.border = '1px solid var(--vela-up, #a7be94)';
                envProd.style.background = 'var(--vela-up-selected-bg, #363a38)';
                envProd.style.color = 'var(--vela-up, #a7be94)';
                if (envTestnet) {
                    envTestnet.style.border = '1px solid var(--vela-border, #262629)';
                    envTestnet.style.background = 'var(--vela-bg-card, #232429)';
                    envTestnet.style.color = 'var(--vela-text-secondary, #757882)';
                }
                const badge = document.getElementById('strip-env-badge');
                if (badge) {
                    badge.textContent = 'BINANCE PRODUCTION';
                    badge.style.color = 'var(--vela-up, #a7be94)';
                    badge.style.background = 'var(--vela-up-selected-bg, #363a38)';
                }
                fetchAccount();
                fetchOrders(state.symbol);
            });

            sideBuy?.addEventListener('click', () => { state.side = 'BUY'; refreshSideAndButton(); });
            sideSell?.addEventListener('click', () => { state.side = 'SELL'; refreshSideAndButton(); });

            typeMarket?.addEventListener('click', () => {
                state.orderType = 'MARKET';
                if (priceGroup) (priceGroup as HTMLElement).style.display = 'none';
                typeMarket.style.background = 'var(--vela-bg-chip, #292a2f)'; typeMarket.style.color = 'var(--vela-text-primary, #eeeef1)';
                if (typeLimit) { typeLimit.style.background = 'transparent'; typeLimit.style.color = 'var(--vela-text-secondary, #757882)'; }
                if (typeStop) { typeStop.style.background = 'transparent'; typeStop.style.color = 'var(--vela-text-secondary, #757882)'; }
            });

            typeLimit?.addEventListener('click', () => {
                state.orderType = 'LIMIT';
                if (priceGroup) (priceGroup as HTMLElement).style.display = 'block';
                typeLimit.style.background = 'var(--vela-bg-chip, #292a2f)'; typeLimit.style.color = 'var(--vela-text-primary, #eeeef1)';
                if (typeMarket) { typeMarket.style.background = 'transparent'; typeMarket.style.color = 'var(--vela-text-secondary, #757882)'; }
                if (typeStop) { typeStop.style.background = 'transparent'; typeStop.style.color = 'var(--vela-text-secondary, #757882)'; }
            });

            typeStop?.addEventListener('click', () => {
                state.orderType = 'STOP_MARKET';
                if (priceGroup) (priceGroup as HTMLElement).style.display = 'block';
                typeStop.style.background = 'var(--vela-bg-chip, #292a2f)'; typeStop.style.color = 'var(--vela-text-primary, #eeeef1)';
                if (typeMarket) { typeMarket.style.background = 'transparent'; typeMarket.style.color = 'var(--vela-text-secondary, #757882)'; }
                if (typeLimit) { typeLimit.style.background = 'transparent'; typeLimit.style.color = 'var(--vela-text-secondary, #757882)'; }
            });

            chkTp?.addEventListener('change', () => {
                inputTp.disabled = !chkTp.checked;
                state.takeProfit = chkTp.checked ? inputTp.value : '';
            });
            inputTp?.addEventListener('input', () => {
                state.takeProfit = chkTp.checked ? inputTp.value : '';
            });

            chkSl?.addEventListener('change', () => {
                inputSl.disabled = !chkSl.checked;
                state.stopLoss = chkSl.checked ? inputSl.value : '';
            });
            inputSl?.addEventListener('input', () => {
                state.stopLoss = chkSl.checked ? inputSl.value : '';
            });

            body.querySelectorAll('.pct-btn').forEach(btn => {
                btn.addEventListener('click', (e: any) => {
                    const pct = parseFloat(e.target.getAttribute('data-pct'));
                    if (state.availableBalance > 0) {
                        const notional = state.availableBalance * pct * state.leverage;
                        // Approximate BTC price for sizing if stats not fetched
                        const approxPrice = 85000;
                        const qty = (notional / approxPrice).toFixed(3);
                        inputQty.value = qty;
                    }
                });
            });

            placeBtn?.addEventListener('click', async () => {
                const qty = parseFloat(inputQty.value || '0');
                if (qty <= 0) {
                    if (tradeMsg) tradeMsg.textContent = 'Please enter a valid quantity';
                    return;
                }

                if (placeBtn) placeBtn.textContent = 'Submitting...';
                try {
                    const payload: any = {
                        symbol: state.symbol,
                        side: state.side,
                        type: state.orderType,
                        quantity: qty,
                        testnet: state.isTestnet
                    };

                    if (state.orderType === 'LIMIT') {
                        payload.price = parseFloat(inputPrice.value);
                    } else if (state.orderType === 'STOP_MARKET') {
                        payload.stopPrice = parseFloat(inputPrice.value);
                    }

                    if (chkTp.checked && parseFloat(inputTp.value) > 0) {
                        payload.takeProfitPrice = parseFloat(inputTp.value);
                    }
                    if (chkSl.checked && parseFloat(inputSl.value) > 0) {
                        payload.stopLossPrice = parseFloat(inputSl.value);
                    }

                    const res = await fetch('/api/binance/order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const json = await res.json();
                    if (!res.ok || json.error) {
                        throw new Error(json.error || 'Failed to place order');
                    }

                    ctx.toast(`Order placed: ${state.side} ${qty} ${state.symbol}`, 'info');
                    if (tradeMsg) tradeMsg.textContent = `Order placed: #${json.main?.orderId || 'OK'}`;
                    fetchAccount();
                    fetchOrders(state.symbol);
                } catch (e: any) {
                    ctx.toast(`Order failed: ${e.message}`, 'error');
                    if (tradeMsg) tradeMsg.textContent = `Error: ${e.message}`;
                } finally {
                    refreshSideAndButton();
                }
            });

            return {
                onChart: (chart) => {
                    const s = ctx.symbol;
                    if (s) {
                        setActiveSymbol(s);
                    }
                },
                onOpen: () => {
                    fetchAccount();
                    fetchOrders(state.symbol);
                },
                destroy: () => {}
            };
        }
    });
}

// ── Top Bar Action [ ⇄ Trade ] Button ───────────────────────────────────────────
export function registerTradeButton() {
    registerWidgetAction({
        id: 'trade.toggle',
        target: 'topbar',
        align: 'right',
        order: 5,
        label: 'Trade',
        icon: 'trade',
        run: (ctx) => {
            ctx.togglePanel('trade.panel');
        }
    });
}

// ── Pine Script Runtime Editor Dialog ─────────────────────────────────────────
let pineDialog: Dialog | null = null;
let pineEditorArea: HTMLTextAreaElement | null = null;
let pineStatus: HTMLElement | null = null;
let pineRunBtn: HTMLButtonElement | null = null;

const DEFAULT_PINE_SCRIPT = `//@version=5
indicator("EMA Ribbon & Trend Cloud", overlay=true)

fast = ta.ema(close, 9)
med = ta.ema(close, 21)
slow = ta.ema(close, 55)

plot(fast, "EMA 9", color=#00e676, linewidth=2)
plot(med, "EMA 21", color=#ffeb3b, linewidth=2)
plot(slow, "EMA 55", color=#ff5252, linewidth=2)

fill(plot(fast), plot(med), color=fast > med ? color.new(#00e676, 80) : color.new(#ff5252, 80))
`;

export function registerPineEditor() {
    registerWidgetAction({
        id: 'pine.editor',
        target: 'topbar',
        align: 'right',
        order: 3,
        label: 'Pine Script',
        icon: 'code',
        run: (ctx) => {
            if (!pineDialog) {
                const container = document.createElement('div');
                container.style.cssText = 'display: flex; flex-direction: column; gap: 10px; width: 560px; max-width: 85vw;';

                pineEditorArea = document.createElement('textarea');
                pineEditorArea.value = DEFAULT_PINE_SCRIPT;
                pineEditorArea.spellcheck = false;
                pineEditorArea.style.cssText = `
                    width: 100%;
                    box-sizing: border-box;
                    height: 240px;
                    background: var(--vela-bg-main, #202126);
                    color: var(--vela-text-primary, #eeeef1);
                    border: 1px solid var(--vela-border, #262629);
                    border-radius: 6px;
                    padding: 10px;
                    font-family: 'JetBrains Mono', 'Fira Code', monospace;
                    font-size: 12px;
                    line-height: 1.5;
                    outline: none;
                `;

                const btnRow = document.createElement('div');
                btnRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between;';

                pineRunBtn = document.createElement('button');
                pineRunBtn.textContent = 'Compile & Run on Chart';
                pineRunBtn.style.cssText = `
                    background: var(--vela-up, #a7be94);
                    color: var(--vela-bg-panel, #121215);
                    border: none;
                    border-radius: 4px;
                    padding: 8px 16px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                `;

                pineStatus = document.createElement('div');
                pineStatus.style.cssText = 'font-size: 12px; color: var(--vela-text-secondary, #757882);';

                btnRow.appendChild(pineRunBtn);
                btnRow.appendChild(pineStatus);
                container.appendChild(pineEditorArea);
                container.appendChild(btnRow);

                pineDialog = new Dialog({
                    title: 'Pine Script v5 Runtime (Worker)',
                    host: ctx.host,
                    closeOnInteractOutside: true,
                    content: (body) => body.append(container),
                });
            }

            pineRunBtn!.onclick = async () => {
                if (!pineEditorArea || !pineStatus) return;
                pineStatus.style.color = 'var(--vela-text-secondary, #757882)';
                pineStatus.textContent = 'Compiling via PineWorkerEngine...';
                try {
                    const res = await ctx.chart.runIndicator(pineEditorArea.value);
                    if (res.ok) {
                        pineStatus.style.color = 'var(--vela-up, #a7be94)';
                        pineStatus.textContent = `✓ ${res.handle?.title || 'Script'} rendered on active chart`;
                    } else {
                        pineStatus.style.color = 'var(--vela-down, #af6870)';
                        pineStatus.textContent = `✗ ${res.error?.message || 'Execution error'}`;
                    }
                } catch (err: any) {
                    pineStatus.style.color = 'var(--vela-down, #af6870)';
                    pineStatus.textContent = `✗ ${err.message}`;
                }
            };

            pineStatus!.textContent = '';
            pineDialog.show();
            setTimeout(() => pineEditorArea?.focus(), 50);
        }
    });
}

// ── TradingView-Style Bar Replay ──────────────────────────────────────────────
let wsInstance: VelaWorkspace | null = null;
export function setWorkspaceInstance(ws: VelaWorkspace) {
    wsInstance = ws;
}

export function registerReplayButton() {
    let replayDock: HTMLElement | null = null;
    let cutModeActive = false;
    let cutLineEl: HTMLElement | null = null;

    const armCutMode = () => {
        cutModeActive = true;

        if (!cutLineEl) {
            cutLineEl = document.createElement('div');
            cutLineEl.id = 'tv-replay-cut-line';
            cutLineEl.style.cssText = `
                position: fixed;
                top: 0;
                bottom: 0;
                width: 2px;
                background: var(--vela-down, #af6870);
                pointer-events: none;
                z-index: 9999;
                display: none;
                border-left: 2px dashed var(--vela-down, #af6870);
            `;

            const cutBadge = document.createElement('div');
            cutBadge.style.cssText = `
                position: absolute;
                top: 50px;
                left: 8px;
                background: var(--vela-down, #af6870);
                color: var(--vela-text-primary, #eeeef1);
                padding: 3px 8px;
                font-size: 11px;
                font-weight: 700;
                border-radius: 4px;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                font-family: -apple-system, system-ui, sans-serif;
            `;
            cutBadge.textContent = '✂ Click to Jump to Bar';
            cutLineEl.appendChild(cutBadge);
            document.body.appendChild(cutLineEl);
        }

        const onMouseMove = (e: MouseEvent) => {
            if (!cutModeActive || !cutLineEl) return;
            cutLineEl.style.display = 'block';
            cutLineEl.style.left = `${e.clientX}px`;
        };

        const onClick = async (e: MouseEvent) => {
            if (!cutModeActive || !wsInstance) return;
            cutModeActive = false;
            if (cutLineEl) cutLineEl.style.display = 'none';

            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('click', onClick, true);

            // Calculate timestamp of bar at click position
            const range = wsInstance.active.chart.getVisibleRange();
            const hostRect = wsInstance.active.host.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - hostRect.left) / hostRect.width));
            const from = range ? Math.round(range.from + ratio * (range.to - range.from)) : Date.now() - 3600_000;

            await wsInstance.replay.start({ from });
            showReplayDock();
        };

        window.addEventListener('mousemove', onMouseMove);
        setTimeout(() => {
            window.addEventListener('click', onClick, { capture: true, once: true });
        }, 100);
    };

    const showReplayDock = () => {
        if (!replayDock) {
            replayDock = document.createElement('div');
            replayDock.id = 'tv-replay-player-dock';
            replayDock.style.cssText = `
                position: fixed;
                bottom: 195px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 99999;
                background: var(--vela-bg-card, #232429);
                border: 1px solid var(--vela-border, #262629);
                box-shadow: 0 10px 30px rgba(0,0,0,0.8);
                border-radius: 8px;
                padding: 6px 14px;
                display: flex;
                align-items: center;
                gap: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 12px;
                color: var(--vela-text-primary, #eeeef1);
                user-select: none;
            `;

            replayDock.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: var(--vela-down, #af6870);">
                    <span>⮌ REPLAY</span>
                </div>
                <div style="border-left: 1px solid var(--vela-border, #262629); height: 16px;"></div>
                <button id="tv-dock-jump" title="Jump to another bar" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); border-radius: 4px; padding: 5px 9px; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 4px;">✂ Jump</button>
                <button id="tv-dock-step" title="Step forward 1 bar" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); border-radius: 4px; padding: 5px 9px; font-size: 11px; cursor: pointer;">◀ Step</button>
                <button id="tv-dock-play" title="Play / Pause" style="background: var(--vela-up, #a7be94); border: none; color: var(--vela-bg-panel, #121215); font-weight: 700; border-radius: 4px; padding: 5px 12px; font-size: 11px; cursor: pointer;">▶ Play</button>
                <div style="display: flex; gap: 3px;">
                    <button class="tv-dock-spd" data-spd="100" style="background: var(--vela-bg-main, #202126); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); border-radius: 3px; padding: 3px 6px; font-size: 10px; cursor: pointer;">0.1s</button>
                    <button class="tv-dock-spd" data-spd="500" style="background: var(--vela-bg-main, #202126); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); border-radius: 3px; padding: 3px 6px; font-size: 10px; cursor: pointer;">0.5s</button>
                    <button class="tv-dock-spd" data-spd="1000" style="background: var(--vela-up, #a7be94); border: 1px solid var(--vela-up, #a7be94); color: var(--vela-bg-panel, #121215); border-radius: 3px; padding: 3px 6px; font-size: 10px; font-weight: 700; cursor: pointer;">1s</button>
                    <button class="tv-dock-spd" data-spd="3000" style="background: var(--vela-bg-main, #202126); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); border-radius: 3px; padding: 3px 6px; font-size: 10px; cursor: pointer;">3s</button>
                </div>
                <div style="border-left: 1px solid var(--vela-border, #262629); height: 16px;"></div>
                <button id="tv-dock-close" title="Exit Bar Replay" style="background: transparent; border: none; color: var(--vela-down, #af6870); font-size: 14px; font-weight: 700; cursor: pointer; padding: 2px 6px;">✕</button>
            `;

            document.body.appendChild(replayDock);

            const btnJump = replayDock.querySelector('#tv-dock-jump')!;
            const btnStep = replayDock.querySelector('#tv-dock-step')!;
            const btnPlay = replayDock.querySelector('#tv-dock-play')!;
            const btnClose = replayDock.querySelector('#tv-dock-close')!;
            let intervalMs = 1000;

            const updatePlaying = (playing: boolean) => {
                btnPlay.textContent = playing ? '⏸ Pause' : '▶ Play';
                btnPlay.style.background = playing ? 'var(--vela-warning, #fde047)' : 'var(--vela-up, #a7be94)';
                btnPlay.style.color = 'var(--vela-bg-panel, #121215)';
            };

            btnJump.addEventListener('click', () => {
                if (wsInstance) wsInstance.replay.pause();
                updatePlaying(false);
                armCutMode();
            });

            btnStep.addEventListener('click', () => {
                if (wsInstance) {
                    wsInstance.replay.pause();
                    wsInstance.replay.step();
                }
                updatePlaying(false);
            });

            btnPlay.addEventListener('click', () => {
                if (!wsInstance) return;
                if (wsInstance.replay.state.playing) {
                    wsInstance.replay.pause();
                    updatePlaying(false);
                } else {
                    wsInstance.replay.play(intervalMs);
                    updatePlaying(true);
                }
            });

            replayDock.querySelectorAll('.tv-dock-spd').forEach(btn => {
                btn.addEventListener('click', (e: any) => {
                    const spd = parseInt(e.target.getAttribute('data-spd'), 10);
                    intervalMs = spd;
                    replayDock?.querySelectorAll('.tv-dock-spd').forEach((b: any) => {
                        b.style.background = 'var(--vela-bg-main, #202126)';
                        b.style.borderColor = 'var(--vela-border, #262629)';
                        b.style.color = 'var(--vela-text-secondary, #757882)';
                        b.style.fontWeight = 'normal';
                    });
                    e.target.style.background = 'var(--vela-up, #a7be94)';
                    e.target.style.borderColor = 'var(--vela-up, #a7be94)';
                    e.target.style.color = 'var(--vela-bg-panel, #121215)';
                    e.target.style.fontWeight = '700';

                    if (wsInstance && wsInstance.replay.state.playing) {
                        wsInstance.replay.play(spd);
                    }
                });
            });

            btnClose.addEventListener('click', () => {
                if (wsInstance) wsInstance.replay.stop();
                updatePlaying(false);
                replayDock!.style.display = 'none';
            });
        }

        replayDock.style.display = 'flex';
    };

    registerWidgetAction({
        id: 'replay.toggle',
        target: 'topbar',
        align: 'left',
        order: 25,
        label: 'Replay',
        icon: 'replay',
        run: () => {
            if (wsInstance?.replay.state.active || (replayDock && replayDock.style.display === 'flex')) {
                if (wsInstance) wsInstance.replay.stop();
                if (replayDock) replayDock.style.display = 'none';
                if (cutLineEl) cutLineEl.style.display = 'none';
                cutModeActive = false;
            } else {
                showReplayDock();
                armCutMode();
            }
        }
    });
}

// ── Docked Bottom Account Drawer (Unified into Range Bar) ──────────────────────
export function mountBottomAccountStrip(ws: VelaWorkspace) {
    const bottombarEl = document.querySelector('.vela-widget-bottombar') as HTMLElement;
    if (!bottombarEl) {
        setTimeout(() => mountBottomAccountStrip(ws), 100);
        return;
    }

    // Clean up any legacy standalone strip
    document.getElementById('velo-bottom-account-drawer')?.remove();
    document.getElementById('velo-bottom-account-panel')?.remove();

    // 1. Create the Expandable Account Drawer Tray immediately ABOVE the Range Bar
    const panel = document.createElement('div');
    panel.id = 'velo-bottom-account-panel';
    panel.style.cssText = `
        height: 0px;
        display: none;
        background: var(--vela-bg-bar, #191a1e);
        border-top: 1px solid var(--vela-border, #262629);
        border-bottom: 1px solid var(--vela-border, #262629);
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: var(--vela-text-secondary, #757882);
        overflow: hidden;
        flex: none;
        z-index: 10;
        transition: height 0.15s ease;
    `;

    panel.innerHTML = `
        <div style="flex: 1; overflow: auto; position: relative;">
            <div id="positions-table-view" style="position: absolute; inset: 0; overflow: auto;"></div>
            <div id="orders-table-view" style="position: absolute; inset: 0; overflow: auto; display: none;"></div>
            <div id="history-table-view" style="position: absolute; inset: 0; overflow: auto; display: none;"></div>
            <div id="journal-table-view" style="position: absolute; inset: 0; overflow: auto; display: none;"></div>
        </div>
    `;

    positionsContainer = panel.querySelector('#positions-table-view');
    ordersContainer = panel.querySelector('#orders-table-view');
    historyContainer = panel.querySelector('#history-table-view');
    journalContainer = panel.querySelector('#journal-table-view');

    // Insert immediately above the bottombar
    bottombarEl.parentElement?.insertBefore(panel, bottombarEl);

    // 2. Embed Navigation Tabs & Broker Status directly inside the Range Bar
    const spacer = bottombarEl.querySelector('.vela-bb-spacer');
    if (spacer) {
        spacer.innerHTML = `
            <div style="display: flex; align-items: center; width: 100%; height: 100%;">
                <div style="width: 1px; height: 16px; background: var(--vela-border, #262629); margin: 0 8px; flex: none;"></div>
                <div id="velo-dock-tabs" style="display: flex; gap: 2px; align-items: center; flex: none;">
                    <button id="tab-positions-btn" style="background: transparent; color: var(--vela-text-secondary, #757882); border: none; font-size: 11px; font-weight: 600; padding: 4px 10px; cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">Positions (<span id="pos-count">0</span>)</button>
                    <button id="tab-orders-btn" style="background: transparent; color: var(--vela-text-secondary, #757882); border: none; font-size: 11px; font-weight: 600; padding: 4px 10px; cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">Orders (<span id="ord-count">0</span>)</button>
                    <button id="tab-history-btn" style="background: transparent; color: var(--vela-text-secondary, #757882); border: none; font-size: 11px; font-weight: 600; padding: 4px 10px; cursor: pointer; border-radius: 4px;">Order History</button>
                    <button id="tab-journal-btn" style="background: transparent; color: var(--vela-text-secondary, #757882); border: none; font-size: 11px; font-weight: 600; padding: 4px 10px; cursor: pointer; border-radius: 4px;">Trade Journal</button>
                </div>
                <div style="flex: 1 1 auto;"></div>
                <div style="display: flex; align-items: center; gap: 8px; flex: none; margin-right: 6px;">
                    <span id="strip-env-badge" style="color: var(--vela-warning, #fde047); font-weight: 700; font-size: 10px; background: var(--vela-warning-bg, #29261a); padding: 2px 6px; border-radius: 4px;">BINANCE TESTNET</span>
                    <span id="strip-avail-val" style="color: var(--vela-text-primary, #eeeef1); font-size: 11px; font-weight: 600;">$0.00</span>
                    <button id="strip-toggle-btn" title="Toggle Account Panel" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                        <span>Panel</span> <span id="strip-toggle-chevron">▲</span>
                    </button>
                </div>
            </div>
        `;
    }

    let activeTab: 'positions' | 'orders' | 'history' | 'journal' = 'positions';
    let isPanelOpen = false;

    const tabPos = document.getElementById('tab-positions-btn');
    const tabOrd = document.getElementById('tab-orders-btn');
    const tabHist = document.getElementById('tab-history-btn');
    const tabJourn = document.getElementById('tab-journal-btn');
    const toggleBtn = document.getElementById('strip-toggle-btn');
    const toggleChevron = document.getElementById('strip-toggle-chevron');

    const setTabActiveStyle = (btn: HTMLElement | null, isActive: boolean) => {
        if (!btn) return;
        if (isActive) {
            btn.style.background = 'var(--vela-bg-chip, #292a2f)';
            btn.style.color = 'var(--vela-text-primary, #eeeef1)';
            btn.style.borderBottom = '2px solid var(--vela-up, #a7be94)';
        } else {
            btn.style.background = 'transparent';
            btn.style.color = 'var(--vela-text-secondary, #757882)';
            btn.style.borderBottom = 'none';
        }
    };

    const openPanel = () => {
        isPanelOpen = true;
        panel.style.display = 'flex';
        panel.style.height = '220px';
        if (toggleChevron) toggleChevron.textContent = '▼';
    };

    const closePanel = () => {
        isPanelOpen = false;
        panel.style.height = '0px';
        panel.style.display = 'none';
        if (toggleChevron) toggleChevron.textContent = '▲';
        setTabActiveStyle(tabPos, false);
        setTabActiveStyle(tabOrd, false);
        setTabActiveStyle(tabHist, false);
        setTabActiveStyle(tabJourn, false);
    };

    const switchTab = (tab: 'positions' | 'orders' | 'history' | 'journal') => {
        if (isPanelOpen && activeTab === tab) {
            closePanel();
            return;
        }

        activeTab = tab;
        openPanel();

        setTabActiveStyle(tabPos, tab === 'positions');
        setTabActiveStyle(tabOrd, tab === 'orders');
        setTabActiveStyle(tabHist, tab === 'history');
        setTabActiveStyle(tabJourn, tab === 'journal');

        if (positionsContainer) positionsContainer.style.display = tab === 'positions' ? 'block' : 'none';
        if (ordersContainer) ordersContainer.style.display = tab === 'orders' ? 'block' : 'none';
        if (historyContainer) historyContainer.style.display = tab === 'history' ? 'block' : 'none';
        if (journalContainer) journalContainer.style.display = tab === 'journal' ? 'block' : 'none';

        if (tab === 'positions') fetchAccount();
        else if (tab === 'orders') fetchOrders(state.symbol);
        else if (tab === 'history') fetchOrderHistory(state.symbol);
        else if (tab === 'journal') fetchTradeHistory(state.symbol);
    };

    tabPos?.addEventListener('click', () => switchTab('positions'));
    tabOrd?.addEventListener('click', () => switchTab('orders'));
    tabHist?.addEventListener('click', () => switchTab('history'));
    tabJourn?.addEventListener('click', () => switchTab('journal'));

        const envBadge = document.getElementById('strip-env-badge');
    if (envBadge) {
        envBadge.style.cursor = 'pointer';
        envBadge.title = 'Click to toggle Testnet / Production';
        envBadge.addEventListener('click', () => {
            if (state.isTestnet) {
                const prodBtn = document.getElementById('env-prod-btn');
                if (prodBtn) {
                    prodBtn.click();
                } else {
                    state.isTestnet = false;
                    envBadge.textContent = 'BINANCE PRODUCTION';
                    envBadge.style.color = 'var(--vela-up, #a7be94)';
                    envBadge.style.background = 'var(--vela-up-selected-bg, #363a38)';
                    fetchAccount();
                    fetchOrders(state.symbol);
                    fetchOrderHistory(state.symbol);
                    fetchTradeHistory(state.symbol);
                }
            } else {
                const testBtn = document.getElementById('env-testnet-btn');
                if (testBtn) {
                    testBtn.click();
                } else {
                    state.isTestnet = true;
                    envBadge.textContent = 'BINANCE TESTNET';
                    envBadge.style.color = 'var(--vela-warning, #fde047)';
                    envBadge.style.background = 'var(--vela-warning-bg, #29261a)';
                    fetchAccount();
                    fetchOrders(state.symbol);
                    fetchOrderHistory(state.symbol);
                    fetchTradeHistory(state.symbol);
                }
            }
        });
    }

    toggleBtn?.addEventListener('click', () => {
        if (isPanelOpen) closePanel();
        else switchTab(activeTab);
    });

    // Initial fetches
    fetchAccount();
    fetchOrders(state.symbol);
    fetchOrderHistory(state.symbol);
    fetchTradeHistory(state.symbol);

    setInterval(() => {
        fetchAccount();
    }, 2500);
}
