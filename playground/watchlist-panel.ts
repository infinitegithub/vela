import { setActiveSymbol } from './trade-suite';
import { registerSidePanel, registerIcon, registerStatePersistence, registerSymbolFavorite } from '../src/plugin';
import type { VelaWorkspace } from '../src/workspace';
import { tickerIconEl, baseOf } from '../src/widget/symbol-icon';
import { ledgerCryptoIconUrl } from '../src/data/symbol-base';
import { injectStyles } from '../src/ui/styles';

const WATCHLIST_PANEL_STYLE_ID = 'vela-watchlist-panel-styles';
const WATCHLIST_PANEL_CSS = `
.vela-wl-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--vela-fg-on-fill, #ffffff);
    font-size: 10px;
    font-weight: 700;
    overflow: hidden;
    user-select: none;
    background: var(--vela-bg-chip, #292a2f);
}
.vela-wl-avatar img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    display: block;
    object-fit: cover;
}
.wl-row:hover {
    background: var(--vela-bg-hover, #2b2d34) !important;
}
`;

// Register custom icons
registerIcon('watchlist', `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h7"/><circle cx="12.5" cy="12.5" r="1.5"/></svg>`);

let wsInstance: VelaWorkspace | null = null;
let activeSymbol = 'BTCUSDT';
let symbolChangeListeners: Array<(sym: string) => void> = [];

interface TriggeredAlert {
    id: string;
    source: string;
    symbol: string;
    title: string;
    message: string;
    time: string;
}

const triggeredAlerts: TriggeredAlert[] = [
    { id: "sample-1", source: "Pine Script", symbol: "BTCUSDT", title: "SuperTrend", message: "Bullish trend reversal at 86,400", time: "12m ago" }
];
let alertChangeListeners: Array<() => void> = [];

export function pushWorkspaceAlert(alert: { source?: string; symbol?: string; title?: string; message: string; time?: number }) {
    triggeredAlerts.unshift({
        id: String(Date.now() + Math.random()),
        source: alert.source || "Indicator",
        symbol: alert.symbol || activeSymbol,
        title: alert.title || "Alert",
        message: alert.message,
        time: new Date(alert.time || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
    if (triggeredAlerts.length > 50) triggeredAlerts.pop();
    for (const fn of alertChangeListeners) fn();
}

export function openAlertsPanel() {
    if (wsInstance) {
        (wsInstance as any).dock?.toggle("watchlist.panel", true);
    }
    const switchFn = (window as any).__switchWatchlistTab;
    if (switchFn) switchFn("alerts");
}

export function setWatchlistWorkspaceInstance(ws: VelaWorkspace) {
    wsInstance = ws;
    const bindCell = (cell: any) => {
        try {
            cell.chart.on("alert", (alert: any) => {
                pushWorkspaceAlert({
                    symbol: cell.symbol,
                    source: alert.indicator || cell.symbol,
                    title: alert.title,
                    message: alert.message,
                    time: alert.time,
                });
            });
        } catch (e) {
            // cell alert listener error
        }
    };
    for (const cell of ws.cells()) bindCell(cell);
    ws.on("cell:created", ({ id }) => {
        const cell = ws.cell(id);
        if (cell) bindCell(cell);
    });
}

export function setWatchlistActiveSymbol(sym: string) {
    activeSymbol = sym.toUpperCase().replace('-', '').replace('/', '');
    for (const listener of symbolChangeListeners) {
        listener(activeSymbol);
    }
}

interface WatchlistItem {
    symbol: string;        // e.g. BTC-USD, BTC-PERP
    binanceSymbol: string; // e.g. BTCUSDT, BTCUSDT.P
    canonicalSymbol?: string; // e.g. BINANCE:BTCUSDT, BINANCE:BTCUSDT.P
    name: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    high?: number;
    low?: number;
    turnover?: number;
    iconSvg?: string;      // legacy/fallback SVG
    iconUrl?: string;      // Ledger CDN URL or custom
    isFutures?: boolean;
}

// Default high-liquidity crypto assets matching user's view
const DEFAULT_WATCHLIST: WatchlistItem[] = [
    {
        symbol: 'BTC-USD',
        binanceSymbol: 'BTCUSDT',
        canonicalSymbol: 'BINANCE:BTCUSDT',
        name: 'Bitcoin',
        price: 82574.00,
        change: -449.99,
        changePercent: -0.54,
        volume: 16312,
    },
    {
        symbol: 'ETH-USD',
        binanceSymbol: 'ETHUSDT',
        canonicalSymbol: 'BINANCE:ETHUSDT',
        name: 'Ethereum',
        price: 2527.55,
        change: -31.72,
        changePercent: -1.24,
        volume: 308032,
    },
    {
        symbol: 'SOL-USD',
        binanceSymbol: 'SOLUSDT',
        canonicalSymbol: 'BINANCE:SOLUSDT',
        name: 'Solana',
        price: 112.57,
        change: -3.33,
        changePercent: -2.87,
        volume: 2120000,
    },
    {
        symbol: 'XRP-USD',
        binanceSymbol: 'XRPUSDT',
        canonicalSymbol: 'BINANCE:XRPUSDT',
        name: 'Ripple',
        price: 1.41,
        change: -0.03,
        changePercent: -1.77,
        volume: 127690000,
    },
    {
        symbol: 'DOGE-USD',
        binanceSymbol: 'DOGEUSDT',
        canonicalSymbol: 'BINANCE:DOGEUSDT',
        name: 'Dogecoin',
        price: 0.08738,
        change: -0.0011,
        changePercent: -1.20,
        volume: 912530000,
    },
    {
        symbol: 'LINK-USD',
        binanceSymbol: 'LINKUSDT',
        canonicalSymbol: 'BINANCE:LINKUSDT',
        name: 'Chainlink',
        price: 13.00,
        change: -0.38,
        changePercent: -2.83,
        volume: 1680000,
    },
    {
        symbol: 'AVAX-USD',
        binanceSymbol: 'AVAXUSDT',
        canonicalSymbol: 'BINANCE:AVAXUSDT',
        name: 'Avalanche',
        price: 10.64,
        change: -0.64,
        changePercent: -5.64,
        volume: 5120000,
    },
    {
        symbol: 'BNB-USD',
        binanceSymbol: 'BNBUSDT',
        canonicalSymbol: 'BINANCE:BNBUSDT',
        name: 'BNB',
        price: 758.80,
        change: -8.35,
        changePercent: -1.09,
        volume: 88900,
    },
    {
        symbol: 'SUI-USD',
        binanceSymbol: 'SUIUSDT',
        canonicalSymbol: 'BINANCE:SUIUSDT',
        name: 'Sui',
        price: 1.10,
        change: -0.02,
        changePercent: -1.38,
        volume: 63510000,
    },
    {
        symbol: 'BTC-PERP',
        binanceSymbol: 'BTCUSDT.P',
        canonicalSymbol: 'BINANCE:BTCUSDT.P',
        name: 'BTC Perpetual',
        price: 82540.10,
        change: -410.00,
        changePercent: -0.49,
        volume: 325200,
        isFutures: true,
    },
    {
        symbol: 'ETH-PERP',
        binanceSymbol: 'ETHUSDT.P',
        canonicalSymbol: 'BINANCE:ETHUSDT.P',
        name: 'ETH Perpetual',
        price: 2526.80,
        change: -32.10,
        changePercent: -1.25,
        volume: 1450000,
        isFutures: true,
    },
    {
        symbol: 'SOL-PERP',
        binanceSymbol: 'SOLUSDT.P',
        canonicalSymbol: 'BINANCE:SOLUSDT.P',
        name: 'SOL Perpetual',
        price: 112.50,
        change: -3.30,
        changePercent: -2.85,
        volume: 4890000,
        isFutures: true,
    },
    {
        symbol: 'NEAR-USD',
        binanceSymbol: 'NEARUSDT',
        canonicalSymbol: 'BINANCE:NEARUSDT',
        name: 'NEAR Protocol',
        price: 3.45,
        change: -0.08,
        changePercent: -2.26,
        volume: 18450000,
    },
    {
        symbol: 'PEPE-USD',
        binanceSymbol: 'PEPEUSDT',
        canonicalSymbol: 'BINANCE:PEPEUSDT',
        name: 'Pepe',
        price: 0.0000085,
        change: 0.0000002,
        changePercent: 2.41,
        volume: 142000000,
    },
    {
        symbol: 'SPY-USD',
        binanceSymbol: 'SPYUSDT',
        canonicalSymbol: 'SPYUSDT',
        name: 'SPDR S&P 500 ETF',
        price: 575.20,
        change: 3.40,
        changePercent: 0.59,
        volume: 852000,
    },
    {
        symbol: 'XAU-USD',
        binanceSymbol: 'XAUUSDT',
        canonicalSymbol: 'XAUUSDT',
        name: 'Gold',
        price: 2650.50,
        change: 12.80,
        changePercent: 0.49,
        volume: 320000,
    },
];

const WATCHLIST_STORAGE_KEY = 'vela-play:watchlist-store';

function getBaseAsset(item: { binanceSymbol?: string; symbol?: string; name?: string }): string {
    const raw = item.binanceSymbol || item.symbol || '';
    const clean = raw.replace(/^(BINANCE|COINBASE|HYPERLIQUID):/i, '').replace(/\.P$/i, '');
    const base = baseOf({ ticker: clean, description: item.name });
    return (base || clean.replace(/[-_/]?(USDT|USDC|USD|BUSD|PERP)$/i, '')).toUpperCase();
}

function renderItemIcon(item: WatchlistItem, doc: Document): HTMLElement {
    const base = getBaseAsset(item);
    const iconUrl = item.iconUrl || ledgerCryptoIconUrl(base);
    if (iconUrl) {
        return tickerIconEl(doc, base, item.name || base, 'vela-wl-avatar', iconUrl);
    }
    if (item.iconSvg) {
        const wrap = doc.createElement('span');
        wrap.className = 'vela-wl-avatar';
        wrap.innerHTML = item.iconSvg;
        return wrap;
    }
    return tickerIconEl(doc, base, item.name || base, 'vela-wl-avatar');
}

function loadInitialWatchlists(): { activeList: string; lists: Record<string, WatchlistItem[]> } {
    try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(WATCHLIST_STORAGE_KEY) : null;
        if (raw) {
            const data = JSON.parse(raw);
            if (data && typeof data === 'object' && data.lists && Object.keys(data.lists).length > 0) {
                return {
                    activeList: data.activeList || Object.keys(data.lists)[0],
                    lists: data.lists,
                };
            }
        }
    } catch (e) {}
    return {
        activeList: 'Crypto Majors',
        lists: {
            'Crypto Majors': [...DEFAULT_WATCHLIST],
        },
    };
}

let { activeList: currentListName, lists: watchlistsStore } = loadInitialWatchlists();
let watchlistItems: WatchlistItem[] = watchlistsStore[currentListName] || [...DEFAULT_WATCHLIST];
let renderWatchlistRowsFn: (() => void) | null = null;
let updateWlTitleFn: (() => void) | null = null;
let triggerTickerUpdateFn: (() => void) | null = null;

function saveWatchlistStore() {
    watchlistsStore[currentListName] = [...watchlistItems];
    try {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify({
                activeList: currentListName,
                lists: watchlistsStore,
            }));
        }
    } catch {}
    if (wsInstance) {
        try {
            (wsInstance as any).markStateDirty?.();
            (wsInstance as any).events?.emit?.('state:changed', undefined);
        } catch {}
    }
}

// ── Hook Watchlist into Vela\'s Unified State Persistence Document ─────────────
registerStatePersistence({
    key: 'vela.watchlist',
    scope: 'global',
    serialize: () => {
        // Strip heavy dynamic tick metrics and inline SVGs to keep template payloads compact
        const cleanLists: Record<string, any[]> = {};
        for (const [listName, items] of Object.entries(watchlistsStore)) {
            cleanLists[listName] = (items || []).map(x => ({
                symbol: x.symbol,
                binanceSymbol: x.binanceSymbol,
                canonicalSymbol: x.canonicalSymbol,
                name: x.name,
                isFutures: x.isFutures,
            }));
        }
        return {
            activeList: currentListName,
            lists: cleanLists,
        };
    },
    restore: (payload: any) => {
        if (payload && typeof payload === 'object') {
            if (payload.lists && typeof payload.lists === 'object' && Object.keys(payload.lists).length > 0) {
                const restoredStore: Record<string, WatchlistItem[]> = {};
                for (const [k, list] of Object.entries(payload.lists as Record<string, any[]>)) {
                    restoredStore[k] = (list || []).map(item => {
                        const isFutures = item.isFutures || (item.binanceSymbol || item.symbol || '').endsWith('.P');
                        const base = getBaseAsset(item);
                        return {
                            symbol: item.symbol || `${item.binanceSymbol}-USD`,
                            binanceSymbol: item.binanceSymbol || item.symbol,
                            canonicalSymbol: item.canonicalSymbol || `BINANCE:${item.binanceSymbol || item.symbol}`,
                            name: item.name || item.binanceSymbol || 'Ticker',
                            price: typeof item.price === 'number' ? item.price : 1.0,
                            change: typeof item.change === 'number' ? item.change : 0.0,
                            changePercent: typeof item.changePercent === 'number' ? item.changePercent : 0.0,
                            volume: typeof item.volume === 'number' ? item.volume : 1000,
                            high: typeof item.high === 'number' ? item.high : undefined,
                            low: typeof item.low === 'number' ? item.low : undefined,
                            turnover: typeof item.turnover === 'number' ? item.turnover : undefined,
                            iconUrl: item.iconUrl || ledgerCryptoIconUrl(base),
                            iconSvg: item.iconSvg,
                            isFutures: isFutures,
                        };
                    });
                }
                watchlistsStore = restoredStore;
            }
            if (payload.activeList && watchlistsStore[payload.activeList]) {
                currentListName = payload.activeList;
            }
            watchlistItems = watchlistsStore[currentListName] || [...DEFAULT_WATCHLIST];
            try {
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify({
                        activeList: currentListName,
                        lists: watchlistsStore,
                    }));
                }
            } catch {}
            if (updateWlTitleFn) updateWlTitleFn();
            if (renderWatchlistRowsFn) renderWatchlistRowsFn();
            if (triggerTickerUpdateFn) triggerTickerUpdateFn();
        }
    },
});

// Helper to check and toggle watchlist membership for symbol picker (checks across all lists)
export function isSymbolInWatchlist(sym: string): boolean {
    const raw = sym.toUpperCase().replace(/^BINANCE:/i, '').replace(/^COINBASE:/i, '').replace(/^HYPERLIQUID:/i, '');
    const clean = raw.replace('-', '').replace('/', '');
    return Object.values(watchlistsStore).some(items => (items || []).some(x => {
        const xNorm = (x.binanceSymbol || x.symbol).toUpperCase().replace('-', '').replace('/', '');
        return xNorm === clean || xNorm === raw || x.symbol.toUpperCase() === raw || (x.canonicalSymbol && x.canonicalSymbol.toUpperCase() === sym.toUpperCase());
    }));
}

export function toggleWatchlistSymbol(rawSym: string, descriptor?: any): boolean {
    const raw = rawSym.toUpperCase().replace(/^BINANCE:/i, '').replace(/^COINBASE:/i, '').replace(/^HYPERLIQUID:/i, '');
    const clean = raw.replace('-', '').replace('/', '');
    const existingIndex = watchlistItems.findIndex(x => {
        const xNorm = (x.binanceSymbol || x.symbol).toUpperCase().replace('-', '').replace('/', '');
        return xNorm === clean || xNorm === raw || x.symbol.toUpperCase() === raw || (x.canonicalSymbol && x.canonicalSymbol.toUpperCase() === rawSym.toUpperCase());
    });

    if (existingIndex >= 0) {
        watchlistItems.splice(existingIndex, 1);
        saveWatchlistStore();
        renderWatchlistRowsFn?.();
        return false;
    } else {
        const isFutures = raw.endsWith('.P') || rawSym.endsWith('.P');
        const baseName = descriptor?.description?.split('/')?.[0]?.trim() || raw.replace('.P', '').replace(/USDT$/, '').replace(/USD$/, '');
        const display = isFutures
            ? `${raw.replace('.P', '').replace(/USDT$/, '')}-PERP`
            : (raw.endsWith('USDT') ? `${raw.replace(/USDT$/, '')}-USD` : (raw.includes('-') ? raw : `${raw}-USD`));
        const canonical = descriptor?.ticker || (rawSym.includes(':') ? rawSym : `BINANCE:${raw}`);
        const base = baseOf({ ticker: raw.replace(/\.P$/i, ''), description: descriptor?.description || baseName }) || baseName;
        const iconUrl = ledgerCryptoIconUrl(base);

        watchlistItems.unshift({
            symbol: display,
            binanceSymbol: raw,
            canonicalSymbol: canonical,
            name: descriptor?.description || baseName,
            price: 1.0,
            change: 0.0,
            changePercent: 0.0,
            volume: 1000,
            iconUrl: iconUrl,
            isFutures: isFutures,
        });
        saveWatchlistStore();
        renderWatchlistRowsFn?.();
        triggerTickerUpdateFn?.();
        return true;
    }
}

// Connect star in symbol search to watchlist
registerSymbolFavorite({
    isFavorite: (ticker) => isSymbolInWatchlist(ticker),
    toggleFavorite: (ticker, desc) => toggleWatchlistSymbol(ticker, desc),
});

export function registerWatchlistSidePanel() {
    registerSidePanel({
        id: 'watchlist.panel',
        title: 'Watchlist',
        icon: 'watchlist',
        order: 5, // Sits first among panel toggles (before dataWindow: 10, objects: 20)
        width: 340,
        minWidth: 280,
        maxWidth: 850,
        resizable: true,
        overlay: false,
        mount: (ctx, body, header) => {
            injectStyles(WATCHLIST_PANEL_STYLE_ID, WATCHLIST_PANEL_CSS, body.ownerDocument);
            // Replace header title so tab buttons claim the entire header surface
            header.setTitle('');
            body.style.padding = '0';
            body.style.background = 'var(--vela-bg-panel, #121215)';
            body.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

            // ── 1. Create Top Header Tabs: [Watchlist] [Order Book] [Alerts] [Tables] ──
            const tabsContainer = document.createElement('div');
            tabsContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 4px;
                width: 100%;
            `;

            const tabIds = [
                { id: 'watchlist', label: 'Watchlist' },
                { id: 'orderbook', label: 'Order Book' },
                { id: 'alerts', label: 'Alerts' },
                { id: 'tables', label: 'Tables' },
            ];

            let activeTab = 'watchlist';
            const tabButtons: Map<string, HTMLButtonElement> = new Map();

            for (const t of tabIds) {
                const btn = document.createElement('button');
                btn.className = `vela-wpt-tab ${t.id === activeTab ? 'active' : ''}`;
                btn.dataset.tab = t.id;
                btn.style.cssText = `
                    background: ${t.id === activeTab ? 'var(--vela-bg-chip, #292a2f)' : 'transparent'};
                    color: ${t.id === activeTab ? 'var(--vela-text-primary, #eeeef1)' : 'var(--vela-text-secondary, #757882)'};
                    border: none;
                    border-radius: 4px;
                    padding: 4px 8px;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    transition: all 0.15s ease;
                    white-space: nowrap;
                `;
                if (t.id === 'alerts') {
                    btn.innerHTML = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" style="vertical-align: -1px;"><path d="M8 2a4 4 0 0 0-4 4v2.5L2.5 11v1h11v-1L12 8.5V6a4 4 0 0 0-4-4z"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/></svg><span>${t.label}</span><span id="alerts-tab-badge" style="display: none; background: var(--vela-bg-chip, #292a2f); color: var(--vela-text-primary, #eeeef1); border: 1px solid var(--vela-border, #262629); font-size: 9px; padding: 0 4px; border-radius: 8px; font-weight: 700; line-height: 13px;"></span>`;
                } else {
                    btn.textContent = t.label;
                }

                btn.addEventListener('click', () => {
                    activeTab = t.id;
                    updateTabViews();
                });

                tabButtons.set(t.id, btn);
                tabsContainer.appendChild(btn);
            }
            (window as any).__switchWatchlistTab = (id: string) => {
                activeTab = id;
                updateTabViews();
            };

            header.slot.appendChild(tabsContainer);

            // ── 2. Create Panel Body Views ──────────────────────────────────────────
            const mainView = document.createElement('div');
            mainView.style.cssText = `
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            body.appendChild(mainView);

            // Container for each tab
            const viewWatchlist = document.createElement('div');
            viewWatchlist.style.cssText = `flex: 1; display: flex; flex-direction: column; overflow: hidden;`;

            const viewOrderBook = document.createElement('div');
            viewOrderBook.style.cssText = `flex: 1; display: none; flex-direction: column; overflow: hidden;`;

            const viewAlerts = document.createElement('div');
            viewAlerts.style.cssText = `flex: 1; display: none; flex-direction: column; overflow: hidden; padding: 12px;`;

            const viewTables = document.createElement('div');
            viewTables.style.cssText = `flex: 1; display: none; flex-direction: column; overflow: hidden; padding: 12px;`;

            mainView.append(viewWatchlist, viewOrderBook, viewAlerts, viewTables);

            const updateTabViews = () => {
                for (const [id, btn] of tabButtons.entries()) {
                    const isCur = id === activeTab;
                    btn.style.background = isCur ? 'var(--vela-bg-chip, #292a2f)' : 'transparent';
                    btn.style.color = isCur ? 'var(--vela-text-primary, #eeeef1)' : 'var(--vela-text-secondary, #757882)';
                }
                viewWatchlist.style.display = activeTab === 'watchlist' ? 'flex' : 'none';
                viewOrderBook.style.display = activeTab === 'orderbook' ? 'flex' : 'none';
                viewAlerts.style.display = activeTab === 'alerts' ? 'flex' : 'none';
                viewTables.style.display = activeTab === 'tables' ? 'flex' : 'none';

                if (activeTab === 'orderbook') {
                    startOrderBookStream(activeSymbol);
                }
            };

            // ─────────────────────────────────────────────────────────────────────────
            // ── TAB 1: WATCHLIST IMPLEMENTATION ──────────────────────────────────────
            // ─────────────────────────────────────────────────────────────────────────
            const wlSubheader = document.createElement('div');
            wlSubheader.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 12px;
                border-bottom: 1px solid var(--vela-border, #262629);
                background: var(--vela-bg-panel, #121215);
            `;

            const wlTitleGroup = document.createElement('div');
            wlTitleGroup.style.cssText = `position: relative; display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 13px; color: var(--vela-text-primary, #eeeef1); cursor: pointer;`;
            const wlTitleText = document.createElement('span');
            wlTitleText.textContent = currentListName;
            const wlTitleChevron = document.createElement('span');
            wlTitleChevron.style.cssText = 'font-size: 10px; color: var(--vela-text-secondary, #757882);';
            wlTitleChevron.textContent = '▾';
            wlTitleGroup.append(wlTitleText, wlTitleChevron);

            updateWlTitleFn = () => {
                wlTitleText.textContent = currentListName;
            };

            // Dropdown menu for watchlist switcher
            const wlDropdown = document.createElement('div');
            wlDropdown.style.cssText = `
                position: absolute;
                top: 28px;
                left: 0;
                background: var(--vela-bg-card, #232429);
                border: 1px solid var(--vela-border, #262629);
                border-radius: 6px;
                padding: 6px 0;
                width: 200px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5);
                z-index: 10000;
                display: none;
                flex-direction: column;
                font-size: 12px;
                font-weight: 500;
            `;

            const renderWlDropdown = () => {
                wlDropdown.innerHTML = '';
                const headerItem = document.createElement('div');
                headerItem.style.cssText = `padding: 6px 12px; font-size: 10px; text-transform: uppercase; color: var(--vela-text-secondary, #757882); font-weight: 700; letter-spacing: 0.5px;`;
                headerItem.textContent = 'Select Watchlist';
                wlDropdown.appendChild(headerItem);

                for (const listName of Object.keys(watchlistsStore)) {
                    const isCur = listName === currentListName;
                    const item = document.createElement('div');
                    item.style.cssText = `
                        padding: 6px 12px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        color: ${isCur ? 'var(--vela-text-primary, #eeeef1)' : 'var(--vela-text-secondary, #757882)'};
                        background: ${isCur ? 'var(--vela-bg-chip, #292a2f)' : 'transparent'};
                        cursor: pointer;
                        transition: background 0.15s;
                    `;
                    item.innerHTML = `<span>${listName}</span>${isCur ? '<span>✓</span>' : ''}`;
                    item.addEventListener('mouseenter', () => { if (!isCur) item.style.background = 'var(--vela-bg-hover, #2b2d34)'; });
                    item.addEventListener('mouseleave', () => { if (!isCur) item.style.background = 'transparent'; });
                    item.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        currentListName = listName;
                        watchlistItems = watchlistsStore[currentListName] || [];
                        saveWatchlistStore();
                        updateWlTitleFn?.();
                        renderWatchlistRows();
                        wlDropdown.style.display = 'none';
                    });
                    wlDropdown.appendChild(item);
                }

                // Divider
                const div = document.createElement('div');
                div.style.cssText = 'height: 1px; background: var(--vela-border, #262629); margin: 4px 0;';
                wlDropdown.appendChild(div);

                // Add New Watchlist option
                const addOpt = document.createElement('div');
                addOpt.style.cssText = `padding: 6px 12px; color: var(--vela-up, #a7be94); cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600;`;
                addOpt.innerHTML = `<span>+ New Watchlist...</span>`;
                addOpt.addEventListener('mouseenter', () => { addOpt.style.background = 'var(--vela-bg-hover, #2b2d34)'; });
                addOpt.addEventListener('mouseleave', () => { addOpt.style.background = 'transparent'; });
                addOpt.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    wlDropdown.style.display = 'none';
                    const name = prompt('Enter new watchlist name:');
                    if (name && name.trim()) {
                        const trimmed = name.trim();
                        if (!watchlistsStore[trimmed]) {
                            watchlistsStore[trimmed] = [...DEFAULT_WATCHLIST.slice(0, 4)];
                            currentListName = trimmed;
                            watchlistItems = watchlistsStore[currentListName];
                            saveWatchlistStore();
                            updateWlTitleFn?.();
                            renderWatchlistRows();
                        }
                    }
                });
                wlDropdown.appendChild(addOpt);

                // Reset to Default option
                const resetOpt = document.createElement('div');
                resetOpt.style.cssText = `padding: 6px 12px; color: var(--vela-text-secondary, #757882); cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 11px;`;
                resetOpt.innerHTML = `<span>↺ Reset Current to Default</span>`;
                resetOpt.addEventListener('mouseenter', () => { resetOpt.style.background = 'var(--vela-bg-hover, #2b2d34)'; resetOpt.style.color = 'var(--vela-text-primary, #eeeef1)'; });
                resetOpt.addEventListener('mouseleave', () => { resetOpt.style.background = 'transparent'; resetOpt.style.color = 'var(--vela-text-secondary, #757882)'; });
                resetOpt.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    wlDropdown.style.display = 'none';
                    watchlistItems = [...DEFAULT_WATCHLIST];
                    saveWatchlistStore();
                    renderWatchlistRows();
                });
                wlDropdown.appendChild(resetOpt);
            };

            wlTitleGroup.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (wlDropdown.style.display === 'flex') {
                    wlDropdown.style.display = 'none';
                } else {
                    renderWlDropdown();
                    wlDropdown.style.display = 'flex';
                }
            });

            document.addEventListener('click', () => {
                wlDropdown.style.display = 'none';
            });

            wlTitleGroup.appendChild(wlDropdown);

            const wlActions = document.createElement('div');
            wlActions.style.cssText = `display: flex; align-items: center; gap: 8px;`;
            wlActions.innerHTML = `
                <button id="wl-add-btn" title="Add symbol" style="background: transparent; border: none; color: var(--vela-text-secondary, #757882); cursor: pointer; font-size: 16px; padding: 2px 4px;">+</button>
                <button title="Settings" style="background: transparent; border: none; color: var(--vela-text-secondary, #757882); cursor: pointer; font-size: 12px; padding: 2px 4px;">⊶</button>
                <button title="More" style="background: transparent; border: none; color: var(--vela-text-secondary, #757882); cursor: pointer; font-size: 14px; padding: 2px 4px;">⋮</button>
                <button id="wl-expand-btn" title="Expand" style="background: transparent; border: none; color: var(--vela-text-secondary, #757882); cursor: pointer; font-size: 13px; padding: 2px 4px; transition: color 0.15s ease;">⤢</button>
            `;

            wlSubheader.append(wlTitleGroup, wlActions);

            // Expand / Collapse state & toggle button
            const expandBtn = wlActions.querySelector('#wl-expand-btn') as HTMLButtonElement;
            let isExpanded = false;

            const applyExpandState = () => {
                const panelEl = body.closest<HTMLElement>('.vela-panel');
                if (panelEl) {
                    panelEl.style.setProperty('--vela-panel-w', isExpanded ? '640px' : '340px');
                }
                if (expandBtn) {
                    expandBtn.title = isExpanded ? 'Collapse' : 'Expand';
                    expandBtn.textContent = isExpanded ? '⤡' : '⤢';
                    expandBtn.style.color = isExpanded ? 'var(--vela-primary, #3b82f6)' : 'var(--vela-text-secondary, #757882)';
                }
                renderTableHeader();
                renderWatchlistRows();
            };

            if (expandBtn) {
                expandBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    isExpanded = !isExpanded;
                    applyExpandState();
                });
            }

            // Inline Add Symbol search box
            const addSearchBox = document.createElement('div');
            addSearchBox.style.cssText = `display: none; padding: 8px 12px; background: var(--vela-bg-card, #232429); border-bottom: 1px solid var(--vela-border, #262629);`;
            addSearchBox.innerHTML = `
                <div style="display: flex; gap: 6px;">
                    <input id="wl-search-input" placeholder="Add symbol (e.g. SUI, NEAR)..." style="flex: 1; background: var(--vela-bg-main, #202126); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); padding: 4px 8px; font-size: 11px; border-radius: 4px; outline: none;" />
                    <button id="wl-search-add" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer;">Add</button>
                </div>
            `;

            const addBtn = wlActions.querySelector('#wl-add-btn')!;
            addBtn.addEventListener('click', () => {
                addSearchBox.style.display = addSearchBox.style.display === 'none' ? 'block' : 'none';
                if (addSearchBox.style.display === 'block') {
                    (addSearchBox.querySelector('#wl-search-input') as HTMLInputElement)?.focus();
                }
            });

            // Table Header: Dynamic grid based on expanded state
            const wlTableHead = document.createElement('div');
            wlTableHead.style.cssText = `
                display: grid;
                gap: 4px;
                padding: 6px 10px;
                font-size: 10px;
                color: var(--vela-text-secondary, #757882);
                text-transform: uppercase;
                border-bottom: 1px solid var(--vela-border, #262629);
                user-select: none;
            `;

            const renderTableHeader = () => {
                if (isExpanded) {
                    wlTableHead.style.gridTemplateColumns = '16px 2.2fr 1.2fr 1fr 1fr 1.1fr 1.1fr 1fr 1.2fr 20px';
                    wlTableHead.innerHTML = `
                        <div></div>
                        <div style="text-align: left;">Symbol</div>
                        <div style="text-align: right;">Price</div>
                        <div style="text-align: right;">Chg</div>
                        <div style="text-align: right;">Chg%</div>
                        <div style="text-align: right;">24h High</div>
                        <div style="text-align: right;">24h Low</div>
                        <div style="text-align: right;">Vol</div>
                        <div style="text-align: right;">Turnover</div>
                        <div></div>
                    `;
                } else {
                    wlTableHead.style.gridTemplateColumns = '16px 2fr 1.3fr 1.1fr 1.1fr 0.9fr 20px';
                    wlTableHead.innerHTML = `
                        <div></div>
                        <div style="text-align: left;">Symbol</div>
                        <div style="text-align: right;">Price</div>
                        <div style="text-align: right;">Chg</div>
                        <div style="text-align: right;">Chg%</div>
                        <div style="text-align: right;">Vol</div>
                        <div></div>
                    `;
                }
            };
            renderTableHeader();

            const wlList = document.createElement('div');
            wlList.style.cssText = `flex: 1; overflow-y: auto; overflow-x: hidden;`;

            viewWatchlist.append(wlSubheader, addSearchBox, wlTableHead, wlList);

            const formatPrice = (p?: number) => {
                if (p === undefined || isNaN(p) || p === 0) return '-';
                return p.toLocaleString(undefined, {
                    minimumFractionDigits: p < 1 ? 4 : 2,
                    maximumFractionDigits: p < 1 ? 5 : 2
                });
            };

            const formatVol = (v?: number) => {
                if (!v || isNaN(v)) return '-';
                if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
                if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
                if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
                return v.toFixed(0);
            };

            const formatTurnover = (t?: number) => {
                if (!t || isNaN(t)) return '-';
                if (t >= 1_000_000_000) return `$${(t / 1_000_000_000).toFixed(2)}B`;
                if (t >= 1_000_000) return `$${(t / 1_000_000).toFixed(2)}M`;
                if (t >= 1_000) return `$${(t / 1_000).toFixed(1)}K`;
                return `$${t.toFixed(0)}`;
            };

            let draggedIdx: number | null = null;

            const renderWatchlistRows = () => {
                wlList.innerHTML = '';
                const colTemplate = isExpanded
                    ? '16px 2.2fr 1.2fr 1fr 1fr 1.1fr 1.1fr 1fr 1.2fr 20px'
                    : '16px 2fr 1.3fr 1.1fr 1.1fr 0.9fr 20px';

                for (let i = 0; i < watchlistItems.length; i++) {
                    const item = watchlistItems[i];
                    const itemIdx = i;
                    const isSelected = item.binanceSymbol === activeSymbol || item.symbol === activeSymbol;
                    const row = document.createElement('div');
                    row.className = 'wl-row';
                    row.draggable = true;
                    row.dataset.idx = String(i);
                    row.style.cssText = `
                        display: grid;
                        grid-template-columns: ${colTemplate};
                        gap: 4px;
                        padding: 7px 10px;
                        font-size: 12px;
                        border-bottom: 1px solid var(--vela-border, #262629);
                        cursor: pointer;
                        align-items: center;
                        background: ${isSelected ? 'var(--vela-bg-chip, #292a2f)' : 'transparent'};
                        transition: background 0.15s ease, border-top 0.15s ease, border-bottom 0.15s ease;
                        user-select: none;
                    `;

                    // Drag events
                    row.addEventListener('dragstart', (e) => {
                        draggedIdx = itemIdx;
                        row.style.opacity = '0.4';
                        if (e.dataTransfer) {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', String(itemIdx));
                        }
                    });

                    row.addEventListener('dragend', () => {
                        draggedIdx = null;
                        row.style.opacity = '1';
                        wlList.querySelectorAll('.wl-row').forEach((r: any) => {
                            r.style.borderTop = '';
                            r.style.borderBottom = '1px solid var(--vela-border, #262629)';
                        });
                    });

                    row.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        if (draggedIdx === null || draggedIdx === itemIdx) return;
                        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                        const rect = row.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;
                        if (e.clientY < midY) {
                            row.style.borderTop = '2px solid var(--vela-primary, #3b82f6)';
                            row.style.borderBottom = '1px solid var(--vela-border, #262629)';
                        } else {
                            row.style.borderTop = '';
                            row.style.borderBottom = '2px solid var(--vela-primary, #3b82f6)';
                        }
                    });

                    row.addEventListener('dragleave', () => {
                        row.style.borderTop = '';
                        row.style.borderBottom = '1px solid var(--vela-border, #262629)';
                    });

                    row.addEventListener('drop', (e) => {
                        e.preventDefault();
                        row.style.borderTop = '';
                        row.style.borderBottom = '1px solid var(--vela-border, #262629)';
                        if (draggedIdx === null || draggedIdx === itemIdx) return;

                        const rect = row.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;
                        const placeAfter = e.clientY >= midY;

                        const [moved] = watchlistItems.splice(draggedIdx, 1);
                        let targetIdx = itemIdx;
                        if (draggedIdx < itemIdx && !placeAfter) targetIdx -= 1;
                        if (draggedIdx > itemIdx && placeAfter) targetIdx += 1;

                        watchlistItems.splice(targetIdx, 0, moved);
                        saveWatchlistStore();
                        renderWatchlistRows();
                    });

                    const delBtn = document.createElement('button');
                    delBtn.title = 'Remove from watchlist';
                    delBtn.innerHTML = '✕';
                    delBtn.style.cssText = `
                        background: transparent;
                        border: none;
                        color: var(--vela-text-secondary, #757882);
                        cursor: pointer;
                        font-size: 11px;
                        padding: 2px 4px;
                        border-radius: 2px;
                        opacity: 0;
                        transition: opacity 0.15s ease, color 0.15s ease;
                        text-align: center;
                    `;
                    delBtn.addEventListener('mouseenter', () => { delBtn.style.color = 'var(--vela-down, #af6870)'; });
                    delBtn.addEventListener('mouseleave', () => { delBtn.style.color = 'var(--vela-text-secondary, #757882)'; });
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        watchlistItems = watchlistItems.filter(x => x.binanceSymbol !== item.binanceSymbol);
                        saveWatchlistStore();
                        renderWatchlistRows();
                    });

                    row.addEventListener('mouseenter', () => {
                        if (!isSelected) row.style.background = 'var(--vela-bg-hover, #2b2d34)';
                        delBtn.style.opacity = '1';
                    });
                    row.addEventListener('mouseleave', () => {
                        if (!isSelected) row.style.background = 'transparent';
                        delBtn.style.opacity = '0';
                    });

                    row.addEventListener('click', () => {
                        setWatchlistActiveSymbol(item.binanceSymbol);
                        setActiveSymbol(item.binanceSymbol);
                        if (wsInstance) {
                            try {
                                const symToLoad = item.canonicalSymbol || (item.binanceSymbol.includes(':') ? item.binanceSymbol : `BINANCE:${item.binanceSymbol}`);
                                wsInstance.active.setSymbol(symToLoad);
                            } catch (e) {
                                try {
                                    wsInstance.active.setSymbol(item.binanceSymbol);
                                } catch (e2) {
                                    console.error('Failed to set symbol', e2);
                                }
                            }
                        }
                        renderWatchlistRows();
                    });

                    const isUp = item.change >= 0;
                    const chgColor = isUp ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
                    const sign = isUp ? '+' : '';

                    // Drag grip
                    const gripEl = document.createElement('div');
                    gripEl.style.cssText = 'display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--vela-text-secondary, #757882); opacity: 0.4; cursor: grab;';
                    gripEl.title = 'Drag to reorder';
                    gripEl.textContent = '⋮⋮';

                    // Symbol with official logo
                    const symContainer = document.createElement('div');
                    symContainer.style.cssText = 'display: flex; align-items: center; gap: 6px; min-width: 0;';
                    const iconWrap = renderItemIcon(item, row.ownerDocument);
                    const symLabel = document.createElement('span');
                    symLabel.style.cssText = 'font-weight: 700; color: var(--vela-text-primary, #eeeef1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;';
                    symLabel.textContent = item.symbol;
                    symContainer.append(iconWrap, symLabel);

                    // Price
                    const priceEl = document.createElement('div');
                    priceEl.style.cssText = 'text-align: right; color: var(--vela-text-primary, #eeeef1); font-weight: 600; font-family: ui-monospace, monospace; font-size: 11px;';
                    priceEl.textContent = formatPrice(item.price);

                    // Change
                    const chgEl = document.createElement('div');
                    chgEl.style.cssText = `text-align: right; color: ${chgColor}; font-family: ui-monospace, monospace; font-size: 11px;`;
                    chgEl.textContent = `${sign}${item.change.toFixed(item.price < 1 ? 4 : 2)}`;

                    // Change %
                    const chgPctEl = document.createElement('div');
                    chgPctEl.style.cssText = `text-align: right; color: ${chgColor}; font-weight: 600; font-family: ui-monospace, monospace; font-size: 11px;`;
                    chgPctEl.textContent = `${sign}${item.changePercent.toFixed(2)}%`;

                    // Volume
                    const volEl = document.createElement('div');
                    volEl.style.cssText = 'text-align: right; color: var(--vela-text-secondary, #757882); font-size: 10px; font-family: ui-monospace, monospace;';
                    volEl.textContent = formatVol(item.volume);

                    row.append(gripEl, symContainer, priceEl, chgEl, chgPctEl);

                    if (isExpanded) {
                        const highEl = document.createElement('div');
                        highEl.style.cssText = 'text-align: right; color: var(--vela-text-primary, #eeeef1); font-size: 11px; font-family: ui-monospace, monospace;';
                        highEl.textContent = formatPrice(item.high);

                        const lowEl = document.createElement('div');
                        lowEl.style.cssText = 'text-align: right; color: var(--vela-text-secondary, #757882); font-size: 11px; font-family: ui-monospace, monospace;';
                        lowEl.textContent = formatPrice(item.low);

                        const toEl = document.createElement('div');
                        toEl.style.cssText = 'text-align: right; color: var(--vela-text-secondary, #757882); font-size: 10px; font-family: ui-monospace, monospace;';
                        toEl.textContent = formatTurnover(item.turnover);

                        row.append(highEl, lowEl, volEl, toEl);
                    } else {
                        row.append(volEl);
                    }

                    row.appendChild(delBtn);
                    wlList.appendChild(row);
                }
            };

            renderWatchlistRowsFn = renderWatchlistRows;
            renderWatchlistRows();

            // Handle adding new symbol
            const searchInput = addSearchBox.querySelector('#wl-search-input') as HTMLInputElement;
            const searchAddBtn = addSearchBox.querySelector('#wl-search-add')!;
            const doAdd = () => {
                const val = searchInput.value.trim().toUpperCase();
                if (!val) return;
                const cleanVal = val.replace(/^(BINANCE|COINBASE|HYPERLIQUID):/i, '');
                const isFutures = cleanVal.endsWith('.P');
                let binanceSym: string;
                let displaySym: string;
                let baseName: string;

                if (isFutures) {
                    binanceSym = cleanVal;
                    baseName = cleanVal.replace('.P', '').replace(/USDT$/, '');
                    displaySym = `${baseName}-PERP`;
                } else if (cleanVal.includes('-')) {
                    displaySym = cleanVal;
                    baseName = cleanVal.split('-')[0];
                    binanceSym = `${baseName}USDT`;
                } else if (cleanVal.endsWith('USDT')) {
                    binanceSym = cleanVal;
                    baseName = cleanVal.replace(/USDT$/, '');
                    displaySym = `${baseName}-USD`;
                } else {
                    baseName = cleanVal;
                    binanceSym = `${cleanVal}USDT`;
                    displaySym = `${cleanVal}-USD`;
                }

                if (!watchlistItems.find(x => x.binanceSymbol === binanceSym)) {
                    const canonical = `BINANCE:${binanceSym}`;
                    const base = baseOf({ ticker: binanceSym.replace(/\.P$/i, ''), description: baseName }) || baseName;
                    const iconUrl = ledgerCryptoIconUrl(base);

                    watchlistItems.push({
                        symbol: displaySym,
                        binanceSymbol: binanceSym,
                        canonicalSymbol: canonical,
                        name: baseName,
                        price: 1.00,
                        change: 0.00,
                        changePercent: 0.00,
                        volume: 1000,
                        iconUrl: iconUrl,
                        isFutures: isFutures,
                    });
                    saveWatchlistStore();
                    renderWatchlistRows();
                    void updateTickerPrices();
                }
                searchInput.value = '';
                addSearchBox.style.display = 'none';
            };
            searchAddBtn.addEventListener('click', doAdd);
            searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

            // Fetch live 24h ticker prices from Binance Spot & Futures
            let isUpdatingTickers = false;
            let tickerBackoffUntil = 0;

            const updateTickerPrices = async () => {
                if (isUpdatingTickers) return;
                if (typeof document !== 'undefined' && document.hidden) return;
                if (Date.now() < tickerBackoffUntil) return;

                isUpdatingTickers = true;
                try {
                    const [spotRes, futuresRes] = await Promise.allSettled([
                        fetch('https://api.binance.com/api/v3/ticker/24hr'),
                        fetch('https://fapi.binance.com/fapi/v1/ticker/24hr'),
                    ]);

                    const tickerMap = new Map<string, any>();
                    const futuresMap = new Map<string, any>();

                    if (spotRes.status === 'fulfilled') {
                        if (spotRes.value.status === 429 || spotRes.value.status === 418) {
                            console.warn('[watchlist] Binance Spot rate limit reached. Backing off 30s.');
                            tickerBackoffUntil = Date.now() + 30_000;
                        } else if (spotRes.value.ok) {
                            const data = await spotRes.value.json();
                            if (Array.isArray(data)) {
                                for (const t of data) tickerMap.set(t.symbol, t);
                            }
                        }
                    }

                    if (futuresRes.status === 'fulfilled') {
                        if (futuresRes.value.status === 429 || futuresRes.value.status === 418) {
                            console.warn('[watchlist] Binance Futures rate limit reached. Backing off 30s.');
                            tickerBackoffUntil = Date.now() + 30_000;
                        } else if (futuresRes.value.ok) {
                            const data = await futuresRes.value.json();
                            if (Array.isArray(data)) {
                                for (const t of data) futuresMap.set(t.symbol, t);
                            }
                        }
                    }

                    let hasUpdates = false;
                    for (const item of watchlistItems) {
                        const isFut = item.isFutures || item.binanceSymbol.endsWith('.P') || item.symbol.endsWith('.P');
                        const cleanSym = item.binanceSymbol.replace(/\.P$/i, '').replace(/[-_/]/g, '').toUpperCase();

                        const tick = isFut
                            ? (futuresMap.get(cleanSym) || tickerMap.get(cleanSym))
                            : (tickerMap.get(cleanSym) || futuresMap.get(cleanSym));

                        if (tick) {
                            const p = parseFloat(tick.lastPrice);
                            const c = parseFloat(tick.priceChange);
                            const cp = parseFloat(tick.priceChangePercent);
                            const v = parseFloat(tick.volume);
                            const h = tick.highPrice ? parseFloat(tick.highPrice) : undefined;
                            const l = tick.lowPrice ? parseFloat(tick.lowPrice) : undefined;
                            const to = tick.quoteVolume ? parseFloat(tick.quoteVolume) : undefined;

                            if (!isNaN(p) && p > 0) {
                                item.price = p;
                                item.change = isNaN(c) ? 0 : c;
                                item.changePercent = isNaN(cp) ? 0 : cp;
                                item.volume = isNaN(v) ? 0 : v;
                                if (h !== undefined && !isNaN(h)) item.high = h;
                                if (l !== undefined && !isNaN(l)) item.low = l;
                                if (to !== undefined && !isNaN(to)) item.turnover = to;
                                hasUpdates = true;
                            }
                        }
                    }

                    if (hasUpdates && activeTab === 'watchlist') {
                        renderWatchlistRows();
                    }
                } catch (e) {
                    // Ignore offline fallback
                } finally {
                    isUpdatingTickers = false;
                }
            };

            triggerTickerUpdateFn = () => { void updateTickerPrices(); };
            void updateTickerPrices();
            const tickerInterval = setInterval(updateTickerPrices, 8000);

// ── TAB 2: ORDER BOOK IMPLEMENTATION ─────────────────────────────────────
            // ─────────────────────────────────────────────────────────────────────────
            const obHeader = document.createElement('div');
            obHeader.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 12px;
                border-bottom: 1px solid var(--vela-border, #262629);
                background: var(--vela-bg-panel, #121215);
            `;
            const obSymbolTitle = document.createElement('span');
            obSymbolTitle.style.cssText = `font-weight: 700; font-size: 13px; color: var(--vela-text-primary, #eeeef1);`;
            obSymbolTitle.textContent = `${activeSymbol} Depth`;

            const obPrecision = document.createElement('span');
            obPrecision.style.cssText = `font-size: 10px; color: var(--vela-text-secondary, #757882); background: var(--vela-bg-chip, #292a2f); padding: 2px 6px; border-radius: 3px;`;
            obPrecision.textContent = `0.1 Precision`;
            obHeader.append(obSymbolTitle, obPrecision);

            const obTableHead = document.createElement('div');
            obTableHead.style.cssText = `
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                padding: 6px 12px;
                font-size: 10px;
                color: var(--vela-text-secondary, #757882);
                text-transform: uppercase;
                border-bottom: 1px solid var(--vela-border, #262629);
            `;
            obTableHead.innerHTML = `
                <div style="text-align: left;">Size</div>
                <div style="text-align: center;">Price (USDT)</div>
                <div style="text-align: right;">Total</div>
            `;

            const asksList = document.createElement('div');
            asksList.style.cssText = `display: flex; flex-direction: column-reverse; padding: 4px 0;`;

            const spreadRow = document.createElement('div');
            spreadRow.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 6px 12px;
                background: var(--vela-bg-card, #232429);
                border-top: 1px solid var(--vela-border, #262629);
                border-bottom: 1px solid var(--vela-border, #262629);
                font-size: 11px;
                font-weight: 600;
            `;
            spreadRow.innerHTML = `<span style="color: var(--vela-up, #a7be94);" id="ob-mid-price">--</span><span style="color: var(--vela-text-secondary, #757882); font-size: 10px;" id="ob-spread">Spread: $0.10 (0.00%)</span>`;

            const bidsList = document.createElement('div');
            bidsList.style.cssText = `display: flex; flex-direction: column; padding: 4px 0;`;

            viewOrderBook.append(obHeader, obTableHead, asksList, spreadRow, bidsList);

            let obWs: WebSocket | null = null;

            const renderOrderBookLevels = (bids: Array<[string, string]>, asks: Array<[string, string]>) => {
                obSymbolTitle.textContent = `${activeSymbol} Depth`;

                // Render Asks (sorted lowest ask first, rendered reversed)
                let askRows = '';
                const maxAskTotal = asks.slice(0, 8).reduce((acc, a) => acc + parseFloat(a[1]), 0) || 1;
                let runningAsk = 0;
                for (const [pStr, sStr] of asks.slice(0, 8)) {
                    const price = parseFloat(pStr);
                    const size = parseFloat(sStr);
                    runningAsk += size;
                    const pct = Math.min(100, Math.round((runningAsk / maxAskTotal) * 100));
                    askRows += `
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 3px 12px; font-size: 11px; font-family: ui-monospace, monospace; position: relative;">
                            <div style="position: absolute; right: 0; top: 0; bottom: 0; width: ${pct}%; background: rgba(175, 104, 112, 0.16); z-index: 1;"></div>
                            <div style="color: var(--vela-text-primary, #eeeef1); z-index: 2;">${size.toFixed(3)}</div>
                            <div style="text-align: center; color: var(--vela-down, #af6870); font-weight: 600; z-index: 2;">${price.toFixed(2)}</div>
                            <div style="text-align: right; color: var(--vela-text-secondary, #757882); z-index: 2;">${runningAsk.toFixed(3)}</div>
                        </div>
                    `;
                }
                asksList.innerHTML = askRows;

                // Mid price & spread
                const bestBid = bids[0] ? parseFloat(bids[0][0]) : 0;
                const bestAsk = asks[0] ? parseFloat(asks[0][0]) : 0;
                const mid = bestAsk > 0 && bestBid > 0 ? (bestAsk + bestBid) / 2 : bestBid;
                const spread = Math.abs(bestAsk - bestBid);
                const spreadPct = mid > 0 ? (spread / mid) * 100 : 0;

                const midEl = spreadRow.querySelector('#ob-mid-price');
                const spdEl = spreadRow.querySelector('#ob-spread');
                if (midEl) midEl.textContent = mid.toFixed(2);
                if (spdEl) spdEl.textContent = `Spread: $${spread.toFixed(2)} (${spreadPct.toFixed(3)}%)`;

                // Render Bids
                let bidRows = '';
                const maxBidTotal = bids.slice(0, 8).reduce((acc, b) => acc + parseFloat(b[1]), 0) || 1;
                let runningBid = 0;
                for (const [pStr, sStr] of bids.slice(0, 8)) {
                    const price = parseFloat(pStr);
                    const size = parseFloat(sStr);
                    runningBid += size;
                    const pct = Math.min(100, Math.round((runningBid / maxBidTotal) * 100));
                    bidRows += `
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 3px 12px; font-size: 11px; font-family: ui-monospace, monospace; position: relative;">
                            <div style="position: absolute; right: 0; top: 0; bottom: 0; width: ${pct}%; background: rgba(167, 190, 148, 0.16); z-index: 1;"></div>
                            <div style="color: var(--vela-text-primary, #eeeef1); z-index: 2;">${size.toFixed(3)}</div>
                            <div style="text-align: center; color: var(--vela-up, #a7be94); font-weight: 600; z-index: 2;">${price.toFixed(2)}</div>
                            <div style="text-align: right; color: var(--vela-text-secondary, #757882); z-index: 2;">${runningBid.toFixed(3)}</div>
                        </div>
                    `;
                }
                bidsList.innerHTML = bidRows;
            };

            const startOrderBookStream = (sym: string) => {
                if (obWs) {
                    obWs.close();
                    obWs = null;
                }
                try {
                    const wsUrl = `wss://fstream.binance.com/ws/${sym.toLowerCase()}@depth20@100ms`;
                    obWs = new WebSocket(wsUrl);
                    obWs.onmessage = (evt) => {
                        try {
                            const data = JSON.parse(evt.data);
                            if (data.b && data.a) {
                                renderOrderBookLevels(data.b, data.a);
                            }
                        } catch (e) {}
                    };
                } catch (e) {
                    console.error('Order book stream error', e);
                }
            };

            // ─────────────────────────────────────────────────────────────────────────
            // ── TAB 3: ALERTS IMPLEMENTATION ─────────────────────────────────────────
            // ─────────────────────────────────────────────────────────────────────────
            viewAlerts.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 7px;">
                        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="var(--vela-text-secondary, #757882)" stroke-width="1.5"><path d="M8 2a4 4 0 0 0-4 4v2.5L2.5 11v1h11v-1L12 8.5V6a4 4 0 0 0-4-4z"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/></svg>
                        <span style="font-weight: 700; color: var(--vela-text-primary, #eeeef1); font-size: 13px;">Alerts & Notifications</span>
                    </div>
                    <button id="alert-create-btn" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer;">+ Create Alert</button>
                </div>
                <div id="alert-form-panel" style="display: none; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); border-radius: 6px; padding: 10px; margin-bottom: 12px;">
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 10px; color: var(--vela-text-secondary, #757882); text-transform: uppercase;">Condition</label>
                        <select id="alert-condition" style="width: 100%; background: var(--vela-bg-main, #202126); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); padding: 5px; border-radius: 4px; font-size: 11px; margin-top: 2px;">
                            <option value="cross_up">Crossing Up</option>
                            <option value="cross_down">Crossing Down</option>
                            <option value="greater">Greater Than</option>
                            <option value="less">Less Than</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="font-size: 10px; color: var(--vela-text-secondary, #757882); text-transform: uppercase;">Trigger Price</label>
                        <input id="alert-target-price" type="number" step="any" placeholder="85000" style="width: 100%; background: var(--vela-bg-main, #202126); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); padding: 5px; border-radius: 4px; font-size: 11px; margin-top: 2px; box-sizing: border-box;" />
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 6px;">
                        <button id="alert-cancel-btn" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">Cancel</button>
                        <button id="alert-save-btn" style="background: var(--vela-up, #a7be94); border: none; color: var(--vela-bg-panel, #121215); padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer;">Save Alert</button>
                    </div>
                </div>
                <div id="alerts-list-container" style="flex: 1; overflow-y: auto;">
                    <div style="padding: 16px; text-align: center; color: var(--vela-text-secondary, #757882); font-size: 11px;">
                        No active alerts.<br/>Click "+ Create Alert" to monitor price levels.
                    </div>
                </div>
            `;

            interface AlertEntry {
                id: string;
                symbol: string;
                condition: string;
                price: number;
                active: boolean;
                createdAt: string;
            }

            const alertList: AlertEntry[] = [
                { id: '1', symbol: 'BTCUSDT', condition: 'Crossing Up', price: 87000, active: true, createdAt: 'Just now' },
                { id: '2', symbol: 'ETHUSDT', condition: 'Crossing Down', price: 2700, active: true, createdAt: '10m ago' },
            ];

            const alertCreateBtn = viewAlerts.querySelector('#alert-create-btn')!;
            const alertForm = viewAlerts.querySelector('#alert-form-panel') as HTMLElement;
            const alertCancelBtn = viewAlerts.querySelector('#alert-cancel-btn')!;
            const alertSaveBtn = viewAlerts.querySelector('#alert-save-btn')!;
            const alertListContainer = viewAlerts.querySelector('#alerts-list-container')!;

            alertCreateBtn.addEventListener('click', () => {
                alertForm.style.display = 'block';
            });
            alertCancelBtn.addEventListener('click', () => {
                alertForm.style.display = 'none';
            });

            const updateAlertsBadge = () => {
                const badge = tabsContainer.querySelector('#alerts-tab-badge') as HTMLElement;
                if (badge) {
                    const count = alertList.length + triggeredAlerts.length;
                    badge.textContent = String(count);
                    badge.style.display = count > 0 ? 'inline-block' : 'none';
                }
            };

            const renderAlerts = () => {
                updateAlertsBadge();
                let html = '';

                // Section 1: Active Price Alerts
                html += `
                    <div style="font-size: 10px; font-weight: 700; color: var(--vela-text-secondary, #757882); text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">
                        Active Price Alerts (${alertList.length})
                    </div>
                `;
                if (alertList.length === 0) {
                    html += `<div style="padding: 10px; text-align: center; color: var(--vela-text-secondary, #757882); font-size: 11px; background: var(--vela-bg-card, #232429); border-radius: 6px; margin-bottom: 12px;">No active price alerts. Click "+ Create Alert" above.</div>`;
                } else {
                    for (const al of alertList) {
                        html += `
                            <div style="background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                                <div>
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <span style="font-weight: 700; color: var(--vela-text-primary, #eeeef1); font-size: 12px;">${al.symbol}</span>
                                        <span style="font-size: 10px; color: var(--vela-text-primary, #eeeef1); background: var(--vela-bg-chip, #292a2f); padding: 1px 4px; border-radius: 3px;">${al.condition}</span>
                                    </div>
                                    <div style="font-family: ui-monospace, monospace; color: var(--vela-up, #a7be94); font-weight: 700; font-size: 12px; margin-top: 3px;">
                                        $${al.price.toFixed(2)}
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <button class="alert-del-btn" data-id="${al.id}" style="background: transparent; border: none; color: var(--vela-down, #af6870); cursor: pointer; font-size: 13px;">✕</button>
                                </div>
                            </div>
                        `;
                    }
                }

                // Section 2: Triggered Alerts Log
                html += `
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 14px; margin-bottom: 8px;">
                        <span style="font-size: 10px; font-weight: 700; color: var(--vela-text-secondary, #757882); text-transform: uppercase; letter-spacing: 0.5px;">Notification Log (${triggeredAlerts.length})</span>
                        ${triggeredAlerts.length > 0 ? '<button id="clear-triggered-alerts-btn" style="background: transparent; border: none; color: var(--vela-text-secondary, #757882); font-size: 10px; cursor: pointer; text-decoration: underline;">Clear</button>' : ''}
                    </div>
                `;
                if (triggeredAlerts.length === 0) {
                    html += `<div style="padding: 10px; text-align: center; color: var(--vela-text-secondary, #757882); font-size: 11px; background: var(--vela-bg-card, #232429); border-radius: 6px;">No triggered alerts yet.</div>`;
                } else {
                    for (const ta of triggeredAlerts) {
                        html += `
                            <div style="background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); border-radius: 6px; padding: 8px 10px; margin-bottom: 6px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
                                    <div style="display: flex; align-items: center; gap: 5px;">
                                        <span style="font-weight: 700; color: var(--vela-text-primary, #eeeef1); font-size: 11px;">${ta.symbol}</span>
                                        <span style="font-size: 9px; color: var(--vela-warning, #fde047); background: var(--vela-warning-bg, #29261a); padding: 1px 4px; border-radius: 3px;">${ta.source}</span>
                                    </div>
                                    <span style="font-size: 10px; color: var(--vela-text-secondary, #757882);">${ta.time}</span>
                                </div>
                                <div style="font-size: 11px; color: var(--vela-text-secondary, #757882);">
                                    <strong style="color: var(--vela-text-primary, #eeeef1);">${ta.title}:</strong> ${ta.message}
                                </div>
                            </div>
                        `;
                    }
                }

                alertListContainer.innerHTML = html;

                alertListContainer.querySelectorAll('.alert-del-btn').forEach(btn => {
                    btn.addEventListener('click', (e: any) => {
                        const id = e.target.getAttribute('data-id');
                        const idx = alertList.findIndex(a => a.id === id);
                        if (idx !== -1) {
                            alertList.splice(idx, 1);
                            renderAlerts();
                        }
                    });
                });

                const clearBtn = alertListContainer.querySelector('#clear-triggered-alerts-btn');
                if (clearBtn) {
                    clearBtn.addEventListener('click', () => {
                        triggeredAlerts.length = 0;
                        renderAlerts();
                    });
                }
            };

            alertChangeListeners.push(() => {
                renderAlerts();
            });

            alertSaveBtn.addEventListener('click', () => {
                const condEl = viewAlerts.querySelector('#alert-condition') as HTMLSelectElement;
                const priceEl = viewAlerts.querySelector('#alert-target-price') as HTMLInputElement;
                const price = parseFloat(priceEl.value);
                if (price > 0) {
                    alertList.push({
                        id: String(Date.now()),
                        symbol: activeSymbol,
                        condition: condEl.options[condEl.selectedIndex].text,
                        price,
                        active: true,
                        createdAt: 'Now',
                    });
                    priceEl.value = '';
                    alertForm.style.display = 'none';
                    renderAlerts();
                }
            });

            renderAlerts();

            // ─────────────────────────────────────────────────────────────────────────
            // ── TAB 4: TABLES & SCANNER MATRIX IMPLEMENTATION ────────────────────────
            // ─────────────────────────────────────────────────────────────────────────
            viewTables.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                    <div style="font-weight: 700; color: var(--vela-text-primary, #eeeef1); font-size: 13px;">Multi-Timeframe Scanner</div>
                    <span style="font-size: 10px; color: var(--vela-up, #a7be94); background: rgba(167, 190, 148, 0.15); padding: 2px 6px; border-radius: 3px;">LIVE</span>
                </div>
                <div style="background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); border-radius: 6px; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: center;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); font-size: 10px;">
                                <th style="padding: 6px 8px; text-align: left;">Symbol</th>
                                <th style="padding: 6px 4px;">1m</th>
                                <th style="padding: 6px 4px;">5m</th>
                                <th style="padding: 6px 4px;">15m</th>
                                <th style="padding: 6px 4px;">1h</th>
                                <th style="padding: 6px 4px;">1D</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom: 1px solid var(--vela-border, #262629);">
                                <td style="padding: 6px 8px; text-align: left; font-weight: 700; color: var(--vela-text-primary, #eeeef1);">BTC</td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.28); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 700;">STRONG</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                            </tr>
                            <tr style="border-bottom: 1px solid var(--vela-border, #262629);">
                                <td style="padding: 6px 8px; text-align: left; font-weight: 700; color: var(--vela-text-primary, #eeeef1);">ETH</td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(117, 120, 130, 0.18); color: var(--vela-text-secondary, #757882); padding: 1px 4px; border-radius: 2px;">NEUT</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                            </tr>
                            <tr style="border-bottom: 1px solid var(--vela-border, #262629);">
                                <td style="padding: 6px 8px; text-align: left; font-weight: 700; color: var(--vela-text-primary, #eeeef1);">SOL</td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.28); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 700;">STRONG</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.28); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 700;">STRONG</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                            </tr>
                            <tr style="border-bottom: 1px solid var(--vela-border, #262629);">
                                <td style="padding: 6px 8px; text-align: left; font-weight: 700; color: var(--vela-text-primary, #eeeef1);">XRP</td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(117, 120, 130, 0.18); color: var(--vela-text-secondary, #757882); padding: 1px 4px; border-radius: 2px;">NEUT</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(175, 104, 112, 0.18); color: var(--vela-down, #af6870); padding: 1px 4px; border-radius: 2px; font-weight: 600;">SELL</span></td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 8px; text-align: left; font-weight: 700; color: var(--vela-text-primary, #eeeef1);">DOGE</td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                                <td style="padding: 4px;"><span style="background: rgba(167, 190, 148, 0.18); color: var(--vela-up, #a7be94); padding: 1px 4px; border-radius: 2px; font-weight: 600;">BUY</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;

            // Active symbol listener
            symbolChangeListeners.push((newSym) => {
                renderWatchlistRows();
                if (activeTab === 'orderbook') {
                    startOrderBookStream(newSym);
                }
            });

            return {
                onChart: (chart) => {
                    const sym = (chart as any).symbol || (chart as any)._symbol;
                    if (sym) setWatchlistActiveSymbol(sym);
                },
                onOpen: () => {
                    if (activeTab === 'orderbook') {
                        startOrderBookStream(activeSymbol);
                    }
                },
                destroy: () => {
                    clearInterval(tickerInterval);
                    if (obWs) obWs.close();
                },
            };
        },
    });
}
