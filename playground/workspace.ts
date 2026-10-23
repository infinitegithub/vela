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
import { registerFootprintPlugin } from './footprint-plugin';
import { registerHeatmapPlugin } from './heatmap-plugin';
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
registerFootprintPlugin();
registerHeatmapPlugin();
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
            eth: { symbol: 'ETHUSDT', timeframe: '15m', priceStyle: 'heatmap' },
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
