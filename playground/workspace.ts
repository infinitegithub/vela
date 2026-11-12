// LuxAlgo Vela Workstation — Full Integration with LiquidityMapper & Order Flow Engines
import './quant-watchlist.css';
import { VelaWorkspace } from '../src/workspace';
import { BinanceProvider } from '../src/data/providers/binance';
import { CoinbaseProvider } from '../src/data/providers/coinbase';
import { HyperliquidProvider } from '../src/data/providers/hyperliquid';
import { PineWorkerEngine } from '@luxalgo/vela-pinets';
import { DemoEngine } from './demo-engine';
import { playgroundStorage } from './persistence';
import { registerClassicIndicators } from '../src/core/native-indicators/classics';
import { registerTradingLinesLayer } from './trading-lines';
import { registerChartType } from '../src/chart-types/registry';
import { registerLiquidityIndicators } from './liquidity-indicators';
import {
    registerLiquiditySidePanel,
    setLiquidityWorkspaceInstance,
} from './liquidity-panel';
import {
    registerWatchlistSidePanel,
    setWatchlistWorkspaceInstance,
} from './watchlist-panel';
import {
    registerAlertsSidePanel,
    setAlertsWorkspaceInstance,
} from './alerts-panel';
import {
    registerTradingSidePanel,
    registerTradeButton,
    registerReplayButton,
    registerPineEditor,
    setWorkspaceInstance,
    mountBottomAccountStrip,
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
    openIndicatorExplorer,
} from './indicator-explorer';
import { registerIndicatorsPersistence } from './indicators-persistence';
import {
    registerWorkspaceLayoutPicker,
    createLocalWorkspaceSource,
} from './workspace-picker';
import {
    registerIndicatorTemplatesPicker,
    createLocalIndicatorTemplatesSource,
} from './indicator-templates';
import { applyThemeTokens } from '../src/ui/tokens';
import { resolveTheme, DARK_THEME } from '../src/core/theme';

// 1. Register All Workstation Plugins & Extensions
registerIndicatorsPersistence();
registerWorkspaceLayoutPicker();
registerIndicatorTemplatesPicker();
registerClassicIndicators();
registerTradingLinesLayer();
registerChartType({
    id: 'liquidity',
    label: 'Liquidity Mapper (Heatmap, Footprint, DOM)',
    icon: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M5 11L8 8L11 11L14 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="8" cy="8" r="1.5" fill="#f59e0b"/><circle cx="14" cy="7" r="1.5" fill="#10b981"/></svg>',
    basePainting: 'none',
});
registerLiquidityIndicators();
registerLiquiditySidePanel();
registerWatchlistSidePanel();
registerAlertsSidePanel();
registerTradingSidePanel();
registerTradeButton();
registerReplayButton();
registerPineEditor();
registerThemeSwitcher();
registerIndicatorExplorer();

// 2. Initialize Prominent Vela Workstation Shell
export function bootVelaWorkstation() {
    const appEl = document.getElementById('app');
    if (!appEl) {
        console.error('[Vela] #app container missing');
        return;
    }
    appEl.innerHTML = '';

    const ws = new VelaWorkspace(appEl, {
        symbol: 'BTCUSDT',
        timeframe: '1h',
        priceStyle: 'candles',
        cells: {
            btc: { symbol: 'BTCUSDT', timeframe: '1h', priceStyle: 'candles' },
            eth: { symbol: 'ETHUSDT', timeframe: '15m', priceStyle: 'liquidity' },
            sol: { symbol: 'SOLUSDT', timeframe: '1h', priceStyle: 'candles' },
            bnb: { symbol: 'BNBUSDT', timeframe: '1d', priceStyle: 'candles' },
        },
        providers: {
            binance: () => new BinanceProvider(),
            coinbase: () => new CoinbaseProvider(),
            hyperliquid: () => new HyperliquidProvider(),
        },
        engines: {
            pine: () => new PineWorkerEngine(),
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
        sync: {
            viewport: false,
            crosshair: true,
            drawings: true,
            style: true,
        },
        drawingToolbar: true,
    });

    // 3. Bind Workspace to Helper Panels & Controllers
    setWorkspaceInstance(ws);
    (window as any).ws = ws;
    (window as any).__ws = ws;
    setWatchlistWorkspaceInstance(ws);
    setAlertsWorkspaceInstance(ws);
    setThemeWorkspaceInstance(ws);
    setExplorerWorkspaceInstance(ws);
    (window as any).openIndicatorExplorer = openIndicatorExplorer;
    setLiquidityWorkspaceInstance(ws);
    createLocalWorkspaceSource(ws);
    createLocalIndicatorTemplatesSource(ws);
    mountBottomAccountStrip(ws);

    // Initial theme tokens
    try {
        const theme = resolveTheme(getSavedTheme() || DARK_THEME);
        applyThemeTokens(document.body, theme);
        applyThemeTokens(document.documentElement, theme);
    } catch (_) {}

    console.info('[VelaWorkstation] Prominent Vela Interface with Liquidity Mapper ready.');
    return ws;
}

bootVelaWorkstation();
