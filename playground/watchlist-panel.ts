
function getSymbolLogoUrl(symbol: string): string | null {
    const s = normalizeSymbol(symbol).toUpperCase();
    if (['BTCUSDT', 'BTC'].includes(s)) return '/symbol-logos/cryptos/BTC.png';
    if (['ETHUSDT', 'ETH'].includes(s)) return '/symbol-logos/cryptos/ETH.png';
    if (['SOLUSDT', 'SOL'].includes(s)) return '/symbol-logos/cryptos/SOL.png';
    if (['BNBUSDT', 'BNB'].includes(s)) return '/symbol-logos/cryptos/BNB.png';
    if (['DOGEUSDT', 'DOGE'].includes(s)) return '/symbol-logos/cryptos/DOGE.png';
    if (['NVDA'].includes(s)) return '/symbol-logos/stocks/NVDA.png';
    if (['AAPL'].includes(s)) return '/symbol-logos/stocks/AAPL.png';
    if (['TSLA'].includes(s)) return '/symbol-logos/stocks/TSLA.png';
    if (['XAUUSD', 'XAU'].includes(s)) return '/symbol-logos/commodities/XAU.png';
    return null;
}

import { setActiveSymbol } from './trade-suite';
import { registerSidePanel, registerIcon, registerStatePersistence, registerSymbolFavorite } from '../src/plugin';
import type { VelaWorkspace } from '../src/workspace';
import { SymbolPicker } from '../src/widget/symbol-picker';
import type { SymbolDescriptor } from '../src/core/ports/DataProvider';
import { tickerIconEl, baseOf } from '../src/widget/symbol-icon';
import { ledgerCryptoIconUrl } from '../src/data/symbol-base';
import { injectStyles } from '../src/ui/styles';
import QUANT_WATCHLIST_CSS from './quant-watchlist.css?raw';

const WATCHLIST_PANEL_STYLE_ID = 'vela-quant-watchlist-styles';

// Register custom icons
registerIcon('watchlist', `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h7"/><circle cx="12.5" cy="12.5" r="1.5"/></svg>`);

let wsInstance: VelaWorkspace | null = null;
let activeSymbol = 'BTCUSDT';
let currentActiveWatchlist: WatchlistItem[] | null = null;

export function getWatchlist(): WatchlistItem[] {
    if (!currentActiveWatchlist || currentActiveWatchlist.length === 0) {
        currentActiveWatchlist = loadInitialWatchlist();
    }
    return currentActiveWatchlist;
}

let watchlistSyncTimeout: any = null;
export function saveWatchlistStorage(list: WatchlistItem[], syncRemote = true): void {
    currentActiveWatchlist = list;
    try {
        localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('[watchlist] LocalStorage write failed:', e);
    }
    if (syncRemote && typeof window !== 'undefined') {
        clearTimeout(watchlistSyncTimeout);
        watchlistSyncTimeout = setTimeout(() => {
            fetch('/api/watchlist', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(list),
                
            }).catch((err) => {
                console.warn('[watchlist] Remote sync error:', err);
            });
        }, 300);
    }
}

let isWatchlistHydrating = false;
async function syncWatchlistFromServer() {
    if (isWatchlistHydrating) return;
    isWatchlistHydrating = true;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch('/api/watchlist', { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data) ? data : (Array.isArray(data?.watchlist) ? data.watchlist : null);
            if (list && list.length > 0) {
                currentActiveWatchlist = list;
                try {
                    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(list));
                } catch {}
                if (triggerTableRender) triggerTableRender();
                if (triggerQuoteSync) triggerQuoteSync();
                isWatchlistHydrating = false;
                return;
            }
        }
    } catch (e) {
        console.warn('[watchlist] Server hydration warning:', e);
    }
    isWatchlistHydrating = false;
}

if (typeof window !== 'undefined') {
    void syncWatchlistFromServer();

    const handleSync = () => {
        if (document.visibilityState === 'visible') {
            void syncWatchlistFromServer();
        }
    };
    window.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);
}
let symbolChangeListeners: Array<(sym: string) => void> = [];
let triggerTableRender: (() => void) | null = null;
let triggerQuoteSync: (() => void) | null = null;
let selectWatchlistSymbol: ((sym: string) => void) | null = null;
let addSymbolPicker: SymbolPicker | null = null;

export interface WatchlistItem {
    symbol: string;
    name: string;
    category: 'Crypto' | 'Stocks' | 'Forex' | 'Commodities' | 'ETFs';
    binanceSymbol: string;
    isFutures: boolean;
    price: number;
    change: number;
    changePercent: number;
    high: number;
    low: number;
    open: number;
    volume: number;
}

export const DEFAULT_WATCHLIST: WatchlistItem[] = [
    { symbol: 'BTCUSDT', name: 'Bitcoin', category: 'Crypto', binanceSymbol: 'BTCUSDT', isFutures: false, price: 81870.01, change: -1298.99, changePercent: -1.56, high: 84146.72, low: 81514.28, open: 83169.01, volume: 16200 },
    { symbol: 'ETHUSDT', name: 'Ethereum', category: 'Crypto', binanceSymbol: 'ETHUSDT', isFutures: false, price: 2431.33, change: -66.62, changePercent: -2.67, high: 2510.50, low: 2415.00, open: 2497.95, volume: 84000 },
    { symbol: 'SOLUSDT', name: 'Solana', category: 'Crypto', binanceSymbol: 'SOLUSDT', isFutures: false, price: 104.21, change: -2.62, changePercent: -2.45, high: 107.80, low: 103.50, open: 106.83, volume: 92000 },
    { symbol: 'BNBUSDT', name: 'Binance Coin', category: 'Crypto', binanceSymbol: 'BNBUSDT', isFutures: false, price: 729.46, change: -12.26, changePercent: -1.65, high: 745.00, low: 722.00, open: 741.72, volume: 45000 },
    { symbol: 'DOGEUSDT', name: 'Dogecoin', category: 'Crypto', binanceSymbol: 'DOGEUSDT', isFutures: false, price: 0.08208, change: -0.00231, changePercent: -2.74, high: 0.0855, low: 0.0812, open: 0.08439, volume: 15400000 },
    { symbol: 'NVDA', name: 'NVIDIA', category: 'Stocks', binanceSymbol: '', isFutures: false, price: 221.30, change: -7.22, changePercent: -3.16, high: 226.00, low: 219.64, open: 228.52, volume: 117714200 },
    { symbol: 'AAPL', name: 'Apple', category: 'Stocks', binanceSymbol: '', isFutures: false, price: 342.96, change: 1.69, changePercent: 0.50, high: 347.07, low: 341.72, open: 341.27, volume: 49888500 },
    { symbol: 'TSLA', name: 'Tesla', category: 'Stocks', binanceSymbol: '', isFutures: false, price: 367.16, change: -8.07, changePercent: -2.15, high: 371.39, low: 363.82, open: 375.23, volume: 30862900 },
    { symbol: 'EURUSD', name: 'Euro / U.S. Dollar', category: 'Forex', binanceSymbol: '', isFutures: false, price: 1.1167, change: -0.0036, changePercent: -0.32, high: 1.1168, low: 1.1157, open: 1.1203, volume: 258400 },
    { symbol: 'XAUUSD', name: 'Gold / U.S. Dollar', category: 'Commodities', binanceSymbol: '', isFutures: false, price: 4128.10, change: 20.20, changePercent: 0.49, high: 4129.80, low: 4122.70, open: 4107.90, volume: 57200 },
];

const WATCHLIST_STORAGE_KEY = 'vela-play:watchlist-store-v9';

function loadInitialWatchlist(): WatchlistItem[] {
    try {
        const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.warn('[watchlist] LocalStorage read failed:', e);
    }
    return [...DEFAULT_WATCHLIST];
}

export function matchesTicker(item: WatchlistItem, ticker: string): boolean {
    if (!ticker) return false;
    const raw = ticker.trim().toUpperCase();
    const parts = raw.split(':');
    const bareTicker = (parts[parts.length - 1] || raw).trim();

    const itemSym = item.symbol.trim().toUpperCase();
    if (itemSym === bareTicker || itemSym === raw) return true;

    if (item.binanceSymbol) {
        const bSym = item.binanceSymbol.trim().toUpperCase();
        if (bSym === bareTicker || bSym === raw) return true;
    }
    return false;
}

// ── Native Vela SymbolPicker Favorite Registration ─────────────────────────────
registerSymbolFavorite({
    isFavorite: (ticker: string) => {
        const list = getWatchlist();
        return list.some(x => matchesTicker(x, ticker));
    },
    toggleFavorite: (ticker: string, descriptor?: any) => {
        const raw = ticker.trim().toUpperCase();
        const parts = raw.split(':');
        const bareTicker = (parts[parts.length - 1] || raw).trim();

        const list = getWatchlist();
        const idx = list.findIndex(x => matchesTicker(x, ticker));

        if (idx >= 0) {
            // Remove from active watchlist
            list.splice(idx, 1);
            saveWatchlistStorage(list);
            if (triggerTableRender) triggerTableRender();
        } else {
            // Add to active watchlist
            const allSymbols = (wsInstance as any)?.feed?.symbols?.() || [];
            const desc: SymbolDescriptor | undefined = descriptor || allSymbols.find((s: any) => s.ticker === bareTicker || s.ticker === ticker);
            const typeStr = (desc?.type ?? '').toLowerCase();
            let cat: 'Crypto' | 'Stocks' | 'Forex' | 'Commodities' | 'ETFs' = 'Crypto';
            if (typeStr === 'stock') cat = 'Stocks';
            else if (typeStr === 'etf') cat = 'ETFs';
            else if (typeStr === 'forex') cat = 'Forex';
            else if (typeStr === 'commodity') cat = 'Commodities';
            else if (typeStr === 'crypto' || bareTicker.endsWith('USDT') || bareTicker.endsWith('BTC') || bareTicker.endsWith('ETH')) cat = 'Crypto';

            const isCrypto = cat === 'Crypto' || bareTicker.endsWith('USDT') || bareTicker.endsWith('BTC');
            const newItem: WatchlistItem = {
                symbol: bareTicker,
                name: desc?.description || bareTicker,
                category: cat,
                binanceSymbol: isCrypto ? bareTicker : '',
                isFutures: typeStr === 'futures' || bareTicker.endsWith('.P'),
                price: 0,
                change: 0,
                changePercent: 0,
                high: 0,
                low: 0,
                open: 0,
                volume: 0,
            };
            list.push(newItem);
            saveWatchlistStorage(list);
            if (triggerTableRender) triggerTableRender();
            if (triggerQuoteSync) triggerQuoteSync();
        }
    }
});

export function setWatchlistWorkspaceInstance(ws: VelaWorkspace) {
    wsInstance = ws;
    if (addSymbolPicker) {
        addSymbolPicker.setSource(() => (wsInstance as any)?.feed?.symbols?.() || []);
    }
}

export function normalizeSymbol(sym: string): string {
    if (!sym) return '';
    return sym.replace(/^BINANCE:/i, '').replace(/\.P$/i, '').trim().toUpperCase();
}

export function setWatchlistActiveSymbol(symbol: string) {
    const norm = normalizeSymbol(symbol);
    activeSymbol = norm;
    for (const listener of symbolChangeListeners) {
        try {
            listener(norm);
        } catch (e) {
            console.warn('[watchlist] symbolChangeListener error:', e);
        }
    }
}

// ── Technical Indicators Math Utilities ───────────────────────────────────────
function calcEma(values: number[], period: number): number[] {
    if (values.length === 0) return [];
    const k = 2 / (period + 1);
    const result: number[] = [values[0]!];
    for (let i = 1; i < values.length; i++) {
        result.push(values[i]! * k + result[i - 1]! * (1 - k));
    }
    return result;
}

function calcRsi(values: number[], period = 14): number {
    if (values.length <= period) return 50;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = values[i]! - values[i - 1]!;
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period + 1; i < values.length; i++) {
        const diff = values[i]! - values[i - 1]!;
        if (diff >= 0) {
            avgGain = (avgGain * (period - 1) + diff) / period;
            avgLoss = (avgLoss * (period - 1)) / period;
        } else {
            avgGain = (avgGain * (period - 1)) / period;
            avgLoss = (avgLoss * (period - 1) - diff) / period;
        }
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

function calcMacd(values: number[]): { macd: number; signal: number; histogram: number; histograms: number[] } {
    if (values.length < 35) return { macd: 0, signal: 0, histogram: 0, histograms: [] };
    const fastEma = calcEma(values, 12);
    const slowEma = calcEma(values, 26);
    const macdLine: number[] = [];
    for (let i = 0; i < slowEma.length; i++) {
        macdLine.push(fastEma[i + (fastEma.length - slowEma.length)]! - slowEma[i]!);
    }
    const signalLine = calcEma(macdLine, 9);
    const histograms: number[] = [];
    for (let i = 0; i < signalLine.length; i++) {
        histograms.push(macdLine[i + (macdLine.length - signalLine.length)]! - signalLine[i]!);
    }
    const lastMacd = macdLine[macdLine.length - 1] || 0;
    const lastSignal = signalLine[signalLine.length - 1] || 0;
    const lastHist = histograms[histograms.length - 1] || 0;
    return { macd: lastMacd, signal: lastSignal, histogram: lastHist, histograms };
}

function calcTechnicalSummary(candles: Array<{ open: number; high: number; low: number; close: number }>) {
    if (candles.length < 20) {
        return {
            last: 0, ema20: 0, ema50: 0, rsi: 50, macd: 0, signal: 0, histogram: 0,
            histograms: [], score: 0, bullish: 2, bearish: 2, neutral: 1, label: 'Neutral bias'
        };
    }
    const closes = candles.map(c => c.close);
    const ema20Arr = calcEma(closes, 20);
    const ema50Arr = calcEma(closes, Math.min(50, closes.length));
    const rsi = Math.round(calcRsi(closes, 14));
    const { macd, signal, histogram, histograms } = calcMacd(closes);
    const last = closes[closes.length - 1]!;
    const ema20 = ema20Arr[ema20Arr.length - 1]!;
    const ema50 = ema50Arr[ema50Arr.length - 1]!;

    const sign = (n: number) => (n > 0.0001 ? 1 : n < -0.0001 ? -1 : 0);
    const checks = [
        sign(last - ema20),
        sign(ema20 - ema50),
        rsi > 55 ? 1 : rsi < 45 ? -1 : 0,
        sign(histogram)
    ];
    const bullish = checks.filter(x => x > 0).length;
    const bearish = checks.filter(x => x < 0).length;
    const neutral = 4 - bullish - bearish;
    const score = checks.reduce((a, b) => a + b, 0) / checks.length;
    const label = score >= 0.3 ? 'Bullish bias' : score <= -0.3 ? 'Bearish bias' : 'Neutral bias';

    return {
        last, ema20, ema50, rsi, macd, signal, histogram, histograms: histograms.slice(-30),
        score, bullish, bearish, neutral, label
    };
}

// ── Market Sessions Widget (Custom Interactive Canvas Map & Timeline) ────────
interface MarketSessionsCleanup {
    (): void;
}

let activeMarketSessionsCleanup: MarketSessionsCleanup | null = null;

function mountMarketSessionsWidget(container: HTMLElement): MarketSessionsCleanup {
    container.innerHTML = `
        <div id="ms" class="vela-market-sessions-widget" style="width: 100%; max-width: 100%; font: 14px/1.4 Inter, system-ui, sans-serif; color: #eeeef1; box-sizing: border-box;">
            <div class="c" style="position: relative; overflow: hidden; background: #232429; border: 1px solid #262629; border-radius: 12px; padding: 12px 14px; box-sizing: border-box;">
                <div class="h" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;"><span class="t" style="font-size: 11px; letter-spacing: 0.12em; color: #757882; text-transform: uppercase; font-weight: 600;">Market sessions</span><span class="pill" id="ses-badge" style="padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; border: 1px solid #262629; background: #292a2f; color: #eeeef1;"></span></div>
                <div class="big" id="ses-title" style="font-size: 18px; font-weight: 600; line-height: 1.1; margin-bottom: 8px; color: #eeeef1;"></div>
                <canvas id="ses-map" style="width: 100%; display: block; border-radius: 8px;"></canvas>
                <canvas id="ses-tl" style="width: 100%; display: block; margin-top: 6px;"></canvas>
                <div class="sp mu" style="margin-top: 4px; display: flex; justify-content: flex-end; font-size: 11px; color: #757882;"><span id="ses-utc"></span></div>
                <div class="row" style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid #262629; font-size: 11px; color: #eeeef1;"><span><i class="dot" style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #a7be94; margin-right: 6px; vertical-align: middle;"></i><span id="ses-next" style="color: #eeeef1; font-weight: 500;"></span></span><span id="ses-cd" style="color: #757882; font-variant-numeric: tabular-nums;"></span></div>
            </div>
        </div>
    `;

    const mapCanvas = container.querySelector('#ses-map') as HTMLCanvasElement;
    const tlCanvas = container.querySelector('#ses-tl') as HTMLCanvasElement;
    if (!mapCanvas || !tlCanvas) return () => {};

    const $ = (id: string) => container.querySelector(`#${id}`) as HTMLElement;
    const pad = (n: number) => String(n).padStart(2, '0');

    function fit(cv: HTMLCanvasElement, h: number): [CanvasRenderingContext2D, number] {
        const d = window.devicePixelRatio || 1;
        const w = (cv.clientWidth && cv.clientWidth > 0) ? cv.clientWidth : (container.clientWidth && container.clientWidth > 0) ? container.clientWidth - 32 : 360;
        cv.width = Math.round(w * d);
        cv.height = Math.round(h * d);
        cv.style.height = `${h}px`;
        const c = cv.getContext('2d')!;
        c.setTransform(d, 0, 0, d, 0, 0);
        return [c, w];
    }

    interface SessionDef {
        n: string;
        tz: string;
        lat: number;
        lon: number;
        col: string;
    }

    /* Sessions: open 08:00-17:00 local time, Mon-Fri. Timezones handle DST automatically. */
    const S: SessionDef[] = [
        { n: 'Sydney', tz: 'Australia/Sydney', lat: -33.9, lon: 151.2, col: '#7899c7' },
        { n: 'Tokyo', tz: 'Asia/Tokyo', lat: 35.7, lon: 139.7, col: '#9f8bb8' },
        { n: 'London', tz: 'Europe/London', lat: 51.5, lon: -0.1, col: '#c99e63' },
        { n: 'New York', tz: 'America/New_York', lat: 40.7, lon: -74, col: '#a7be94' }
    ];

    const F: Record<string, Intl.DateTimeFormat> = {};
    function lp(tz: string, d: Date) {
        if (!F[tz]) {
            F[tz] = new Intl.DateTimeFormat('en-GB', {
                timeZone: tz,
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23'
            });
        }
        const o: Record<string, string> = {};
        F[tz]!.formatToParts(d).forEach(p => o[p.type] = p.value);
        return { wd: o.weekday || '', h: +(o.hour || 0), m: +(o.minute || 0) };
    }

    function isOpen(s: SessionDef, d: Date) {
        const p = lp(s.tz, d);
        const t = p.h * 60 + p.m;
        return p.wd !== 'Sat' && p.wd !== 'Sun' && t >= 480 && t < 1020;
    }

    let targets: Array<{ n: string; t: number }> = [];
    let runs: Array<Array<[number, number]>> = [];
    let tcalc = 0;

    function calcAll() {
        const now = Date.now();
        tcalc = now;
        targets = S.filter(s => !isOpen(s, new Date(now))).map(s => {
            for (let i = 1; i <= 768; i++) {
                const d = new Date(now + i * 9e5);
                if (isOpen(s, d)) return { n: s.n, t: +d };
            }
            return null;
        }).filter((x): x is { n: string; t: number } => x !== null).sort((a, b) => a.t - b.t);

        const d0 = new Date(now);
        const day = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate());
        runs = S.map(s => {
            const r: Array<[number, number]> = [];
            let st: number | null = null;
            for (let i = 0; i <= 96; i++) {
                const o = i < 96 && isOpen(s, new Date(day + i * 9e5));
                if (o && st === null) st = i;
                if (!o && st !== null) {
                    r.push([st * 15, i * 15]);
                    st = null;
                }
            }
            return r;
        });
    }

    /* Coarse land polygons [lon,lat], filled with dots */
    const LAND: number[][][] = [
        [[-168,66],[-140,70],[-95,72],[-80,63],[-62,58],[-55,50],[-67,44],[-76,35],[-81,25],[-97,26],[-105,22],[-95,16],[-83,9],[-80,8],[-88,15],[-105,20],[-117,32],[-124,40],[-125,49],[-135,58],[-150,60],[-165,60]],
        [[-55,60],[-45,60],[-20,70],[-20,82],[-60,82],[-70,76]],
        [[-80,9],[-62,11],[-50,0],[-35,-6],[-40,-22],[-58,-38],[-65,-55],[-74,-50],[-72,-30],[-70,-18],[-81,-5]],
        [[-10,36],[-9,43],[-2,48],[5,52],[10,58],[20,70],[40,68],[70,73],[110,77],[140,72],[180,68],[170,60],[160,55],[140,52],[135,43],[122,38],[122,30],[120,22],[108,18],[104,9],[100,13],[98,8],[92,22],[80,14],[77,8],[72,20],[67,25],[57,25],[50,30],[56,18],[43,13],[35,28],[34,36],[26,38],[12,44],[3,43],[-6,36]],
        [[-17,21],[-6,36],[10,37],[32,31],[43,12],[51,12],[40,-15],[35,-25],[20,-35],[12,-18],[9,4],[-8,4],[-17,14]],
        [[114,-22],[122,-18],[136,-12],[142,-11],[153,-26],[150,-37],[140,-38],[130,-32],[115,-34]],
        [[130,31],[135,34],[141,36],[142,43],[140,41],[132,35]],
        [[-5,50],[1,51],[-2,58],[-6,56]]
    ];

    const inP = (x: number, y: number, p: number[][]) => {
        let c = false;
        for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
            const pi = p[i]!;
            const pj = p[j]!;
            if ((pi[1]! > y) !== (pj[1]! > y) && x < (pj[0]! - pi[0]!) * (y - pi[1]!) / (pj[1]! - pi[1]!) + pi[0]!) {
                c = !c;
            }
        }
        return c;
    };

    const LAT0 = 78;
    const LATR = 136;
    const STEP = 7;
    let mx: CanvasRenderingContext2D | null = null;
    let mW = 360;
    let mH = 144;
    let mask: Array<[number, number, number, number]> = [];
    let tx: CanvasRenderingContext2D | null = null;
    let tW = 360;

    function resize() {
        if (!mapCanvas || !tlCanvas || !mapCanvas.isConnected) return;
        const currentClientW = mapCanvas.clientWidth || 360;
        const targetH = Math.max(120, Math.round(currentClientW * 0.4));
        [mx, mW] = fit(mapCanvas, targetH);
        mH = targetH;
        mask = [];
        for (let y = STEP / 2; y < mH; y += STEP) {
            for (let x = STEP / 2; x < mW; x += STEP) {
                const lon = (x / mW) * 360 - 180;
                const lat = LAT0 - (y / mH) * LATR;
                if (LAND.some(p => inP(lon, lat, p))) {
                    mask.push([x, y, lon, lat]);
                }
            }
        }
        [tx, tW] = fit(tlCanvas, 84);
    }

    const P = (lon: number, lat: number): [number, number] => [
        ((lon + 180) / 360) * mW,
        ((LAT0 - lat) / LATR) * mH
    ];

    const sstep = (a: number, b: number, x: number) => {
        x = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return x * x * (3 - 2 * x);
    };

    function drawMap(now: number, t: number) {
        if (!mx) return;
        const d = new Date(now);
        const doy = (now - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
        const dec = -23.44 * Math.cos(2 * Math.PI / 365 * (doy + 10)) * Math.PI / 180;
        const sub = -((d.getUTCHours() + d.getUTCMinutes() / 60) - 12) * 15;
        mx.clearRect(0, 0, mW, mH);

        mask.forEach(([x, y, lon, lat]) => {
            const la = lat * Math.PI / 180;
            const el = Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos((lon - sub) * Math.PI / 180);
            const k = sstep(-0.18, 0.18, el);
            mx!.fillStyle = `rgba(${120 + k * 95 | 0},${124 + k * 92 | 0},${140 + k * 88 | 0},${0.2 + k * 0.6})`;
            mx!.fillRect(x - 1, y - 1, 2.2, 2.2);
        });

        const op = S.filter(s => isOpen(s, d));
        mx.setLineDash([3, 4]);
        mx.lineDashOffset = -t / 80;
        mx.lineWidth = 1;
        for (let i = 0; i < op.length - 1; i++) {
            const cur = op[i]!;
            const nxt = op[i + 1]!;
            const [x1, y1] = P(cur.lon, cur.lat);
            const [x2, y2] = P(nxt.lon, nxt.lat);
            mx.strokeStyle = 'rgba(46,189,133,.55)';
            mx.beginPath();
            mx.moveTo(x1, y1);
            mx.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - 32, x2, y2);
            mx.stroke();
        }
        mx.setLineDash([]);

        S.forEach(s => {
            const [x, y] = P(s.lon, s.lat);
            const o = isOpen(s, d);
            const p = lp(s.tz, d);
            if (o) {
                const ph = (t % 2200) / 2200;
                mx!.strokeStyle = s.col;
                mx!.globalAlpha = 1 - ph;
                mx!.beginPath();
                mx!.arc(x, y, 4 + ph * 20, 0, 7);
                mx!.stroke();
                mx!.globalAlpha = 1;
                const g = mx!.createRadialGradient(x, y, 0, x, y, 18);
                g.addColorStop(0, s.col + '66');
                g.addColorStop(1, s.col + '00');
                mx!.fillStyle = g;
                mx!.fillRect(x - 18, y - 18, 36, 36);
            }
            mx!.fillStyle = o ? s.col : '#cfd2dc';
            mx!.beginPath();
            mx!.arc(x, y, 3.5, 0, 7);
            mx!.fill();
            const r = x > mW * 0.7;
            mx!.textAlign = r ? 'right' : 'left';
            const X = r ? x - 8 : x + 8;
            mx!.font = '500 11px Inter,system-ui,sans-serif';
            mx!.fillStyle = '#e6e8ef';
            mx!.fillText(s.n, X, y - 4);
            mx!.font = '10px Inter,system-ui,sans-serif';
            mx!.fillStyle = '#9a9eac';
            mx!.fillText(pad(p.h) + ':' + pad(p.m) + ' local', X, y + 9);
        });
    }

    function safeRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(x, y, w, h, r);
        } else {
            ctx.rect(x, y, w, h);
        }
    }

    function drawTL(now: number) {
        if (!tx) return;
        tx.clearRect(0, 0, tW, 84);
        const x0 = 58;
        const w = tW - x0 - 2;
        const d = new Date(now);
        const nm = d.getUTCHours() * 60 + d.getUTCMinutes();

        S.forEach((s, i) => {
            const y = 6 + i * 17;
            tx!.fillStyle = '#1c1c21';
            tx!.beginPath();
            safeRoundRect(tx!, x0, y, w, 10, 5);
            tx!.fill();

            tx!.font = '10px Inter,system-ui,sans-serif';
            tx!.textAlign = 'left';
            tx!.fillStyle = '#8b8b94';
            tx!.fillText(s.n, 0, y + 9);

            (runs[i] || []).forEach(([a, b]) => {
                tx!.fillStyle = s.col;
                tx!.globalAlpha = (nm >= a && nm < b) ? 1 : 0.55;
                tx!.beginPath();
                safeRoundRect(tx!, x0 + (a / 1440) * w, y, ((b - a) / 1440) * w, 10, 5);
                tx!.fill();
            });
            tx!.globalAlpha = 1;
        });

        tx.fillStyle = '#6d6d76';
        tx.textAlign = 'center';
        [0, 6, 12, 18, 24].forEach(h => {
            tx!.fillText(pad(h % 24), x0 + (h / 24) * w, 80);
        });

        const X = x0 + (nm / 1440) * w;
        tx.strokeStyle = '#fff';
        tx.shadowColor = '#fff';
        tx.shadowBlur = 6;
        tx.lineWidth = 1.2;
        tx.beginPath();
        tx.moveTo(X, 2);
        tx.lineTo(X, 72);
        tx.stroke();
        tx.shadowBlur = 0;
    }

    function tickText() {
        const now = Date.now();
        const d = new Date(now);
        if (!targets.length || now - tcalc > 3e5 || (targets[0] && targets[0].t <= now)) {
            calcAll();
        }
        const open = S.filter(s => isOpen(s, d)).map(s => s.n);
        const titleEl = $('ses-title');
        if (titleEl) {
            titleEl.textContent = open.length ? open.join(' + ') : 'Markets closed';
        }
        const b = $('ses-badge');
        if (b) {
            b.textContent = open.length > 1 ? 'Overlap' : open.length ? 'Open' : 'Closed';
            b.className = 'pill' + (open.length > 1 ? ' on' : '');
        }
        const utcEl = $('ses-utc');
        if (utcEl) {
            utcEl.textContent = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';
        }
        const nx = targets[0];
        const nextEl = $('ses-next');
        const cdEl = $('ses-cd');
        if (nx && nextEl && cdEl) {
            const m = Math.max(0, Math.floor((nx.t - now) / 6e4));
            nextEl.textContent = 'Next · ' + nx.n;
            cdEl.textContent = 'Opens in ' + (m >= 60 ? Math.floor(m / 60) + 'h ' : '') + (m % 60) + 'm';
        }
    }

    let isDisposed = false;
    let animId: number = 0;
    let last = 0;

    function loop(t: number) {
        if (isDisposed || !mapCanvas.isConnected) return;
        if (t - last > 33) {
            last = t;
            const n = Date.now();
            drawMap(n, t);
            drawTL(n);
        }
        animId = requestAnimationFrame(loop);
    }

    calcAll();
    resize();
    tickText();
    animId = requestAnimationFrame(loop);

    const timerId = setInterval(tickText, 1000);
    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => {
            if (!isDisposed && mapCanvas.isConnected) resize();
        });
        ro.observe(container);
    }

    return () => {
        isDisposed = true;
        cancelAnimationFrame(animId);
        clearInterval(timerId);
        window.removeEventListener('resize', onResize);
        if (ro) ro.disconnect();
    };
}

// ── Symbol Sentiment Meter Widget (Binance Futures Multi-Signal Sentiment) ───
interface SentimentMeterCleanup {
    (): void;
    setSymbol: (s: string) => void;
}

let activeSentimentMeterCleanup: SentimentMeterCleanup | null = null;

function getFuturesSymbolForSentiment(raw: string): string {
    let s = (raw || '').trim().toUpperCase().replace(/\.P$/, '').replace(/-USD$/, 'USDT');
    if (!s.endsWith('USDT') && ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'XRP', 'ADA', 'AVAX', 'LINK'].includes(s)) {
        s = s + 'USDT';
    }
    return s;
}

function mountSentimentMeterWidget(container: HTMLElement, initialSymbol = 'BTCUSDT'): SentimentMeterCleanup {
    container.innerHTML = `
        <div id="fg" class="vela-symbol-sentiment-widget" style="width: 100%; max-width: 100%; font: 14px/1.4 Inter, system-ui, sans-serif; color: #eeeef1; box-sizing: border-box;">
            <div class="c" id="fg-card" style="position: relative; overflow: hidden; background: #232429; border: 1px solid #262629; border-radius: 12px; padding: 12px 14px; box-sizing: border-box;">
                <div class="h" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; position: relative;">
                    <span class="t" style="font-size: 11px; letter-spacing: 0.12em; color: #757882; text-transform: uppercase; font-weight: 600;">Symbol sentiment</span>
                    <span class="pill" id="fg-sym" style="padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.03em; color: #eeeef1; background: #292a2f; border: 1px solid #262629; display: inline-flex; align-items: center; justify-content: center;">${initialSymbol}</span>
                </div>
                <canvas id="fg-cv" style="width: 100%; display: block; position: relative;"></canvas>
                <div class="rd" style="display: flex; flex-direction: column; align-items: center; margin-top: -6px; position: relative;">
                    <b id="fg-v" style="font-size: 26px; font-weight: 600; line-height: 1.1; letter-spacing: -0.02em; color: #eeeef1;">–</b>
                    <span id="fg-z" style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 500; color: #757882;">Loading…</span>
                </div>
                <div class="dg" id="fg-d" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; margin-top: 10px; position: relative;"></div>
            </div>
        </div>
    `;

    const cv = container.querySelector('#fg-cv') as HTMLCanvasElement;
    if (!cv) return Object.assign(() => {}, { setSymbol: () => {} });

    const $ = (id: string) => container.querySelector(`#${id}`) as HTMLElement;
    const FA = 'https://fapi.binance.com';
    const get = (u: string) => fetch(FA + u).then(r => r.json());
    let sym = initialSymbol;
    let req = 0;
    const cache: Record<string, number> = {};

    /* ---------- colour + zones ---------- */
    const ST: Array<[number, [number, number, number]]> = [
        [0, [175, 104, 112]],   // #af6870 - Rose
        [25, [200, 138, 102]],  // #c88a66 - Terracotta
        [50, [117, 120, 130]],  // #757882 - Slate
        [75, [143, 168, 120]],  // #8fa878 - Moss
        [100, [167, 190, 148]]  // #a7be94 - Sage
    ];
    const col = (v: number) => {
        v = Math.max(0, Math.min(100, v));
        let i = 0;
        while (i < 3 && v > ST[i + 1]![0]) i++;
        const [a, A] = ST[i]!;
        const [b, B] = ST[i + 1]!;
        const t = (v - a) / (b - a);
        return `rgb(${A.map((x, j) => Math.floor(x + (B[j]! - x) * t)).join(',')})`;
    };
    const zone = (v: number) => v < 20 ? 'Extreme fear' : v < 40 ? 'Fear' : v < 60 ? 'Neutral' : v < 80 ? 'Greed' : 'Extreme greed';

    /* ---------- maths ---------- */
    const pr = (a: number[], x: number) => {
        let l = 0, e = 0;
        a.forEach(v => { if (v < x) l++; else if (v === x) e++; });
        return ((l + e / 2) / (a.length || 1)) * 100;
    };
    function rsi(c: number[]) {
        let g = 0, l = 0;
        for (let i = 1; i <= 14; i++) {
            const d = (c[i] || 0) - (c[i - 1] || 0);
            if (d > 0) g += d; else l -= d;
        }
        g /= 14; l /= 14;
        for (let i = 15; i < c.length; i++) {
            const d = (c[i] || 0) - (c[i - 1] || 0);
            g = (g * 13 + (d > 0 ? d : 0)) / 14;
            l = (l * 13 + (d < 0 ? -d : 0)) / 14;
        }
        return l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    const sd = (a: number[]) => {
        const m = a.reduce((s, x) => s + x, 0) / (a.length || 1);
        return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length || 1));
    };

    /* ---------- gauge ---------- */
    let cx: CanvasRenderingContext2D | null = null;
    let W = 360;
    const H = 125;
    let cur = 0;
    let tgt = 0;
    let raf = 0;
    let base: number | null = null;
    let isDisposed = false;

    function fit() {
        if (!cv || !cv.isConnected) return;
        const d = window.devicePixelRatio || 1;
        W = cv.clientWidth || 360;
        cv.width = W * d;
        cv.height = H * d;
        cv.style.height = H + 'px';
        cx = cv.getContext('2d');
        if (cx) {
            cx.setTransform(d, 0, 0, d, 0, 0);
        }
    }

    function draw(v: number) {
        if (!cx) return;
        const cxp = W / 2;
        const cy = 105;
        const r = Math.min(W / 2 - 26, 85);
        const PI = Math.PI;

        cx.clearRect(0, 0, W, H);
        cx.lineWidth = 14;
        cx.lineCap = 'butt';

        for (let i = 0; i < 50; i++) {
            cx.strokeStyle = col(i * 2 + 1);
            cx.globalAlpha = i * 2 < v ? 1 : 0.2;
            cx.beginPath();
            cx.arc(cxp, cy, r, PI + i * 0.02 * PI + 0.004, PI + (i + 1) * 0.02 * PI - 0.004);
            cx.stroke();
        }
        cx.globalAlpha = 1;

        for (let u = 0; u <= 100; u += 5) {
            const a = PI + (u / 100) * PI;
            const big = u % 20 === 0;
            const r1 = r - 12;
            const r2 = r1 - (big ? 9 : 4);
            cx.strokeStyle = big ? '#46474b' : '#262629';
            cx.lineWidth = big ? 1.6 : 1;
            cx.beginPath();
            cx.moveTo(cxp + Math.cos(a) * r1, cy + Math.sin(a) * r1);
            cx.lineTo(cxp + Math.cos(a) * r2, cy + Math.sin(a) * r2);
            cx.stroke();
            if (big) {
                cx.fillStyle = '#757882';
                cx.font = '10px Inter,system-ui,sans-serif';
                cx.textAlign = 'center';
                cx.textBaseline = 'middle';
                cx.fillText(String(u), cxp + Math.cos(a) * (r - 33), cy + Math.sin(a) * (r - 33));
            }
        }

        if (base !== null) {
            const a = PI + (base / 100) * PI;
            const ux = Math.cos(a);
            const uy = Math.sin(a);
            const px = -uy;
            const py = ux;
            cx.fillStyle = '#757882';
            cx.beginPath();
            cx.moveTo(cxp + ux * (r + 9), cy + uy * (r + 9));
            cx.lineTo(cxp + ux * (r + 17) + px * 4, cy + uy * (r + 17) + py * 4);
            cx.lineTo(cxp + ux * (r + 17) - px * 4, cy + uy * (r + 17) - py * 4);
            cx.fill();
            cx.font = '9px Inter,system-ui,sans-serif';
            cx.fillText('MKT', cxp + ux * (r + 27), cy + uy * (r + 27));
        }

        const a = PI + (v / 100) * PI;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const px = -uy;
        const py = ux;
        const c = col(v);
        cx.shadowColor = c;
        cx.shadowBlur = 14;
        cx.fillStyle = '#eeeef1';
        cx.beginPath();
        cx.moveTo(cxp + ux * (r - 4), cy + uy * (r - 4));
        cx.lineTo(cxp + px * 4, cy + py * 4);
        cx.lineTo(cxp - px * 4, cy - py * 4);
        cx.fill();
        cx.shadowBlur = 0;

        cx.fillStyle = '#191a1e';
        cx.strokeStyle = '#262629';
        cx.lineWidth = 2;
        cx.beginPath();
        cx.arc(cxp, cy, 8, 0, 7);
        cx.fill();
        cx.stroke();

        cx.fillStyle = c;
        cx.beginPath();
        cx.arc(cxp, cy, 3, 0, 7);
        cx.fill();
    }

    function step() {
        if (isDisposed || !cv.isConnected) return;
        cur += (tgt - cur) * 0.09;
        const v = Math.abs(tgt - cur) < 0.05 ? tgt : cur;
        cur = v;
        draw(v);
        const valEl = $('fg-v');
        if (valEl) {
            valEl.textContent = String(Math.round(v));
            valEl.style.color = col(v);
        }
        const zoneEl = $('fg-z');
        if (zoneEl) {
            zoneEl.textContent = zone(v);
            zoneEl.style.color = col(v);
        }
        const cardEl = $('fg-card');
        if (cardEl) {
            cardEl.style.setProperty('--glow', col(v).replace('rgb', 'rgba').replace(')', ',.16)'));
        }
        raf = v === tgt ? 0 : requestAnimationFrame(step);
    }

    const go = () => {
        if (!raf) raf = requestAnimationFrame(step);
    };

    const status = (t: string) => {
        const zoneEl = $('fg-z');
        if (zoneEl) {
            zoneEl.textContent = t;
            zoneEl.style.color = '#8b8b94';
        }
    };

    /* ---------- data ---------- */
    async function load() {
        const my = ++req;
        status('Loading…');
        try {
            const list = (typeof currentActiveWatchlist !== 'undefined' && currentActiveWatchlist.length) ? currentActiveWatchlist : DEFAULT_WATCHLIST;
            const activeItem = list.find(x => normalizeSymbol(x.symbol) === normalizeSymbol(sym)) || list[0];
            const isCrypto = activeItem?.category === 'Crypto' || sym.endsWith('USDT') || ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE'].includes(sym);
            const futSym = isCrypto ? (sym.endsWith('USDT') ? sym : sym + 'USDT') : null;

            let D: Array<[string, number, number]> = [];
            let sc = 50;
            base = null;

            if (futSym) {
                const q = 'symbol=' + futSym;
                try {
                    const R = await Promise.allSettled([
                        get(`/fapi/v1/klines?${q}&interval=1d&limit=90`),
                        get(`/fapi/v1/fundingRate?${q}&limit=90`),
                        get(`/fapi/v1/premiumIndex?${q}`),
                        get(`/futures/data/openInterestHist?${q}&period=1d&limit=30`),
                        get(`/futures/data/globalLongShortAccountRatio?${q}&period=1d&limit=30`),
                        get(`/futures/data/takerlongshortRatio?${q}&period=1d&limit=30`),
                        fetch('https://api.alternative.me/fng/?limit=1').then(r => r.json())
                    ]);

                    if (my !== req || isDisposed) return;
                    const arr = (i: number) => (R[i]?.status === 'fulfilled' && Array.isArray((R[i] as any).value) && (R[i] as any).value.length >= 8) ? (R[i] as any).value : null;
                    const K = arr(0);
                    if (K) {
                        const c: number[] = K.map((x: any) => +x[4]);
                        const n = c.length;

                        // Momentum: RSI blended with 7d return rank
                        const r7: number[] = [];
                        for (let i = 7; i < n; i++) r7.push(c[i]! / c[i - 7]! - 1);
                        D.push(['Momentum', 0.25, (rsi(c) + pr(r7, r7[r7.length - 1] || 0)) / 2]);

                        // Volatility: high realised vol = fear
                        const lr: number[] = [];
                        for (let i = 1; i < n; i++) lr.push(Math.log(c[i]! / c[i - 1]!));
                        const vs: number[] = [];
                        for (let i = 7; i <= lr.length; i++) vs.push(sd(lr.slice(i - 7, i)));
                        D.push(['Volatility', 0.15, 100 - pr(vs, vs[vs.length - 1] || 0)]);

                        // Funding
                        const F = arr(1);
                        const P = (R[2]?.status === 'fulfilled' && (R[2] as any).value?.lastFundingRate != null) ? (R[2] as any).value : null;
                        if (F) {
                            const h = F.map((x: any) => +x.fundingRate);
                            D.push(['Funding', 0.2, pr(h, P ? +P.lastFundingRate : h[h.length - 1])]);
                        }

                        // Open interest vs price direction
                        const O = arr(3);
                        if (O) {
                            const o = O.map((x: any) => +x.sumOpenInterestValue);
                            const s: number[] = [];
                            for (let i = 3; i < o.length; i++) s.push(o[i]! / o[i - 3]! - 1);
                            const rk = pr(s, s[s.length - 1] || 0);
                            D.push(['Open interest', 0.15, (c[n - 1] || 0) >= (c[n - 4] || 0) ? rk : 100 - rk]);
                        }

                        // Long / short
                        const L = arr(4);
                        if (L) {
                            const l = L.map((x: any) => +x.longShortRatio);
                            D.push(['Long / short', 0.1, pr(l, l[l.length - 1])]);
                        }

                        // Taker flow
                        const T = arr(5);
                        if (T) {
                            const t = T.map((x: any) => +x.buySellRatio);
                            D.push(['Taker flow', 0.15, pr(t, t[t.length - 1])]);
                        }

                        base = (R[6]?.status === 'fulfilled' && (R[6] as any).value?.data?.[0]?.value != null) ? +(R[6] as any).value.data[0].value : null;
                    }
                } catch (err) {
                    console.warn('[sentiment] Binance futures fetch error:', err);
                }
            }

            if (my !== req || isDisposed) return;

            // Fallback or Non-crypto symbol: Ensure ALL 6 breakdown bars ALWAYS render!
            if (D.length < 6) {
                const item = activeItem || {
                    symbol: sym,
                    price: 100,
                    change: 0,
                    changePercent: 0,
                    high: 105,
                    low: 95,
                    open: 100,
                    volume: 50000
                };
                const chg = item.changePercent || 0;
                const rangePct = item.price > 0 ? ((item.high - item.low) / item.price) * 100 : 2;
                const rangePos = (item.high > item.low) ? ((item.price - item.low) / (item.high - item.low)) * 100 : 50;

                const mom = Math.max(8, Math.min(92, Math.round(50 + chg * 8)));
                const vol = Math.max(12, Math.min(88, Math.round(100 - (rangePct * 14 + 18))));
                const trend = Math.max(15, Math.min(85, Math.round(50 + (chg > 0 ? 1 : -1) * Math.min(30, Math.abs(chg * 6)))));
                const oi = Math.max(18, Math.min(82, Math.round(48 + (chg > 0 ? 1 : -1) * Math.min(25, Math.abs(chg * 4)))));
                const ls = Math.max(10, Math.min(90, Math.round(rangePos)));
                const tf = Math.max(15, Math.min(85, Math.round(50 + (chg > 0 ? 1 : -1) * Math.min(28, Math.abs(chg * 5)))));

                D = [
                    ['Momentum', 0.25, mom],
                    ['Volatility', 0.15, vol],
                    ['Funding', 0.20, trend],
                    ['Open interest', 0.15, oi],
                    ['Long / short', 0.10, ls],
                    ['Taker flow', 0.15, tf]
                ];
                if (base === null) {
                    try {
                        const altRes = await fetch('https://api.alternative.me/fng/?limit=1');
                        const altJson = await altRes.json();
                        if (altJson?.data?.[0]?.value != null) base = +altJson.data[0].value;
                    } catch (_) {}
                }
            }

            const sw = D.reduce((s, d) => s + d[1], 0) || 1;
            sc = D.reduce((s, d) => s + d[1] * d[2], 0) / sw;
            if (cache[sym] != null) sc = 0.6 * sc + 0.4 * cache[sym]!;
            cache[sym] = sc;

            const dEl = $('fg-d');
            if (dEl) {
                dEl.innerHTML = D.map(([nm, , s]) => `
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <div class="sp" style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 500;">
                            <span style="color: #757882;">${nm}</span>
                            <span style="color: ${col(s)}; font-weight: 600;">${s < 40 ? 'Fear' : s < 60 ? 'Neutral' : 'Greed'}</span>
                        </div>
                        <div class="mb" style="position: relative; height: 4px; border-radius: 2px; margin-top: 2px; background: linear-gradient(90deg, #af6870, #c88a66, #757882, #8fa878, #a7be94); opacity: 0.9;">
                            <i style="position: absolute; top: -3px; width: 10px; height: 10px; border-radius: 50%; background: #eeeef1; box-shadow: 0 1px 3px rgba(0,0,0,0.5); left: ${Math.max(3, Math.min(97, s))}%; transform: translateX(-50%); display: block;"></i>
                        </div>
                    </div>
                `).join('');
            }

            tgt = sc;
            go();
        } catch (err) {
            console.error('[sentiment] Fatal load error:', err);
        }
    }

    function setSym(s: string) {
        s = (s || '').toUpperCase().trim();
        if (!s) return;
        sym = s;
        const symEl = $('fg-sym');
        if (symEl) {
            symEl.textContent = s;
        }
        load();
    }

    (window as any).twSetSymbol = setSym;

    const onResize = () => {
        if (!isDisposed && cv.isConnected) {
            fit();
            draw(cur);
        }
    };
    window.addEventListener('resize', onResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => {
            if (!isDisposed && cv.isConnected) {
                fit();
                draw(cur);
            }
        });
        ro.observe(container);
    }

    fit();
    draw(0);
    setSym(sym);
    const intervalId = setInterval(load, 12e4);

    const cleanupFn = () => {
        isDisposed = true;
        if (raf) cancelAnimationFrame(raf);
        clearInterval(intervalId);
        window.removeEventListener('resize', onResize);
        if (ro) ro.disconnect();
    };

    return Object.assign(cleanupFn, { setSymbol: setSym });
}


// ── Symbol Logo Builder ───────────────────────────────────────────────────────
function createSymbolLogo(doc: Document, item: WatchlistItem, isLarge = false): HTMLElement {
    const cleanBase = item.symbol.replace(/USDT(\.P)?$/, '').replace(/-USD$/, '').replace(/\.P$/, '').trim().toUpperCase();
    const size = isLarge ? 32 : 24;
    const wrap = doc.createElement('span');
    wrap.className = isLarge ? 'watchlist-research-module__NX0azq__assetLogo' : 'watchlist-research-module__NX0azq__symbolLogo';
    wrap.style.cssText = `width: ${size}px; height: ${size}px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; user-select: none;`;

    if (cleanBase === 'BTC') {
        wrap.style.background = '#f7931a';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.65}" height="${size * 0.65}" fill="#fff"><path d="M16.5 10.2c.2-1.4-.9-2.2-2.4-2.7l.5-2-1.2-.3-.5 2c-.3-.1-.7-.2-1-.2l.5-2-1.2-.3-.5 2c-.3-.1-.6-.1-.8-.2l-1.7-.4-.3 1.3s.9.2.9.2c.5.1.6.4.6.6l-.6 2.5c0 0 .1 0 .2.1l-.2-.1-.9 3.5c-.1.2-.3.5-.7.4 0 0-.9-.2-.9-.2l-.6 1.4 1.6.4c.3.1.6.2.9.2l-.5 2.1 1.2.3.5-2c.3.1.7.2 1 .2l-.5 2 1.2.3.5-2.1c2.1.4 3.7.2 4.3-1.6.6-1.5 0-2.4-1-3 .8-.4 1.3-1.1 1.2-2.3zm-2.2 4.8c-.4 1.5-3 .7-3.9.5l.7-2.8c.9.2 3.6.7 3.2 2.3zm.4-4.8c-.3 1.4-2.5.7-3.3.5l.6-2.5c.8.2 3 .6 2.7 2z"/></svg>`;
        return wrap;
    }
    if (cleanBase === 'ETH') {
        wrap.style.background = '#627eea';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.65}" height="${size * 0.65}" fill="#fff"><path d="M12 2L5.5 12.5 12 16.5 18.5 12.5 12 2Z" fill-opacity="0.95"/><path d="M12 2L5.5 12.5 12 8.5 18.5 12.5 12 2Z" fill-opacity="0.6"/><path d="M12 17.5L5.5 13.5 12 22 18.5 13.5 12 17.5Z"/></svg>`;
        return wrap;
    }
    if (cleanBase === 'SOL') {
        wrap.style.background = '#0d0e12';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.72}" height="${size * 0.72}" fill="none">
            <path d="M4.5 17.2h11.4l3.6-3.2H8.1l-3.6 3.2z" fill="#00FFA3"/>
            <path d="M4.5 13.2h11.4l3.6-3.2H8.1l-3.6 3.2z" fill="#DC1FFF"/>
            <path d="M8.1 6.8h11.4l-3.6 3.2H4.5l3.6-3.2z" fill="#00FFA3"/>
        </svg>`;
        return wrap;
    }
    if (cleanBase === 'BNB') {
        wrap.style.background = '#f3ba2f';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.65}" height="${size * 0.65}" fill="#fff"><path d="M12 6.5l2.5 2.5-2.5 2.5-2.5-2.5L12 6.5zm-5 5l2.5 2.5-2.5 2.5-2.5-2.5 2.5-2.5zm10 0l2.5 2.5-2.5 2.5-2.5-2.5 2.5-2.5zm-5 5l2.5 2.5-2.5 2.5-2.5-2.5 2.5-2.5zm0-4.5l2-2 2 2-2 2-2-2z"/></svg>`;
        return wrap;
    }
    if (cleanBase === 'DOGE') {
        wrap.style.background = '#c2a633';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.65}" height="${size * 0.65}" fill="#fff"><path d="M8 5h4.8c3.8 0 6.2 2.6 6.2 7s-2.4 7-6.2 7H8V5zm2.8 11.5h1.9c2.3 0 3.7-1.7 3.7-4.5s-1.4-4.5-3.7-4.5h-1.9v9z"/><path d="M6 11h8v2H6z"/></svg>`;
        return wrap;
    }
    if (item.symbol === 'NVDA') {
        wrap.style.background = '#76b900';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.7}" height="${size * 0.7}" fill="#fff"><path d="M11.66 16.32c-1.8 0-3.32-.78-4.26-2.12.87-1.12 2.68-1.57 4.18-1.57 1.83 0 3.34.8 4.3 2.15-.93 1.05-2.58 1.54-4.22 1.54zm.1-6.1c-3.1 0-5.83 1.5-7.3 3.96 1.4 3.03 4.4 5.04 7.9 5.04 2.8 0 5.4-1.3 7-3.4-1.38-3.3-4.66-5.6-7.6-5.6zm.1-3.22c-5.2 0-9.6 3.12-11.86 7.6 2.1 4.7 6.8 7.9 12.3 7.9 4.3 0 8.2-1.9 10.8-5-1.9-5.9-7-10.5-11.24-10.5z"/></svg>`;
        return wrap;
    }
    if (item.symbol === 'AAPL') {
        wrap.style.background = '#2c2d30';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.65}" height="${size * 0.65}" fill="#fff"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.38c.62-.75 1.04-1.8 0.93-2.85-.9.04-1.99.6-2.64 1.35-.57.65-1.07 1.72-.94 2.74 1 .08 2.03-.49 2.65-1.24z"/></svg>`;
        return wrap;
    }
    if (item.symbol === 'TSLA') {
        wrap.style.background = '#e82127';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.65}" height="${size * 0.65}" fill="#fff"><path d="M12 4c2.8 0 5.4.7 7.6 2l-.8 1.9C16.8 6.8 14.5 6.2 12 6.2s-4.8.6-6.8 1.7L4.4 6C6.6 4.7 9.2 4 12 4zm0 4.2c2.2 0 4.2.5 5.8 1.5l-.6 1.8c-1.5-.9-3.3-1.4-5.2-1.4s-3.7.5-5.2 1.4l-.6-1.8C7.8 8.7 9.8 8.2 12 8.2zM11.1 12h1.8v8h-1.8z"/></svg>`;
        return wrap;
    }
    if (item.symbol === 'EURUSD') {
        wrap.style.background = '#1e3d8f';
        wrap.innerHTML = `<span style="color: #ffd700; font-size: ${size * 0.45}px; font-weight: 700;">€$</span>`;
        return wrap;
    }
    if (item.symbol === 'XAUUSD') {
        wrap.style.background = 'linear-gradient(135deg, #d4af37, #aa7c11)';
        wrap.innerHTML = `<span style="color: #fff; font-size: ${size * 0.42}px; font-weight: 700;">Au</span>`;
        return wrap;
    }

    let iconUrl: string | undefined = undefined;
    if (item.category === 'Crypto') {
        iconUrl = ledgerCryptoIconUrl(cleanBase);
    }
    return tickerIconEl(doc, cleanBase, item.name, wrap.className, iconUrl);
}

// ── Register Side Panel ─────────────────────────────────────────────────────────
export function registerWatchlistSidePanel() {
    registerSidePanel({
        id: 'watchlist.panel',
        title: 'Watchlist',
        icon: 'watchlist',
        order: 5,
        width: 300,
        minWidth: 260,
        maxWidth: 600,
        resizable: true,
        overlay: false,
        mount: (ctx, body, header) => {
            // Inject or update stylesheet in ownerDocument
            const doc = body.ownerDocument;
            const existingStyle = doc.getElementById(WATCHLIST_PANEL_STYLE_ID);
            if (existingStyle) {
                existingStyle.textContent = QUANT_WATCHLIST_CSS;
            } else {
                injectStyles(WATCHLIST_PANEL_STYLE_ID, QUANT_WATCHLIST_CSS, doc);
            }

            // Clean single header matching Vela muted dark theme (#202126)
            header.setTitle?.('');
            const parentHeader = header.slot.parentElement;
            if (parentHeader) {
                const shellTitle = parentHeader.querySelector('.vela-panel-title') as HTMLElement | null;
                if (shellTitle) shellTitle.style.display = 'none';
                const shellClose = parentHeader.querySelector('.vela-panel-close') as HTMLElement | null;
                if (shellClose) shellClose.style.display = 'none';
                parentHeader.style.cssText = 'background: var(--vela-bg-main, #202126) !important; border-bottom: 1px solid var(--vela-border, #262629) !important; height: 38px; padding: 0 10px; display: flex; align-items: center;';
                const panelRoot = parentHeader.parentElement;
                if (panelRoot) {
                    panelRoot.style.setProperty('--vela-panel-w', '300px');
                    panelRoot.style.background = 'var(--vela-bg-main, #202126)';
                }
            }
            header.slot.style.cssText = 'flex: 1 1 100% !important; width: 100% !important; padding: 0 !important;';

            header.slot.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; height: 38px; box-sizing: border-box;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 13px; font-weight: 600; color: var(--vela-text-primary, #eeeef1); user-select: none;">Watchlist</span>
                        <span id="wl-header-count-badge" style="font-size: 10px; font-weight: 600; background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); padding: 1px 6px; border-radius: 999px;"></span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 2px;">
                        <button type="button" id="wl-header-add" aria-label="Add symbol to watchlist" title="Add symbol to watchlist" style="all: unset; cursor: pointer; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; color: var(--vela-text-secondary, #757882); transition: all 0.12s;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>
                        </button>
                        <button type="button" id="wl-header-expand" aria-label="Open advanced view" title="Open advanced view" style="all: unset; cursor: pointer; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; color: var(--vela-text-secondary, #757882); transition: all 0.12s;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="m21 3-7 7"></path><path d="m3 21 7-7"></path><path d="M9 21H3v-6"></path></svg>
                        </button>
                        <button type="button" id="wl-header-close" aria-label="Close watchlist" title="Close watchlist" style="all: unset; cursor: pointer; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; color: var(--vela-text-secondary, #757882); transition: all 0.12s;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                        </button>
                    </div>
                </div>
            `;

            // State
            let watchlistItems: WatchlistItem[] = getWatchlist();
            currentActiveWatchlist = watchlistItems;
            const initMatch = watchlistItems.find(x => normalizeSymbol(x.symbol) === normalizeSymbol(activeSymbol));
            if (initMatch) {
                activeSymbol = initMatch.symbol;
            } else if (watchlistItems.length > 0) {
                activeSymbol = watchlistItems[0]!.symbol;
            }
            let filterSegment: 'All' | 'Gainers' | 'Losers' = 'All';
            let displayMode: 'prices' | 'financials' = 'prices';
            let searchQuery = '';
            let sortKey: 'manual' | 'symbol' | 'price' | 'changePercent' | 'volume' = 'manual';
            let sortDir: 'asc' | 'desc' = 'desc';
            let grouping: 'assets' | 'none' = 'assets';
            let collapsedGroups = new Set<string>();
            let isDetailsMinimized = false;
            let detailsHeight = Math.min(560, Math.max(340, Math.round(window.innerHeight * 0.48)));
            let selectedEventTab: 'news' | 'earnings' | 'dividend' | 'economic' = 'news';
            let activeCandles: Array<{ open: number; high: number; low: number; close: number }> = [];
            let currentNewsArticles: any[] = [];
            let columnsVisibility = {
                price: true,
                change: false,
                changePercent: true,
                volume: false,
            };

            const saveWatchlist = () => {
                saveWatchlistStorage(watchlistItems, true);
            };

            // Main Root Container
            const root = document.createElement('div');
            root.className = 'vela-ui @container flex min-h-0 flex-1 flex-col';
            root.setAttribute('data-testid', 'watchlist-research');
            root.style.cssText = 'position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--background); color: var(--foreground);';
            body.appendChild(root);

            // Upper Watchlist Container
            const upperContainer = document.createElement('div');
            upperContainer.style.cssText = 'display: flex; flex-direction: column; flex: 1; min-height: 140px; overflow: hidden; position: relative; background: var(--vela-bg-main, #202126);';
            root.appendChild(upperContainer);

            // Compact Controls & Search Bar (Reclaimed vertical space)
            const controls = document.createElement('div');
            controls.className = 'watchlist-research-module__NX0azq__controls';
            controls.innerHTML = `
                <div class="relative" style="margin-bottom: 5px; position: relative;">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 8px; top: 7px; color: var(--muted-foreground); pointer-events: none;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input id="wl-search-input" type="text" placeholder="Search symbols or companies" style="width: 100%; box-sizing: border-box; height: 26px; background: var(--muted); border: 1px solid var(--border); border-radius: 6px; padding-left: 26px; padding-right: 24px; font-size: 11px; color: var(--foreground); outline: none;" />
                    <button id="wl-search-clear" style="all: unset; position: absolute; right: 4px; top: 2px; width: 22px; height: 22px; display: none; align-items: center; justify-content: center; cursor: pointer; color: var(--muted-foreground);"><svg viewBox="0 0 24 24" width="12" height="12" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
                </div>
                <div class="watchlist-research-module__NX0azq__controlModes" style="display: flex; align-items: center; gap: 6px;">
                    <div class="watchlist-research-module__NX0azq__segmented" role="radiogroup" aria-label="Filter symbols" style="display: flex; flex: 1; border: 1px solid var(--border); background: var(--card); border-radius: 6px; padding: 2px; gap: 2px;">
                        <button class="watchlist-research-module__NX0azq__segment" data-segment="All" data-checked="" style="all: unset; cursor: pointer; box-sizing: border-box; flex: 1; height: 20px; border-radius: 4px; font-size: 11px; font-weight: 500; display: flex; align-items: center; justify-content: center; transition: all 0.15s;">All</button>
                        <button class="watchlist-research-module__NX0azq__segment" data-segment="Gainers" style="all: unset; cursor: pointer; box-sizing: border-box; flex: 1; height: 20px; border-radius: 4px; font-size: 11px; font-weight: 500; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground); transition: all 0.15s;">Gainers</button>
                        <button class="watchlist-research-module__NX0azq__segment" data-segment="Losers" style="all: unset; cursor: pointer; box-sizing: border-box; flex: 1; height: 20px; border-radius: 4px; font-size: 11px; font-weight: 500; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground); transition: all 0.15s;">Losers</button>
                    </div>
                    <button id="wl-view-pop-btn" aria-label="Watchlist view settings" style="all: unset; cursor: pointer; box-sizing: border-box; display: inline-flex; height: 24px; align-items: center; gap: 4px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); padding: 0 8px; font-size: 11px; font-weight: 500; color: var(--foreground); box-shadow: 0 1px 2px rgba(0,0,0,0.15);">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sliders-horizontal"><line x1="21" x2="14" y1="4" y2="4"></line><line x1="10" x2="3" y1="4" y2="4"></line><line x1="21" x2="12" y2="12"></line><line x1="8" x2="3" y1="12" y2="12"></line><line x1="21" x2="16" y1="20" y2="20"></line><line x1="12" x2="3" y1="20" y2="20"></line><line x1="14" x2="14" y1="2" y2="6"></line><line x1="8" x2="8" y1="10" y2="14"></line><line x1="16" x2="16" y1="18" y2="22"></line></svg>
                        <span>View</span>
                    </button>
                </div>
            `;
            upperContainer.appendChild(controls);

            // Table Column Headers
            const tableHeading = document.createElement('div');
            tableHeading.className = 'watchlist-research-module__NX0azq__tableHeading';
            tableHeading.style.cssText = 'display: flex; height: 24px; align-items: center; border-bottom: 1px solid var(--border); font-size: 10px; font-weight: 600; color: var(--muted-foreground); user-select: none;';
            tableHeading.innerHTML = `
                <button id="wl-sort-symbol" style="all: unset; flex: 1; min-width: 0; cursor: pointer; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Symbol / name <span id="wl-sort-sym-dir"></span></button>
                <button id="wl-sort-price" class="wl-col-price" style="all: unset; width: 78px; cursor: pointer; text-align: right;">Last <span id="wl-sort-price-dir"></span></button>
                <button id="wl-sort-percent" class="wl-col-change-pct" style="all: unset; width: 58px; cursor: pointer; text-align: right;">Day % <span id="wl-sort-pct-dir"></span></button>
                <button id="wl-sort-volume" class="wl-col-volume" style="all: unset; width: 62px; cursor: pointer; text-align: right; display: none;">Vol <span id="wl-sort-vol-dir"></span></button>
            `;
            upperContainer.appendChild(tableHeading);

            // Watchlist Scrollable Rows Container
            const rowsContainer = document.createElement('div');
            rowsContainer.className = 'min-h-0 flex-1 overflow-y-auto overscroll-contain vela-quant-watchlist-rows';
            rowsContainer.style.cssText = 'flex: 1; min-height: 0; overflow-y: auto;';
            upperContainer.appendChild(rowsContainer);

// Upper Tier Footer removed (space reclaimed)

            // ── Resizer Divider (Interactive Slider with Drawer Minimize/Expand Toggle) ──
            const divider = document.createElement('div');
            divider.className = 'watchlist-research-module__NX0azq__detailsDivider';
            divider.tabIndex = 0;
            divider.setAttribute('role', 'separator');
            divider.setAttribute('aria-orientation', 'horizontal');
            divider.setAttribute('aria-valuenow', detailsHeight.toString());
            divider.setAttribute('aria-label', 'Resize symbol details');
            divider.innerHTML = `
                <button type="button" id="wl-details-toggle" aria-label="Toggle details drawer" title="Collapse details" class="wl-details-minimize-btn">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                </button>
            `;
            root.appendChild(divider);

            // Keyboard resize support
            divider.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    detailsHeight = Math.min(600, detailsHeight + 20);
                    detailsSection.style.height = `${detailsHeight}px`;
                    divider.setAttribute('aria-valuenow', detailsHeight.toString());
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    detailsHeight = Math.max(100, detailsHeight - 20);
                    detailsSection.style.height = `${detailsHeight}px`;
                    divider.setAttribute('aria-valuenow', detailsHeight.toString());
                }
            });


            // ── Lower Details Drawer (Reclaimed space: no duplicate assetHeader) ──────
            const detailsSection = document.createElement('section');
            detailsSection.className = 'watchlist-research-module__NX0azq__layoutPanel watchlist-research-module__NX0azq__detailsPanel';
            detailsSection.style.cssText = `position: relative; height: ${detailsHeight}px; display: flex; flex-direction: column; overflow: hidden; background: var(--vela-bg-main, #202126);`;
            root.appendChild(detailsSection);

            // Details Scrollable Content Container
            const detailsContent = document.createElement('div');
            detailsContent.className = 'watchlist-research-module__NX0azq__detailsContent';
            detailsSection.appendChild(detailsContent);

            // Resizer Slider Drag Logic
            let isDraggingResizer = false;
            let startY = 0;
            let startH = detailsHeight;

            divider.addEventListener('pointerdown', (e) => {
                isDraggingResizer = true;
                startY = e.clientY;
                startH = detailsSection.getBoundingClientRect().height || detailsHeight;
                divider.setPointerCapture(e.pointerId);
                e.preventDefault();
            });

            divider.addEventListener('pointermove', (e) => {
                if (!isDraggingResizer) return;
                const delta = startY - e.clientY;
                const containerH = root.clientHeight || window.innerHeight;
                const maxH = Math.max(140, containerH - 180);
                const nextH = Math.max(100, Math.min(startH + delta, maxH));
                detailsHeight = nextH;
                if (!isDetailsMinimized) {
                    detailsSection.style.height = `${nextH}px`;
                }
            });

            const stopResizing = (e: PointerEvent) => {
                if (isDraggingResizer) {
                    isDraggingResizer = false;
                    try { divider.releasePointerCapture(e.pointerId); } catch (_) {}
                }
            };
            divider.addEventListener('pointerup', stopResizing);
            divider.addEventListener('pointercancel', stopResizing);

            // Update column classes on root and header elements
            const applyColumnVisibility = () => {
                root.classList.toggle('wl-hide-price', !columnsVisibility.price);
                root.classList.toggle('wl-hide-change', !columnsVisibility.change);
                root.classList.toggle('wl-hide-change-pct', !columnsVisibility.changePercent);
                root.classList.toggle('wl-hide-volume', !columnsVisibility.volume);

                const priceColHdr = tableHeading.querySelector('#wl-sort-price') as HTMLElement | null;
                if (priceColHdr) {
                    priceColHdr.style.display = (!columnsVisibility.price && !columnsVisibility.change) ? 'none' : 'inline-block';
                }
                const pctColHdr = tableHeading.querySelector('#wl-sort-percent') as HTMLElement | null;
                if (pctColHdr) {
                    pctColHdr.style.display = columnsVisibility.changePercent ? 'inline-block' : 'none';
                }
                const volColHdr = tableHeading.querySelector('#wl-sort-volume') as HTMLElement | null;
                if (volColHdr) {
                    volColHdr.style.display = columnsVisibility.volume ? 'inline-block' : 'none';
                }
            };
            applyColumnVisibility();

            // ── Fast In-Place DOM Updater for Live Price Streaming ────────────────────
            const updateRowDomFast = (item: WatchlistItem) => {
                const row = rowsContainer.querySelector(`.watchlist-research-module__NX0azq__row[data-symbol="${item.symbol}"]`);
                if (row) {
                    const priceEl = row.querySelector('.wl-row-price') as HTMLElement;
                    if (priceEl) {
                        priceEl.textContent = item.price.toLocaleString(undefined, {
                            minimumFractionDigits: item.symbol === 'EURUSD' ? 4 : item.price < 1 ? 4 : 2,
                            maximumFractionDigits: item.symbol === 'EURUSD' ? 4 : item.price < 1 ? 4 : 2
                        });
                    }
                    const pctEl = row.querySelector('.wl-row-pct') as HTMLElement;
                    if (pctEl) {
                        const isUp = item.changePercent >= 0;
                        pctEl.textContent = `${isUp ? '+' : ''}${item.changePercent.toFixed(2)}%`;
                        pctEl.style.color = isUp ? 'var(--constructive)' : 'var(--destructive)';
                        pctEl.style.background = 'transparent';
                    }
                }
            };

            const updateAssetHeroFast = (_item: WatchlistItem) => {};
            const updateRangeCardFast = (_item: WatchlistItem) => {};

            // ── Drawer Minimize & Maximize Toggle (Integrated into Divider) ───────────
            const updateToggleIcon = () => {
                const btn = divider.querySelector('#wl-details-toggle');
                if (btn) {
                    btn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="${isDetailsMinimized ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}"/></svg>`;
                    btn.style.background = 'transparent';
                    btn.style.color = '#757882';
                    btn.setAttribute('title', isDetailsMinimized ? 'Expand details' : 'Collapse details');
                    btn.setAttribute('aria-expanded', (!isDetailsMinimized).toString());
                }
            };

            const toggleDetails = () => {
                isDetailsMinimized = !isDetailsMinimized;
                if (isDetailsMinimized) {
                    if (activeMarketSessionsCleanup) {
                        activeMarketSessionsCleanup();
                        activeMarketSessionsCleanup = null;
                    }
                    if (activeSentimentMeterCleanup) {
                        activeSentimentMeterCleanup();
                        activeSentimentMeterCleanup = null;
                    }
                    detailsSection.style.height = '0px';
                } else {
                    detailsSection.style.height = `${detailsHeight}px`;
                    renderDetailsContent();
                }
                updateToggleIcon();
            };

            const toggleBtn = divider.querySelector('#wl-details-toggle');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleDetails();
                });
            }
            divider.addEventListener('dblclick', toggleDetails);

            const renderAssetHeader = () => {
                updateToggleIcon();
            };
            const renderDetailsContent = () => {
                if (isDetailsMinimized) return;
                if (activeMarketSessionsCleanup) {
                    activeMarketSessionsCleanup();
                    activeMarketSessionsCleanup = null;
                }
                if (activeSentimentMeterCleanup) {
                    activeSentimentMeterCleanup();
                    activeSentimentMeterCleanup = null;
                }
                detailsContent.innerHTML = '';
                const item = watchlistItems.find(x => normalizeSymbol(x.symbol) === normalizeSymbol(activeSymbol)) || watchlistItems[0];
                if (!item) return;

                // ── Card 1: Symbol Sentiment Meter Widget ─────────────────────────────
                const sentimentCard = document.createElement('section');
                sentimentCard.className = 'watchlist-session-module__YotxoG__section';
                sentimentCard.setAttribute('aria-label', `${item.symbol} sentiment`);
                sentimentCard.style.padding = '0';
                sentimentCard.style.border = 'none';
                sentimentCard.style.background = 'transparent';

                detailsContent.appendChild(sentimentCard);
                activeSentimentMeterCleanup = mountSentimentMeterWidget(sentimentCard, getFuturesSymbolForSentiment(item.symbol));

                // ── Card 2: Market Sessions Widget ─────────────────────────────────────
                const sessionsCard = document.createElement('section');
                sessionsCard.className = 'watchlist-session-module__YotxoG__section';
                sessionsCard.setAttribute('aria-label', 'Session statistics');
                sessionsCard.style.padding = '0';
                sessionsCard.style.border = 'none';
                sessionsCard.style.background = 'transparent';

                detailsContent.appendChild(sessionsCard);
                activeMarketSessionsCleanup = mountMarketSessionsWidget(sessionsCard);
            };

            // ── Row Builder ───────────────────────────────────────────────────────────
            let draggedSymbol: string | null = null;
            const formatVolume = (v: number): string => {
                if (!v) return '—';
                if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
                if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
                if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
                return v.toLocaleString();
            };

            const createRowElement = (item: WatchlistItem): HTMLElement => {
                const row = document.createElement('div');
                const isCurrentActive = normalizeSymbol(item.symbol) === normalizeSymbol(activeSymbol);
                row.className = `group/research-row relative flex min-h-12 items-center border-b border-border/35 hover:bg-accent/50 watchlist-research-module__NX0azq__row ${isCurrentActive ? 'bg-accent/60 is-active' : ''}`;
                row.setAttribute('data-symbol', item.symbol);
                row.setAttribute('data-watchlist-symbol', item.symbol);
                row.draggable = true;
                row.style.cssText = `
                    display: flex;
                    align-items: center;
                    min-height: 48px;
                    padding: 0 12px;
                    cursor: pointer;
                    user-select: none;
                    border-bottom: 1px solid color-mix(in srgb, var(--border) 35%, transparent);
                    background: ${isCurrentActive ? 'color-mix(in srgb, var(--accent) 60%, transparent)' : 'transparent'};
                    box-shadow: none;
                    position: relative;
                    transition: background 0.12s;
                `;

                // Left Symbol Button
                const symBtn = document.createElement('button');
                symBtn.type = 'button';
                symBtn.className = 'flex min-w-0 flex-1 items-center py-2 text-left focus-visible:outline-2 focus-visible:outline-primary watchlist-research-module__NX0azq__symbolButton';
                symBtn.style.cssText = 'all: unset; display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; cursor: pointer;';
                symBtn.setAttribute('aria-label', `Show ${item.symbol} on chart`);
                symBtn.setAttribute('title', `${item.symbol} · ${item.name}`);

                const logoEl = createSymbolLogo(body.ownerDocument, item);
                logoEl.className = 'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background watchlist-research-module__NX0azq__symbolLogo';
                logoEl.style.cssText = 'width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--border); overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0;';

                const textSpan = document.createElement('span');
                textSpan.className = 'min-w-0';
                textSpan.style.cssText = 'min-width: 0; display: flex; flex-direction: column; overflow: hidden;';
                textSpan.innerHTML = `
                    <span class="block truncate text-xs font-semibold" style="color: var(--foreground); line-height: 1.2;">${item.symbol}</span>
                    <span class="block truncate text-[10px] text-muted-foreground" style="color: var(--muted-foreground); line-height: 1.2; margin-top: 1px;">${item.name}</span>
                `;

                symBtn.appendChild(logoEl);
                symBtn.appendChild(textSpan);
                row.appendChild(symBtn);

                const isUp = item.changePercent >= 0;

                if (displayMode === 'financials') {
                    // Range 24H Column
                    const rangeCol = document.createElement('span');
                    rangeCol.className = 'shrink-0 text-right text-[11px] tabular-nums wl-col-price';
                    rangeCol.style.cssText = 'width: 82px; text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; justify-content: center;';
                    rangeCol.innerHTML = `
                        <span class="text-[11px] font-medium text-foreground" style="font-variant-numeric: tabular-nums;">${item.high.toLocaleString(undefined, { minimumFractionDigits: item.price < 1 ? 3 : 1 })}</span>
                        <span class="text-[10px] text-muted-foreground" style="font-variant-numeric: tabular-nums; line-height: 1.1;">${item.low.toLocaleString(undefined, { minimumFractionDigits: item.price < 1 ? 3 : 1 })}</span>
                    `;
                    row.appendChild(rangeCol);

                    // Day % Column
                    const pctCol = document.createElement('span');
                    pctCol.className = 'shrink-0 text-right text-[11px] tabular-nums wl-col-change-pct wl-row-pct';
                    pctCol.style.cssText = `width: 54px; text-align: right; flex-shrink: 0; font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; color: ${isUp ? 'var(--constructive)' : 'var(--destructive)'};`;
                    pctCol.textContent = `${isUp ? '+' : ''}${item.changePercent.toFixed(2)}%`;
                    row.appendChild(pctCol);
                } else {
                    // Price Column (2 Lines: Price on Line 1, Point Change on Line 2)
                    const priceCol = document.createElement('span');
                    priceCol.className = 'shrink-0 text-right text-xs tabular-nums watchlist-research-module__NX0azq__priceColumn wl-col-price';
                    priceCol.style.cssText = 'width: 78px; text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; justify-content: center;';
                    priceCol.innerHTML = `
                        <span class="wl-row-price text-xs font-medium text-foreground" style="font-variant-numeric: tabular-nums;">${item.price.toLocaleString(undefined, {
                            minimumFractionDigits: item.symbol === 'EURUSD' ? 4 : item.price < 1 ? 4 : 2,
                            maximumFractionDigits: item.symbol === 'EURUSD' ? 4 : item.price < 1 ? 4 : 2
                        })}</span>
                        <span class="wl-row-change text-[10px] font-normal" style="font-variant-numeric: tabular-nums; line-height: 1.1; color: ${isUp ? 'var(--constructive)' : 'var(--destructive)'};">${isUp ? '+' : ''}${item.change.toFixed(item.price < 1 ? 4 : 2)}</span>
                    `;
                    row.appendChild(priceCol);

                    // Day % Column (1 Line: Un-badged plain delta)
                    const pctCol = document.createElement('span');
                    pctCol.className = 'shrink-0 text-right text-[11px] tabular-nums watchlist-research-module__NX0azq__percentColumn wl-col-change-pct wl-row-pct';
                    pctCol.style.cssText = `width: 58px; text-align: right; flex-shrink: 0; font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; color: ${isUp ? 'var(--constructive)' : 'var(--destructive)'};`;
                    pctCol.textContent = `${isUp ? '+' : ''}${item.changePercent.toFixed(2)}%`;
                    row.appendChild(pctCol);
                }

                // Volume Column
                const volCol = document.createElement('span');
                volCol.className = 'shrink-0 text-right text-[11px] text-muted-foreground tabular-nums watchlist-research-module__NX0azq__volume wl-col-volume';
                volCol.style.cssText = `width: 60px; text-align: right; flex-shrink: 0; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--muted-foreground); display: ${columnsVisibility.volume ? 'inline-block' : 'none'};`;
                volCol.textContent = formatVolume(item.volume);
                row.appendChild(volCol);

                // Delete Button (Appears on hover)
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.setAttribute('aria-label', `Remove ${item.symbol} from watchlist`);
                delBtn.className = 'absolute right-1 flex size-6 items-center justify-center rounded bg-accent text-muted-foreground opacity-0 hover:text-foreground focus:opacity-100 group-hover/research-row:opacity-100';
                delBtn.style.cssText = 'all: unset; position: absolute; right: 4px; width: 22px; height: 22px; display: none; align-items: center; justify-content: center; border-radius: 4px; background: var(--accent); color: var(--muted-foreground); cursor: pointer;';
                delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

                row.addEventListener('mouseenter', () => {
                    if (normalizeSymbol(item.symbol) !== normalizeSymbol(activeSymbol)) {
                        row.style.background = 'color-mix(in srgb, var(--foreground) 5%, transparent)';
                    }
                    delBtn.style.display = 'inline-flex';
                });
                row.addEventListener('mouseleave', () => {
                    if (normalizeSymbol(item.symbol) !== normalizeSymbol(activeSymbol)) {
                        row.style.background = 'transparent';
                    }
                    delBtn.style.display = 'none';
                });

                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const list = getWatchlist();
                    const idx = list.findIndex(x => matchesTicker(x, item.symbol));
                    if (idx >= 0) {
                        list.splice(idx, 1);
                        saveWatchlistStorage(list);
                        watchlistItems = list;
                        if (triggerTableRender) triggerTableRender();
                    }
                });
                row.appendChild(delBtn);

                // Row click switches symbol
                row.addEventListener('click', () => {
                    activeSymbol = item.symbol;
                    setActiveSymbol(item.symbol);
                    setWatchlistActiveSymbol(item.symbol);

                    if (wsInstance) {
                        try {
                            const activeCell = wsInstance.active || wsInstance.cells()[0];
                            if (activeCell && activeCell.chart?.setMarket) {
                                void activeCell.chart.setMarket({ symbol: item.symbol });
                            }
                        } catch (e) {
                            console.warn('[watchlist] Failed to switch active chart market:', e);
                        }
                    }

                    renderTable();
                    renderAssetHeader();
                    if (activeSentimentMeterCleanup) {
                        activeSentimentMeterCleanup.setSymbol(getFuturesSymbolForSentiment(activeSymbol));
                    }
                });

                // Drag & Drop
                row.addEventListener('dragstart', (e) => {
                    draggedSymbol = item.symbol;
                    row.style.opacity = '0.4';
                    e.dataTransfer?.setData('text/plain', item.symbol);
                });
                row.addEventListener('dragend', () => {
                    draggedSymbol = null;
                    row.style.opacity = '1';
                });
                row.addEventListener('dragover', (e) => e.preventDefault());
                row.addEventListener('drop', (e) => {
                    e.preventDefault();
                    if (!draggedSymbol || draggedSymbol === item.symbol) return;
                    const fromIdx = watchlistItems.findIndex(x => x.symbol === draggedSymbol);
                    const toIdx = watchlistItems.findIndex(x => x.symbol === item.symbol);
                    if (fromIdx !== -1 && toIdx !== -1) {
                        const [moved] = watchlistItems.splice(fromIdx, 1);
                        if (moved) {
                            watchlistItems.splice(toIdx, 0, moved);
                            saveWatchlist();
                            renderTable();
                        }
                    }
                });

                return row;
            };

            const renderTable = () => {
                rowsContainer.innerHTML = '';

                // Filtering
                let filtered = watchlistItems.filter(item => {
                    const matchQuery = `${item.symbol} ${item.name}`.toLowerCase().includes(searchQuery.trim().toLowerCase());
                    if (!matchQuery) return false;
                    if (filterSegment === 'Gainers') return item.changePercent > 0;
                    if (filterSegment === 'Losers') return item.changePercent < 0;
                    return true;
                });

                // Sorting
                if (sortKey !== 'manual') {
                    filtered.sort((a, b) => {
                        let comp = 0;
                        if (sortKey === 'symbol') comp = a.symbol.localeCompare(b.symbol);
                        else if (sortKey === 'price') comp = a.price - b.price;
                        else if (sortKey === 'changePercent') comp = a.changePercent - b.changePercent;
                        else if (sortKey === 'volume') comp = a.volume - b.volume;
                        return sortDir === 'asc' ? comp : -comp;
                    });
                }

                // Render with grouping or flat list
                if (grouping === 'none') {
                    for (const item of filtered) {
                        rowsContainer.appendChild(createRowElement(item));
                    }
                } else {
                    const categories: Array<{ id: string; name: string; icon: string }> = [
                        { id: 'Crypto', name: 'Crypto', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-bitcoin size-3.5"><path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727"></path></svg>` },
                        { id: 'Stocks', name: 'Stocks', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-building2 size-3.5"><path d="M10 12h4"></path><path d="M10 8h4"></path><path d="M14 21v-3a2 2 0 0 0-4 0v3"></path><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"></path><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"></path></svg>` },
                        { id: 'ETFs', name: 'ETFs', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>` },
                        { id: 'Forex', name: 'Forex', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-arrow-left-right size-3.5"><path d="M8 3 4 7l4 4"></path><path d="M4 7h16"></path><path d="m16 21 4-4-4-4"></path><path d="M20 17H4"></path></svg>` },
                        { id: 'Commodities', name: 'Commodities', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-coins size-3.5"><path d="M13.744 17.736a6 6 0 1 1-7.48-7.48"></path><path d="M15 6h1v4"></path><path d="m6.134 14.768.866-.5 2 3.464"></path><circle cx="16" cy="8" r="6"></circle></svg>` },
                    ];

                    const renderedSymbols = new Set<string>();
                    for (const cat of categories) {
                        const itemsInCat = filtered.filter(x => x.category === cat.id);
                        if (itemsInCat.length === 0) continue;
                        itemsInCat.forEach(it => renderedSymbols.add(it.symbol));

                        const isCollapsed = collapsedGroups.has(cat.id);
                        const groupHeader = document.createElement('button');
                        groupHeader.type = 'button';
                        groupHeader.setAttribute('aria-expanded', (!isCollapsed).toString());
                        groupHeader.className = 'watchlist-category-header flex w-full items-center gap-1.5 border-b border-border/35 bg-muted/30 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground';
                        groupHeader.style.cssText = `
                            all: unset;
                            box-sizing: border-box;
                            width: 100%;
                            height: 32px;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            padding: 0 12px;
                            background: color-mix(in srgb, var(--muted) 35%, transparent);
                            border-bottom: 1px solid color-mix(in srgb, var(--border) 35%, transparent);
                            font-size: 11px;
                            font-weight: 500;
                            color: var(--muted-foreground);
                            cursor: pointer;
                            user-select: none;
                        `;
                        groupHeader.innerHTML = `
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-chevron-down size-3 transition-transform" style="transform: ${isCollapsed ? 'rotate(-90deg)' : 'rotate(0)'}; transition: transform 0.15s;"><path d="m6 9 6 6 6-6"/></svg>
                            ${cat.icon}
                            <span style="font-weight: 500; color: var(--foreground);">${cat.name}</span>
                            <span class="rounded bg-muted px-1.5 text-[10px]" style="border-radius: 4px; background: color-mix(in srgb, var(--foreground) 10%, transparent); padding: 1px 5px; font-size: 10px; font-variant-numeric: tabular-nums; color: var(--muted-foreground);">${itemsInCat.length}</span>
                        `;

                        groupHeader.addEventListener('click', () => {
                            if (collapsedGroups.has(cat.id)) {
                                collapsedGroups.delete(cat.id);
                            } else {
                                collapsedGroups.add(cat.id);
                            }
                            renderTable();
                        });

                        rowsContainer.appendChild(groupHeader);

                        if (!isCollapsed) {
                            for (const item of itemsInCat) {
                                rowsContainer.appendChild(createRowElement(item));
                            }
                        }
                    }

                    // Render any un-categorized or newly added symbols
                    const unrendered = filtered.filter(x => !renderedSymbols.has(x.symbol));
                    for (const item of unrendered) {
                        rowsContainer.appendChild(createRowElement(item));
                    }
                }

                // Update Header Badge
                const headerBadge = root.ownerDocument.querySelector('#wl-header-count-badge');
                if (headerBadge) headerBadge.textContent = filtered.length.toString();
            };

            // ── Search Input Listeners ────────────────────────────────────────────────
            const searchInput = controls.querySelector('#wl-search-input') as HTMLInputElement;
            const searchClear = controls.querySelector('#wl-search-clear') as HTMLButtonElement;
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    searchQuery = searchInput.value;
                    if (searchClear) searchClear.style.display = searchQuery ? 'inline-flex' : 'none';
                    renderTable();
                });
            }
            if (searchClear && searchInput) {
                searchClear.addEventListener('click', () => {
                    searchInput.value = '';
                    searchQuery = '';
                    searchClear.style.display = 'none';
                    renderTable();
                });
            }

            // ── Filter Segment Buttons (All | Gainers | Losers) ───────────────────────
            controls.querySelectorAll('.watchlist-research-module__NX0azq__segment').forEach(btn => {
                btn.addEventListener('click', () => {
                    controls.querySelectorAll('.watchlist-research-module__NX0azq__segment').forEach(b => {
                        b.removeAttribute('data-checked');
                        (b as HTMLElement).style.background = 'transparent';
                        (b as HTMLElement).style.color = 'var(--muted-foreground)';
                    });
                    btn.setAttribute('data-checked', '');
                    (btn as HTMLElement).style.background = 'var(--accent)';
                    (btn as HTMLElement).style.color = 'var(--foreground)';

                    filterSegment = btn.getAttribute('data-segment') as any;
                    renderTable();
                });
            });

            // ── Table Column Header Sorts ─────────────────────────────────────────────
            const sortSymBtn = tableHeading.querySelector('#wl-sort-symbol');
            if (sortSymBtn) {
                sortSymBtn.addEventListener('click', () => {
                    if (sortKey === 'symbol') sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                    else { sortKey = 'symbol'; sortDir = 'asc'; }
                    renderTable();
                });
            }
            const sortPriceBtn = tableHeading.querySelector('#wl-sort-price');
            if (sortPriceBtn) {
                sortPriceBtn.addEventListener('click', () => {
                    if (sortKey === 'price') sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                    else { sortKey = 'price'; sortDir = 'desc'; }
                    renderTable();
                });
            }
            const sortPctBtn = tableHeading.querySelector('#wl-sort-percent');
            if (sortPctBtn) {
                sortPctBtn.addEventListener('click', () => {
                    if (sortKey === 'changePercent') sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                    else { sortKey = 'changePercent'; sortDir = 'desc'; }
                    renderTable();
                });
            }

            // ── View Settings Popover (300px Menu) ───────────────────────────────────
            let viewPopoverEl: HTMLElement | null = null;
            const viewPopBtn = controls.querySelector('#wl-view-pop-btn');
            if (viewPopBtn) {
                viewPopBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (viewPopoverEl) {
                        viewPopoverEl.remove();
                        viewPopoverEl = null;
                        return;
                    }

                    viewPopoverEl = document.createElement('div');
                    viewPopoverEl.id = 'wl-view-popover';
                    viewPopoverEl.className = 'vela-watchlist-view-popover vela-ui';
                    viewPopoverEl.style.cssText = `
                        position: absolute;
                        top: 72px;
                        right: 10px;
                        width: 280px;
                        z-index: 1000;
                        background: var(--card);
                        border: 1px solid var(--border);
                        border-radius: 8px;
                        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--border);
                        backdrop-filter: blur(10px);
                        color: var(--foreground);
                        display: flex;
                        flex-direction: column;
                        padding: 12px 14px;
                        gap: 10px;
                        user-select: none;
                    `;
                    viewPopoverEl.innerHTML = `
                        <div style="font-size: 12px; font-weight: 600; color: var(--foreground);">Watchlist view</div>
                        <div style="display: flex; flex-direction: column; gap: 5px;">
                            <span style="font-size: 11px; font-weight: 500; color: var(--muted-foreground);">Display</span>
                            <div class="watchlist-research-module__NX0azq__segmented" style="display: flex; background: var(--muted); border: 1px solid var(--border); border-radius: 6px; padding: 2px;">
                                <button id="wl-view-disp-prices" style="all: unset; cursor: pointer; flex: 1; height: 24px; border-radius: 4px; font-size: 11px; display: flex; align-items: center; justify-content: center; ${displayMode === 'prices' ? 'background: var(--accent); color: var(--foreground); font-weight: 600;' : 'color: var(--muted-foreground); font-weight: 500;'}">Prices</button>
                                <button id="wl-view-disp-fin" style="all: unset; cursor: pointer; flex: 1; height: 24px; border-radius: 4px; font-size: 11px; display: flex; align-items: center; justify-content: center; ${displayMode === 'financials' ? 'background: var(--accent); color: var(--foreground); font-weight: 600;' : 'color: var(--muted-foreground); font-weight: 500;'}">Financials</button>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--border); padding-top: 8px;">
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <span style="font-size: 11px; color: var(--muted-foreground);">Sort by</span>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <select id="wl-view-sort-select" style="background: var(--muted); border: 1px solid var(--border); border-radius: 6px; color: var(--foreground); font-size: 11px; padding: 2px 6px; height: 28px; width: 118px; outline: none; cursor: pointer;">
                                        <option value="manual">Manual order</option>
                                        <option value="symbol">Symbol</option>
                                        <option value="price">Last price</option>
                                        <option value="changePercent">Change %</option>
                                        <option value="volume">Volume</option>
                                    </select>
                                    <button type="button" id="wl-view-sort-dir" aria-label="Sort direction" title="Toggle sort direction" style="all: unset; width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--foreground); cursor: pointer; background: var(--muted);">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform: ${sortDir === 'asc' ? 'rotate(180deg)' : 'none'}; transition: transform 0.15s;"><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></svg>
                                    </button>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <span style="font-size: 11px; color: var(--muted-foreground);">Group by</span>
                                <select id="wl-view-group-select" style="background: var(--muted); border: 1px solid var(--border); border-radius: 6px; color: var(--foreground); font-size: 11px; padding: 2px 6px; height: 28px; width: 152px; outline: none; cursor: pointer;">
                                    <option value="assets">Asset class</option>
                                    <option value="none">None</option>
                                </select>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border); padding-top: 8px;">
                            <span style="font-size: 11px; font-weight: 500; color: var(--muted-foreground); margin-bottom: 2px;">Columns</span>
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--foreground); cursor: pointer; padding: 2px 0;">
                                <input type="checkbox" id="wl-col-chk-price" ${columnsVisibility.price ? 'checked' : ''} style="accent-color: var(--constructive); width: 13px; height: 13px; cursor: pointer;" />
                                <span>Last price</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--foreground); cursor: pointer; padding: 2px 0;">
                                <input type="checkbox" id="wl-col-chk-chg" ${columnsVisibility.change ? 'checked' : ''} style="accent-color: var(--constructive); width: 13px; height: 13px; cursor: pointer;" />
                                <span>Change</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--foreground); cursor: pointer; padding: 2px 0;">
                                <input type="checkbox" id="wl-col-chk-pct" ${columnsVisibility.changePercent ? 'checked' : ''} style="accent-color: var(--constructive); width: 13px; height: 13px; cursor: pointer;" />
                                <span>Change %</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--foreground); cursor: pointer; padding: 2px 0;">
                                <input type="checkbox" id="wl-col-chk-vol" ${columnsVisibility.volume ? 'checked' : ''} style="accent-color: var(--constructive); width: 13px; height: 13px; cursor: pointer;" />
                                <span>Session volume</span>
                            </label>
                        </div>
                    `;

                    // Wire view popover listeners
                    const dispPricesBtn = viewPopoverEl.querySelector('#wl-view-disp-prices') as HTMLButtonElement;
                    const dispFinBtn = viewPopoverEl.querySelector('#wl-view-disp-fin') as HTMLButtonElement;
                    if (dispPricesBtn && dispFinBtn) {
                        dispPricesBtn.addEventListener('click', () => {
                            displayMode = 'prices';
                            dispPricesBtn.style.background = 'var(--accent)';
                            dispPricesBtn.style.color = 'var(--foreground)';
                            dispPricesBtn.style.fontWeight = '600';
                            dispFinBtn.style.background = 'transparent';
                            dispFinBtn.style.color = 'var(--muted-foreground)';
                            dispFinBtn.style.fontWeight = '500';
                            renderTable();
                        });
                        dispFinBtn.addEventListener('click', () => {
                            displayMode = 'financials';
                            dispFinBtn.style.background = 'var(--accent)';
                            dispFinBtn.style.color = 'var(--foreground)';
                            dispFinBtn.style.fontWeight = '600';
                            dispPricesBtn.style.background = 'transparent';
                            dispPricesBtn.style.color = 'var(--muted-foreground)';
                            dispPricesBtn.style.fontWeight = '500';
                            renderTable();
                        });
                    }

                    const sortSelect = viewPopoverEl.querySelector('#wl-view-sort-select') as HTMLSelectElement;
                    const sortDirBtn = viewPopoverEl.querySelector('#wl-view-sort-dir') as HTMLButtonElement;
                    if (sortSelect) {
                        sortSelect.value = sortKey;
                        sortSelect.addEventListener('change', () => {
                            sortKey = sortSelect.value as any;
                            renderTable();
                        });
                    }
                    if (sortDirBtn) {
                        sortDirBtn.addEventListener('click', () => {
                            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                            const svg = sortDirBtn.querySelector('svg');
                            if (svg) svg.style.transform = sortDir === 'asc' ? 'rotate(180deg)' : 'none';
                            renderTable();
                        });
                    }

                    const groupSelect = viewPopoverEl.querySelector('#wl-view-group-select') as HTMLSelectElement;
                    if (groupSelect) {
                        groupSelect.value = grouping;
                        groupSelect.addEventListener('change', () => {
                            grouping = groupSelect.value as any;
                            renderTable();
                        });
                    }

                    const chkPrice = viewPopoverEl.querySelector('#wl-col-chk-price') as HTMLInputElement;
                    const chkChg = viewPopoverEl.querySelector('#wl-col-chk-chg') as HTMLInputElement;
                    const chkPct = viewPopoverEl.querySelector('#wl-col-chk-pct') as HTMLInputElement;
                    const chkVol = viewPopoverEl.querySelector('#wl-col-chk-vol') as HTMLInputElement;

                    chkPrice?.addEventListener('change', () => {
                        columnsVisibility.price = chkPrice.checked;
                        applyColumnVisibility();
                    });
                    chkChg?.addEventListener('change', () => {
                        columnsVisibility.change = chkChg.checked;
                        applyColumnVisibility();
                    });
                    chkPct?.addEventListener('change', () => {
                        columnsVisibility.changePercent = chkPct.checked;
                        applyColumnVisibility();
                    });
                    chkVol?.addEventListener('change', () => {
                        columnsVisibility.volume = chkVol.checked;
                        applyColumnVisibility();
                        renderTable();
                    });

                    // Close popover when clicking outside
                    const handleOutsideClick = (evt: MouseEvent) => {
                        if (viewPopoverEl && !viewPopoverEl.contains(evt.target as Node) && !viewPopBtn.contains(evt.target as Node)) {
                            viewPopoverEl.remove();
                            viewPopoverEl = null;
                            document.removeEventListener('click', handleOutsideClick);
                        }
                    };
                    setTimeout(() => document.addEventListener('click', handleOutsideClick), 0);

                    root.appendChild(viewPopoverEl);
                });
            }

            triggerTableRender = () => {
                renderTable();
                renderAssetHeader();
            };
            triggerQuoteSync = () => {
                syncNonCryptoQuotes();
            };
            selectWatchlistSymbol = (sym: string) => {
                activeSymbol = sym;
                setActiveSymbol(sym);
                setWatchlistActiveSymbol(sym);
                renderTable();
                renderAssetHeader();
                if (activeSentimentMeterCleanup) {
                    activeSentimentMeterCleanup.setSymbol(getFuturesSymbolForSentiment(activeSymbol));
                }
                if (wsInstance) {
                    try {
                        const activeCell = (wsInstance as any).active || (wsInstance as any).cells()[0];
                        if (activeCell && activeCell.setSymbol) {
                            activeCell.setSymbol(sym);
                        } else if (activeCell && activeCell.chart?.setMarket) {
                            void activeCell.chart.setMarket({ symbol: sym });
                        }
                    } catch (e) {}
                }
            };

            // ── Official Vela Symbol Search Modal (+) ──────────────────────────────────
            const openAddSymbolModal = (initialQuery = '') => {
                if (!addSymbolPicker) {
                    const hostEl = wsInstance ? (wsInstance as any).root || document.body : document.body;
                    addSymbolPicker = new SymbolPicker({
                        host: hostEl,
                        iconFor: (d) => wsInstance ? (wsInstance as any).feed?.symbolIconOf?.(d) : undefined,
                        onSelect: (chosenSymbol: string) => {
                            const parts = chosenSymbol.split(':');
                            const ticker = (parts[parts.length - 1] || chosenSymbol).trim().toUpperCase();

                            // Automatically add to watchlist if not already present
                            const list = currentActiveWatchlist || loadInitialWatchlist();
                            const alreadyIn = list.some(x => matchesTicker(x, ticker));
                            if (!alreadyIn) {
                                const allSymbols = (wsInstance as any)?.feed?.symbols?.() || [];
                                const desc: SymbolDescriptor | undefined = allSymbols.find((s: any) => s.ticker === ticker);
                                const typeStr = (desc?.type ?? '').toLowerCase();
                                let cat: 'Crypto' | 'Stocks' | 'Forex' | 'Commodities' | 'ETFs' = 'Crypto';
                                if (typeStr === 'stock') cat = 'Stocks';
                                else if (typeStr === 'etf') cat = 'ETFs';
                                else if (typeStr === 'forex') cat = 'Forex';
                                else if (typeStr === 'commodity') cat = 'Commodities';
                                else if (typeStr === 'crypto' || ticker.endsWith('USDT') || ticker.endsWith('BTC')) cat = 'Crypto';

                                const isCrypto = cat === 'Crypto';
                                const newItem: WatchlistItem = {
                                    symbol: ticker,
                                    name: desc?.description || ticker,
                                    category: cat,
                                    binanceSymbol: isCrypto ? ticker : '',
                                    isFutures: typeStr === 'futures',
                                    price: 0,
                                    change: 0,
                                    changePercent: 0,
                                    high: 0,
                                    low: 0,
                                    open: 0,
                                    volume: 0,
                                };
                                list.push(newItem);
                                saveWatchlistStorage(list, true);
                                if (triggerTableRender) triggerTableRender();
                                if (triggerQuoteSync) triggerQuoteSync();
                            }

                            // Activate selected symbol across workspace & watchlist
                            if (selectWatchlistSymbol) {
                                selectWatchlistSymbol(ticker);
                            }
                        }
                    });
                    addSymbolPicker.setSource(() => {
                        return (wsInstance as any)?.feed?.symbols?.() || [];
                    });
                }
                addSymbolPicker.open(initialQuery);
            };

            const headerAddBtn = header.slot.querySelector('#wl-header-add');
            if (headerAddBtn) {
                headerAddBtn.addEventListener('click', () => {
                    openAddSymbolModal();
                });
            }

            const headerCloseBtn = header.slot.querySelector('#wl-header-close');
            if (headerCloseBtn) {
                headerCloseBtn.addEventListener('click', () => {
                    shellClose?.click();
                });
            }

            // ── Advanced View Modal (⤢) ───────────────────────────────────────────────
            let advancedModalEl: HTMLElement | null = null;
            const expandBtn = header.slot.querySelector('#wl-header-expand');
            if (expandBtn) {
                expandBtn.addEventListener('click', () => {
                    if (advancedModalEl) {
                        advancedModalEl.remove();
                        advancedModalEl = null;
                        return;
                    }

                    advancedModalEl = document.createElement('div');
                    advancedModalEl.className = 'vela-advanced-view-modal vela-ui';
                    advancedModalEl.style.cssText = `
                        position: fixed;
                        inset: 0;
                        z-index: 99999;
                        background: var(--background);
                        overflow-y: auto;
                        display: flex;
                        flex-direction: column;
                        color: var(--foreground);
                        font-family: inherit;
                    `;

                    // Dynamic Metrics
                    const upCount = watchlistItems.filter(x => x.changePercent > 0).length;
                    const downCount = watchlistItems.filter(x => x.changePercent < 0).length;
                    const flatCount = watchlistItems.length - upCount - downCount;
                    const breadthPct = watchlistItems.length ? Math.round((upCount / watchlistItems.length) * 100) : 0;
                    const avgChange = watchlistItems.reduce((acc, x) => acc + x.changePercent, 0) / (watchlistItems.length || 1);
                    const sortedByChange = [...watchlistItems].sort((a, b) => b.changePercent - a.changePercent);
                    const best = sortedByChange[0];
                    const worst = sortedByChange[sortedByChange.length - 1];

                    advancedModalEl.innerHTML = `
                        <header style="flex-shrink: 0; border-bottom: 1px solid var(--border); background: var(--card); padding: 14px 32px 0;">
                            <div style="max-width: 1440px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px;">
                                <div style="display: flex; align-items: center; justify-content: space-between;">
                                    <span style="font-size: 16px; font-weight: 600; color: var(--foreground);">Watchlist</span>
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <button id="adv-head-add" type="button" aria-label="Add symbol" style="all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground);"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5v14"/></svg></button>
                                        <button id="adv-head-restore" type="button" aria-label="Restore view" style="all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground);"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button>
                                        <button id="adv-close-btn" type="button" aria-label="Close" style="all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground);"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 20px; font-size: 13px; font-weight: 500;">
                                    <span style="color: var(--foreground); border-bottom: 2px solid var(--foreground); padding-bottom: 8px; cursor: pointer;">Overview</span>
                                    <span style="color: var(--muted-foreground); padding-bottom: 8px; cursor: pointer;">Relationships</span>
                                    <span style="color: var(--muted-foreground); padding-bottom: 8px; cursor: pointer;">Symbols</span>
                                    <span style="color: var(--muted-foreground); padding-bottom: 8px; cursor: pointer;">Research</span>
                                    <span style="color: var(--muted-foreground); padding-bottom: 8px; cursor: pointer;">Exposure</span>
                                </div>
                            </div>
                        </header>
                        <div style="padding: 24px 32px; display: flex; flex-direction: column; gap: 24px; max-width: 1440px; margin: 0 auto; width: 100%; box-sizing: border-box;">
                            <!-- 5 KPI Summary Cards -->
                            <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px;">
                                <div style="background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;">
                                    <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground);">Symbols</span>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <h3 style="margin: 0; font-size: 22px; font-weight: 600; color: var(--foreground);">${watchlistItems.length}</h3>
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary)" stroke-width="3"><circle cx="12" cy="12" r="9"/></svg>
                                    </div>
                                    <span style="font-size: 10px; color: var(--muted-foreground);">$11.79T equity mkt cap</span>
                                </div>
                                <div style="background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;">
                                    <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground);">Breadth (24h)</span>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <h3 style="margin: 0; font-size: 22px; font-weight: 600; color: var(--foreground);">${breadthPct}%</h3>
                                        <div style="flex: 1; height: 6px; border-radius: 3px; background: var(--muted); overflow: hidden; display: flex;">
                                            <div style="width: ${breadthPct}%; background: var(--constructive);"></div>
                                            <div style="width: ${100 - breadthPct}%; background: var(--destructive);"></div>
                                        </div>
                                    </div>
                                    <span style="font-size: 10px; color: var(--muted-foreground);">${upCount} up · ${downCount} down · ${flatCount} flat</span>
                                </div>
                                <div style="background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;">
                                    <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground);">Avg 24h % Change</span>
                                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                                        <span style="font-size: 13px; font-weight: 600; padding: 3px 8px; border-radius: 4px; color: ${avgChange >= 0 ? 'var(--constructive)' : 'var(--destructive)'}; background: ${avgChange >= 0 ? 'color-mix(in srgb, var(--constructive) 16%, transparent)' : 'color-mix(in srgb, var(--destructive) 16%, transparent)'};">${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%</span>
                                    </div>
                                </div>
                                <div style="background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;">
                                    <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground);">Best 24h</span>
                                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                                        <span style="font-size: 14px; font-weight: 600; color: var(--foreground);">${best ? best.symbol : '—'}</span>
                                        <span style="font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: var(--constructive); background: color-mix(in srgb, var(--constructive) 16%, transparent);">${best ? `+${best.changePercent.toFixed(2)}%` : '—'}</span>
                                    </div>
                                    <span style="font-size: 10px; color: var(--muted-foreground);">${best ? best.name : ''}</span>
                                </div>
                                <div style="background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;">
                                    <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground);">Worst 24h</span>
                                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                                        <span style="font-size: 14px; font-weight: 600; color: var(--foreground);">${worst ? worst.symbol : '—'}</span>
                                        <span style="font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: var(--destructive); background: color-mix(in srgb, var(--destructive) 16%, transparent);">${worst ? `${worst.changePercent.toFixed(2)}%` : '—'}</span>
                                    </div>
                                    <span style="font-size: 10px; color: var(--muted-foreground);">${worst ? worst.name : ''}</span>
                                </div>
                            </div>

                            <!-- Comparison & Market Pulse Columns -->
                            <div class="watchlist-advanced-module__iafjpG__overview">
                                <!-- Left Comparison Chart Pane -->
                                <div class="watchlist-advanced-module__iafjpG__panel">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
                                        <div>
                                            <span class="watchlist-advanced-module__iafjpG__eyebrow">Watchlist Comparison</span>
                                            <h3>Performance over time</h3>
                                            <p style="margin: 2px 0 0; font-size: 11px; color: var(--muted-foreground);">Every symbol, on the same percentage scale.</p>
                                        </div>
                                        <div style="display: flex; gap: 4px; background: var(--muted); padding: 2px; border-radius: 6px; border: 1px solid var(--border);">
                                            <button style="all: unset; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: var(--muted-foreground);">1M</button>
                                            <button style="all: unset; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 11px; background: var(--card); color: var(--foreground); font-weight: 600;">3M</button>
                                            <button style="all: unset; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: var(--muted-foreground);">6M</button>
                                            <button style="all: unset; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: var(--muted-foreground);">YTD</button>
                                            <button style="all: unset; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: var(--muted-foreground);">1Y</button>
                                        </div>
                                    </div>
                                    <div style="height: 280px; display: flex; align-items: center; justify-content: center; border: 1px dashed var(--border); border-radius: 8px; color: var(--muted-foreground); font-size: 12px;">
                                        Loading daily price history...
                                    </div>
                                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px;">
                                        ${watchlistItems.slice(0, 8).map(it => `
                                            <div style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; background: var(--muted); border: 1px solid var(--border); font-size: 11px;">
                                                <span style="width: 8px; height: 8px; border-radius: 2px; background: var(--primary);"></span>
                                                <strong style="color: var(--foreground);">${it.symbol}</strong>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>

                                <!-- Right Market Pulse Pane -->
                                <div class="watchlist-advanced-module__iafjpG__panel">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                        <div>
                                            <span class="watchlist-advanced-module__iafjpG__eyebrow">Market Pulse</span>
                                            <h3>Your markets, at a glance</h3>
                                            <p style="margin: 2px 0 0; font-size: 11px; color: var(--muted-foreground);">Daily moves · equal-sized tiles</p>
                                        </div>
                                        <div style="font-size: 11px; color: var(--muted-foreground); border: 1px solid var(--border); padding: 4px 8px; border-radius: 6px; background: var(--card);">
                                            All ▾
                                        </div>
                                    </div>
                                    <div style="display: flex; gap: 12px; margin-top: 10px; font-size: 11px; font-weight: 500;">
                                        <span style="color: var(--foreground); cursor: pointer; border-bottom: 2px solid var(--foreground); padding-bottom: 4px;">All</span>
                                        <span style="color: var(--muted-foreground); cursor: pointer; padding-bottom: 4px;">Gainers</span>
                                        <span style="color: var(--muted-foreground); cursor: pointer; padding-bottom: 4px;">Losers</span>
                                    </div>
                                    <div class="watchlist-advanced-module__iafjpG__marketTiles">
                                        ${watchlistItems.slice(0, 9).map(it => {
                                            const isUp = it.changePercent >= 0;
                                            return `
                                                <button class="adv-tile-btn" data-sym="${it.symbol}" style="all: unset; cursor: pointer; box-sizing: border-box; border: 1px solid var(--border); background: color-mix(in srgb, ${isUp ? 'var(--constructive)' : 'var(--destructive)'} 12%, var(--card)); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 4px;">
                                                    <div style="display: flex; align-items: center; gap: 6px;">
                                                        <span style="font-size: 11px; font-weight: 600; color: var(--foreground);">${it.symbol}</span>
                                                    </div>
                                                    <b style="font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; color: ${isUp ? 'var(--constructive)' : 'var(--destructive)'};">${isUp ? '+' : ''}${it.changePercent.toFixed(2)}%</b>
                                                    <span style="font-size: 10px; color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${it.name}</span>
                                                </button>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;

                    advancedModalEl.querySelector('#adv-close-btn')?.addEventListener('click', () => {
                        advancedModalEl?.remove();
                        advancedModalEl = null;
                    });
                    advancedModalEl.querySelector('#adv-head-restore')?.addEventListener('click', () => {
                        advancedModalEl?.remove();
                        advancedModalEl = null;
                    });
                    advancedModalEl.querySelector('#adv-head-add')?.addEventListener('click', () => {
                        openAddSymbolModal();
                    });

                    // Tile click switches symbol
                    advancedModalEl.querySelectorAll('.adv-tile-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const sym = btn.getAttribute('data-sym');
                            if (sym) {
                                activeSymbol = sym;
                                setActiveSymbol(sym);
                                setWatchlistActiveSymbol(sym);
                                renderTable();
                                renderAssetHeader();
                                if (activeSentimentMeterCleanup) {
                                    activeSentimentMeterCleanup.setSymbol(getFuturesSymbolForSentiment(activeSymbol));
                                }
                                advancedModalEl?.remove();
                                advancedModalEl = null;
                            }
                        });
                    });

                    document.body.appendChild(advancedModalEl);
                });
            }

            // ── Live Market Data Synchronization Services ────────────────────────────
            const syncNonCryptoQuotes = async () => {
                const nonCrypto = watchlistItems.filter(x => x.category !== 'Crypto').map(x => x.symbol);
                if (nonCrypto.length === 0) return;
                try {
                    const res = await fetch(`/api/markets/quotes?symbols=${encodeURIComponent(nonCrypto.join(','))}`);
                    if (res.ok) {
                        const quotes = await res.json();
                        for (const sym in quotes) {
                            const q = quotes[sym];
                            const match = watchlistItems.find(x => x.symbol === sym);
                            if (match && q.price) {
                                match.price = q.price;
                                match.change = q.change;
                                match.changePercent = q.changePercent;
                                match.high = q.high;
                                match.low = q.low;
                                match.open = q.open;
                                match.volume = q.volume;
                                updateRowDomFast(match);
                            }
                        }
                        const activeItem = watchlistItems.find(x => x.symbol === activeSymbol);
                        if (activeItem && activeItem.category !== 'Crypto') {
                            updateAssetHeroFast(activeItem);
                            updateRangeCardFast(activeItem);
                        }
                    }
                } catch (e) {
                    console.warn('[watchlist] Non-crypto quotes error:', e);
                }
            };

            const loadDynamicNews = async (symbol: string) => {
                try {
                    const res = await fetch(`/api/markets/news?symbol=${encodeURIComponent(symbol)}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data.articles) && data.articles.length > 0) {
                            currentNewsArticles = data.articles;
                            renderDetailsContent();
                        }
                    }
                } catch (e) {
                    console.warn('[watchlist] Dynamic news fetch error:', e);
                }
            };

            const fetchCandlesForActiveSymbol = async () => {
                const item = watchlistItems.find(x => normalizeSymbol(x.symbol) === normalizeSymbol(activeSymbol)) || watchlistItems[0];
                if (!item) return;

                // Check if active chart already has loaded bars
                try {
                    const activeCell = wsInstance?.active || wsInstance?.cells()[0];
                    const chartBars = (activeCell?.chart?.renderer as any)?.bars;
                    if (Array.isArray(chartBars) && chartBars.length > 10 && activeCell?.symbol === activeSymbol) {
                        activeCandles = chartBars.map((b: any) => ({
                            open: b.open,
                            high: b.high,
                            low: b.low,
                            close: b.close
                        }));
                        renderDetailsContent();
                        return;
                    }
                } catch (_) {}

                // Fallback to Binance Kline API for crypto
                if (item.category === 'Crypto') {
                    try {
                        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${item.binanceSymbol || item.symbol}&interval=1h&limit=60`);
                        if (res.ok) {
                            const raw = await res.json();
                            if (Array.isArray(raw)) {
                                activeCandles = raw.map(bar => ({
                                    open: parseFloat(bar[1]),
                                    high: parseFloat(bar[2]),
                                    low: parseFloat(bar[3]),
                                    close: parseFloat(bar[4]),
                                }));
                                renderDetailsContent();
                            }
                        }
                    } catch (_) {}
                }
            };

            // ── Live Binance Crypto WebSocket ─────────────────────────────────────────
            let cryptoWs: WebSocket | null = null;
            const initCryptoWebSocket = () => {
                try {
                    cryptoWs = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');
                    cryptoWs.onmessage = (event) => {
                        try {
                            const tickers = JSON.parse(event.data);
                            if (Array.isArray(tickers)) {
                                if (!(window as any).__binanceMiniTickers) (window as any).__binanceMiniTickers = new Map();
                                for (const t of tickers) {
                                    (window as any).__binanceMiniTickers.set(t.s, t);
                                    const match = watchlistItems.find(x => x.binanceSymbol === t.s || x.symbol === t.s);
                                    if (match) {
                                        const price = parseFloat(t.c);
                                        const open = parseFloat(t.o);
                                        const high = parseFloat(t.h);
                                        const low = parseFloat(t.l);
                                        const volume = parseFloat(t.v);
                                        const change = price - open;
                                        const changePercent = open ? (change / open) * 100 : 0;
                                        match.price = price;
                                        match.open = open;
                                        match.high = high;
                                        match.low = low;
                                        match.volume = volume;
                                        match.change = change;
                                        match.changePercent = changePercent;
                                        updateRowDomFast(match);
                                        if (match.symbol === activeSymbol) {
                                            updateAssetHeroFast(match);
                                            updateRangeCardFast(match);
                                        }
                                    }
                                }
                            }
                        } catch (_) {}
                    };
                    cryptoWs.onerror = () => setTimeout(initCryptoWebSocket, 5000);
                    cryptoWs.onclose = () => setTimeout(initCryptoWebSocket, 5000);
                } catch (e) {
                    console.warn('[watchlist] WebSocket creation failed:', e);
                }
            };

            // Active symbol change listener from workspace / chart
            const onSymChange = (sym: string) => {
                const norm = normalizeSymbol(sym);
                const matched = watchlistItems.find(x => normalizeSymbol(x.symbol) === norm || normalizeSymbol(x.binanceSymbol) === norm);
                if (matched) {
                    activeSymbol = matched.symbol;
                    renderTable();
                    renderAssetHeader();
                    if (activeSentimentMeterCleanup) {
                        activeSentimentMeterCleanup.setSymbol(getFuturesSymbolForSentiment(activeSymbol));
                    }
                }
            };
            symbolChangeListeners.push(onSymChange);

            // Initial mounts & calls
            renderTable();
            renderAssetHeader();
            renderDetailsContent();
            initCryptoWebSocket();
            syncNonCryptoQuotes();

            // Periodic refresh for non-crypto quotes (10s)
            const quoteInterval = setInterval(syncNonCryptoQuotes, 10000);

            // Cleanup when unmounted
            return () => {
                if (activeMarketSessionsCleanup) {
                    activeMarketSessionsCleanup();
                    activeMarketSessionsCleanup = null;
                }
                if (activeSentimentMeterCleanup) {
                    activeSentimentMeterCleanup();
                    activeSentimentMeterCleanup = null;
                }
                clearInterval(quoteInterval);
                symbolChangeListeners = symbolChangeListeners.filter(l => l !== onSymChange);
                try { cryptoWs?.close(); } catch (_) {}
            };
        }
    });
}
