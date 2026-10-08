import type { Vela } from '../src';
import { registerSW } from 'virtual:pwa-register';
import { VelaWorkspace } from '../src/workspace';
import { BinanceProvider } from '../src/data/providers/binance';
import { CoinbaseProvider } from '../src/data/providers/coinbase';
import { HyperliquidProvider } from '../src/data/providers/hyperliquid';
import { PineWorkerEngine } from '@luxalgo/vela-pinets';
import { DemoEngine } from './demo-engine';
import { playgroundStorage } from './persistence';
import { addSampleMarks } from './marks';
import { registerClassicIndicators } from '../src/core/native-indicators/classics';
import { registerFootprintChartType } from './footprint-style';
import { registerTradingLinesLayer } from './trading-lines';
import {
    registerWatchlistSidePanel,
    setWatchlistWorkspaceInstance,
    setWatchlistActiveSymbol,
} from './watchlist-panel';
import {
    registerTradingSidePanel,
    registerTradeButton,
    registerReplayButton,
    registerPineEditor,
    setWorkspaceInstance,
    mountBottomAccountStrip,
    setActiveSymbol,
    refreshWorkspaceIndicators,
} from './trade-suite';
import {
    registerTemplateManager,
    setTemplateWorkspaceInstance,
} from './template-manager';
import {
    registerThemeSwitcher,
    setThemeWorkspaceInstance,
    getSavedTheme,
} from './theme-switcher';
import {
    registerIndicatorExplorer,
    setExplorerWorkspaceInstance,
} from './indicator-explorer';

// 1. Register Extensions
registerClassicIndicators();
registerFootprintChartType();
registerTradingLinesLayer();
registerWatchlistSidePanel();
registerTradingSidePanel();
registerTradeButton();
registerReplayButton();
registerPineEditor();
registerTemplateManager();
registerThemeSwitcher();
registerIndicatorExplorer();

// 2. Instantiate the multi-chart VelaWorkspace
const ws = new VelaWorkspace('#workspace', {
    layout: '4', // 4-cell grid layout (Velo / OpenMarket style)
    symbol: 'BTCUSDT',
    timeframe: '60',
    cells: {
        btc: { symbol: 'BTCUSDT', timeframe: '1' },
        eth: { symbol: 'ETHUSDT', timeframe: '15' },
        sol: { symbol: 'SOLUSDT', timeframe: '60' },
        bnb: { symbol: 'BNBUSDT', timeframe: 'D' },
    },
    providers: {
        binance: () => new BinanceProvider(),
        coinbase: () => new CoinbaseProvider(),
        hyperliquid: () => new HyperliquidProvider(),
    },
    engines: {
        pine: () => new PineWorkerEngine(), // Official Pine Script v5 / v4 web worker runtime
        demo: () => new DemoEngine(),
    },
    defaultLanguage: 'pine',
    live: true,
    theme: getSavedTheme(),
    autofocus: true,
    persist: true,
    storage: playgroundStorage(),
    settings: { hidden: ['advanced'] },
    indicators: async () => {
        try {
            const res = await fetch('/api/indicators');
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn('[indicators] Failed to load from /api/indicators:', e);
        }
        return [];
    },

    // ── Synchronization across all grid cells ─────────────────────────────
    sync: {
        viewport: true,   // panning / zooming one chart syncs followers
        crosshair: true,  // ghost crosshair follows time across every chart
        drawings: true,   // drawings created on one chart mirror across peers
        style: true,      // canvas / scale styling mirrors across cells
    },

    drawingToolbar: true, // full left drawing tools suite (67+ tools)

    topbar: {
        // Left: Symbol, Timeframes, Style (Candles icon), Layout, Indicators, Replay, Undo/Redo
        left: ['symbol', 'timeframes', 'style', 'layout', 'indicators', 'replay.toggle', 'undo-redo'],
        // Right: Pine Editor, Screenshot, Theme Toggle (Vela Muted / Standard Classic), Templates, Panels, Trade button
        right: ['pine.editor', 'screenshot', 'theme.toggle', 'templates.toggle', 'panels', 'trade.toggle'],
    },
});

// 3. Bind workspace instances
setWorkspaceInstance(ws);
setWatchlistWorkspaceInstance(ws);
setTemplateWorkspaceInstance(ws);
setThemeWorkspaceInstance(ws);
setExplorerWorkspaceInstance(ws);

// 4. Mount bottom account drawer (starts collapsed at 28px)
mountBottomAccountStrip(ws);

// 5. Hook active cell & market changes so order ticket & watchlist follow user chart clicks and symbol changes
const syncActiveSymbol = (sym: string) => {
    if (!sym) return;
    setActiveSymbol(sym);
    setWatchlistActiveSymbol(sym);
};

ws.on('cell:active', ({ id }) => {
    const cell = ws.cell(id);
    if (cell && cell.symbol) {
        syncActiveSymbol(cell.symbol);
    }
});

const hookCellMarket = (cell: any) => {
    cell.chart.on('market:changed', ({ symbol }: { symbol: string }) => {
        if (ws.active?.id === cell.id && symbol) {
            syncActiveSymbol(symbol);
        }
    });
};
for (const cell of ws.cells()) {
    hookCellMarket(cell);
}
ws.on('cell:created', ({ id }) => {
    const cell = ws.cell(id);
    if (cell) hookCellMarket(cell);
});

if (ws.active?.symbol) {
    syncActiveSymbol(ws.active.symbol);
}

// 6. Reload chart feeds when toggling between Testnet and Production
if (typeof window !== 'undefined') {
    window.addEventListener('vela:env-changed', () => {
        for (const cell of ws.cells()) {
            if (cell.symbol && cell.chart?.setMarket) {
                void cell.chart.setMarket({ symbol: cell.symbol });
            }
        }
    });
}

// 7. Initialize chart tools & drawing favorites (leave dock closed by default for clean full-screen view)
void ws.cells()[0]?.chart.ready().then(() => {
    for (const cell of ws.cells()) {
        try {
            const currentFavs = cell.chart.drawings.favorites?.();
            if (!currentFavs || currentFavs.length === 0) {
                cell.chart.drawings.setFavorites(['trendline', 'hline', 'box', 'position', 'anchoredvwap', 'fixedrangevp']);
            }
        } catch (e) {
            // Drawings favorites setup
        }
    }
});

// 7. Sync shell theme on changes
const syncShellTheme = (t: { background: string }): void => {
    document.body.style.background = t.background;
};
for (const cell of ws.cells()) cell.chart.on('theme:changed', syncShellTheme);
ws.on('cell:created', ({ id }) => ws.cell(id)?.chart.on('theme:changed', syncShellTheme));

// 8. Seed sample timeline marks
const seedMarks = (chart: Vela): void => {
    void chart.ready().then(() => addSampleMarks(chart));
};
for (const cell of ws.cells()) seedMarks(cell.chart);
ws.on('cell:created', ({ id }) => {
    const cell = ws.cell(id);
    if (cell) seedMarks(cell.chart);
});

// 9. Session Stability Guard: prevent sudden background reloads (HMR drops / SW controller shifts)
if (typeof window !== 'undefined') {
    const rawReload = window.location.reload.bind(window.location);
    let explicitReloadAllowed = false;
    (window as any).__allowReload = () => { explicitReloadAllowed = true; };

    try {
        window.location.reload = function() {
            if (explicitReloadAllowed) {
                return rawReload();
            }
            console.warn('[Vela] Blocked spontaneous background reload to preserve active chart workspace and indicators.');
        };
    } catch (_) {
        // sealed location
    }

    // Keep Cloudflare Tunnel connection alive with light periodic heartbeat
    setInterval(() => {
        try {
            fetch('/api/ping', { method: 'GET', cache: 'no-store' }).catch(() => {});
        } catch (_) {}
    }, 25000);
}

// 10. PWA Service Worker Registration & Storage Persistence
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && !import.meta.env.DEV) {
    registerSW({
        immediate: false,
        onNeedRefresh() {
            console.log('[PWA] New version available (auto-reload suppressed to protect active charts)');
        },
        onOfflineReady() {
            console.log('[PWA] Workstation offline ready');
        },
        onRegisterError(error) {
            console.warn('[PWA] Service worker registration failed:', error);
        },
    });

    // Request persistent storage so drawings, indicators & templates aren't purged under disk pressure
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then((persistent) => {
            console.log(`[PWA] Persistent storage granted: ${persistent}`);
        }).catch(() => {});
    }
}

// Expose on window for browser console access
(window as unknown as { __ws: VelaWorkspace }).__ws = ws;
(window as unknown as { __refreshIndicators: () => Promise<void> }).__refreshIndicators = () => refreshWorkspaceIndicators(ws);
