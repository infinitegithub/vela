import './hlm/app/styles.css';
import './hlm/app/mobile.css';
import './hlm/app/chrome.css';
// LiquidityMapper & LuxAlgo Vela Workstation: 100% Authentic Integration
import { Hub } from './hlm/app/hub.ts';
import { ServerSource } from './hlm/app/server-source.ts';
import { BrowserSource } from './hlm/app/browser-source.ts';
import { chooseCoin, currentCoin, forCoin, keepCoinRecordings, scaledUsd, type CoinChoice } from './hlm/app/coin.ts';
import { withAnchor } from './hlm/app/vwap/settings.ts';
import type { DataSource } from './hlm/app/source.ts';
import { loadKernels } from './hlm/app/kernels.ts';
import { Store, initialState } from './hlm/app/store.ts';
import { applyTheme } from './hlm/app/theme.ts';
import { UiGlass } from './hlm/app/glass/ui-glass.ts';
import { Sounds } from './hlm/app/sound/sounds.ts';
import { Alerts } from './hlm/app/sound/alerts.ts';
import { Toolbar } from './hlm/app/toolbar.ts';
import { StatusBar } from './hlm/app/statusbar.ts';
import { setTimeZone } from './hlm/app/format.ts';
import { installTips } from './hlm/app/tip.ts';
import { installTouchSelects } from './hlm/app/touch-select.ts';
import { lazy, preload } from './hlm/app/lazy.ts';
import { ScreenWake } from './hlm/app/wake.ts';
import { HeatPane, gutter, leftGutter } from './hlm/app/panes/heat-pane.ts';
import { LadderPane } from './hlm/app/panes/ladder-pane.ts';
import { CvdPane } from './hlm/app/panes/cvd-pane.ts';
import { BarStatsPane, DepthPane, LtPane, OiPane } from './hlm/app/panes/lower-panes.ts';
import { DeltaPane } from './hlm/app/panes/delta-pane.ts';
import { LsPane } from './hlm/app/panes/ls-pane.ts';
import { CandlePane } from './hlm/app/panes/candle-pane.ts';
import { matchShortcut, togglePatch } from './hlm/app/shortcuts.ts';
import { ReplayBar } from './hlm/app/replay/bar.ts';
import { replaying } from './hlm/app/replay/clock.ts';
import { topShown } from './hlm/app/measures/strip.ts';
import { tableHeight } from './hlm/app/panes/bar-stats.ts';
import { Layout } from './hlm/app/layout.ts';
import { Dock } from './hlm/app/dock.ts';
import { RangeTool } from './hlm/app/range/tool.ts';
import { startDevice, onLayoutMode, isPhone } from './hlm/app/device.ts';
import { loadLanguage } from './hlm/app/i18n-load.ts';
import { useMarkets } from './hlm/app/venue-marks.ts';

// Vela Workstation imports
import { VelaWorkspace } from '../src/workspace';
import { BinanceProvider } from '../src/data/providers/binance';
import { CoinbaseProvider } from '../src/data/providers/coinbase';
import { HyperliquidProvider } from '../src/data/providers/hyperliquid';
import { PineWorkerEngine } from '@luxalgo/vela-pinets';
import { DemoEngine } from './demo-engine';
import { playgroundStorage } from './persistence';
import { registerClassicIndicators } from '../src/core/native-indicators/classics';
import { widgetActions } from '../src/widget/contributions';
import { registerTradingLinesLayer } from './trading-lines';
import { registerFootprintPlugin } from './footprint-plugin';
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

// Register Vela plugins
registerIndicatorsPersistence();
registerWorkspaceLayoutPicker();
registerIndicatorTemplatesPicker();
registerClassicIndicators();
registerTradingLinesLayer();
registerFootprintPlugin();
registerWatchlistSidePanel();
registerAlertsSidePanel();
registerTradingSidePanel();
registerTradeButton();
registerReplayButton();
registerPineEditor();
registerThemeSwitcher();
registerIndicatorExplorer();

async function serverAnswers(): Promise<boolean> {
  try {
    const response = await fetch('/api/v2/state', { signal: AbortSignal.timeout(1_500), cache: 'no-store' });
    return response.ok && (response.headers.get('content-type') ?? '').includes('json');
  } catch { return false; }
}

async function chooseSource(params: URLSearchParams, choice: CoinChoice): Promise<DataSource> {
  const wanted = params.get('source');
  if (choice.coin.coin === 'BTC' && (wanted === 'server' || (wanted !== 'browser' && await serverAnswers()))) {
    return new ServerSource();
  }
  return new BrowserSource(new Worker(new URL('./hlm/app/browser/feeds.worker.ts', import.meta.url), { type: 'module' }), {
    persist: params.get('persist') !== '0',
    coin: choice.coin,
    tier: choice.tier
  });
}

function mapTimeframeToVela(tf: string): string {
  const map: Record<string, string> = {
    '1s': '1S', '5s': '5S', '15s': '15S',
    '1m': '1', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '4h': '240', '1d': 'D', '1w': 'W'
  };
  return map[tf] || tf;
}

async function bootUnifiedWorkstation() {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  await loadLanguage();
  startDevice();
  const params = new URLSearchParams(location.search);
  const choice = await chooseCoin(params);
  const init = forCoin(initialState(), choice.coin, choice.from);
  if (!init.themePicked || init.theme === 'light') {
    init.theme = 'darker';
    init.themePicked = true;
  }
  const store = new Store(init);
  useMarkets(() => store.state.markets);
  setTimeZone(store.state.timeZone);
  applyTheme(store.state.theme);
  installTips();
  installTouchSelects();
  const kernels = await loadKernels();
  keepCoinRecordings();
  const source = await chooseSource(params, choice);
  const hub = new Hub(store, source);
  const wake = new ScreenWake(); wake.set(store.state.keepAwake);

  const toolbar = new Toolbar(store, source.venues);
  toolbar.flow = hub.flow;
  toolbar.sourceKind = source.kind === 'server' ? 'server' : 'browser';

  const main = document.createElement('main');
  const chart = document.createElement('div'); chart.className = 'chart-col';
  const side = document.createElement('div'); side.className = 'side-col';
  const flowCol = document.createElement('div'); flowCol.className = 'flow-col';
  main.append(flowCol, chart, side);
  const dock = new Dock(main);
  const statusbar = new StatusBar(source.kind);
  app.append(toolbar.root, main, dock.root, statusbar.root);
  toolbar.hostStatusControls(statusbar.controls);
  source.venues.watch?.(entries => statusbar.setVenues(entries));
  const showStatus = (): void => statusbar.update(store.state, hub.recordedSince, source.kind === 'server' ? 'server' : source.saving?.(Date.now()) ?? 'starting');
  window.setInterval(showStatus, 1000);

  // 1. Mount LiquidityMapper native panes
  const heat = new HeatPane(chart, store, hub, kernels);
  toolbar.placeRecenter(heat.root);
  const bars = new BarStatsPane(chart, store, heat.view, heat, hub);
  const depth = new DepthPane(chart, store, heat.view, hub);
  const oi = new OiPane(chart, store, heat.view, hub.flow);
  const delta = new DeltaPane(chart, store, heat.view, hub);
  heat.divergences = () => delta.divergences; delta.onDivergences = () => heat.invalidate();
  const ls = new LsPane(chart, store, heat.view, hub);
  const lt = new LtPane(chart, store, heat.view, hub);
  const ladder = new LadderPane(side, store, kernels, hub);
  const cvd = new CvdPane(flowCol, store, hub, heat.view);
  const candle = new CandlePane(main, store, hub, kernels, s => heat.footprintMarkets(s));
  toolbar.tapeFields = () => candle.settingsFields();

  // 2. Dock Vela Multi-Chart Workspace into chart-col
  const velaContainer = document.createElement('div');
  velaContainer.id = 'vela-workspace-container';
  velaContainer.className = 'vela-workspace-container';
  velaContainer.style.display = 'none'; // starts in Heatmap mode
  velaContainer.innerHTML = '<div id="workspace"></div>';
  chart.insertBefore(velaContainer, chart.firstChild);

  // 3. Mount Vela Workspace
  const ws = new VelaWorkspace('#workspace', {
    layout: '1',
    symbol: choice.coin.coin + 'USDT',
    timeframe: mapTimeframeToVela(store.state.timeframe || '1h'),
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

  setWorkspaceInstance(ws);
  (window as any).ws = ws;
  setWatchlistWorkspaceInstance(ws);
  setAlertsWorkspaceInstance(ws);
  setThemeWorkspaceInstance(ws);
  setExplorerWorkspaceInstance(ws);
  createLocalWorkspaceSource(ws);
  createLocalIndicatorTemplatesSource(ws);
  mountBottomAccountStrip(ws);

  // 4. View Mode Deck in Cockpit Toolbar
  const modeDeck = document.createElement('div');
  modeDeck.className = 'view-mode-deck';
  modeDeck.innerHTML = `
    <button type="button" class="view-mode-btn active" id="mode-heat" title="Native Liquidity Heatmap & Footprint Engine">Heatmap</button>
    <button type="button" class="view-mode-btn" id="mode-vela" title="LuxAlgo Vela Multi-Pane Workstation, Pine Script & Drawing Tools">Vela TA</button>
    <button type="button" class="view-mode-btn" id="mode-split" title="Side-by-Side Dual View">Split</button>
  `;

  // Vela tools deck for quick access to Pine Editor, Indicators, Watchlist
  const velaTools = document.createElement('div');
  velaTools.className = 'vela-tools-deck';
  velaTools.innerHTML = `
    <button type="button" class="vela-tool-btn" id="btn-pine" title="Open Pine Script v5 / v4 Editor">Pine</button>
    <button type="button" class="vela-tool-btn" id="btn-indicators" title="Explore LuxAlgo & Classic Indicators">Indicators</button>
    <button type="button" class="vela-tool-btn" id="btn-watchlist" title="Toggle Watchlist">Watchlist</button>
  `;

  const toolbarSeg = toolbar.root.querySelector('.seg.toggles') || toolbar.root.querySelector('.seg') || toolbar.root;
  toolbarSeg.after(modeDeck);
  modeDeck.after(velaTools);

  let currentViewMode: 'heat' | 'vela' | 'split' = 'heat';
  const setViewMode = (mode: 'heat' | 'vela' | 'split') => {
    currentViewMode = mode;
    modeDeck.querySelectorAll('.view-mode-btn').forEach(b => b.classList.remove('active'));
    modeDeck.querySelector(`#mode-${mode}`)?.classList.add('active');

    if (mode === 'heat') {
      heat.root.style.display = '';
      heat.root.style.height = '';
      heat.root.style.flex = '';
      velaContainer.style.display = 'none';
      heat.fit();
      heat.invalidate();
    } else if (mode === 'vela') {
      heat.root.style.display = 'none';
      velaContainer.style.display = 'flex';
      velaContainer.style.height = '100%';
      velaContainer.style.flex = '1 1 auto';
      window.dispatchEvent(new Event('resize'));
    } else if (mode === 'split') {
      heat.root.style.display = '';
      heat.root.style.height = '50%';
      heat.root.style.flex = '1 1 50%';
      velaContainer.style.display = 'flex';
      velaContainer.style.height = '50%';
      velaContainer.style.flex = '1 1 50%';
      window.dispatchEvent(new Event('resize'));
      heat.fit();
      heat.invalidate();
    }
  };

  modeDeck.querySelector('#mode-heat')?.addEventListener('click', () => setViewMode('heat'));
  modeDeck.querySelector('#mode-vela')?.addEventListener('click', () => setViewMode('vela'));
  modeDeck.querySelector('#mode-split')?.addEventListener('click', () => setViewMode('split'));

  velaTools.querySelector('#btn-pine')?.addEventListener('click', () => {
    setViewMode('vela');
    const act = widgetActions('topbar').find(a => a.id === 'pine.editor');
    if (act) act.run((ws as any).context());
  });
  velaTools.querySelector('#btn-indicators')?.addEventListener('click', () => {
    setViewMode('vela');
    void openIndicatorExplorer();
  });
  velaTools.querySelector('#btn-watchlist')?.addEventListener('click', () => {
    setViewMode('vela');
    (ws as any).dock?.toggle('watchlist.panel');
  });

  // 5. Setup Layout & Splitters
  const arrange = new Layout(main, chart, side, [
    { id: 'heat', root: heat.root, min: 240 },
    { id: 'bars', root: bars.root, height: 84, min: 56, head: bars.header },
    { id: 'depth', root: depth.root, height: 132, min: 70, head: depth.header },
    { id: 'oi', root: oi.root, height: 150, min: 60, head: oi.header },
    { id: 'delta', root: delta.root, height: 150, min: 60, head: delta.header },
    { id: 'ls', root: ls.root, height: 120, min: 60, head: ls.header },
    { id: 'lt', root: lt.root, height: 128, min: 70, head: lt.header },
  ], flowCol);

  const lower = () => {
    depth.invalidate(); oi.invalidate(); delta.invalidate(); ls.invalidate(); lt.invalidate(); bars.invalidate(); cvd.followMap();
  };

  let stripLoads = hub.flow.loads;
  hub.onFlowChanged = () => {
    cvd.invalidate(); delta.invalidate();
    const landed = stripLoads !== hub.flow.loads;
    stripLoads = hub.flow.loads;
    if (replaying() || (landed && topShown(store.state))) heat.invalidate();
    hub.refreshOiMarkets();
  };

  for (const pane of [depth, oi, delta, ls, lt, bars]) pane.useTimeGestures(heat.timeGestures());
  heat.onFrame = lower;
  heat.onView = lower;
  heat.onTopProfile = () => toolbar.openTradedPanel();
  heat.onArrangedChange = () => toolbar.refreshTradedPanel();
  toolbar.profileRoom = () => heat.profileRoom();

  const range = new RangeTool(store, hub);
  range.anchor = toolbar.rangeButton;
  range.mapWindow = () => ({ t0: heat.view.t0, t1: heat.view.t1 });
  heat.range = range;
  cvd.range = range;
  for (const pane of [depth, oi, delta, ls, lt, bars]) pane.useRange(range);

  toolbar.onRange = () => range.toggle();
  toolbar.onRecenter = () => {
    heat.fit();
    ladder.recenter();
    try {
      const native: any = (ws.active?.chart?.renderer as any)?.renderer;
      if (native && typeof native.applyViewport === 'function') {
        native.applyViewport({ rightOffset: 5 });
      }
    } catch (_) {}
  };

  window.setInterval(() => heat.tick(), 1000);

  const replayBar = new ReplayBar(store, {
    redraw: () => heat.invalidate(),
    placeAt: t => heat.placeAt(t),
    live: () => toolbar.onRecenter()
  });
  heat.root.append(replayBar.root);

  toolbar.goTo = {
    replay: t => replayBar.start(t),
    centre: () => (heat.view.t0 + heat.view.t1) / 2,
    earliest: () => ({ depth: hub.recordedSince > 0 ? hub.recordedSince : null, candles: store.state.candles[0]?.[0] ?? null }),
    go: t => heat.goTo(t),
    live: () => { if (replaying()) replayBar.stop(); else toolbar.onRecenter(); },
  };

  hub.onWhaleChanged = () => toolbar.refreshOpenPanel();
  toolbar.panes = { arrangement: () => arrange.arrangement(), apply: a => arrange.apply(a), defaults: () => arrange.defaults() };
  toolbar.onSelectMarket = id => store.set({ marketId: id });
  toolbar.onVenuesApplied = () => {
    void hub.refreshMarkets();
    window.setTimeout(() => void hub.refreshMarkets(), 15_000);
  };

  const sounds = new Sounds(store);
  toolbar.attachSounds(sounds);
  sounds.start();

  const alerts = new Alerts(store, hub.flow, sounds.engine, Date.now, (ids, from) => { void hub.ensureFlow(ids, from); }, (ids, from, to) => hub.source.columns(ids, from, to, 60_000));
  toolbar.attachAlerts(alerts);
  alerts.start();
  alerts.onChange = () => cvd.invalidate();
  cvd.events = alerts.bursts;

  hub.onPrints = fresh => { if (replaying()) return; sounds.feed(fresh); cvd.flash(fresh); };
  hub.onPrintsChanged = () => { heat.invalidate(); range.refreshHeld(); };

  const candleShown = (): boolean => dock.tab === 'candle' && isPhone();
  const glass = new UiGlass((price, t) => heat.liveSpot(price, t), () => hub.tape);
  cvd.onLargeFlow = (x, y, usd) => glass.pulse(x, y, usd, scaledUsd(100_000), usd > 0 ? 0 : 1);

  const applyMaterial = (): void => {
    glass.setPalette(applyTheme(store.state.theme));
    glass.setOn(store.state.material === 'glass');
    document.documentElement.dataset.material = glass.on ? 'glass' : 'solid';
  };

  const tapeWanted = (): boolean => (store.state.show.bubbles && store.state.tradeBubbles.live) || candleShown() || store.state.material === 'glass' || isPhone();
  const coverPanes = (): void => { const covered = candleShown(); heat.setSuspended(covered); ladder.setSuspended(covered); };
  dock.onChange = () => { candle.setShown(candleShown()); coverPanes(); hub.setTape(tapeWanted()); };
  hub.setTape(tapeWanted());
  hub.onTape = () => { heat.tapeArrived(); candle.tapeArrived(); glass.tapeArrived(); };
  applyMaterial();

  hub.onRecovered = (id, _from, to) => { alerts.recovered.set(id, Math.max(alerts.recovered.get(id) ?? 0, to)); };
  hub.onLiquidationsChanged = () => { heat.invalidate(); range.refreshHeld(); };
  toolbar.keyHistory = hub.keyHistory;
  toolbar.profileHistory = barMs => hub.profileHistory(barMs);
  toolbar.whaleInfo = () => ({ since: hub.whale?.since ?? null, state: hub.whaleState, browser: source.kind === 'browser' });

  heat.onAnchor = at => {
    const s = store.state;
    store.set({ vwap: withAnchor({ ...s.vwap, on: true }, currentCoin().coin, at, Date.now()), vwapAnchoring: false });
  };
  hub.onTraded = () => heat.invalidate();
  hub.onAbsorptionChanged = () => { heat.invalidate(); range.refreshHeld(); };
  toolbar.absorptionInfo = () => heat.absorptionThresholdText();

  toolbar.onPreviewTheme = id => {
    const name = id ?? store.state.theme;
    glass.setPalette(applyTheme(name));
    for (const p of [heat, ladder, depth, oi, delta, ls, lt, bars, cvd, candle]) p.setPalette(name);
    toolbar.previewTheme(name);
  };
  heat.onStats = () => toolbar.sync(store.state, heat.window);

  window.addEventListener('keydown', e => {
    const hit = matchShortcut(e, document.querySelector('dialog[open]') !== null);
    if (!hit) return;
    e.preventDefault();
    const a = hit.action;
    if (a.kind === 'timeframe') store.set({ timeframe: a.tf });
    else if (a.kind === 'recenter') toolbar.onRecenter();
    else if (a.kind === 'zoom') heat.zoomStep(a.dir);
    else if (a.kind === 'toggle') { store.set(togglePatch(store.state, a.feature)); toolbar.refreshOpenPanel(); }
    else if (a.kind === 'range') range.toggle();
    else if (a.kind === 'goto') toolbar.openGoTo();
    else if (a.kind === 'screenshot') void lazy(() => import('./hlm/app/screenshot/editor.ts')).then(m => m?.startScreenshot());
    else toolbar.openShortcuts();
  });

  onLayoutMode(() => {
    layout(); heat.invalidate(); lower(); toolbar.sync(store.state, heat.window); candle.setShown(candleShown()); coverPanes(); hub.setTape(tapeWanted());
  });

  const gutters = () => {
    const s = store.state;
    document.documentElement.style.setProperty('--gutter', `${gutter(s)}px`);
    document.documentElement.style.setProperty('--gutter-left', `${leftGutter(s)}px`);
  };

  const layout = () => {
    const s = store.state;
    gutters();
    depth.root.hidden = !s.show.depth;
    oi.root.hidden = !s.show.oi;
    delta.root.hidden = !s.show.delta;
    ls.root.hidden = !s.show.ls;
    lt.root.hidden = !s.show.lt;
    bars.root.hidden = !s.show.stats;
    cvd.root.hidden = !s.show.cvd;
    ladder.root.hidden = !s.show.book;
    arrange.columns({ flow: s.show.cvd, book: s.show.book });
    arrange.rebuild();
    if (s.show.cvd) cvd.invalidate();
    if (s.show.book) ladder.invalidate();
    dock.sync(s.show);
  };

  let tableShape = `${store.state.barStats.join(',')}|${store.state.barStatOptions.grouped}|${store.state.barStatOptions.folded.join(',')}`;

  store.subscribe((state, changed) => {
    if (changed.has('keepAwake')) wake.set(state.keepAwake);
    if (changed.has('timeZone')) { setTimeZone(state.timeZone); heat.invalidate(); lower(); cvd.invalidate(); showStatus(); }
    if (changed.has('theme')) {
      glass.setPalette(applyTheme(state.theme));
      for (const p of [heat, ladder, depth, oi, delta, ls, lt, bars, cvd, candle]) p.setPalette(state.theme);
      try {
        const t = resolveTheme(state.theme);
        applyThemeTokens(document.body, t);
        applyThemeTokens(document.documentElement, t);
      } catch (_) {}
    }
    if (changed.has('material')) { applyMaterial(); hub.setTape(tapeWanted()); }
    if (changed.has('cvd')) cvd.settingsChanged();
    if (changed.has('status') || changed.has('connected') || changed.has('mark')) showStatus();
    if (changed.has('show')) layout(); else if (changed.has('traded')) gutters();
    if (changed.has('marketId') || changed.has('timeframe')) {
      void hub.loadSeries(true).then(() => { heat.fit(); lower(); });
      const baseCoin = currentCoin().coin;
      ws.active?.setSymbol(baseCoin + 'USDT');
      ws.active?.setTimeframe(mapTimeframeToVela(state.timeframe));
    }
    if (changed.has('sounds')) heat.invalidate();
    if (changed.has('mark') && state.show.book) ladder.markMoved();
    if (changed.has('levels')) { if (state.show.book) ladder.levelsArrived(); ladder.invalidate(); ladder.syncVenues(); heat.invalidate(); }
    if (changed.has('replay')) { ladder.invalidate(); cvd.invalidate(); heat.invalidate(); lower(); }
    if (changed.has('layers') || changed.has('layer') || changed.has('candles') || changed.has('mark') || changed.has('heat') || changed.has('show')) heat.invalidate();
    if (changed.has('oi') || changed.has('show')) { oi.invalidate(); bars.invalidate(); }
    if (changed.has('lt') || changed.has('show') || changed.has('sounds')) lt.refresh();
    if (changed.has('sounds')) depth.syncSound();
    const shape = `${state.barStats.join(',')}|${state.barStatOptions.grouped}|${state.barStatOptions.folded.join(',')}`;
    if (shape !== tableShape) { tableShape = shape; arrange.setPaneHeight('bars', tableHeight(state.barStats, state.barStatOptions)); }
    if (changed.has('barStatOptions') || changed.has('footprint') || changed.has('barStats')) bars.refresh();
    if (changed.has('grouping') || changed.has('ladderMode') || changed.has('ladderShow') || changed.has('ladderCurves') || changed.has('cvd') || changed.has('pullStack') || changed.has('ladderVenue') || changed.has('ladderVenues') || changed.has('disabledVenues') || changed.has('scope')) {
      ladder.invalidate(); ladder.syncControls();
    }
    if (changed.has('range')) { heat.invalidate(); oi.invalidate(); depth.invalidate(); lt.invalidate(); bars.invalidate(); cvd.invalidate(); }
    if (changed.has('hover')) { heat.invalidate(); oi.invalidate(); delta.invalidate(); ls.invalidate(); depth.invalidate(); lt.invalidate(); bars.invalidate(); cvd.syncHover(); }
    if (changed.has('delta')) delta.settingsChanged();
    if ((changed.has('oi') || changed.has('oiParts')) && topShown(state)) heat.invalidate();
    if (changed.has('marketId')) candle.marketChanged();
    if (['levels', 'mark', 'disabledVenues', 'scope', 'markets', 'footprint', 'customMarkets', 'replay', 'bookGone', 'show'].some(k => changed.has(k as never))) candle.invalidate();
    if (changed.has('lsMetric')) ls.settingsChanged();
    if (['show', 'timeframe', 'marketId', 'disabledVenues', 'scope', 'markets', 'oiMarkets', 'customMarkets', 'oiInstrument', 'oiParts', 'seriesInstrument', 'range'].some(k => changed.has(k as never))) ls.invalidate();
    if (['show', 'candles', 'timeframe', 'marketId', 'disabledVenues', 'scope', 'markets', 'traded', 'timeZone', 'range', 'oi', 'oiInstrument', 'oiParts'].some(k => changed.has(k as never))) delta.invalidate();
    if (['markets', 'marketId', 'timeframe', 'layer', 'show', 'heat', 'theme', 'status', 'connected', 'disabledVenues', 'heatmapSource', 'levels', 'scope', 'sounds', 'soundState', 'lastSound', 'timeZone', 'absorption', 'highlight', 'range', 'rangeTool', 'liquidations', 'keyLevels', 'vwap', 'footprint'].some(k => changed.has(k as never))) toolbar.sync(state, heat.window);
  });

  for (const p of [heat, ladder, depth, oi, delta, ls, lt, bars, cvd, candle]) p.setPalette(store.state.theme);
  layout();
  ladder.syncControls();
  lt.refresh();
  arrange.setPaneHeight('bars', tableHeight(store.state.barStats, store.state.barStatOptions));
  toolbar.sync(store.state, heat.window);
  await hub.start();
  await hub.loadSeries(true);
  heat.fit();
  lower();

  window.setInterval(() => { void hub.loadSeries(true); }, 60_000);
  window.setInterval(() => { void hub.loadOi(); }, 20_000);

  (window as any).__hlm = { store, hub, heat, ladder, cvd, candle, sounds, alerts, glass, ws };
}

bootUnifiedWorkstation().catch(err => {
  console.error('[UnifiedWorkstation] Fatal boot error:', err);
});
