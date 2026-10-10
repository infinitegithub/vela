import { registerSidePanel, registerWidgetAction, registerIcon } from '../src/plugin';
import type { WidgetContext } from '../src/widget/WidgetContext';
import type { VelaWorkspace } from '../src/workspace';
import { Dialog } from '../src/ui';
import { timeframeToMs } from '../src/data/timeframe';
import { BINANCE_WHITE_ICON, BINANCE_YELLOW_ICON } from './binance-icons-data';

registerIcon('trade', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>');
registerIcon('code', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>');
registerIcon('replay', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>');

// State management for trading suite
export interface TradeState {
    isTestnet: boolean;
    symbol: string;
    currentPrice: number;
    inputUnit: 'USDT_TOTAL' | 'USDT_MARGIN' | 'QTY';
    constraints: {
        stepSize: number;
        precision: number;
        minQty: number;
        minNotional: number;
        tickSize: number;
        pricePrecision: number;
    };
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

let wsInstance: VelaWorkspace | null = null;

function toast(message: string, kind: 'info' | 'success' | 'warning' | 'error' = 'info') {
    if (wsInstance?.toast) {
        wsInstance.toast(message, kind);
    } else {
        console.log(`[toast ${kind}]`, message);
    }
}

export function getSymbolLogoHtml(symbol: string, size = 16): string {
    const clean = String(symbol || '').toUpperCase().replace(/^BINANCE:/, '').replace(/\.P$/, '');
    const base = clean.replace(/[-_/]?(USDT|USDC|USD1|USDS|BUSD|USD|EUR|PERP)$/i, '') || clean;
    const url = `https://crypto-icons.ledger.com/${encodeURIComponent(base)}.png`;
    const initials = base.slice(0, 2);
    const colors = ['#2962ff', '#00b0ff', '#26a69a', '#7e57c2', '#f0b90b', '#e573b5', '#ff6d00'];
    let hash = 0;
    for (let i = 0; i < base.length; i++) hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
    const bgColor = colors[hash % colors.length];

    return `<span style="display: inline-flex; align-items: center; justify-content: center; width: ${size}px; height: ${size}px; border-radius: 50%; overflow: hidden; background: ${bgColor}; flex: none; vertical-align: middle; margin-right: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">` +
        `<img src="${url}" alt="${base}" style="width: 100%; height: 100%; border-radius: 50%; display: block; object-fit: cover;" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-block';" />` +
        `<span style="display: none; font-size: ${Math.round(size * 0.52)}px; font-weight: 700; color: #ffffff; line-height: 1; text-transform: uppercase;">${initials}</span>` +
    `</span>`;
}

export function switchChartToSymbol(symbol: string, targetPrice?: number) {
    if (!symbol) return;
    const clean = symbol.replace(/.*:/, '').replace(/\.P$/i, '').toUpperCase().trim();
    if (!clean) return;

    if (wsInstance) {
        let targetCell = wsInstance.cells().find(c => {
            const cSym = (c.symbol || '').toUpperCase().replace(/^BINANCE:/, '').replace(/\.P$/, '');
            return cSym === clean;
        });

        if (targetCell) {
            try {
                wsInstance.setActiveCell(targetCell.id);
            } catch {}
        } else {
            targetCell = wsInstance.active || wsInstance.cells()[0];
            if (targetCell) {
                const canonical = `BINANCE:${clean}.P`;
                void targetCell.chart.setMarket({ symbol: canonical });
            }
        }

        if (targetCell && targetPrice && targetPrice > 0) {
            try {
                const t = Date.now();
                const span = 15 * 60_000;
                targetCell.chart.setVisibleRange({ from: t - span, to: t + span });
            } catch {}
        }
    }

    setActiveSymbol(clean);
    toast(`Chart switched to ${clean}${targetPrice ? ` ($${targetPrice.toFixed(2)})` : ''}`, 'info');
}

const savedEnv = typeof localStorage !== "undefined" ? localStorage.getItem("vela-binance-env") : null;
export const state: TradeState = {
    isTestnet: savedEnv ? savedEnv === "testnet" : true,
    symbol: 'BTCUSDT',
    currentPrice: 0,
    inputUnit: 'USDT_TOTAL',
    constraints: {
        stepSize: 0.001,
        precision: 3,
        minQty: 0.001,
        minNotional: 50,
        tickSize: 0.1,
        pricePrecision: 2
    },
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

let updateConversionUICallback: (() => void) | null = null;

export async function fetchStats(symbol: string) {
    try {
        const res = await fetch(`/api/binance/stats?symbol=${encodeURIComponent(symbol)}`);
        if (res.ok) {
            const data = await res.json();
            if (data) {
                state.currentPrice = data.lastPrice || data.markPrice || 0;
                if (data.constraints) {
                    state.constraints = data.constraints;
                }
                if (updateConversionUICallback) {
                    updateConversionUICallback();
                }
            }
        }
    } catch (e) {
        // ignore
    }
}

export function setEnvironment(isTestnet: boolean) {
    state.isTestnet = isTestnet;
    try {
        localStorage.setItem("vela-binance-env", isTestnet ? "testnet" : "prod");
        localStorage.setItem("vela-testnet", isTestnet ? "true" : "false");
    } catch {}

    state.openOrders = [];
    state.activePositions = [];
    state.orderHistory = [];
    state.tradeHistory = [];
    state.takeProfit = "";
    state.stopLoss = "";

    const chkTp = document.querySelector("#chk-tp") as HTMLInputElement | null;
    const inputTp = document.querySelector("#input-tp") as HTMLInputElement | null;
    if (chkTp && inputTp) { chkTp.checked = false; inputTp.disabled = true; inputTp.value = ""; }

    const chkSl = document.querySelector("#chk-sl") as HTMLInputElement | null;
    const inputSl = document.querySelector("#input-sl") as HTMLInputElement | null;
    if (chkSl && inputSl) { chkSl.checked = false; inputSl.disabled = true; inputSl.value = ""; }

    updatePositionsUI();
    updateOrdersUI();
    updateAccountBalanceUI();

    const envTestnet = document.getElementById("env-testnet-btn");
    const envProd = document.getElementById("env-prod-btn");
    const badge = document.getElementById("strip-env-badge") as HTMLElement | null;
    const badgeIcon = document.getElementById("strip-env-icon") as HTMLImageElement | null;

    if (envTestnet && envProd) {
        const testIcon = envTestnet.querySelector('img');
        const prodIcon = envProd.querySelector('img');
        if (isTestnet) {
            envTestnet.style.border = "1px solid rgba(255, 255, 255, 0.45)";
            envTestnet.style.background = "rgba(255, 255, 255, 0.1)";
            envTestnet.style.color = "#ffffff";
            if (testIcon) testIcon.style.opacity = "1";

            envProd.style.border = "1px solid var(--vela-border, #262629)";
            envProd.style.background = "var(--vela-bg-card, #232429)";
            envProd.style.color = "var(--vela-text-secondary, #757882)";
            if (prodIcon) prodIcon.style.opacity = "0.45";
        } else {
            envProd.style.border = "1px solid #f0b90b";
            envProd.style.background = "rgba(240, 185, 11, 0.16)";
            envProd.style.color = "#f0b90b";
            if (prodIcon) prodIcon.style.opacity = "1";

            envTestnet.style.border = "1px solid var(--vela-border, #262629)";
            envTestnet.style.background = "var(--vela-bg-card, #232429)";
            envTestnet.style.color = "var(--vela-text-secondary, #757882)";
            if (testIcon) testIcon.style.opacity = "0.45";
        }
    }

    if (badge) {
        if (badgeIcon) {
            badgeIcon.src = isTestnet ? BINANCE_WHITE_ICON : BINANCE_YELLOW_ICON;
        }
        if (isTestnet) {
            badge.title = "Binance Testnet (Click to switch to Production Live)";
            badge.style.border = "1px solid rgba(255, 255, 255, 0.2)";
            badge.style.background = "rgba(255, 255, 255, 0.06)";
            badge.style.boxShadow = "none";
        } else {
            badge.title = "Binance Production Live (Click to switch to Testnet)";
            badge.style.border = "1px solid #f0b90b";
            badge.style.background = "rgba(240, 185, 11, 0.18)";
            badge.style.boxShadow = "0 0 8px rgba(240, 185, 11, 0.3)";
        }
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vela:env-changed', { detail: { isTestnet } }));
    }

    fetchAccount();
    fetchOrders(state.symbol);
    fetchOrderHistory(state.symbol);
    fetchTradeHistory();
}

let updateTicketSymbolCallback: (() => void) | null = null;

export function setActiveSymbol(symbol: string) {
    if (!symbol) return;
    let clean = symbol.replace(/.*:/, '').toUpperCase().trim();
    clean = clean.replace(/\.P$/i, '');
    if (clean.endsWith('-USD')) {
        clean = clean.replace(/-USD$/, 'USDT');
    }
    clean = clean.replace(/[^A-Z0-9]/g, '');
    if (!clean) return;
    if (state.symbol === clean) return;
    state.symbol = clean;
    if (updateTicketSymbolCallback) {
        updateTicketSymbolCallback();
    }
    fetchStats(clean);
    fetchOrders(clean);
    fetchOrderHistory(clean);
    fetchTradeHistory(clean);
}

const closedCooldowns = new Map<string, number>();

export function isSymbolInCloseCooldown(sym: string): boolean {
    if (!sym) return false;
    const canonical = sym.replace(/.*:/, '').replace(/\.P$/i, '').replace(/[-_]/g, '').toUpperCase();
    const expiry = closedCooldowns.get(canonical);
    if (!expiry) return false;
    if (Date.now() > expiry) {
        closedCooldowns.delete(canonical);
        return false;
    }
    return true;
}

export function markSymbolClosed(sym: string) {
    if (!sym) return;
    const canonical = sym.replace(/.*:/, '').replace(/\.P$/i, '').replace(/[-_]/g, '').toUpperCase();
    closedCooldowns.set(canonical, Date.now() + 6000);
}

export async function closePosition(symbol: string, side?: string, size?: number) {
    const canonical = symbol.replace(/.*:/, '').replace(/\.P$/i, '').replace(/[-_]/g, '').toUpperCase();
    
    // Find current position in state if side or size not passed
    const existing = state.activePositions.find((p: any) => p && p.symbol === canonical);
    const posSide = side || existing?.side || 'LONG';
    const posSize = size ?? existing?.size ?? 0;

    // 1. Mark cooldown for 6 seconds to suppress stale Binance replica echoes
    markSymbolClosed(canonical);

    // 2. IMMEDIATE OPTIMISTIC CLEANUP (0ms UI latency):
    state.activePositions = (state.activePositions || []).filter((p: any) => p && p.symbol !== canonical);
    state.openOrders = (state.openOrders || []).filter((o: any) => o && o.symbol !== canonical);

    // If currently viewing this symbol in ticket, clear SL/TP fields
    if (state.symbol === canonical) {
        state.takeProfit = '';
        state.stopLoss = '';
        const chkTp = document.querySelector('#chk-tp') as HTMLInputElement | null;
        const inputTp = document.querySelector('#input-tp') as HTMLInputElement | null;
        if (chkTp && inputTp) { chkTp.checked = false; inputTp.disabled = true; inputTp.value = ''; }
        const chkSl = document.querySelector('#chk-sl') as HTMLInputElement | null;
        const inputSl = document.querySelector('#input-sl') as HTMLInputElement | null;
        if (chkSl && inputSl) { chkSl.checked = false; inputSl.disabled = true; inputSl.value = ''; }
    }

    // 3. Immediately notify UI, DOM overlay & chart canvas
    updatePositionsUI();
    updateOrdersUI();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vela:position-closed', { detail: { symbol: canonical } }));
        window.dispatchEvent(new CustomEvent('vela:repaint-lines'));
    }

    // 4. Send API request to Binance
    if (posSize > 0) {
        try {
            toast(`Closing ${canonical} position...`, 'info');
            const res = await fetch('/api/binance/position/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: canonical, side: posSide, quantity: posSize, testnet: state.isTestnet })
            });
            const json = await res.json().catch(() => ({}));
            if (json.alreadyClosed) {
                toast(`✓ Position already closed on exchange`, 'info');
            } else if (res.ok) {
                toast(`✓ ${canonical} position closed`, 'success');
            } else {
                throw new Error(json.error || `HTTP ${res.status}`);
            }
        } catch (err: any) {
            console.error('[closePosition] Error closing position on exchange:', err);
            toast(`Close error: ${err.message}`, 'error');
            // If actual failure, remove cooldown and refresh from exchange
            closedCooldowns.delete(canonical);
            await Promise.all([fetchAccount(), fetchOrders()]);
            return;
        }
    }

    // Brief deferred refresh to catch updated margin / balance
    setTimeout(() => {
        fetchAccount();
        fetchOrders();
    }, 1200);
}

let previousActiveSymbols = new Set<string>();

export async function fetchAccount() {
    try {
        let res: Response;
        if (typeof AbortController !== 'undefined') {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4000);
            try {
                res = await fetch(`/api/binance/account?testnet=${state.isTestnet}&_t=${Date.now()}`, {
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timer);
            }
        } else {
            res = await fetch(`/api/binance/account?testnet=${state.isTestnet}&_t=${Date.now()}`);
        }

        if (res.ok) {
            const data = await res.json();
            state.availableBalance = data.availableBalance || 0;
            const rawPositions = data.positions || [];

            // Filter out any positions currently in closed cooldown to avoid slow-replica ghosts
            const currentPositions = rawPositions.filter((p: any) => {
                if (!p || !p.symbol) return false;
                return !isSymbolInCloseCooldown(p.symbol);
            });
            state.activePositions = currentPositions;

            const currentActiveSymbols = new Set<string>(
                currentPositions.map((p: any) => p && p.symbol).filter(Boolean)
            );

            // Detect if any position closed (e.g. SL or TP triggered on Binance, or closed externally)
            for (const sym of previousActiveSymbols) {
                if (!currentActiveSymbols.has(sym)) {
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('vela:position-closed', { detail: { symbol: sym } }));
                    }
                    // Cancel orphan bracket orders on Binance so remaining TP or SL doesn't linger
                    fetch('/api/binance/order/cancel-all', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ symbol: sym, testnet: state.isTestnet })
                    }).then(() => fetchOrders()).catch(() => {});
                }
            }
            previousActiveSymbols = currentActiveSymbols;

            updatePositionsUI();
            updateAccountBalanceUI();

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('vela:repaint-lines'));
            }
        }
    } catch (e) {
        console.error('Failed to fetch account', e);
    }
}

let lastGlobalOrdersPoll = 0;

export async function fetchOrders(symbol?: string) {
    try {
        const targetSymbol = symbol ? symbol.replace(/.*:/, '').replace(/\.P$/i, '').toUpperCase().trim() : '';
        const now = Date.now();
        // Weight optimization: An unfiltered openOrders query costs weight 40 on Binance Futures.
        // If symbol is omitted, only do a full sweep at most once every 60s.
        // Otherwise, target state.symbol (weight 1).
        const doFullSweep = !targetSymbol && (now - lastGlobalOrdersPoll > 60_000);
        if (doFullSweep) lastGlobalOrdersPoll = now;

        const effectiveSymbol = doFullSweep ? '' : (targetSymbol || state.symbol || '');
        const queryParam = effectiveSymbol ? `symbol=${encodeURIComponent(effectiveSymbol)}&` : '';

        let res: Response;
        if (typeof AbortController !== 'undefined') {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4000);
            try {
                res = await fetch(`/api/binance/orders?${queryParam}testnet=${state.isTestnet}&_t=${now}`, {
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timer);
            }
        } else {
            res = await fetch(`/api/binance/orders?${queryParam}testnet=${state.isTestnet}&_t=${now}`);
        }

        if (res.ok) {
            const rawOrders = await res.json();
            if (Array.isArray(rawOrders)) {
                const fresh = rawOrders.filter((o: any) => o && o.symbol && !isSymbolInCloseCooldown(o.symbol));
                if (doFullSweep || !effectiveSymbol) {
                    state.openOrders = fresh;
                } else {
                    const cleanTarget = effectiveSymbol.replace(/\.P$/i, '').toUpperCase();
                    const preserved = (state.openOrders || []).filter(
                        (o: any) => o && o.symbol && o.symbol.toUpperCase() !== cleanTarget
                    );
                    state.openOrders = [...preserved, ...fresh];
                }
                updateOrdersUI();
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('vela:repaint-lines'));
                }
            }
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

export async function fetchOrderHistory(symbol?: string) {
    try {
        const symQuery = symbol && symbol !== 'ALL' && symbol !== 'undefined'
            ? `symbol=${encodeURIComponent(symbol)}&`
            : '';
        const res = await fetch(`/api/binance/order-history?${symQuery}testnet=${state.isTestnet}`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                const map = new Map<string, any>();
                if (Array.isArray(state.orderHistory)) {
                    for (const o of state.orderHistory) {
                        if (o.orderId) map.set(String(o.orderId), o);
                    }
                }
                for (const o of data) {
                    if (o.orderId) map.set(String(o.orderId), o);
                }
                state.orderHistory = Array.from(map.values()).sort((a, b) => Number(b.time || b.updateTime || 0) - Number(a.time || a.updateTime || 0));
            }
            updateHistoryUI();
        }
    } catch (e) {
        console.error('Failed to fetch order history', e);
    }
}


export function syncTradeMarksToCharts() {
    if (!wsInstance) return;
    const trades = state.tradeHistory;
    if (!Array.isArray(trades) || trades.length === 0) return;

    for (const cell of wsInstance.cells()) {
        const chart = cell.chart;
        if (!chart || !chart.marks) continue;

        try {
            chart.marks.defineGroup({ id: 'trades', label: 'Executed Trades' });
        } catch {}

        const cellSym = (cell.symbol || '').toUpperCase().replace(/^BINANCE:/, '').replace(/\.P$/, '');
        for (const t of trades) {
            if (!t.symbol || !t.time) continue;
            const tradeSym = String(t.symbol).toUpperCase().replace(/\.P$/, '');
            if (tradeSym !== cellSym) continue;

            const isBuy = t.side === 'BUY';
            const pnl = parseFloat(t.realizedPnl || '0');
            const pnlStr = pnl !== 0 ? (' (PnL: ' + (pnl > 0 ? '+' : '') + '$' + pnl.toFixed(2) + ')') : '';
            const price = parseFloat(t.price || '0');
            const qty = parseFloat(t.qty || '0');
            chart.marks.add({
                id: 'trade-' + (t.id || t.orderId),
                time: Number(t.time),
                title: t.side + ' ' + qty + ' @ $' + price.toFixed(2) + pnlStr,
                group: 'trades',
                glyph: {
                    shape: 'pin',
                    color: isBuy ? '#2ebd85' : '#f6465d',
                    letter: isBuy ? 'B' : 'S',
                },
                tooltip: t.side + ' ' + qty + ' @ $' + price.toFixed(2) + pnlStr,
                content: {
                    panel: {
                        items: [
                            { type: 'field', label: 'Order ID', value: '#' + (t.orderId || t.id) },
                            { type: 'field', label: 'Symbol', value: String(t.symbol) },
                            { type: 'field', label: 'Side', value: String(t.side) },
                            { type: 'field', label: 'Price', value: '$' + price.toFixed(2) },
                            { type: 'field', label: 'Quantity', value: String(qty) },
                            { type: 'field', label: 'Realized PnL', value: (pnl >= 0 ? '+' : '') + pnl.toFixed(4) + ' USDT' },
                            { type: 'field', label: 'Fee', value: (t.commission || 0) + ' ' + (t.commissionAsset || 'USDT') },
                            { type: 'field', label: 'Time', value: new Date(Number(t.time)).toLocaleString() },
                        ],
                    },
                },
            });
        }
    }
}

export async function fetchTradeHistory(symbol?: string) {
    try {
        const symQuery = symbol && symbol !== 'ALL' && symbol !== 'undefined'
            ? `symbol=${encodeURIComponent(symbol)}&`
            : '';
        const res = await fetch(`/api/binance/trade-history?${symQuery}testnet=${state.isTestnet}`);
        if (res.ok) {
            state.tradeHistory = await res.json();

            updateJournalUI();
            syncTradeMarksToCharts();

            // Synchronize order history in the background for relevant symbols so order metadata (SL, TP triggers) is complete
            const symsToFetch = new Set<string>();
            if (symbol && symbol !== 'ALL' && symbol !== 'undefined') {
                symsToFetch.add(symbol.replace(/\.P$/i, '').toUpperCase());
            } else if (Array.isArray(state.tradeHistory)) {
                for (const t of state.tradeHistory) {
                    if (t.symbol) symsToFetch.add(String(t.symbol).replace(/\.P$/i, '').toUpperCase());
                }
            }
            if (symsToFetch.size === 0 && state.symbol) {
                symsToFetch.add(state.symbol.replace(/\.P$/i, '').toUpperCase());
            }

            const recentSyms = Array.from(symsToFetch).slice(0, 5);
            if (recentSyms.length > 0) {
                Promise.all(recentSyms.map(s => fetchOrderHistory(s))).then(() => {
                    updateJournalUI();
                }).catch(err => {
                    console.warn('[journal] Background order sync error:', err);
                });
            }
        }
    } catch (e) {
        console.error('Failed to fetch trade history', e);
    }
}

let positionsContainer: HTMLElement | null = null;
let ordersContainer: HTMLElement | null = null;
let historyContainer: HTMLElement | null = null;
let journalContainer: HTMLElement | null = null;
let historySymbolFilter: string = 'ALL';

function updatePositionsUI() {
    const posCountEl = document.getElementById('pos-count');
    if (posCountEl) posCountEl.textContent = state.activePositions.length.toString();

    if (!positionsContainer) return;
    if (state.activePositions.length === 0) {
        positionsContainer.innerHTML = `
            <div style="padding: 30px; text-align: center; color: var(--vela-text-muted, #757882); background: var(--vela-bg, #202126);">
                <div style="font-size: 12px; font-weight: 600; color: var(--vela-text-primary, #eeeef1);">No open positions</div>
                <div style="font-size: 10.5px; margin-top: 4px; color: var(--vela-text-muted, #757882);">Active Binance Futures contracts with live mark prices & PnL will appear here</div>
                <button id="refresh-empty-pos-btn" style="margin-top: 10px; background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); font-size: 10.5px; font-weight: 600; padding: 4px 12px; border-radius: 4px; cursor: pointer;">↻ Refresh Account</button>
            </div>
        `;
        positionsContainer.querySelector('#refresh-empty-pos-btn')?.addEventListener('click', () => {
            fetchAccount();
        });
        return;
    }

    let totalPnl = 0;
    let totalMargin = 0;
    for (const p of state.activePositions) {
        totalPnl += (p.pnl || 0);
        totalMargin += ((p.entryPrice * p.size) / (p.leverage || 1));
    }
    const pnlColor = totalPnl >= 0 ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
    const pnlBg = totalPnl >= 0 ? 'rgba(167,190,148,0.12)' : 'rgba(175,104,112,0.12)';
    const pnlBorder = totalPnl >= 0 ? 'rgba(167,190,148,0.25)' : 'rgba(175,104,112,0.25)';

    let rowsHtml = '';
    for (const p of state.activePositions) {
        const isLong = p.side === 'LONG';
        const sideColor = isLong ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
        const sideBg = isLong ? 'rgba(167,190,148,0.15)' : 'rgba(175,104,112,0.15)';
        const sideBorder = isLong ? 'rgba(167,190,148,0.25)' : 'rgba(175,104,112,0.25)';
        const rowPnlColor = p.pnl >= 0 ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
        const marginUsed = (p.entryPrice * p.size) / (p.leverage || 1);

        rowsHtml += `
            <tr class="pos-row" data-sym="${p.symbol}" data-price="${p.markPrice}" title="Click to view ${p.symbol} on chart" style="border-bottom: 1px solid var(--vela-border, #262629); font-size: 10.5px; transition: background 0.1s; cursor: pointer;" onmouseover="this.style.background='var(--vela-bg-hover, rgba(255,255,255,0.03))'" onmouseout="this.style.background='transparent'">
                <td style="padding: 5px 8px; font-weight: 700; color: var(--vela-text-primary, #eeeef1); white-space: nowrap;">
                    <div style="display: inline-flex; align-items: center;">
                        ${getSymbolLogoHtml(p.symbol, 16)}
                        <span>${p.symbol}</span>
                    </div>
                </td>
                <td style="padding: 5px 8px; white-space: nowrap;">
                    <span style="font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 2px; background: ${sideBg}; color: ${sideColor}; border: 1px solid ${sideBorder};">${p.side} ${p.leverage}x</span>
                </td>
                <td style="padding: 5px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; white-space: nowrap;">
                    <div style="color: var(--vela-text-primary, #eeeef1); font-weight: 600;">${p.size}</div>
                    <div style="font-size: 9.5px; color: var(--vela-text-muted, #757882);">$${marginUsed.toFixed(2)} margin</div>
                </td>
                <td style="padding: 5px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; color: var(--vela-text-secondary, #757882); white-space: nowrap;">
                    $${p.entryPrice.toFixed(2)} → <strong style="color: var(--vela-text-primary, #eeeef1);">$${p.markPrice.toFixed(2)}</strong>
                </td>
                <td style="padding: 5px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; color: ${p.liqPrice > 0 ? 'var(--vela-down, #af6870)' : 'var(--vela-text-muted, #757882)'}; white-space: nowrap;">
                    ${p.liqPrice > 0 ? '$' + p.liqPrice.toFixed(2) : '--'}
                </td>
                <td style="padding: 5px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; white-space: nowrap;">
                    <div style="font-weight: 700; font-size: 11px; color: ${rowPnlColor};">${p.pnl >= 0 ? '+' : ''}$${p.pnl.toFixed(2)} USDT</div>
                    <div style="font-size: 9.5px; color: ${rowPnlColor}; font-weight: 600;">${p.roe >= 0 ? '+' : ''}${p.roe.toFixed(2)}%</div>
                </td>
                <td style="padding: 5px 8px; text-align: right; white-space: nowrap;">
                    <button class="jump-pos-btn" data-sym="${p.symbol}" data-price="${p.markPrice}" title="Switch chart to ${p.symbol}" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 2px 6px; border-radius: 3px; cursor: pointer; margin-right: 4px;">⤢</button>
                    <button class="close-pos-btn" data-sym="${p.symbol}" data-side="${p.side}" data-size="${p.size}" style="background: rgba(175,104,112,0.12); border: 1px solid rgba(175,104,112,0.25); color: var(--vela-down, #af6870); font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 3px; cursor: pointer;">Close</button>
                </td>
            </tr>
        `;
    }

    positionsContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; background: var(--vela-bg, #202126);">
            <!-- TOP METRICS STRIP -->
            <div style="padding: 5px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--vela-border, #262629); background: var(--vela-bg, #202126); flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 2px 8px; display: flex; flex-direction: column;">
                        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: var(--vela-text-muted, #757882); letter-spacing: 0.5px;">Positions</span>
                        <span style="font-size: 12px; font-weight: 800; color: var(--vela-text-primary, #eeeef1); font-family: var(--vela-font-mono, monospace);">${state.activePositions.length} Active</span>
                    </div>

                    <div style="background: ${pnlBg}; border: 1px solid ${pnlBorder}; border-radius: 4px; padding: 2px 8px; display: flex; flex-direction: column;">
                        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: var(--vela-text-muted, #757882); letter-spacing: 0.5px;">Unrealized PnL</span>
                        <span style="font-size: 12.5px; font-weight: 800; color: ${pnlColor}; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums;">
                            ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)} USDT
                        </span>
                    </div>

                    <div style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 2px 8px; display: flex; flex-direction: column;">
                        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: var(--vela-text-muted, #757882); letter-spacing: 0.5px;">Margin In Use</span>
                        <span style="font-size: 12px; font-weight: 700; color: var(--vela-text-primary, #eeeef1); font-family: var(--vela-font-mono, monospace);">$${totalMargin.toFixed(2)} USDT</span>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 6px;">
                    <button id="close-all-positions-btn" title="Market close all open positions" style="background: rgba(175,104,112,0.12); border: 1px solid rgba(175,104,112,0.25); color: var(--vela-down, #af6870); font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 3px; cursor: pointer;">Close All</button>
                    <button id="refresh-pos-btn" title="Refresh positions from Binance" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; font-weight: 600; padding: 3px 6px; border-radius: 3px; cursor: pointer;">↻</button>
                </div>
            </div>

            <!-- TABLE CONTENT -->
            <div style="flex: 1; overflow: auto; background: var(--vela-bg, #202126);">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="color: var(--vela-text-muted, #757882); font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--vela-border, #262629); background: var(--vela-bg, #202126); position: sticky; top: 0; z-index: 2;">
                            <th style="padding: 5px 8px;">Symbol</th>
                            <th style="padding: 5px 8px;">Side / Lev</th>
                            <th style="padding: 5px 8px;">Size & Margin</th>
                            <th style="padding: 5px 8px;">Entry → Mark Price</th>
                            <th style="padding: 5px 8px;">Liq. Price</th>
                            <th style="padding: 5px 8px;">Unrealized PnL (ROE)</th>
                            <th style="padding: 5px 8px; text-align: right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        </div>
    `;

    positionsContainer.querySelector('#refresh-pos-btn')?.addEventListener('click', () => {
        fetchAccount();
    });

    positionsContainer.querySelector('#close-all-positions-btn')?.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to market close ALL open positions?')) return;
        for (const p of state.activePositions) {
            await closePosition(p.symbol, p.side, p.size);
        }
        await fetchAccount();
    });

    positionsContainer.querySelectorAll('.pos-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.close-pos-btn') || (e.target as HTMLElement).closest('.jump-pos-btn')) return;
            const sym = (row as HTMLElement).dataset.sym || '';
            const price = parseFloat((row as HTMLElement).dataset.price || '0');
            switchChartToSymbol(sym, price);
        });
    });

    positionsContainer.querySelectorAll('.jump-pos-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sym = (btn as HTMLElement).dataset.sym || '';
            const price = parseFloat((btn as HTMLElement).dataset.price || '0');
            switchChartToSymbol(sym, price);
        });
    });

    positionsContainer.querySelectorAll('.close-pos-btn').forEach(btn => {
        btn.addEventListener('click', async (e: any) => {
            const sym = e.target.getAttribute('data-sym');
            const side = e.target.getAttribute('data-side');
            const size = parseFloat(e.target.getAttribute('data-size') || '0');
            e.target.textContent = 'Closing...';
            await closePosition(sym, side, size);
            await fetchAccount();
        });
    });
}

function updateOrdersUI() {
    const ordCountEl = document.getElementById('ord-count');
    if (ordCountEl) ordCountEl.textContent = state.openOrders.length.toString();

    if (!ordersContainer) return;
    if (state.openOrders.length === 0) {
        ordersContainer.innerHTML = `
            <div style="padding: 30px; text-align: center; color: var(--vela-text-muted, #757882); background: var(--vela-bg, #202126);">
                <div style="font-size: 12px; font-weight: 600; color: var(--vela-text-primary, #eeeef1);">No open orders</div>
                <div style="font-size: 10.5px; margin-top: 4px; color: var(--vela-text-muted, #757882);">Limit, Stop Loss, and Take Profit bracket orders placed will appear here</div>
                <button id="refresh-empty-ord-btn" style="margin-top: 10px; background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); font-size: 10.5px; font-weight: 600; padding: 4px 12px; border-radius: 4px; cursor: pointer;">↻ Refresh Orders</button>
            </div>
        `;
        ordersContainer.querySelector('#refresh-empty-ord-btn')?.addEventListener('click', () => {
            fetchOrders();
        });
        return;
    }

    let slOrdersCount = 0;
    let tpOrdersCount = 0;
    let limitOrdersCount = 0;
    for (const o of state.openOrders) {
        const oType = (o.origType || o.type || '').toUpperCase();
        if (oType.includes('STOP')) slOrdersCount++;
        else if (oType.includes('TAKE_PROFIT')) tpOrdersCount++;
        else limitOrdersCount++;
    }

    let rowsHtml = '';
    for (const o of state.openOrders) {
        const isBuy = o.side === 'BUY';
        const sideColor = isBuy ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
        const sideBg = isBuy ? 'rgba(167,190,148,0.15)' : 'rgba(175,104,112,0.15)';
        const sideBorder = isBuy ? 'rgba(167,190,148,0.25)' : 'rgba(175,104,112,0.25)';

        const oType = (o.origType || o.type || 'LIMIT').toUpperCase();
        let typeBadgeBg = 'rgba(117,120,130,0.15)';
        let typeBadgeFg = 'var(--vela-text-secondary, #757882)';
        let typeBadgeBorder = 'rgba(117,120,130,0.25)';
        if (oType.includes('STOP')) {
            typeBadgeBg = 'rgba(175,104,112,0.18)';
            typeBadgeFg = 'var(--vela-down, #af6870)';
            typeBadgeBorder = 'rgba(175,104,112,0.3)';
        } else if (oType.includes('TAKE_PROFIT')) {
            typeBadgeBg = 'rgba(167,190,148,0.18)';
            typeBadgeFg = 'var(--vela-up, #a7be94)';
            typeBadgeBorder = 'rgba(167,190,148,0.3)';
        } else if (oType.includes('LIMIT')) {
            typeBadgeBg = 'rgba(253,224,71,0.12)';
            typeBadgeFg = 'var(--vela-warning, #fde047)';
            typeBadgeBorder = 'rgba(253,224,71,0.25)';
        }

        const trigPrice = parseFloat(o.stopPrice || o.triggerPrice || '0');
        const priceVal = parseFloat(o.price || '0');
        const priceDisplay = trigPrice > 0
            ? `Trig: $${trigPrice.toFixed(2)}`
            : (priceVal > 0 ? '$' + priceVal.toFixed(2) : 'Market');

        const dateStr = formatDateTime(o.time || o.updateTime);
        const qtyVal = parseFloat(o.origQty || o.quantity || '0');
        const filledVal = parseFloat(o.executedQty || '0');

        rowsHtml += `
            <tr class="ord-row" data-sym="${o.symbol}" data-price="${trigPrice || priceVal}" title="Click to view ${o.symbol} on chart" style="border-bottom: 1px solid var(--vela-border, #262629); font-size: 10.5px; transition: background 0.1s; cursor: pointer;" onmouseover="this.style.background='var(--vela-bg-hover, rgba(255,255,255,0.03))'" onmouseout="this.style.background='transparent'">
                <td style="padding: 5px 8px; color: var(--vela-text-muted, #757882); white-space: nowrap;">${dateStr}</td>
                <td style="padding: 5px 8px; font-weight: 700; color: var(--vela-text-primary, #eeeef1); white-space: nowrap;">
                    <div style="display: inline-flex; align-items: center;">
                        ${getSymbolLogoHtml(o.symbol, 16)}
                        <span>${o.symbol}</span>
                    </div>
                </td>
                <td style="padding: 5px 8px; white-space: nowrap;">
                    <span style="font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 2px; background: ${sideBg}; color: ${sideColor}; border: 1px solid ${sideBorder};">${o.side}</span>
                </td>
                <td style="padding: 5px 8px; white-space: nowrap;">
                    <span style="font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 2px; background: ${typeBadgeBg}; color: ${typeBadgeFg}; border: 1px solid ${typeBadgeBorder};">${oType}</span>
                </td>
                <td style="padding: 5px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; color: var(--vela-text-primary, #eeeef1); white-space: nowrap;">${priceDisplay}</td>
                <td style="padding: 5px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; color: var(--vela-text-secondary, #757882); white-space: nowrap;">${filledVal} / ${qtyVal}</td>
                <td style="padding: 5px 8px; white-space: nowrap;">
                    <span style="font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 2px; background: rgba(253,224,71,0.15); color: var(--vela-warning, #fde047); border: 1px solid rgba(253,224,71,0.25);">${o.status || 'NEW'}</span>
                </td>
                <td style="padding: 5px 8px; text-align: right; white-space: nowrap;">
                    <button class="jump-ord-btn" data-sym="${o.symbol}" data-price="${trigPrice || priceVal}" title="Switch chart to ${o.symbol}" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 2px 6px; border-radius: 3px; cursor: pointer; margin-right: 4px;">⤢</button>
                    <button class="cancel-ord-btn" data-sym="${o.symbol}" data-id="${o.orderId}" style="background: rgba(175,104,112,0.12); border: 1px solid rgba(175,104,112,0.25); color: var(--vela-down, #af6870); font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 3px; cursor: pointer;">Cancel</button>
                </td>
            </tr>
        `;
    }

    ordersContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; background: var(--vela-bg, #202126);">
            <!-- TOP METRICS STRIP -->
            <div style="padding: 5px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--vela-border, #262629); background: var(--vela-bg, #202126); flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 2px 8px; display: flex; flex-direction: column;">
                        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: var(--vela-text-muted, #757882); letter-spacing: 0.5px;">Pending Orders</span>
                        <span style="font-size: 12px; font-weight: 800; color: var(--vela-text-primary, #eeeef1); font-family: var(--vela-font-mono, monospace);">${state.openOrders.length}</span>
                    </div>

                    <div style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 2px 8px; display: flex; flex-direction: column;">
                        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: var(--vela-text-muted, #757882); letter-spacing: 0.5px;">Brackets & Limits</span>
                        <span style="font-size: 11.5px; font-weight: 700; color: var(--vela-text-secondary, #757882); font-family: var(--vela-font-mono, monospace);">
                            <span style="color: var(--vela-down, #af6870);">${slOrdersCount} SL</span> • <span style="color: var(--vela-up, #a7be94);">${tpOrdersCount} TP</span> • <span style="color: var(--vela-warning, #fde047);">${limitOrdersCount} Limit</span>
                        </span>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 6px;">
                    <button id="cancel-all-orders-btn" title="Cancel all open orders" style="background: rgba(175,104,112,0.12); border: 1px solid rgba(175,104,112,0.25); color: var(--vela-down, #af6870); font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 3px; cursor: pointer;">Cancel All</button>
                    <button id="refresh-orders-btn" title="Refresh open orders from Binance" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; font-weight: 600; padding: 3px 6px; border-radius: 3px; cursor: pointer;">↻</button>
                </div>
            </div>

            <!-- TABLE CONTENT -->
            <div style="flex: 1; overflow: auto; background: var(--vela-bg, #202126);">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="color: var(--vela-text-muted, #757882); font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--vela-border, #262629); background: var(--vela-bg, #202126); position: sticky; top: 0; z-index: 2;">
                            <th style="padding: 5px 8px;">Time</th>
                            <th style="padding: 5px 8px;">Symbol</th>
                            <th style="padding: 5px 8px;">Side</th>
                            <th style="padding: 5px 8px;">Type</th>
                            <th style="padding: 5px 8px;">Order / Trigger Price</th>
                            <th style="padding: 5px 8px;">Filled / Total</th>
                            <th style="padding: 5px 8px;">Status</th>
                            <th style="padding: 5px 8px; text-align: right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        </div>
    `;

    ordersContainer.querySelector('#refresh-orders-btn')?.addEventListener('click', () => {
        fetchOrders();
    });

    ordersContainer.querySelector('#cancel-all-orders-btn')?.addEventListener('click', async () => {
        await fetch('/api/binance/order/cancel-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: state.symbol, testnet: state.isTestnet })
        });
        await fetchOrders(state.symbol);
    });

    ordersContainer.querySelectorAll('.ord-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.cancel-ord-btn') || (e.target as HTMLElement).closest('.jump-ord-btn')) return;
            const sym = (row as HTMLElement).dataset.sym || '';
            const price = parseFloat((row as HTMLElement).dataset.price || '0');
            switchChartToSymbol(sym, price);
        });
    });

    ordersContainer.querySelectorAll('.jump-ord-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sym = (btn as HTMLElement).dataset.sym || '';
            const price = parseFloat((btn as HTMLElement).dataset.price || '0');
            switchChartToSymbol(sym, price);
        });
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
    const histCountEl = document.getElementById('hist-count');
    if (histCountEl) histCountEl.textContent = state.orderHistory.length.toString();

    if (!historyContainer) return;
    if (!Array.isArray(state.orderHistory) || state.orderHistory.length === 0) {
        historyContainer.innerHTML = `
            <div style="padding: 30px; text-align: center; color: var(--vela-text-muted, #757882); background: var(--vela-bg, #202126);">
                <div style="font-size: 12px; font-weight: 600; color: var(--vela-text-primary, #eeeef1);">No order history recorded</div>
                <div style="font-size: 10.5px; margin-top: 4px; color: var(--vela-text-muted, #757882);">Recent filled, canceled, and expired orders will appear here</div>
                <button id="refresh-empty-hist-btn" style="margin-top: 10px; background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); font-size: 10.5px; font-weight: 600; padding: 4px 12px; border-radius: 4px; cursor: pointer;">↻ Sync Binance Orders</button>
            </div>
        `;
        historyContainer.querySelector('#refresh-empty-hist-btn')?.addEventListener('click', () => {
            fetchOrderHistory(state.symbol);
        });
        return;
    }

    const uniqueSymbols = Array.from(new Set(state.orderHistory.map(o => String(o.symbol).toUpperCase()))).filter(Boolean);
    const activeOrders = historySymbolFilter === 'ALL'
        ? state.orderHistory
        : state.orderHistory.filter(o => String(o.symbol).toUpperCase() === historySymbolFilter);

    let filledCount = 0;
    let canceledCount = 0;
    let otherCount = 0;
    for (const o of activeOrders) {
        const s = (o.status || '').toUpperCase();
        if (s === 'FILLED' || s === 'FINISHED') filledCount++;
        else if (s === 'CANCELED') canceledCount++;
        else otherCount++;
    }

    let rowsHtml = '';
    for (const o of activeOrders) {
        const isBuy = o.side === 'BUY';
        const sideColor = isBuy ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
        const sideBg = isBuy ? 'rgba(167,190,148,0.15)' : 'rgba(175,104,112,0.15)';
        const sideBorder = isBuy ? 'rgba(167,190,148,0.25)' : 'rgba(175,104,112,0.25)';

        const status = o.status || 'UNKNOWN';
        let statusBg = 'rgba(117,120,130,0.15)';
        let statusFg = 'var(--vela-text-secondary, #757882)';
        let statusBorder = 'rgba(117,120,130,0.25)';
        if (status === 'FILLED' || status === 'FINISHED') {
            statusBg = 'rgba(167,190,148,0.15)';
            statusFg = 'var(--vela-up, #a7be94)';
            statusBorder = 'rgba(167,190,148,0.25)';
        } else if (status === 'CANCELED') {
            statusBg = 'rgba(175,104,112,0.15)';
            statusFg = 'var(--vela-down, #af6870)';
            statusBorder = 'rgba(175,104,112,0.25)';
        } else if (status === 'NEW') {
            statusBg = 'rgba(253,224,71,0.15)';
            statusFg = 'var(--vela-warning, #fde047)';
            statusBorder = 'rgba(253,224,71,0.25)';
        }

        const oType = (o.origType || o.type || 'LIMIT').toUpperCase();
        let typeBadgeBg = 'rgba(117,120,130,0.15)';
        let typeBadgeFg = 'var(--vela-text-secondary, #757882)';
        let typeBadgeBorder = 'rgba(117,120,130,0.25)';
        if (oType.includes('STOP')) {
            typeBadgeBg = 'rgba(175,104,112,0.18)';
            typeBadgeFg = 'var(--vela-down, #af6870)';
            typeBadgeBorder = 'rgba(175,104,112,0.3)';
        } else if (oType.includes('TAKE_PROFIT')) {
            typeBadgeBg = 'rgba(167,190,148,0.18)';
            typeBadgeFg = 'var(--vela-up, #a7be94)';
            typeBadgeBorder = 'rgba(167,190,148,0.3)';
        } else if (oType.includes('LIMIT')) {
            typeBadgeBg = 'rgba(253,224,71,0.12)';
            typeBadgeFg = 'var(--vela-warning, #fde047)';
            typeBadgeBorder = 'rgba(253,224,71,0.25)';
        }

        const dateStr = formatDateTime(o.time || o.updateTime);
        const trigPrice = parseFloat(o.stopPrice || o.triggerPrice || '0');
        const orderPrice = parseFloat(o.price || '0');
        const priceStr = trigPrice > 0
            ? `Trig: $${trigPrice.toFixed(2)}`
            : (orderPrice > 0 ? '$' + orderPrice.toFixed(2) : 'Market');
        const avgPrice = parseFloat(o.avgPrice || o.actualPrice || '0');
        const avgPriceStr = avgPrice > 0 ? '$' + avgPrice.toFixed(2) : '--';
        const execQty = parseFloat(o.executedQty || '0');
        const origQty = parseFloat(o.origQty || o.quantity || '0');

        rowsHtml += `
            <tr class="hist-row" data-sym="${o.symbol}" data-price="${avgPrice || trigPrice || orderPrice}" data-time="${o.time || o.updateTime}" title="Click to view ${o.symbol} on chart" style="border-bottom: 1px solid var(--vela-border, #262629); font-size: 10.5px; transition: background 0.1s; cursor: pointer;" onmouseover="this.style.background='var(--vela-bg-hover, rgba(255,255,255,0.03))'" onmouseout="this.style.background='transparent'">
                <td style="padding: 5px 8px; color: var(--vela-text-muted, #757882); white-space: nowrap;">${dateStr}</td>
                <td style="padding: 5px 8px; font-weight: 700; color: var(--vela-text-primary, #eeeef1); white-space: nowrap;">
                    <div style="display: inline-flex; align-items: center;">
                        ${getSymbolLogoHtml(o.symbol, 16)}
                        <span>${o.symbol}</span>
                    </div>
                </td>
                <td style="padding: 5px 8px; white-space: nowrap;">
                    <span style="font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 2px; background: ${sideBg}; color: ${sideColor}; border: 1px solid ${sideBorder};">${o.side}</span>
                </td>
                <td style="padding: 5px 8px; white-space: nowrap;">
                    <span style="font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 2px; background: ${typeBadgeBg}; color: ${typeBadgeFg}; border: 1px solid ${typeBadgeBorder};">${oType}</span>
                </td>
                <td style="padding: 5px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; color: var(--vela-text-primary, #eeeef1); white-space: nowrap;">${priceStr}</td>
                <td style="padding: 5px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; color: var(--vela-text-secondary, #757882); white-space: nowrap;">${avgPriceStr}</td>
                <td style="padding: 5px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; color: var(--vela-text-primary, #eeeef1); white-space: nowrap;">${execQty} / ${origQty}</td>
                <td style="padding: 5px 8px; white-space: nowrap;">
                    <span style="font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 2px; background: ${statusBg}; color: ${statusFg}; border: 1px solid ${statusBorder};">${status}</span>
                </td>
                <td style="padding: 5px 8px; text-align: right; white-space: nowrap;">
                    <button class="jump-hist-btn" data-sym="${o.symbol}" data-price="${avgPrice || trigPrice || orderPrice}" data-time="${o.time || o.updateTime}" title="Switch chart to ${o.symbol}" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 2px 6px; border-radius: 3px; cursor: pointer;">⤢</button>
                </td>
            </tr>
        `;
    }

    const symbolOptions = ['ALL', ...uniqueSymbols].map(s => `
        <option value="${s}" ${s === historySymbolFilter ? 'selected' : ''}>${s === 'ALL' ? 'All Symbols' : s}</option>
    `).join('');

    historyContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; background: var(--vela-bg, #202126);">
            <!-- TOP METRICS STRIP -->
            <div style="padding: 5px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--vela-border, #262629); background: var(--vela-bg, #202126); flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 2px 8px; display: flex; flex-direction: column;">
                        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: var(--vela-text-muted, #757882); letter-spacing: 0.5px;">Orders</span>
                        <span style="font-size: 12px; font-weight: 800; color: var(--vela-text-primary, #eeeef1); font-family: var(--vela-font-mono, monospace);">${activeOrders.length}</span>
                    </div>

                    <div style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 2px 8px; display: flex; flex-direction: column;">
                        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: var(--vela-text-muted, #757882); letter-spacing: 0.5px;">Executions</span>
                        <span style="font-size: 11.5px; font-weight: 700; color: var(--vela-text-secondary, #757882); font-family: var(--vela-font-mono, monospace);">
                            <span style="color: var(--vela-up, #a7be94);">${filledCount} Filled</span> • <span style="color: var(--vela-down, #af6870);">${canceledCount} Canceled</span>${otherCount > 0 ? ` • <span style="color: var(--vela-text-muted, #757882);">${otherCount} Other</span>` : ''}
                        </span>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 6px;">
                    <select id="history-sym-filter" style="background: var(--vela-bg-chip, #292a2f); color: var(--vela-text-primary, #eeeef1); border: 1px solid var(--vela-border, #262629); border-radius: 3px; padding: 3px 6px; font-size: 10px; font-weight: 600; cursor: pointer; outline: none;">
                        ${symbolOptions}
                    </select>
                    <button id="refresh-history-btn" title="Refresh order history from Binance" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; font-weight: 600; padding: 3px 6px; border-radius: 3px; cursor: pointer;">↻</button>
                </div>
            </div>

            <!-- TABLE CONTENT -->
            <div style="flex: 1; overflow: auto; background: var(--vela-bg, #202126);">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="color: var(--vela-text-muted, #757882); font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--vela-border, #262629); background: var(--vela-bg, #202126); position: sticky; top: 0; z-index: 2;">
                            <th style="padding: 5px 8px;">Time</th>
                            <th style="padding: 5px 8px;">Symbol</th>
                            <th style="padding: 5px 8px;">Side</th>
                            <th style="padding: 5px 8px;">Type</th>
                            <th style="padding: 5px 8px;">Order / Trigger Price</th>
                            <th style="padding: 5px 8px;">Avg Price</th>
                            <th style="padding: 5px 8px;">Filled / Total</th>
                            <th style="padding: 5px 8px;">Status</th>
                            <th style="padding: 5px 8px; text-align: right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        </div>
    `;

    historyContainer.querySelector('#refresh-history-btn')?.addEventListener('click', () => {
        fetchOrderHistory(historySymbolFilter === 'ALL' ? undefined : historySymbolFilter);
    });

    const symSelect = historyContainer.querySelector('#history-sym-filter') as HTMLSelectElement | null;
    symSelect?.addEventListener('change', () => {
        historySymbolFilter = symSelect.value;
        updateHistoryUI();
    });

    historyContainer.querySelectorAll('.hist-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.jump-hist-btn')) return;
            const sym = (row as HTMLElement).dataset.sym || '';
            const price = parseFloat((row as HTMLElement).dataset.price || '0');
            const time = Number((row as HTMLElement).dataset.time || '0');
            if (time > 0) {
                void jumpChartToFill(time, sym, price);
            } else {
                switchChartToSymbol(sym, price);
            }
        });
    });

    historyContainer.querySelectorAll('.jump-hist-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sym = (btn as HTMLElement).dataset.sym || '';
            const price = parseFloat((btn as HTMLElement).dataset.price || '0');
            const time = Number((btn as HTMLElement).dataset.time || '0');
            if (time > 0) {
                void jumpChartToFill(time, sym, price);
            } else {
                switchChartToSymbol(sym, price);
            }
        });
    });
}

let journalSymbolFilter: string = 'ALL';
let journalViewMode: 'trades' | 'fills' | 'daily' = 'trades';
let isJournalMaximized = false;

function formatDuration(ms: number): string {
    if (!ms || ms <= 0) return '< 1m';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    if (h < 24) return `${h}h ${remM}m`;
    const d = (ms / 86400000).toFixed(1);
    return `${d}d`;
}

interface ClosedTradeSession {
    id: string | number;
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    qty: number;
    grossPnl: number;
    fee: number;
    netPnl: number;
    roi: number;
    openTime: number;
    closeTime: number;
    durationMs: number;
    closeReason: string;
    closeReasonType: 'sl' | 'tp' | 'manual' | 'limit';
    orderId?: string | number;
    fills: any[];
}

function aggregateClosedTrades(trades: any[], orders: any[]): ClosedTradeSession[] {
    const ordersMap = new Map<string, any>();
    if (Array.isArray(orders)) {
        for (const o of orders) {
            if (o.orderId) ordersMap.set(String(o.orderId), o);
        }
    }

    const sorted = [...trades].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const bySymbol: Record<string, any[]> = {};
    for (const t of sorted) {
        const sym = (t.symbol || 'UNKNOWN').toUpperCase();
        if (!bySymbol[sym]) bySymbol[sym] = [];
        bySymbol[sym].push(t);
    }

    const closedTrades: ClosedTradeSession[] = [];

    for (const sym of Object.keys(bySymbol)) {
        const list = bySymbol[sym];
        let openPos: {
            side: 'LONG' | 'SHORT';
            qty: number;
            avgPrice: number;
            totalCost: number;
            openTime: number;
            fees: number;
            fills: any[];
        } | null = null;

        for (const fill of list) {
            const side = fill.side; // BUY or SELL
            const qty = parseFloat(fill.qty || '0');
            const price = parseFloat(fill.price || '0');
            const pnl = parseFloat(fill.realizedPnl || '0');
            const fee = Math.abs(parseFloat(fill.commission || '0'));
            const time = Number(fill.time || 0);
            const orderId = String(fill.orderId || '');

            const ord = ordersMap.get(orderId);
            let exitReason = 'Manual Close';
            let exitReasonType: 'sl' | 'tp' | 'manual' | 'limit' = 'manual';

            if (ord) {
                const oType = (ord.type || ord.origType || ord.algoOrderType || '').toUpperCase();
                const aType = (ord.algoOrderType || ord.origType || '').toUpperCase();
                const isStop = oType.includes('STOP') || aType.includes('STOP');
                const isTp = oType.includes('TAKE_PROFIT') || aType.includes('TAKE_PROFIT');

                if (isStop) {
                    const trig = parseFloat(ord.triggerPrice || ord.stopPrice || '0');
                    exitReason = trig > 0 ? `Stop Loss Triggered (@ $${trig.toFixed(2)})` : 'Stop Loss Triggered';
                    exitReasonType = 'sl';
                } else if (isTp) {
                    const trig = parseFloat(ord.triggerPrice || ord.stopPrice || '0');
                    exitReason = trig > 0 ? `Take Profit Hit (@ $${trig.toFixed(2)})` : 'Take Profit Hit';
                    exitReasonType = 'tp';
                } else if (oType === 'LIMIT') {
                    exitReason = pnl >= 0 ? 'Limit Take Profit' : 'Limit Exit';
                    exitReasonType = pnl >= 0 ? 'tp' : 'limit';
                } else if (oType === 'MARKET') {
                    if (ord.closePosition === true || ord.closePosition === 'true' || ord.isBracketClose) {
                        // On Binance Futures, closePosition=true ONLY exists on orders spawned by conditional STOP/TP bracket triggers
                        if (pnl < 0) {
                            exitReason = 'Stop Loss Triggered';
                            exitReasonType = 'sl';
                        } else {
                            exitReason = 'Take Profit Hit';
                            exitReasonType = 'tp';
                        }
                    } else {
                        exitReason = pnl >= 0 ? 'Manual Close (Profit)' : 'Manual Close (Loss)';
                        exitReasonType = 'manual';
                    }
                }
            } else {
                if (pnl > 0.0001) {
                    exitReason = 'Take Profit';
                    exitReasonType = 'tp';
                } else if (pnl < -0.0001) {
                    exitReason = 'Stop Loss';
                    exitReasonType = 'sl';
                } else {
                    exitReason = 'Breakeven';
                    exitReasonType = 'manual';
                }
            }

            // Realized PnL !== 0 marks an exit
            if (Math.abs(pnl) > 0.00000001) {
                const tradeSide: 'LONG' | 'SHORT' = side === 'SELL' ? 'LONG' : 'SHORT';
                const entryPrice = openPos ? openPos.avgPrice : price;
                const openTime = openPos ? openPos.openTime : (time - 60000);
                const grossPnl = pnl;
                const netPnl = grossPnl - fee;
                const notional = entryPrice * qty;
                const roi = notional > 0 ? (grossPnl / notional) * 100 : 0;

                closedTrades.push({
                    id: fill.id || fill.orderId,
                    symbol: sym,
                    side: tradeSide,
                    entryPrice,
                    exitPrice: price,
                    qty,
                    grossPnl,
                    fee,
                    netPnl,
                    roi,
                    openTime,
                    closeTime: time,
                    durationMs: Math.max(0, time - openTime),
                    closeReason: exitReason,
                    closeReasonType: exitReasonType,
                    orderId: fill.orderId,
                    fills: [fill]
                });

                if (openPos) {
                    openPos.qty -= qty;
                    if (openPos.qty <= 0.0000001) openPos = null;
                }
            } else {
                // Entry fill
                if (!openPos) {
                    openPos = {
                        side: side === 'BUY' ? 'LONG' : 'SHORT',
                        qty,
                        avgPrice: price,
                        totalCost: qty * price,
                        openTime: time,
                        fees: fee,
                        fills: [fill]
                    };
                } else {
                    openPos.totalCost += qty * price;
                    openPos.qty += qty;
                    openPos.avgPrice = openPos.totalCost / openPos.qty;
                    openPos.fees += fee;
                    openPos.fills.push(fill);
                }
            }
        }
    }

    return closedTrades.sort((a, b) => b.closeTime - a.closeTime);
}

function chooseOptimalTimeframe(durationMs: number, currentTf: string): string {
    const currentMs = Math.max(1000, timeframeToMs(currentTf));
    const barsOnCurrent = Math.max(1, Math.round(durationMs / currentMs));

    // If trade spans between 2 and 180 bars on the user's current timeframe, preserve it
    if (barsOnCurrent >= 2 && barsOnCurrent <= 180) {
        return currentTf;
    }

    // Otherwise, adapt to a timeframe that frames the trade between ~30 and 90 bars:
    if (durationMs <= 15 * 60_000) return '1';          // <= 15m duration -> 1m
    if (durationMs <= 60 * 60_000) return '3';          // <= 1h duration -> 3m
    if (durationMs <= 4 * 3600_000) return '5';         // <= 4h duration -> 5m
    if (durationMs <= 16 * 3600_000) return '15';       // <= 16h duration -> 15m
    if (durationMs <= 3 * 86400_000) return '60';       // <= 3 days duration -> 1h (60)
    if (durationMs <= 14 * 86400_000) return '240';     // <= 2 weeks duration -> 4h (240)
    return 'D';                                         // > 2 weeks -> 1D
}

async function jumpChartToTrade(t: ClosedTradeSession | any) {
    if (!wsInstance) return;
    const cleanSym = String(t.symbol || '').toUpperCase().replace(/^BINANCE:/, '').replace(/\.P$/, '');
    let targetCell = wsInstance.cells().find(c => {
        const cSym = (c.symbol || '').toUpperCase().replace(/^BINANCE:/, '').replace(/\.P$/, '');
        return cSym === cleanSym;
    });

    if (!targetCell) {
        targetCell = wsInstance.active || wsInstance.cells()[0];
    }
    if (!targetCell) return;

    try {
        wsInstance.setActiveCell(targetCell.id);
    } catch {}

    const openT = Number(t.openTime || t.time || Date.now());
    const closeT = Number(t.closeTime || t.time || (openT + 60_000));
    const durationMs = Math.max(0, closeT - openT);

    const currentCellSym = (targetCell.symbol || '').toUpperCase().replace(/^BINANCE:/, '').replace(/\.P$/, '');
    const symMismatch = currentCellSym !== cleanSym;
    const currentTf = targetCell.timeframe || '60';
    const optimalTf = chooseOptimalTimeframe(durationMs, currentTf);
    const tfChanged = optimalTf !== currentTf;

    // 1. Switch market if symbol changed or timeframe needed harmonization
    if (symMismatch || tfChanged) {
        const marketSwitch: any = {};
        if (symMismatch) marketSwitch.symbol = `BINANCE:${cleanSym}.P`;
        if (tfChanged) marketSwitch.timeframe = optimalTf;
        try {
            await targetCell.chart.setMarket(marketSwitch);
            await targetCell.chart.ready();
        } catch (e) {
            console.warn('[journal] Market switch before trade jump failed:', e);
        }
    }

    const activeTf = targetCell.timeframe || optimalTf;
    const tfMs = Math.max(1000, timeframeToMs(activeTf));
    const tradeBarCount = Math.max(1, Math.round(durationMs / tfMs));

    // 2. Dynamic horizontal context padding based on trade length
    let contextBars = 25;
    if (tradeBarCount > 20 && tradeBarCount <= 100) {
        contextBars = Math.max(20, Math.round(tradeBarCount * 0.35));
    } else if (tradeBarCount > 100) {
        contextBars = Math.max(15, Math.round(tradeBarCount * 0.15));
    }

    const padMs = contextBars * tfMs;
    const from = openT - padMs;
    const to = closeT + padMs;

    // 3. Check if historical candles covering [from, to] are loaded in memory; if not, pre-load them!
    const rawBars: any[] = (targetCell.chart as any).orchestrator?.rawBars || (targetCell.chart as any).orchestrator?.bars || [];
    const oldestBarTime = rawBars.length > 0 ? rawBars[0].time : Infinity;

    if (from < oldestBarTime) {
        const barsNeeded = Math.min(Math.ceil((Date.now() - from) / tfMs) + 120, 15000);
        try {
            await targetCell.chart.setMarket({ bars: barsNeeded });
            await Promise.race([
                targetCell.chart.historyComplete(),
                new Promise(r => setTimeout(r, 4000))
            ]);
        } catch (err) {
            console.warn('[journal] History pre-load error:', err);
        }
    }

    // 4. Measure intra-trade price excursions from the loaded candles for vertical bounds
    const updatedRaw: any[] = (targetCell.chart as any).orchestrator?.rawBars || (targetCell.chart as any).orchestrator?.bars || [];
    const entryPrice = parseFloat(t.entryPrice || t.price || '0');
    const exitPrice = parseFloat(t.exitPrice || t.price || '0');
    const side = (t.side || (t.grossPnl >= 0 ? 'LONG' : 'SHORT')).toUpperCase();
    const isLong = side === 'LONG';

    let intraHigh = Math.max(entryPrice, exitPrice);
    let intraLow = Math.min(entryPrice, exitPrice);
    if (updatedRaw.length > 0) {
        for (const b of updatedRaw) {
            if (b.time >= openT && b.time <= closeT) {
                if (b.high > intraHigh) intraHigh = b.high;
                if (b.low < intraLow) intraLow = b.low;
            }
        }
    }

    const priceDiff = Math.abs(exitPrice - entryPrice);
    const offset = priceDiff > 0 ? priceDiff : (entryPrice * 0.005 || 1);

    let stopPrice: number;
    let targetPrice: number;

    if (isLong) {
        targetPrice = exitPrice >= entryPrice ? exitPrice : (intraHigh > entryPrice ? intraHigh : entryPrice + offset * 1.5);
        stopPrice = exitPrice < entryPrice ? exitPrice : (intraLow < entryPrice ? intraLow : entryPrice - offset * 0.5);
    } else {
        targetPrice = exitPrice <= entryPrice ? exitPrice : (intraLow < entryPrice ? intraLow : entryPrice - offset * 1.5);
        stopPrice = exitPrice > entryPrice ? exitPrice : (intraHigh > entryPrice ? intraHigh : entryPrice + offset * 0.5);
    }

    // 5. Place or select the trade position drawing & intermediate execution markers
    try {
        const drawingsCtrl = targetCell.chart.drawings;
        if (drawingsCtrl && typeof drawingsCtrl.all === 'function') {
            const allDrawings = drawingsCtrl.all();
            const existing = allDrawings.find(d => {
                if (d.type !== 'position') return false;
                const a0 = d.anchors?.[0];
                return a0 && Math.abs(a0.time - openT) < (tfMs * 2) && Math.abs(a0.price - entryPrice) < (entryPrice * 0.005);
            });

            if (existing) {
                drawingsCtrl.select(existing.id);
            } else {
                const added = drawingsCtrl.add('position', {
                    paneId: 'price',
                    anchors: [
                        { time: openT, price: entryPrice },
                        { time: closeT, price: stopPrice },
                        { time: closeT, price: targetPrice }
                    ],
                    props: {
                        riskPercent: Math.abs(t.roi || 1),
                        accountBalance: 10000,
                        showText: true,
                        showHeader: true,
                        showPrices: true,
                        showLossSize: false,
                        showTargetLabel: true,
                        showStopLabel: true,
                        profitColor: '#2ebd85',
                        lossColor: '#f6465d'
                    }
                });
                if (added) {
                    drawingsCtrl.select(added.id);
                }

                // If multiple partial fills exist, stamp directional arrow markers on intermediate fills
                if (Array.isArray(t.fills) && t.fills.length > 2) {
                    const intermediate = t.fills.slice(1, -1);
                    for (const fill of intermediate) {
                        const fTime = Number(fill.time);
                        const fPrice = parseFloat(fill.price);
                        const fSide = (fill.side || '').toUpperCase();
                        const isBuy = fSide === 'BUY';
                        drawingsCtrl.add(isBuy ? 'arrowmarkup' : 'arrowmarkdown', {
                            paneId: 'price',
                            anchors: [{ time: fTime, price: fPrice }],
                            props: {
                                color: isBuy ? '#2ebd85' : '#f6465d'
                            }
                        });
                    }
                }
            }
        }
    } catch (err) {
        console.warn('[journal] Failed to place position drawing:', err);
    }

    // 6. Reset vertical price scaling so autoscale automatically envelopes all wicks and target lines
    try {
        targetCell.chart.renderer.set('autoScale', true);
    } catch {}

    // 7. Apply the visible range (candles are fully loaded so clampViewport will not truncate)
    try {
        targetCell.chart.setVisibleRange({ from, to });
    } catch (e) {
        console.warn('[journal] Failed to set visible range:', e);
    }

    if (isJournalMaximized) {
        toggleJournalPanelMaximize();
    }

    const durationStr = formatDuration(durationMs);
    const barsStr = `${tradeBarCount} bar${tradeBarCount > 1 ? 's' : ''}`;
    const fillsCount = Array.isArray(t.fills) ? t.fills.length : 1;
    const fillSuffix = fillsCount > 1 ? ` (${fillsCount} fills)` : '';
    toast(`Chart framed ${cleanSym} ${side} trade: $${entryPrice.toFixed(2)} → $${exitPrice.toFixed(2)} [${durationStr}, ${barsStr} on ${activeTf}]${fillSuffix}`, 'info');
}

async function jumpChartToFill(fillTime: number, fillSym: string, fillPrice?: number) {
    if (!wsInstance) return;
    const cleanSym = String(fillSym || '').toUpperCase().replace(/^BINANCE:/, '').replace(/\.P$/, '');
    let targetCell = wsInstance.cells().find(c => {
        const cSym = (c.symbol || '').toUpperCase().replace(/^BINANCE:/, '').replace(/\.P$/, '');
        return cSym === cleanSym;
    });

    if (!targetCell) {
        targetCell = wsInstance.active || wsInstance.cells()[0];
    }
    if (!targetCell) return;

    try {
        wsInstance.setActiveCell(targetCell.id);
    } catch {}

    const currentCellSym = (targetCell.symbol || '').toUpperCase().replace(/^BINANCE:/, '').replace(/\.P$/, '');
    if (currentCellSym !== cleanSym) {
        try {
            await targetCell.chart.setMarket({ symbol: `BINANCE:${cleanSym}.P` });
            await targetCell.chart.ready();
        } catch (e) {
            console.warn('[journal] Market switch before fill jump failed:', e);
        }
    }

    const activeTf = targetCell.timeframe || '60';
    const tfMs = Math.max(1000, timeframeToMs(activeTf));
    const t = Number(fillTime || Date.now());
    const contextBars = 25;
    const padMs = contextBars * tfMs;
    const from = t - padMs;
    const to = t + padMs;

    // Check if candles covering [from, to] are in memory; pre-load if needed
    const rawBars: any[] = (targetCell.chart as any).orchestrator?.rawBars || (targetCell.chart as any).orchestrator?.bars || [];
    const oldestBarTime = rawBars.length > 0 ? rawBars[0].time : Infinity;

    if (from < oldestBarTime) {
        const barsNeeded = Math.min(Math.ceil((Date.now() - from) / tfMs) + 120, 15000);
        try {
            await targetCell.chart.setMarket({ bars: barsNeeded });
            await Promise.race([
                targetCell.chart.historyComplete(),
                new Promise(r => setTimeout(r, 4000))
            ]);
        } catch (err) {
            console.warn('[journal] History pre-load error for fill:', err);
        }
    }

    // Place a signpost drawing on the fill price if provided
    if (fillPrice && fillPrice > 0) {
        try {
            const drawingsCtrl = targetCell.chart.drawings;
            if (drawingsCtrl && typeof drawingsCtrl.add === 'function') {
                drawingsCtrl.add('signpost', {
                    paneId: 'price',
                    anchors: [{ time: t, price: fillPrice }],
                    props: {
                        text: `Fill $${fillPrice.toFixed(2)}`,
                        color: '#f0b90b'
                    }
                });
            }
        } catch {}
    }

    // Auto-scale price axis
    try {
        targetCell.chart.renderer.set('autoScale', true);
    } catch {}

    try {
        targetCell.chart.setVisibleRange({ from, to });
    } catch (e) {
        console.warn('[journal] Failed to set visible range for fill:', e);
    }

    if (isJournalMaximized) {
        toggleJournalPanelMaximize();
    }

    toast(`Chart focused on ${cleanSym} execution fill${fillPrice ? ` @ $${fillPrice.toFixed(2)}` : ''} on ${activeTf}`, 'info');
}

function toggleJournalPanelMaximize() {
    isJournalMaximized = !isJournalMaximized;
    const panel = document.getElementById('velo-bottom-account-panel');
    if (panel) {
        panel.style.height = isJournalMaximized ? 'calc(100vh - 75px)' : '220px';
        panel.style.zIndex = isJournalMaximized ? '9999' : '10';
    }
    updateJournalUI();
}

function updateJournalUI() {
    if (!journalContainer) return;
    if (!Array.isArray(state.tradeHistory) || state.tradeHistory.length === 0) {
        journalContainer.innerHTML = `
            <div style="padding: 30px; text-align: center; color: var(--vela-text-muted, #757882); background: var(--vela-bg, #202126);">
                <div style="font-size: 12px; font-weight: 600; color: var(--vela-text-primary, #eeeef1);">No trade executions found in journal</div>
                <div style="font-size: 10.5px; margin-top: 4px; color: var(--vela-text-muted, #757882);">Trade history is synced automatically upon fills or via manual sync</div>
                <button id="refresh-empty-journal-btn" style="margin-top: 10px; background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); font-size: 10.5px; font-weight: 600; padding: 4px 12px; border-radius: 4px; cursor: pointer;">↻ Sync Binance History</button>
            </div>
        `;
        journalContainer.querySelector('#refresh-empty-journal-btn')?.addEventListener('click', () => {
            fetchTradeHistory(state.symbol);
        });
        return;
    }

    const allClosed = aggregateClosedTrades(state.tradeHistory, state.orderHistory);
    const journCountEl = document.getElementById('journ-count');
    if (journCountEl) journCountEl.textContent = allClosed.length.toString();
    const uniqueSymbols = Array.from(new Set(state.tradeHistory.map(t => String(t.symbol).toUpperCase()))).filter(Boolean);

    const activeClosed = journalSymbolFilter === 'ALL' 
        ? allClosed 
        : allClosed.filter(t => t.symbol === journalSymbolFilter);
    const activeFills = journalSymbolFilter === 'ALL'
        ? state.tradeHistory
        : state.tradeHistory.filter(t => t.symbol === journalSymbolFilter);

    let totalGrossPnl = 0;
    let totalFees = 0;
    let winCount = 0;
    let lossCount = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let slCount = 0;
    let tpCount = 0;
    let manualCount = 0;

    for (const t of activeClosed) {
        totalGrossPnl += t.grossPnl;
        totalFees += t.fee;
        if (t.netPnl > 0.0001) {
            winCount++;
            grossWins += t.grossPnl;
        } else if (t.netPnl < -0.0001) {
            lossCount++;
            grossLosses += Math.abs(t.grossPnl);
        }

        if (t.closeReasonType === 'sl') slCount++;
        else if (t.closeReasonType === 'tp') tpCount++;
        else manualCount++;
    }

    const totalNetPnl = totalGrossPnl - totalFees;
    const totalTrades = winCount + lossCount;
    const winRate = totalTrades > 0 ? Math.round((winCount / totalTrades) * 100) : 0;
    const profitFactor = grossLosses > 0 ? (grossWins / grossLosses).toFixed(2) : (grossWins > 0 ? '∞' : '0.00');
    const netPnlColor = totalNetPnl >= 0 ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
    const netPnlBg = totalNetPnl >= 0 ? 'rgba(167,190,148,0.12)' : 'rgba(175,104,112,0.12)';
    const netPnlBorder = totalNetPnl >= 0 ? 'rgba(167,190,148,0.3)' : 'rgba(175,104,112,0.3)';

    let contentHtml = '';

    if (journalViewMode === 'trades') {
        if (activeClosed.length === 0) {
            contentHtml = `<div style="padding: 24px; text-align: center; color: var(--vela-text-muted, #757882); font-size: 11px;">No completed round-trip trades recorded for this filter. Check the Fills tab.</div>`;
        } else {
            let rowsHtml = '';
            for (const t of activeClosed) {
                const isLong = t.side === 'LONG';
                const sideColor = isLong ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
                const sideBg = isLong ? 'rgba(167,190,148,0.15)' : 'rgba(175,104,112,0.15)';
                const pnlColor = t.netPnl >= 0 ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
                const pnlStr = (t.netPnl >= 0 ? '+' : '') + '$' + t.netPnl.toFixed(2);
                const dateStr = formatDateTime(t.closeTime);
                const durationStr = formatDuration(t.durationMs);

                let closeBadgeBg = 'rgba(56,192,253,0.12)';
                let closeBadgeFg = '#38c0fd';
                let closeBadgeBorder = 'rgba(56,192,253,0.25)';
                let closeBadgeLabel = 'MANUAL';

                if (t.closeReasonType === 'sl') {
                    closeBadgeBg = 'rgba(175,104,112,0.18)';
                    closeBadgeFg = 'var(--vela-down, #af6870)';
                    closeBadgeBorder = 'rgba(175,104,112,0.3)';
                    closeBadgeLabel = 'SL';
                } else if (t.closeReasonType === 'tp') {
                    closeBadgeBg = 'rgba(167,190,148,0.18)';
                    closeBadgeFg = 'var(--vela-up, #a7be94)';
                    closeBadgeBorder = 'rgba(167,190,148,0.3)';
                    closeBadgeLabel = 'TP';
                } else if (t.closeReasonType === 'limit') {
                    closeBadgeBg = 'rgba(253,224,71,0.12)';
                    closeBadgeFg = 'var(--vela-warning, #fde047)';
                    closeBadgeBorder = 'rgba(253,224,71,0.25)';
                    closeBadgeLabel = 'LIMIT';
                }

                rowsHtml += `
                    <tr class="journ-trade-row" data-trade-id="${t.id}" title="Click to view trade on chart" style="border-bottom: 1px solid var(--vela-border, #262629); font-size: 10.5px; transition: background 0.1s; cursor: pointer;" onmouseover="this.style.background='var(--vela-bg-hover, rgba(255,255,255,0.03))'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 4px 8px; color: var(--vela-text-secondary, #757882); white-space: nowrap;">
                            <div>${dateStr}</div>
                            <div style="font-size: 9.5px; color: var(--vela-text-muted, #757882); margin-top: 1px;">${durationStr}</div>
                        </td>
                        <td style="padding: 4px 8px; font-weight: 700; color: var(--vela-text-primary, #eeeef1); white-space: nowrap;">
                            <div style="display: inline-flex; align-items: center;">
                                ${getSymbolLogoHtml(t.symbol, 16)}
                                <span>${t.symbol}</span>
                            </div>
                        </td>
                        <td style="padding: 4px 8px; white-space: nowrap;">
                            <span style="font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 2px; background: ${sideBg}; color: ${sideColor};">${t.side}</span>
                        </td>
                        <td style="padding: 4px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; color: var(--vela-text-secondary, #757882); white-space: nowrap;">
                            $${t.entryPrice.toFixed(2)} → <strong style="color: var(--vela-text-primary, #eeeef1);">$${t.exitPrice.toFixed(2)}</strong>
                        </td>
                        <td style="padding: 4px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; color: var(--vela-text-primary, #eeeef1); white-space: nowrap;">
                            ${t.qty}
                        </td>
                        <td style="padding: 4px 8px; white-space: nowrap;">
                            <span title="${t.closeReason}" style="font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 2px; background: ${closeBadgeBg}; color: ${closeBadgeFg}; border: 1px solid ${closeBadgeBorder};">
                                ${closeBadgeLabel}
                            </span>
                        </td>
                        <td style="padding: 4px 8px; white-space: nowrap; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums;">
                            <div style="font-weight: 700; font-size: 11px; color: ${pnlColor};">${pnlStr} USDT</div>
                            <div style="font-size: 9.5px; color: var(--vela-text-muted, #757882);">Fee: $${t.fee.toFixed(3)}</div>
                        </td>
                        <td style="padding: 4px 8px; text-align: right; white-space: nowrap;">
                            <button class="jump-trade-btn" data-trade-id="${t.id}" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 3px; cursor: pointer;">Chart</button>
                        </td>
                    </tr>
                `;
            }

            contentHtml = `
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="color: var(--vela-text-muted, #757882); font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--vela-border, #262629); background: var(--vela-bg, #202126); position: sticky; top: 0; z-index: 2;">
                            <th style="padding: 5px 8px;">Time</th>
                            <th style="padding: 5px 8px;">Symbol</th>
                            <th style="padding: 5px 8px;">Side</th>
                            <th style="padding: 5px 8px;">Entry → Exit</th>
                            <th style="padding: 5px 8px;">Size</th>
                            <th style="padding: 5px 8px;">Close Reason</th>
                            <th style="padding: 5px 8px;">Net PnL</th>
                            <th style="padding: 5px 8px; text-align: right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            `;
        }
    } else if (journalViewMode === 'fills') {
        let fillsRows = '';
        for (const f of activeFills) {
            const isBuy = f.side === 'BUY';
            const sideColor = isBuy ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
            const pnl = parseFloat(f.realizedPnl || '0');
            const pnlColor = pnl > 0 ? 'var(--vela-up, #a7be94)' : (pnl < 0 ? 'var(--vela-down, #af6870)' : 'var(--vela-text-muted, #757882)');
            const pnlStr = pnl === 0 ? '$0.00' : (pnl > 0 ? '+' : '') + '$' + pnl.toFixed(4);
            const dateStr = formatDateTime(f.time);
            const price = parseFloat(f.price || '0');
            const qty = parseFloat(f.qty || '0');
            const fee = parseFloat(f.commission || '0');

            fillsRows += `
                <tr class="journ-fill-row" data-fill-time="${f.time}" data-fill-sym="${f.symbol}" data-fill-price="${price}" title="Click to view fill on chart" style="border-bottom: 1px solid var(--vela-border, #262629); font-size: 10.5px; transition: background 0.1s; cursor: pointer;" onmouseover="this.style.background='var(--vela-bg-hover, rgba(255,255,255,0.03))'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 4px 8px; color: var(--vela-text-muted, #757882); white-space: nowrap;">${dateStr}</td>
                    <td style="padding: 4px 8px; font-weight: 700; color: var(--vela-text-primary, #eeeef1); white-space: nowrap;">
                        <div style="display: inline-flex; align-items: center;">
                            ${getSymbolLogoHtml(f.symbol, 16)}
                            <span>${f.symbol}</span>
                        </div>
                    </td>
                    <td style="padding: 4px 8px; white-space: nowrap;">
                        <span style="font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 2px; background: ${isBuy ? 'rgba(167,190,148,0.15)' : 'rgba(175,104,112,0.15)'}; color: ${sideColor};">${f.side}</span>
                    </td>
                    <td style="padding: 4px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; color: var(--vela-text-secondary, #757882); white-space: nowrap;">$${price.toFixed(2)}</td>
                    <td style="padding: 4px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; color: var(--vela-text-primary, #eeeef1); white-space: nowrap;">${qty}</td>
                    <td style="padding: 4px 8px; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums; font-weight: 700; color: ${pnlColor}; white-space: nowrap;">${pnlStr} USDT</td>
                    <td style="padding: 4px 8px; color: var(--vela-text-muted, #757882); white-space: nowrap;">${fee.toFixed(4)} ${f.commissionAsset || 'USDT'}</td>
                    <td style="padding: 4px 8px; color: var(--vela-text-muted, #757882); font-family: var(--vela-font-mono, monospace); font-size: 9.5px; white-space: nowrap;">#${f.id || f.orderId}</td>
                    <td style="padding: 4px 8px; text-align: right; white-space: nowrap;">
                        <button class="jump-fill-btn" data-fill-time="${f.time}" data-fill-sym="${f.symbol}" data-fill-price="${price}" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 3px; cursor: pointer;">Chart</button>
                    </td>
                </tr>
            `;
        }

        contentHtml = `
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr style="color: var(--vela-text-muted, #757882); font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--vela-border, #262629); background: var(--vela-bg, #202126); position: sticky; top: 0; z-index: 2;">
                        <th style="padding: 5px 8px;">Time</th>
                        <th style="padding: 5px 8px;">Symbol</th>
                        <th style="padding: 5px 8px;">Side</th>
                        <th style="padding: 5px 8px;">Fill Price</th>
                        <th style="padding: 5px 8px;">Quantity</th>
                        <th style="padding: 5px 8px;">Realized PnL</th>
                        <th style="padding: 5px 8px;">Fee</th>
                        <th style="padding: 5px 8px;">Trade ID</th>
                        <th style="padding: 5px 8px; text-align: right;">Action</th>
                    </tr>
                </thead>
                <tbody>${fillsRows}</tbody>
            </table>
        `;
    } else if (journalViewMode === 'daily') {
        const byDay: Record<string, { pnl: number; wins: number; losses: number; count: number; fees: number }> = {};
        for (const t of activeClosed) {
            const dayKey = new Date(t.closeTime).toISOString().slice(0, 10);
            if (!byDay[dayKey]) byDay[dayKey] = { pnl: 0, wins: 0, losses: 0, count: 0, fees: 0 };
            byDay[dayKey].pnl += t.netPnl;
            byDay[dayKey].fees += t.fee;
            byDay[dayKey].count++;
            if (t.netPnl > 0.0001) byDay[dayKey].wins++;
            else if (t.netPnl < -0.0001) byDay[dayKey].losses++;
        }

        const days = Object.keys(byDay).sort().reverse();
        let dayCardsHtml = '';
        for (const d of days) {
            const data = byDay[d];
            const dColor = data.pnl >= 0 ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
            const dWinRate = (data.wins + data.losses > 0) ? Math.round((data.wins / (data.wins + data.losses)) * 100) : 0;
            dayCardsHtml += `
                <div style="background: var(--vela-bg-card, #202126); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 6px 12px; display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <div style="font-weight: 700; font-size: 11.5px; color: var(--vela-text-primary, #eeeef1);">${d}</div>
                        <div style="font-size: 10px; color: var(--vela-text-muted, #757882); margin-top: 2px;">
                            ${data.count} trades • ${data.wins}W / ${data.losses}L (${dWinRate}% Win Rate) • Fees: $${data.fees.toFixed(3)}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 13px; font-weight: 700; color: ${dColor}; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums;">
                            ${data.pnl >= 0 ? '+' : ''}$${data.pnl.toFixed(2)} USDT
                        </div>
                    </div>
                </div>
            `;
        }

        contentHtml = `
            <div style="padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                ${dayCardsHtml || '<div style="color: var(--vela-text-muted, #757882); text-align: center; padding: 20px; font-size: 11px;">No daily data recorded yet.</div>'}
            </div>
        `;
    }

    const symbolOptions = ['ALL', ...uniqueSymbols].map(s => `
        <option value="${s}" ${s === journalSymbolFilter ? 'selected' : ''}>${s === 'ALL' ? 'All Symbols' : s}</option>
    `).join('');

    journalContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; background: var(--vela-bg, #202126);">
            <!-- TOP METRICS STRIP -->
            <div style="padding: 5px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--vela-border, #262629); background: var(--vela-bg, #202126); flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <!-- Realized Net PnL -->
                    <div style="background: ${netPnlBg}; border: 1px solid ${netPnlBorder}; border-radius: 4px; padding: 2px 8px; display: flex; flex-direction: column;">
                        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: var(--vela-text-muted, #757882); letter-spacing: 0.5px;">Net PnL</span>
                        <span style="font-size: 12.5px; font-weight: 800; color: ${netPnlColor}; font-family: var(--vela-font-mono, monospace); font-variant-numeric: tabular-nums;">
                            ${totalNetPnl >= 0 ? '+' : ''}$${totalNetPnl.toFixed(2)} USDT
                        </span>
                    </div>

                    <!-- Win Rate -->
                    <div style="background: var(--vela-bg-card, #202126); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 2px 8px; display: flex; flex-direction: column;">
                        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: var(--vela-text-muted, #757882); letter-spacing: 0.5px;">Win Rate</span>
                        <div style="display: flex; align-items: baseline; gap: 4px;">
                            <span style="font-size: 12px; font-weight: 700; color: var(--vela-text-primary, #eeeef1); font-family: var(--vela-font-mono, monospace);">${winRate}%</span>
                            <span style="font-size: 9.5px; color: var(--vela-text-muted, #757882);">(${winCount}W / ${lossCount}L)</span>
                        </div>
                    </div>

                    <!-- Profit Factor -->
                    <div style="background: var(--vela-bg-card, #202126); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 2px 8px; display: flex; flex-direction: column;">
                        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: var(--vela-text-muted, #757882); letter-spacing: 0.5px;">Profit Factor</span>
                        <span style="font-size: 12px; font-weight: 700; color: var(--vela-text-primary, #eeeef1); font-family: var(--vela-font-mono, monospace);">${profitFactor}</span>
                    </div>

                    <!-- Close Breakdown -->
                    <div style="background: var(--vela-bg-card, #202126); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 2px 8px; display: flex; flex-direction: column;">
                        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: var(--vela-text-muted, #757882); letter-spacing: 0.5px;">Exit Breakdown</span>
                        <div style="display: flex; gap: 6px; align-items: center; margin-top: 1px;">
                            <span style="font-size: 9.5px; font-weight: 700; color: var(--vela-up, #a7be94);">TP ${tpCount}</span>
                            <span style="font-size: 9.5px; color: var(--vela-border, #3a3b45);">•</span>
                            <span style="font-size: 9.5px; font-weight: 700; color: var(--vela-down, #af6870);">SL ${slCount}</span>
                            <span style="font-size: 9.5px; color: var(--vela-border, #3a3b45);">•</span>
                            <span style="font-size: 9.5px; font-weight: 700; color: #38c0fd;">MANUAL ${manualCount}</span>
                        </div>
                    </div>
                </div>

                <!-- CONTROLS -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <select id="journal-sym-filter" style="background: var(--vela-bg-chip, #292a2f); color: var(--vela-text-primary, #eeeef1); border: 1px solid var(--vela-border, #262629); border-radius: 3px; padding: 3px 6px; font-size: 10px; font-weight: 600; cursor: pointer; outline: none;">
                        ${symbolOptions}
                    </select>

                    <div style="display: flex; background: var(--vela-bg-card, #202126); border: 1px solid var(--vela-border, #262629); border-radius: 3px; padding: 1px;">
                        <button id="view-mode-trades" style="background: ${journalViewMode === 'trades' ? 'var(--vela-bg-chip, #292a2f)' : 'transparent'}; color: ${journalViewMode === 'trades' ? 'var(--vela-text-primary, #eeeef1)' : 'var(--vela-text-secondary, #757882)'}; border: none; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 2px; cursor: pointer;">Trades (${activeClosed.length})</button>
                        <button id="view-mode-fills" style="background: ${journalViewMode === 'fills' ? 'var(--vela-bg-chip, #292a2f)' : 'transparent'}; color: ${journalViewMode === 'fills' ? 'var(--vela-text-primary, #eeeef1)' : 'var(--vela-text-secondary, #757882)'}; border: none; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 2px; cursor: pointer;">Fills (${activeFills.length})</button>
                        <button id="view-mode-daily" style="background: ${journalViewMode === 'daily' ? 'var(--vela-bg-chip, #292a2f)' : 'transparent'}; color: ${journalViewMode === 'daily' ? 'var(--vela-text-primary, #eeeef1)' : 'var(--vela-text-secondary, #757882)'}; border: none; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 2px; cursor: pointer;">Daily PnL</button>
                    </div>

                    <button id="journal-maximize-btn" title="${isJournalMaximized ? 'Dock to bottom' : 'Expand full height'}" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; font-weight: 600; padding: 3px 6px; border-radius: 3px; cursor: pointer;">
                        ${isJournalMaximized ? 'Dock' : 'Expand'}
                    </button>

                    <button id="refresh-journal-btn" title="Refresh trade fills from Binance" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; font-weight: 600; padding: 3px 6px; border-radius: 3px; cursor: pointer;">↻</button>
                </div>
            </div>

            <!-- TABLE CONTENT -->
            <div style="flex: 1; overflow: auto; background: var(--vela-bg, #202126);">
                ${contentHtml}
            </div>
        </div>
    `;

    // Bind event listeners
    journalContainer.querySelector('#refresh-journal-btn')?.addEventListener('click', () => {
        fetchTradeHistory(journalSymbolFilter === 'ALL' ? undefined : journalSymbolFilter);
    });

    journalContainer.querySelector('#journal-maximize-btn')?.addEventListener('click', () => {
        toggleJournalPanelMaximize();
    });

    const symSelect = journalContainer.querySelector('#journal-sym-filter') as HTMLSelectElement | null;
    symSelect?.addEventListener('change', () => {
        journalSymbolFilter = symSelect.value;
        updateJournalUI();
    });

    journalContainer.querySelector('#view-mode-trades')?.addEventListener('click', () => {
        journalViewMode = 'trades';
        updateJournalUI();
    });

    journalContainer.querySelector('#view-mode-fills')?.addEventListener('click', () => {
        journalViewMode = 'fills';
        updateJournalUI();
    });

    journalContainer.querySelector('#view-mode-daily')?.addEventListener('click', () => {
        journalViewMode = 'daily';
        updateJournalUI();
    });

    // Bind jump buttons and row clicks
    journalContainer.querySelectorAll('.journ-trade-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.jump-trade-btn')) return;
            const id = (row as HTMLElement).dataset.tradeId;
            const target = activeClosed.find(t => String(t.id) === String(id));
            if (target) void jumpChartToTrade(target);
        });
    });

    journalContainer.querySelectorAll('.jump-trade-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = (btn as HTMLElement).dataset.tradeId;
            const target = activeClosed.find(t => String(t.id) === String(id));
            if (target) void jumpChartToTrade(target);
        });
    });

    journalContainer.querySelectorAll('.journ-fill-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.jump-fill-btn')) return;
            const time = Number((row as HTMLElement).dataset.fillTime || 0);
            const sym = (row as HTMLElement).dataset.fillSym || '';
            const price = parseFloat((row as HTMLElement).dataset.fillPrice || '0');
            void jumpChartToFill(time, sym, price);
        });
    });

    journalContainer.querySelectorAll('.jump-fill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const time = Number((btn as HTMLElement).dataset.fillTime || 0);
            const sym = (btn as HTMLElement).dataset.fillSym || '';
            const price = parseFloat((btn as HTMLElement).dataset.fillPrice || '0');
            void jumpChartToFill(time, sym, price);
        });
    });
}

let orderTicketPanelEl: HTMLElement | null = null;
let isOrderTicketOpen = false;
let orderTicketWidth = 330;

export function updateTradeButtonActiveState(active: boolean) {
    const actionBtn = document.querySelector<HTMLButtonElement>("[data-action-id='trade.toggle']");
    if (actionBtn) {
        actionBtn.dataset.active = active ? '1' : '';
    }
}

export function toggleTradingTicket(open?: boolean) {
    if (!orderTicketPanelEl) return;
    const nextState = open !== undefined ? open : !isOrderTicketOpen;
    isOrderTicketOpen = nextState;

    if (isOrderTicketOpen) {
        orderTicketPanelEl.style.display = 'flex';
        requestAnimationFrame(() => {
            if (orderTicketPanelEl) {
                orderTicketPanelEl.classList.add('open');
                orderTicketPanelEl.style.width = `${orderTicketWidth}px`;
            }
        });
        const currentSym = wsInstance?.active?.symbol || state.symbol;
        if (currentSym) {
            setActiveSymbol(currentSym);
        }
        fetchStats(state.symbol);
        fetchAccount();
        fetchOrders(state.symbol);
    } else {
        orderTicketPanelEl.classList.remove('open');
        orderTicketPanelEl.style.width = '0px';
        setTimeout(() => {
            if (!isOrderTicketOpen && orderTicketPanelEl) {
                orderTicketPanelEl.style.display = 'none';
            }
        }, 200);
    }

    updateTradeButtonActiveState(isOrderTicketOpen);
    setTimeout(() => wsInstance?.resize?.(), 50);
}

export function registerTradingSidePanel() {
    // Retained for backward compatibility
}

export function mountIndependentOrderTicket(ws: VelaWorkspace) {
    if (orderTicketPanelEl) return;
    const mainHost = (ws.root?.querySelector('.vela-ws-main') || document.querySelector('.vela-ws-main')) as HTMLElement | null;
    if (!mainHost) return;

    const panel = document.createElement('div');
    panel.id = 'vela-order-ticket';
    panel.className = 'vela-order-ticket-panel';
    panel.style.width = '0px';
    panel.style.display = 'none';

    panel.innerHTML = `
        <div class="vela-order-ticket-resizer" title="Drag to resize"></div>
        <div class="vela-order-ticket-header">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span class="vela-order-ticket-title">Order Ticket</span>
            </div>
            <div style="flex: 1 1 auto;"></div>
            <button class="vela-order-ticket-close" title="Close Order Ticket">✕</button>
        </div>
        <div class="vela-order-ticket-body">
            <div style="padding: 12px; font-family: -apple-system, system-ui, sans-serif; font-size: 12px; color: var(--vela-text-secondary, #757882); background: var(--vela-bg, #202126);">
                    <!-- Environment switcher -->
                    <div style="display: flex; gap: 6px; margin-bottom: 12px;">
                        <button id="env-testnet-btn" style="flex: 1; padding: 6px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid ${state.isTestnet ? 'rgba(255, 255, 255, 0.45)' : 'var(--vela-border, #262629)'}; background: ${state.isTestnet ? 'rgba(255, 255, 255, 0.1)' : 'var(--vela-bg-card, #232429)'}; color: ${state.isTestnet ? '#ffffff' : 'var(--vela-text-secondary, #757882)'}; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                            <img src="${BINANCE_WHITE_ICON}" alt="Testnet" style="width: 14px; height: 14px; opacity: ${state.isTestnet ? '1' : '0.45'};" />
                            <span>TESTNET</span>
                        </button>
                        <button id="env-prod-btn" style="flex: 1; padding: 6px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid ${!state.isTestnet ? '#f0b90b' : 'var(--vela-border, #262629)'}; background: ${!state.isTestnet ? 'rgba(240, 185, 11, 0.16)' : 'var(--vela-bg-card, #232429)'}; color: ${!state.isTestnet ? '#f0b90b' : 'var(--vela-text-secondary, #757882)'}; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                            <img src="${BINANCE_YELLOW_ICON}" alt="Production" style="width: 14px; height: 14px; opacity: ${!state.isTestnet ? '1' : '0.45'};" />
                            <span>PRODUCTION LIVE</span>
                        </button>
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
                    <div style="display: flex; background: var(--vela-bg-card, #202126); border: 1px solid var(--vela-border, #262629); border-radius: 6px; margin-bottom: 12px; overflow: hidden;">
                        <button id="type-market-btn" style="flex: 1; padding: 6px; font-size: 11px; font-weight: 700; background: var(--vela-bg-chip, #292a2f); color: var(--vela-text-primary, #eeeef1); border: none; cursor: pointer;">Market</button>
                        <button id="type-limit-btn" style="flex: 1; padding: 6px; font-size: 11px; font-weight: 700; background: transparent; color: var(--vela-text-secondary, #757882); border: none; cursor: pointer;">Limit</button>
                        <button id="type-stop-btn" style="flex: 1; padding: 6px; font-size: 11px; font-weight: 700; background: transparent; color: var(--vela-text-secondary, #757882); border: none; cursor: pointer;">Stop</button>
                    </div>

                    <!-- Price input (Limit/Stop) -->
                    <div id="field-price-group" style="display: none; margin-bottom: 10px;">
                        <label style="display: block; font-size: 11px; color: var(--vela-text-secondary, #757882); margin-bottom: 4px;">Price (USDT)</label>
                        <input id="input-order-price" type="number" step="any" placeholder="Price" style="width: 100%; box-sizing: border-box; background: var(--vela-bg-card, #232429); color: var(--vela-text-primary, #eeeef1); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 8px 10px; font-size: 12px; outline: none;" />
                    </div>

                    <!-- Quantity Input with Unit Toggle & Live Conversion -->
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-size: 11px; color: var(--vela-text-secondary, #757882); font-weight: 600;">Order Amount</span>
                            <span style="font-size: 11px; color: var(--vela-text-secondary, #757882);">Avail: <strong id="trade-panel-avail" style="color: var(--vela-text-primary, #eeeef1);">--</strong></span>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <input id="input-order-qty" type="number" step="any" placeholder="100" style="flex: 1; min-width: 0; box-sizing: border-box; background: var(--vela-bg-card, #232429); color: var(--vela-text-primary, #eeeef1); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 8px 10px; font-size: 12px; outline: none;" />
                            <select id="select-order-unit" style="width: 124px; background: var(--vela-bg-card, #232429); color: var(--vela-text-primary, #eeeef1); border: 1px solid var(--vela-border, #262629); border-radius: 4px; padding: 6px 8px; font-size: 11px; font-weight: 700; cursor: pointer;">
                                <option value="USDT_TOTAL" selected>USDT (Total)</option>
                                <option value="USDT_MARGIN">USDT (Margin)</option>
                                <option value="QTY">Coin (Qty)</option>
                            </select>
                        </div>
                        <!-- Live Calculation Card -->
                        <div id="trade-calc-card" style="margin-top: 6px; padding: 6px 8px; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); border-radius: 4px; font-size: 11px; display: flex; justify-content: space-between; color: var(--vela-text-secondary, #757882);">
                            <span>Position: <strong id="calc-notional" style="color: var(--vela-text-primary, #eeeef1);">--</strong></span>
                            <span>Margin: <strong id="calc-margin" style="color: var(--vela-up, #a7be94);">--</strong></span>
                        </div>
                    </div>

                    <!-- Quick % Allocation Buttons -->
                    <div style="display: flex; gap: 4px; margin-bottom: 14px;">
                        <button class="pct-btn" data-pct="0.25" style="flex: 1; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 4px 0; border-radius: 4px; cursor: pointer;">25%</button>
                        <button class="pct-btn" data-pct="0.50" style="flex: 1; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 4px 0; border-radius: 4px; cursor: pointer;">50%</button>
                        <button class="pct-btn" data-pct="0.75" style="flex: 1; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 4px 0; border-radius: 4px; cursor: pointer;">75%</button>
                        <button class="pct-btn" data-pct="1.00" style="flex: 1; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px; padding: 4px 0; border-radius: 4px; cursor: pointer;">100%</button>
                    </div>

                    <!-- Bracket TP / SL -->
                    <div style="background: var(--vela-bg-card, #202126); border: 1px solid var(--vela-border, #262629); border-radius: 6px; padding: 8px 10px; margin-bottom: 14px;">
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
            </div>
    `;

    mainHost.appendChild(panel);
    orderTicketPanelEl = panel;

    const closeBtn = panel.querySelector('.vela-order-ticket-close');
    closeBtn?.addEventListener('click', () => {
        toggleTradingTicket(false);
    });

    const resizer = panel.querySelector('.vela-order-ticket-resizer') as HTMLElement;
    if (resizer) {
        let isResizing = false;
        let startX = 0;
        let startWidth = orderTicketWidth;

        resizer.addEventListener('pointerdown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = orderTicketWidth;
            resizer.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const onPointerMove = (ev: PointerEvent) => {
                if (!isResizing) return;
                const delta = startX - ev.clientX;
                const newW = Math.max(280, Math.min(500, startWidth + delta));
                orderTicketWidth = newW;
                panel.style.width = `${newW}px`;
                ws.resize?.();
            };

            const onPointerUp = () => {
                isResizing = false;
                resizer.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
            };

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        });
    }

    const body = panel.querySelector('.vela-order-ticket-body') as HTMLElement;

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
                setEnvironment(true);
            });

            envProd?.addEventListener('click', () => {
                setEnvironment(false);
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

            const calcNotional = body.querySelector('#calc-notional') as HTMLElement | null;
            const calcMargin = body.querySelector('#calc-margin') as HTMLElement | null;
            const unitSelect = body.querySelector('#select-order-unit') as HTMLSelectElement | null;
            const leverageSelect = body.querySelector('#trade-leverage') as HTMLSelectElement | null;
            const marginModeSelect = body.querySelector('#trade-margin-mode') as HTMLSelectElement | null;

            const updateConversionUI = () => {
                if (!calcNotional || !calcMargin || !inputQty) return;
                const val = parseFloat(inputQty.value || '0');
                const price = (state.orderType === 'LIMIT' || state.orderType === 'STOP_MARKET') && parseFloat(inputPrice.value || '0') > 0
                    ? parseFloat(inputPrice.value)
                    : (state.currentPrice > 0 ? state.currentPrice : 85000);

                const baseAsset = state.symbol.replace(/USDT$/i, '');
                const lev = Math.max(1, state.leverage || 20);

                if (val <= 0 || price <= 0) {
                    calcNotional.textContent = '--';
                    calcMargin.textContent = `-- (@ ${lev}x)`;
                    return;
                }

                let notional = 0;
                let margin = 0;
                let coinQty = 0;

                if (state.inputUnit === 'USDT_TOTAL') {
                    notional = val;
                    margin = notional / lev;
                    coinQty = notional / price;
                } else if (state.inputUnit === 'USDT_MARGIN') {
                    margin = val;
                    notional = margin * lev;
                    coinQty = notional / price;
                } else {
                    coinQty = val;
                    notional = coinQty * price;
                    margin = notional / lev;
                }

                const prec = state.constraints.precision ?? 3;
                const step = state.constraints.stepSize || 0.001;
                const alignedCoins = (Math.floor(coinQty / step) * step).toFixed(prec);

                calcNotional.textContent = `$${notional.toFixed(2)} (~${alignedCoins} ${baseAsset})`;
                calcMargin.textContent = `$${margin.toFixed(2)} (@ ${lev}x)`;
            };

            updateConversionUICallback = updateConversionUI;
            inputQty?.addEventListener('input', updateConversionUI);
            inputPrice?.addEventListener('input', updateConversionUI);

            unitSelect?.addEventListener('change', () => {
                state.inputUnit = unitSelect.value as any;
                if (state.inputUnit === 'USDT_TOTAL') {
                    inputQty.placeholder = '100 (USDT)';
                } else if (state.inputUnit === 'USDT_MARGIN') {
                    inputQty.placeholder = '5 (USDT Margin)';
                } else {
                    inputQty.placeholder = '0.05 (Coins)';
                }
                updateConversionUI();
            });

            leverageSelect?.addEventListener('change', async () => {
                state.leverage = parseInt(leverageSelect.value) || 20;
                updateConversionUI();
                try {
                    const res = await fetch('/api/binance/leverage', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            symbol: state.symbol,
                            leverage: state.leverage,
                            testnet: state.isTestnet
                        })
                    });
                    const data = await res.json();
                    if (res.ok && !data.error) {
                        toast(`Leverage set to ${state.leverage}x for ${state.symbol}`, 'info');
                    } else {
                        toast(`Leverage update: ${data.error || 'Set'}`, 'info');
                    }
                } catch (err: any) {
                    console.warn('Leverage change error:', err);
                }
            });

            marginModeSelect?.addEventListener('change', async () => {
                state.marginMode = (marginModeSelect.value as 'isolated' | 'cross') || 'isolated';
                try {
                    const marginType = state.marginMode === 'cross' ? 'CROSSED' : 'ISOLATED';
                    const res = await fetch('/api/binance/margin-type', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            symbol: state.symbol,
                            marginType,
                            testnet: state.isTestnet
                        })
                    });
                    const data = await res.json();
                    if (res.ok && !data.error) {
                        toast(`Margin mode set to ${marginType} for ${state.symbol}`, 'info');
                    } else {
                        toast(`Margin mode: ${data.error || data.msg || 'OK'}`, 'info');
                    }
                } catch (err: any) {
                    console.warn('Margin mode change error:', err);
                }
            });

            body.querySelectorAll('.pct-btn').forEach(btn => {
                btn.addEventListener('click', (e: any) => {
                    const pct = parseFloat(e.target.getAttribute('data-pct'));
                    if (state.availableBalance > 0) {
                        const price = (state.orderType === 'LIMIT' || state.orderType === 'STOP_MARKET') && parseFloat(inputPrice.value || '0') > 0
                            ? parseFloat(inputPrice.value)
                            : (state.currentPrice > 0 ? state.currentPrice : 85000);

                        if (state.inputUnit === 'USDT_TOTAL') {
                            const notional = state.availableBalance * pct * state.leverage;
                            inputQty.value = notional.toFixed(2);
                        } else if (state.inputUnit === 'USDT_MARGIN') {
                            const margin = state.availableBalance * pct;
                            inputQty.value = margin.toFixed(2);
                        } else {
                            const notional = state.availableBalance * pct * state.leverage;
                            const prec = state.constraints.precision ?? 3;
                            inputQty.value = (notional / price).toFixed(prec);
                        }
                        updateConversionUI();
                    }
                });
            });

            placeBtn?.addEventListener('click', async () => {
                const inputVal = parseFloat(inputQty.value || '0');
                if (inputVal <= 0) {
                    if (tradeMsg) tradeMsg.textContent = 'Please enter a valid amount';
                    return;
                }

                const price = (state.orderType === 'LIMIT' || state.orderType === 'STOP_MARKET') && parseFloat(inputPrice.value || '0') > 0
                    ? parseFloat(inputPrice.value)
                    : (state.currentPrice > 0 ? state.currentPrice : 85000);

                let calculatedCoins = inputVal;
                if (state.inputUnit === 'USDT_TOTAL') {
                    calculatedCoins = inputVal / price;
                } else if (state.inputUnit === 'USDT_MARGIN') {
                    calculatedCoins = (inputVal * state.leverage) / price;
                }

                const step = state.constraints.stepSize || 0.001;
                const prec = state.constraints.precision ?? 3;
                let finalQty = parseFloat((Math.floor(calculatedCoins / step) * step).toFixed(prec));

                if (finalQty < (state.constraints.minQty || 0.001)) {
                    finalQty = state.constraints.minQty || 0.001;
                }

                if (finalQty <= 0) {
                    if (tradeMsg) tradeMsg.textContent = 'Calculated quantity is too small for exchange filters';
                    return;
                }

                const notionalValue = finalQty * price;
                if (state.constraints.minNotional && notionalValue < state.constraints.minNotional) {
                    if (tradeMsg) tradeMsg.textContent = `Order value ($${notionalValue.toFixed(2)}) is below exchange minimum ($${state.constraints.minNotional})`;
                    return;
                }

                if (placeBtn) placeBtn.textContent = 'Submitting...';
                try {
                    const payload: any = {
                        symbol: state.symbol,
                        side: state.side,
                        type: state.orderType,
                        quantity: finalQty,
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

                    toast(`Order placed: ${state.side} ${finalQty} ${state.symbol} (~$${notionalValue.toFixed(2)} USDT)`, 'info');
                    if (tradeMsg) tradeMsg.textContent = `Order placed: #${json.main?.orderId || 'OK'}`;
                    await Promise.all([fetchAccount(), fetchOrders()]);
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('vela:repaint-lines'));
                    }
                } catch (e: any) {
                    toast(`Order failed: ${e.message}`, 'error');
                    if (tradeMsg) tradeMsg.textContent = `Error: ${e.message}`;
                } finally {
                    refreshSideAndButton();
                }
            });

            refreshSideAndButton();
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
        run: () => {
            toggleTradingTicket();
        }
    });
}

// ── Workspace Instance & Indicator Refresh ────────────────────────────────────
export function setWorkspaceInstance(ws: VelaWorkspace) {
    wsInstance = ws;
    mountIndependentOrderTicket(ws);
    ws.on('cell:created', () => syncTradeMarksToCharts());
    for (const cell of ws.cells()) {
        cell.chart.on('market:changed', () => syncTradeMarksToCharts());
    }
}

export function getWorkspaceInstance(): VelaWorkspace | null {
    return wsInstance;
}

export async function refreshWorkspaceIndicators(ws: VelaWorkspace | null = wsInstance): Promise<void> {
    if (!ws) return;
    try {
        const res = await fetch('/api/indicators');
        if (!res.ok) return;
        const list = await res.json();
        (ws as any).manifest = list;
        for (const cell of ws.cells()) {
            cell.setManifest(list, false);
        }
        const picker = (ws as any).indicatorPicker;
        if (picker && typeof picker.sync === 'function') {
            picker.sync();
        }
    } catch (err) {
        console.warn('[indicators] Failed to refresh workspace indicators:', err);
    }
}

// ── Pine Script Runtime Editor Dialog ─────────────────────────────────────────
let pineDialog: Dialog | null = null;
let pineEditorArea: HTMLTextAreaElement | null = null;
let pineNameInput: HTMLInputElement | null = null;
let pineSavedSelect: HTMLSelectElement | null = null;
let pineStatus: HTMLElement | null = null;
let pineRunBtn: HTMLButtonElement | null = null;
let pineSaveBtn: HTMLButtonElement | null = null;
let pineDeleteBtn: HTMLButtonElement | null = null;
let savedIndicatorsCache: Array<{ id: string; name: string; script: string }> = [];

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

async function updateSavedDropdown(): Promise<void> {
    if (!pineSavedSelect) return;
    try {
        const res = await fetch('/api/indicators');
        if (res.ok) {
            savedIndicatorsCache = await res.json();
        }
    } catch {
        /* fallback */
    }
    pineSavedSelect.replaceChildren();
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '-- Load Saved Indicator --';
    pineSavedSelect.appendChild(defaultOpt);

    for (const ind of savedIndicatorsCache) {
        const opt = document.createElement('option');
        opt.value = ind.id;
        opt.textContent = ind.name;
        pineSavedSelect.appendChild(opt);
    }
}

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
                container.style.cssText = 'display: flex; flex-direction: column; gap: 10px; width: 580px; max-width: 85vw;';

                // Top Controls: Name input, Saved Selector, Delete
                const topControls = document.createElement('div');
                topControls.style.cssText = 'display: flex; gap: 8px; align-items: center; width: 100%;';

                pineNameInput = document.createElement('input');
                pineNameInput.type = 'text';
                pineNameInput.placeholder = 'Indicator Name (e.g. EMA Ribbon)';
                pineNameInput.style.cssText = `
                    flex: 1;
                    background: var(--vela-bg-main, #202126);
                    color: var(--vela-text-primary, #eeeef1);
                    border: 1px solid var(--vela-border, #262629);
                    border-radius: 4px;
                    padding: 6px 10px;
                    font-size: 12px;
                    outline: none;
                `;

                pineSavedSelect = document.createElement('select');
                pineSavedSelect.style.cssText = `
                    width: 200px;
                    background: var(--vela-bg-panel, #18191e);
                    color: var(--vela-text-primary, #eeeef1);
                    border: 1px solid var(--vela-border, #262629);
                    border-radius: 4px;
                    padding: 6px 8px;
                    font-size: 12px;
                    outline: none;
                    cursor: pointer;
                `;

                pineDeleteBtn = document.createElement('button');
                pineDeleteBtn.textContent = '✕';
                pineDeleteBtn.title = 'Delete saved indicator';
                pineDeleteBtn.style.cssText = `
                    background: transparent;
                    color: var(--vela-down, #af6870);
                    border: 1px solid var(--vela-border, #262629);
                    border-radius: 4px;
                    padding: 6px 10px;
                    font-size: 12px;
                    cursor: pointer;
                    display: none;
                `;

                pineSavedSelect.addEventListener('change', () => {
                    const selectedId = pineSavedSelect!.value;
                    if (!selectedId) {
                        if (pineDeleteBtn) pineDeleteBtn.style.display = 'none';
                        return;
                    }
                    const item = savedIndicatorsCache.find(i => i.id === selectedId);
                    if (item && pineEditorArea && pineNameInput) {
                        pineEditorArea.value = item.script;
                        pineNameInput.value = item.name;
                        if (pineDeleteBtn) pineDeleteBtn.style.display = 'inline-block';
                        if (pineStatus) {
                            pineStatus.style.color = 'var(--vela-text-secondary, #757882)';
                            pineStatus.textContent = `Loaded "${item.name}"`;
                        }
                    }
                });

                pineDeleteBtn.onclick = async () => {
                    const selectedId = pineSavedSelect?.value;
                    if (!selectedId) return;
                    const item = savedIndicatorsCache.find(i => i.id === selectedId);
                    if (!confirm(`Delete "${item?.name || selectedId}" from saved indicators?`)) return;

                    try {
                        const res = await fetch(`/api/indicators/${encodeURIComponent(selectedId)}`, { method: 'DELETE' });
                        if (res.ok) {
                            if (pineStatus) {
                                pineStatus.style.color = 'var(--vela-up, #a7be94)';
                                pineStatus.textContent = '✓ Deleted indicator';
                            }
                            pineDeleteBtn!.style.display = 'none';
                            await updateSavedDropdown();
                            await refreshWorkspaceIndicators(wsInstance);
                        } else {
                            if (pineStatus) {
                                pineStatus.style.color = 'var(--vela-down, #af6870)';
                                pineStatus.textContent = '✗ Failed to delete indicator';
                            }
                        }
                    } catch (err: any) {
                        if (pineStatus) {
                            pineStatus.style.color = 'var(--vela-down, #af6870)';
                            pineStatus.textContent = `✗ ${err.message}`;
                        }
                    }
                };

                topControls.appendChild(pineNameInput);
                topControls.appendChild(pineSavedSelect);
                topControls.appendChild(pineDeleteBtn);

                // Code Editor Textarea
                pineEditorArea = document.createElement('textarea');
                pineEditorArea.value = DEFAULT_PINE_SCRIPT;
                pineEditorArea.spellcheck = false;
                pineEditorArea.style.cssText = `
                    width: 100%;
                    box-sizing: border-box;
                    height: 250px;
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

                // Bottom Action Buttons
                const btnRow = document.createElement('div');
                btnRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;';

                const leftBtns = document.createElement('div');
                leftBtns.style.cssText = 'display: flex; gap: 8px; align-items: center;';

                pineRunBtn = document.createElement('button');
                pineRunBtn.textContent = 'Compile & Run on Chart';
                pineRunBtn.style.cssText = `
                    background: var(--vela-up, #a7be94);
                    color: var(--vela-bg-panel, #121215);
                    border: none;
                    border-radius: 4px;
                    padding: 8px 14px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                `;

                pineSaveBtn = document.createElement('button');
                pineSaveBtn.textContent = '★ Save to Indicators';
                pineSaveBtn.title = 'Save indicator so it appears in the Indicators dropdown catalog';
                pineSaveBtn.style.cssText = `
                    background: #4a7bb0;
                    color: #fff;
                    border: none;
                    border-radius: 4px;
                    padding: 8px 14px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                `;

                leftBtns.appendChild(pineRunBtn);
                leftBtns.appendChild(pineSaveBtn);

                pineStatus = document.createElement('div');
                pineStatus.style.cssText = 'font-size: 12px; color: var(--vela-text-secondary, #757882); flex: 1; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

                btnRow.appendChild(leftBtns);
                btnRow.appendChild(pineStatus);

                container.appendChild(topControls);
                container.appendChild(pineEditorArea);
                container.appendChild(btnRow);

                pineDialog = new Dialog({
                    title: 'Pine Script v5 Runtime (Worker)',
                    host: ctx.host,
                    closeOnInteractOutside: true,
                    content: (body) => body.append(container),
                });
            }

            // Run action
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

            // Save action
            pineSaveBtn!.onclick = async () => {
                if (!pineEditorArea || !pineStatus) return;
                const script = pineEditorArea.value.trim();
                if (!script) {
                    pineStatus.style.color = 'var(--vela-down, #af6870)';
                    pineStatus.textContent = '✗ Script cannot be empty';
                    return;
                }

                const nameRegex = new RegExp('(?:indicator|strategy)\\s*\\(\\s*["\x27]([^"\x27]+)["\x27]');
                const match = script.match(nameRegex);
                let name = pineNameInput?.value.trim() || (match ? match[1] : '');
                if (!name) name = 'Custom Pine Indicator';

                pineStatus.style.color = 'var(--vela-text-secondary, #757882)';
                pineStatus.textContent = 'Saving to indicators catalog...';

                try {
                    const res = await fetch('/api/indicators', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: pineSavedSelect?.value || undefined,
                            name,
                            script,
                            language: 'pine',
                            category: 'Custom Indicators'
                        })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        pineStatus.style.color = 'var(--vela-up, #a7be94)';
                        pineStatus.textContent = `✓ Saved "${name}" to Indicators catalog!`;
                        await updateSavedDropdown();
                        if (pineSavedSelect && data.indicator?.id) {
                            pineSavedSelect.value = data.indicator.id;
                            if (pineDeleteBtn) pineDeleteBtn.style.display = 'inline-block';
                        }
                        await refreshWorkspaceIndicators(wsInstance);
                    } else {
                        const errData = await res.json().catch(() => ({}));
                        pineStatus.style.color = 'var(--vela-down, #af6870)';
                        pineStatus.textContent = `✗ Save failed: ${errData.error || res.statusText}`;
                    }
                } catch (err: any) {
                    pineStatus.style.color = 'var(--vela-down, #af6870)';
                    pineStatus.textContent = `✗ ${err.message}`;
                }
            };

            pineStatus!.textContent = '';
            void updateSavedDropdown();
            pineDialog.show();
            setTimeout(() => pineEditorArea?.focus(), 50);
        }
    });
}
// ── TradingView-Style Bar Replay ──────────────────────────────────────────────


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
        background: var(--vela-bg, #202126);
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
                    <button id="tab-history-btn" style="background: transparent; color: var(--vela-text-secondary, #757882); border: none; font-size: 11px; font-weight: 600; padding: 4px 10px; cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">Order History (<span id="hist-count">0</span>)</button>
                    <button id="tab-journal-btn" style="background: transparent; color: var(--vela-text-secondary, #757882); border: none; font-size: 11px; font-weight: 600; padding: 4px 10px; cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">Trade Journal (<span id="journ-count">0</span>)</button>
                </div>
                <div style="flex: 1 1 auto;"></div>
                <div style="display: flex; align-items: center; gap: 8px; flex: none; margin-right: 6px;">
                    <button id="strip-env-badge" title="${state.isTestnet ? 'Binance Testnet (Click to switch to Production Live)' : 'Binance Production Live (Click to switch to Testnet)'}" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 26px; border-radius: 4px; border: 1px solid ${state.isTestnet ? 'rgba(255, 255, 255, 0.2)' : '#f0b90b'}; background: ${state.isTestnet ? 'rgba(255, 255, 255, 0.06)' : 'rgba(240, 185, 11, 0.18)'}; box-shadow: ${state.isTestnet ? 'none' : '0 0 8px rgba(240, 185, 11, 0.3)'}; cursor: pointer; transition: all 0.15s ease; flex: none; padding: 0;">
                        <img id="strip-env-icon" src="${state.isTestnet ? BINANCE_WHITE_ICON : BINANCE_YELLOW_ICON}" alt="Binance" style="width: 17px; height: 17px; display: block;" />
                    </button>
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

        if (tab === 'positions') {
            updatePositionsUI();
            fetchAccount();
        } else if (tab === 'orders') {
            updateOrdersUI();
            fetchOrders(state.symbol);
        } else if (tab === 'history') {
            updateHistoryUI();
            fetchOrderHistory(state.symbol);
        } else if (tab === 'journal') {
            updateJournalUI();
            fetchTradeHistory();
        }
    };

    tabPos?.addEventListener('click', () => switchTab('positions'));
    tabOrd?.addEventListener('click', () => switchTab('orders'));
    tabHist?.addEventListener('click', () => switchTab('history'));
    tabJourn?.addEventListener('click', () => switchTab('journal'));

    const envBadge = document.getElementById('strip-env-badge');
    if (envBadge) {
        envBadge.style.cursor = 'pointer';
        envBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            setEnvironment(!state.isTestnet);
        });
        envBadge.addEventListener('mouseenter', () => {
            if (state.isTestnet) {
                envBadge.style.background = 'rgba(255, 255, 255, 0.12)';
            } else {
                envBadge.style.background = 'rgba(240, 185, 11, 0.28)';
            }
        });
        envBadge.addEventListener('mouseleave', () => {
            if (state.isTestnet) {
                envBadge.style.background = 'rgba(255, 255, 255, 0.06)';
            } else {
                envBadge.style.background = 'rgba(240, 185, 11, 0.18)';
            }
        });
    }

    toggleBtn?.addEventListener('click', () => {
        if (isPanelOpen) closePanel();
        else switchTab(activeTab);
    });

    // Initial panel data population
    fetchAccount();
    fetchOrders();
    fetchOrderHistory(state.symbol);
    fetchTradeHistory();
    startAccountPolling();
}

let pollingStarted = false;
export function startAccountPolling() {
    if (pollingStarted) return;
    pollingStarted = true;

    let isPolling = false;
    const pollLoop = async () => {
        if (isPolling) return;
        isPolling = true;
        try {
            await Promise.all([fetchAccount(), fetchOrders()]);
        } catch (err) {
            console.error('[polling] Background poll tick error:', err);
        } finally {
            isPolling = false;
            const hasActivity = (state.activePositions && state.activePositions.length > 0) || (state.openOrders && state.openOrders.length > 0);
            setTimeout(pollLoop, hasActivity ? 1200 : 2500);
        }
    };
    setTimeout(pollLoop, 1500);
}

// Automatically start background polling as soon as module loads
startAccountPolling();
