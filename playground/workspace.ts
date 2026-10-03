import type { Vela } from '../src';
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

// 4. Mount bottom account drawer (starts collapsed at 28px)
mountBottomAccountStrip(ws);

// 5. Hook active cell changes so order ticket & watchlist follow user chart clicks
ws.on('cell:active', ({ id }) => {
    const cell = ws.cell(id);
    if (cell && cell.symbol) {
        setActiveSymbol(cell.symbol);
        setWatchlistActiveSymbol(cell.symbol);
    }
});

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

// Expose on window for browser console access
(window as unknown as { __ws: VelaWorkspace }).__ws = ws;
(window as unknown as { __refreshIndicators: () => Promise<void> }).__refreshIndicators = () => refreshWorkspaceIndicators(ws);
