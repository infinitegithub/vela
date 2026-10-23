import { applyTheme } from "./liquidity/theme";
import { CockpitToolbar } from "./liquidity/cockpit-toolbar";
import { StatusBarController } from "./liquidity/statusbar";
import { DomLadderPanelController } from "./liquidity-dom-panel";
import { applyThemeTokens } from "../src/ui/tokens";
import { resolveTheme, DARK_THEME } from "../src/core/theme";
import './quant-watchlist.css';
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
import { registerTradingLinesLayer } from './trading-lines';
import { registerFootprintPlugin } from './footprint-plugin';
import { registerWidgetAction } from '../src/plugin';
import { LiquidityClient } from './liquidity-client';
import { registerLiquidityIndicators } from './liquidity-indicators';
import { registerLiquidityDomPanel } from './liquidity-dom-panel';
import {
    registerWatchlistSidePanel,
    setWatchlistWorkspaceInstance,
    setWatchlistActiveSymbol,
} from './watchlist-panel';
import {
    registerAlertsSidePanel,
    setAlertsWorkspaceInstance,
    setAlertsActiveSymbol,
} from './alerts-panel';
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
import { registerIndicatorsPersistence } from './indicators-persistence';
import {
    registerWorkspaceLayoutPicker,
    createLocalWorkspaceSource,
} from './workspace-picker';
import {
    registerIndicatorTemplatesPicker,
    createLocalIndicatorTemplatesSource,
} from './indicator-templates';

// 1. Register Extensions
registerIndicatorsPersistence();
registerWorkspaceLayoutPicker();
registerIndicatorTemplatesPicker();
registerClassicIndicators();
registerTradingLinesLayer();
registerFootprintPlugin();
registerLiquidityIndicators();
registerLiquidityDomPanel();
registerWatchlistSidePanel();
registerAlertsSidePanel();
registerTradingSidePanel();
registerTradeButton();
registerReplayButton();
registerPineEditor();
registerThemeSwitcher();
registerIndicatorExplorer();

// Quick topbar button to toggle Footprint chart style
registerWidgetAction({
    id: 'footprint.toggle',
    target: 'topbar',
    align: 'left',
    order: 22,
    label: 'Footprint',
    run: (ctx) => {
        const next = ctx.priceStyle === 'footprint' ? 'candles' : 'footprint';
        ctx.setPriceStyle(next);
        if (next === 'footprint') {
            try {
                const chart = ctx.chart;
                const native: any = (chart?.renderer as any)?.renderer;
                if (native && typeof native.applyViewport === 'function') {
                    const vp = native.coords?.getViewport?.();
                    if (!vp || vp.barSpacing < 70) {
                        native.applyViewport({ barSpacing: 95, rightOffset: 5 });
                    }
                }
            } catch (e) {
                console.warn('[Footprint] Auto-frame failed:', e);
            }
        }
        ctx.toast(next === 'footprint' ? 'Switched to Footprint (Order Flow)' : 'Switched to Candlesticks');
    }
});

// Quick topbar button to toggle DOM Ladder
registerWidgetAction({
    id: 'domladder.toggle',
    target: 'topbar',
    align: 'left',
    order: 23,
    label: 'DOM Ladder',
    run: (ctx) => {
        ctx.togglePanel('liquidity.dom');
    }
});

async function startVela() {
    // 1. Initialize authentic LiquidityMapper theme (Darker / Editor frame)
    try {
        const saved = (typeof window !== 'undefined' && window.localStorage.getItem('hlm-theme')) || 'darker';
        applyTheme(saved);
    } catch (e) {
        console.warn('[Theme] Initial apply warning:', e);
    }

    // Pre-flight fetch authoritative workspace from LXC 115 backend before mounting
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch('/api/workspaces', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.workspaces) && data.workspaces.length > 0) {
                const activeId = data.activeId || data.workspaces[0].id;
                const activeWs = data.workspaces.find((w: any) => w.id === activeId) || data.workspaces[0];
                if (activeWs && activeWs.document) {
                    try {
                        window.localStorage.setItem('vela-play:vela-workspace', JSON.stringify(activeWs.document));
                        window.localStorage.setItem('vela:workspaces-list', JSON.stringify(data.workspaces));
                        window.localStorage.setItem('vela:active-workspace-id', activeId);
                    } catch (_) {}
                }
            }
        }
    } catch (e) {
        console.warn('[Workspace] Server pre-flight sync warning (using cached/fallback):', e);
    }

function getBootLayout(): string {
    try {
        if (typeof window !== 'undefined') {
            const raw = window.localStorage.getItem('vela-play:vela-workspace');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.layout === 'string') {
                    return parsed.layout;
                }
            }
            const tplCache = window.localStorage.getItem('vela-play:templates-cache');
            if (tplCache) {
                const tpls = JSON.parse(tplCache);
                if (Array.isArray(tpls)) {
                    const def = tpls.find((t: any) => t.isDefault);
                    if (def?.layout && typeof def.layout === 'string') {
                        return def.layout;
                    }
                }
            }
        }
    } catch {}
    return '1';
}

// 2. Instantiate the multi-chart VelaWorkspace
const ws = new VelaWorkspace('#workspace', {
    layout: getBootLayout(), // Restores saved/default layout immediately with zero flicker
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
        viewport: false,  // false: charts adjust independently; toggled via Time switch
        crosshair: true,  // ghost crosshair follows time across every chart
        drawings: true,   // drawings created on one chart mirror across peers
        style: true,      // canvas / scale styling mirrors across cells
    },

    drawingToolbar: true, // full left drawing tools suite (67+ tools)

    topbar: {
        // Left: Symbol, Timeframes, Style (Candles icon), Layout, Indicators, Replay, Undo/Redo
        left: ['symbol', 'timeframes', 'style', 'layout', 'indicators', 'quant:indicator-templates.open', 'replay.toggle', 'undo-redo'],
        // Right: Pine Editor, Screenshot, Theme Toggle, Panels, Trade button
        right: ['pine.editor', 'screenshot', 'theme.toggle', 'panels', 'trade.toggle'],
    },
});

// 3. Bind workspace instances
setWorkspaceInstance(ws);
(window as any).ws = ws;
setWatchlistWorkspaceInstance(ws);
setAlertsWorkspaceInstance(ws);
setThemeWorkspaceInstance(ws);
setExplorerWorkspaceInstance(ws);
createLocalWorkspaceSource(ws);
createLocalIndicatorTemplatesSource(ws);

// ── LiquidityMapper Cockpit, 3-Column Layout & DOM Ladder Mount ─────────────
function initSplitters(): void {
    const sideSplitter = document.getElementById("side-splitter");
    const sideCol = document.getElementById("side-column");
    if (sideSplitter && sideCol) {
        let startX = 0;
        let startW = 0;
        const onMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - startX;
            const newW = Math.max(260, Math.min(650, startW - dx));
            sideCol.style.width = `${newW}px`;
            sideCol.style.flex = `0 0 ${newW}px`;
            window.dispatchEvent(new Event("resize"));
        };
        const onMouseUp = () => {
            sideSplitter.classList.remove("active");
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
        sideSplitter.addEventListener("mousedown", (e) => {
            e.preventDefault();
            startX = e.clientX;
            startW = sideCol.getBoundingClientRect().width;
            sideSplitter.classList.add("active");
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
        });
    }

    const flowSplitter = document.getElementById("flow-splitter");
    const flowCol = document.getElementById("flow-column");
    if (flowSplitter && flowCol) {
        let startX = 0;
        let startW = 0;
        const onMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - startX;
            const newW = Math.max(200, Math.min(500, startW + dx));
            flowCol.style.width = `${newW}px`;
            flowCol.style.flex = `0 0 ${newW}px`;
            window.dispatchEvent(new Event("resize"));
        };
        const onMouseUp = () => {
            flowSplitter.classList.remove("active");
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
        flowSplitter.addEventListener("mousedown", (e) => {
            e.preventDefault();
            startX = e.clientX;
            startW = flowCol.getBoundingClientRect().width;
            flowSplitter.classList.add("active");
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
        });
    }
}

initSplitters();

// Mount DOM Ladder in Side Column
const sideColEl = document.getElementById("side-column");
let domLadderCtrl: DomLadderPanelController | null = null;
if (sideColEl) {
    try {
        domLadderCtrl = new DomLadderPanelController(sideColEl);
    } catch (e) {
        console.warn("[DOM Ladder] Mount warning:", e);
    }
}

// Mount Status Bar
const statusbarHost = document.getElementById("app-statusbar");
let statusBarCtrl: StatusBarController | null = null;
if (statusbarHost) {
    try {
        statusBarCtrl = new StatusBarController(statusbarHost);
        LiquidityClient.get().onTick((price) => {
            statusBarCtrl?.updateMark(price);
        });
    } catch (e) {
        console.warn("[StatusBar] Mount warning:", e);
    }
}

// Mount Cockpit Toolbar
const toolbarHost = document.getElementById("cockpit-toolbar");
let cockpitToolbar: CockpitToolbar | null = null;
if (toolbarHost) {
    try {
        cockpitToolbar = new CockpitToolbar(toolbarHost, {
            activeCoin: "BTC",
            activeTimeframe: "1h",
            activePriceStyle: "candles",
            onCoinChange: (coin) => {
                const sym = coin + "USDT";
                if (ws.active) {
                    ws.active.setSymbol(sym);
                }
                domLadderCtrl?.setSymbol(sym);
            },
            onTimeframeChange: (tf) => {
                const map: Record<string, string> = {
                    "1s": "1S", "5s": "5S", "15s": "15S",
                    "1m": "1", "5m": "5", "15m": "15", "30m": "30",
                    "1h": "60", "4h": "240", "1d": "D"
                };
                if (ws.active) {
                    ws.active.setTimeframe(map[tf] || tf);
                }
            },
            onPriceStyleChange: (style) => {
                if (ws.active) {
                    ws.active.setPriceStyle(style);
                    if (style === "footprint") {
                        try {
                            const chart = ws.active.chart;
                            const native: any = (chart?.renderer as any)?.renderer;
                            if (native && typeof native.applyViewport === "function") {
                                const vp = native.coords?.getViewport?.();
                                if (!vp || vp.barSpacing < 70) {
                                    native.applyViewport({ barSpacing: 95, rightOffset: 5 });
                                }
                            }
                        } catch (_) {}
                    }
                }
            },
            onToggleBook: (show) => {
                const side = document.getElementById("side-column");
                const split = document.getElementById("side-splitter");
                if (side) side.style.display = show ? "flex" : "none";
                if (split) split.style.display = show ? "block" : "none";
                window.dispatchEvent(new Event("resize"));
            },
            onToggleFlow: (show) => {
                const flow = document.getElementById("flow-column");
                const split = document.getElementById("flow-splitter");
                if (flow) flow.style.display = show ? "flex" : "none";
                if (split) split.style.display = show ? "block" : "none";
                window.dispatchEvent(new Event("resize"));
            },
            onToggleStats: (show) => {
                const lower = document.getElementById("lower-panes");
                const split = document.getElementById("lower-splitter");
                if (lower) lower.style.display = show ? "flex" : "none";
                if (split) split.style.display = show ? "block" : "none";
                window.dispatchEvent(new Event("resize"));
            },
            onRecenter: () => {
                try {
                    const chart = ws.active.chart;
                    const native: any = (chart?.renderer as any)?.renderer;
                    if (native && typeof native.applyViewport === "function") {
                        native.applyViewport({ rightOffset: 5 });
                    }
                } catch (_) {}
            },
            onThemeChange: (theme) => {
                statusBarCtrl?.updateTheme(theme);
            }
        });
    } catch (e) {
        console.warn("[CockpitToolbar] Mount warning:", e);
    }
}

// Keep Cockpit Toolbar synchronized with active cell
ws.on("cell:active", ({ id }) => {
    const cell = ws.cell(id);
    if (cell) {
        const sym = cell.chart.symbol || "BTCUSDT";
        const base = sym.replace(/USDT$|USD$|-PERP$/, "");
        cockpitToolbar?.setCoin(base);
        cockpitToolbar?.setPriceStyle(cell.chart.priceStyle || "candles");
    }
});


// 4. Mount bottom account drawer (starts collapsed at 28px)
mountBottomAccountStrip(ws);

// 5. Hook active cell & market changes so order ticket & watchlist follow user chart clicks and symbol changes
const syncActiveSymbol = (sym: string) => {
    if (!sym) return;
    setActiveSymbol(sym);
    setWatchlistActiveSymbol(sym);
    setAlertsActiveSymbol(sym);
    void LiquidityClient.get().switchMarket(sym);
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
const syncShellTheme = (t: any): void => {
    document.body.style.background = t.background;
    applyThemeTokens(document.body, t);
    applyThemeTokens(document.documentElement, t);
};
syncShellTheme(ws.opts.theme ? resolveTheme(ws.opts.theme) : DARK_THEME);
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
}

void startVela();
