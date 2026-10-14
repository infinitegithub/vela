import { setActiveSymbol } from './trade-suite';
import { registerSidePanel, registerIcon, registerStatePersistence, registerSymbolFavorite } from '../src/plugin';
import type { VelaWorkspace } from '../src/workspace';
import { tickerIconEl, baseOf } from '../src/widget/symbol-icon';
import { ledgerCryptoIconUrl } from '../src/data/symbol-base';
import { injectStyles } from '../src/ui/styles';
import QUANT_WATCHLIST_CSS from './quant-watchlist.css?raw';

const WATCHLIST_PANEL_STYLE_ID = 'vela-quant-watchlist-styles';

// Register custom icons
registerIcon('watchlist', `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h7"/><circle cx="12.5" cy="12.5" r="1.5"/></svg>`);

let wsInstance: VelaWorkspace | null = null;
let activeSymbol = 'SOL-USD';
let symbolChangeListeners: Array<(sym: string) => void> = [];

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
    { symbol: 'BTC-USD', name: 'BTC-USD', category: 'Crypto', binanceSymbol: 'BTCUSDT', isFutures: false, price: 83670.47, change: 568.48, changePercent: 0.68, high: 84500, low: 82100, open: 83101.99, volume: 24500 },
    { symbol: 'ETH-USD', name: 'ETH-USD', category: 'Crypto', binanceSymbol: 'ETHUSDT', isFutures: false, price: 2512.40, change: 16.57, changePercent: 0.66, high: 2550, low: 2480, open: 2495.83, volume: 184000 },
    { symbol: 'SOL-USD', name: 'SOL-USD', category: 'Crypto', binanceSymbol: 'SOLUSDT', isFutures: false, price: 107.79, change: 1.06, changePercent: 0.99, high: 108.50, low: 106.10, open: 106.73, volume: 128000 },
    { symbol: 'XRP-USD', name: 'XRP-USD', category: 'Crypto', binanceSymbol: 'XRPUSDT', isFutures: false, price: 1.3728, change: 0.0078, changePercent: 0.57, high: 1.41, low: 1.35, open: 1.3650, volume: 450000 },
    { symbol: 'DOGE-USD', name: 'DOGE-USD', category: 'Crypto', binanceSymbol: 'DOGEUSDT', isFutures: false, price: 0.08483, change: 0.00050, changePercent: 0.59, high: 0.086, low: 0.083, open: 0.08433, volume: 12000000 },
    { symbol: 'ADA-USD', name: 'ADA-USD', category: 'Crypto', binanceSymbol: 'ADAUSDT', isFutures: false, price: 0.23667, change: 0.00096, changePercent: 0.41, high: 0.242, low: 0.231, open: 0.23571, volume: 9500000 },
    { symbol: 'LINK-USD', name: 'LINK-USD', category: 'Crypto', binanceSymbol: 'LINKUSDT', isFutures: false, price: 13.013, change: 0.138, changePercent: 1.07, high: 13.40, low: 12.80, open: 12.875, volume: 320000 },
    { symbol: 'BNB-USD', name: 'BNB-USD', category: 'Crypto', binanceSymbol: 'BNBUSDT', isFutures: false, price: 612.30, change: 8.50, changePercent: 1.41, high: 618, low: 598, open: 603.8, volume: 89000 },
];

const WATCHLIST_STORAGE_KEY = 'vela-play:watchlist-store-v5';

function loadInitialWatchlist(): WatchlistItem[] {
    try {
        const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch {}
    return [...DEFAULT_WATCHLIST];
}

let watchlistItems: WatchlistItem[] = loadInitialWatchlist();

function saveWatchlist() {
    try {
        localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlistItems));
    } catch {}
}

export function setWatchlistWorkspaceInstance(ws: VelaWorkspace) {
    wsInstance = ws;
}

export function setWatchlistActiveSymbol(sym: string) {
    if (!sym) return;
    const cleanSym = sym.toUpperCase().replace(/USDT(\.P)?$/, '').replace(/-USD$/, '').replace(/\.P$/, '');
    const found = watchlistItems.find(x => x.symbol === sym || x.binanceSymbol === sym || x.symbol.replace(/-USD$/, '') === cleanSym || x.symbol === `${cleanSym}-USD`);
    activeSymbol = found ? found.symbol : sym;
    for (const fn of symbolChangeListeners) fn(activeSymbol);
}

export function openAlertsPanel() {
    if (wsInstance) {
        (wsInstance as any).dock?.toggle('watchlist.panel', true);
    }
}

export function pushWorkspaceAlert(alert: any) {}

function isSymbolInWatchlist(ticker: string): boolean {
    const clean = ticker.toUpperCase().replace(/USDT(\.P)?$/, '').replace(/-USD$/, '');
    return watchlistItems.some(x => x.symbol === ticker || x.binanceSymbol === ticker || x.symbol.replace(/-USD$/, '') === clean);
}

function toggleWatchlistSymbol(ticker: string, desc?: any) {
    const descString = typeof desc === 'string' ? desc : desc?.description || desc?.ticker || ticker;
    const existingIdx = watchlistItems.findIndex(x => x.symbol === ticker || x.binanceSymbol === ticker);
    if (existingIdx >= 0) {
        watchlistItems.splice(existingIdx, 1);
    } else {
        const clean = ticker.toUpperCase().replace(/USDT(\.P)?$/, '').replace(/-USD$/, '').replace(/\.P$/, '');
        const isFutures = ticker.endsWith('.P') || ['NVDA', 'AAPL', 'TSLA', 'AMZN', 'MSFT', 'META', 'GOOGL', 'XAUUSD'].includes(clean);
        const category = ['NVDA', 'AAPL', 'TSLA', 'AMZN', 'MSFT', 'META', 'GOOGL'].includes(clean) ? 'Stocks' : ['EURUSD', 'GBPUSD', 'USDJPY'].includes(clean) ? 'Forex' : ['XAUUSD', 'XAGUSD'].includes(clean) ? 'Commodities' : 'Crypto';
        const formattedSym = category === 'Crypto' && !ticker.includes('-') ? `${clean}-USD` : ticker;
        const binanceSym = ticker.endsWith('.P') ? ticker.replace('.P', '') : (category === 'Stocks' || category === 'Forex' || category === 'Commodities') && !ticker.endsWith('USDT') ? `${clean}USDT` : ticker.includes('-USD') ? `${clean}USDT` : ticker;

        watchlistItems.unshift({
            symbol: formattedSym,
            name: descString || formattedSym,
            category,
            binanceSymbol: binanceSym,
            isFutures,
            price: 0,
            change: 0,
            changePercent: 0,
            high: 0,
            low: 0,
            open: 0,
            volume: 0,
        });
    }
    saveWatchlist();
}

registerSymbolFavorite({
    isFavorite: (ticker) => isSymbolInWatchlist(ticker),
    toggleFavorite: (ticker, desc) => toggleWatchlistSymbol(ticker, desc),
});

// ── Mathematical Indicator Functions (from module 219428) ──────────────────────
function calcEma(series: number[], period: number): number[] {
    const res: number[] = [];
    if (series.length < period) return res;
    let a = series.slice(0, period).reduce((acc, v) => acc + v, 0) / period;
    for (let i = period - 1; i < series.length; i++) {
        if (i >= period) {
            a += (series[i] - a) * 2 / (period + 1);
        }
        res.push(a);
    }
    return res;
}

function calcRma(series: number[], period: number): number {
    if (series.length < period) return 0;
    let a = series.slice(0, period).reduce((acc, v) => acc + v, 0) / period;
    for (const v of series.slice(period)) {
        a = (a * (period - 1) + v) / period;
    }
    return a;
}

export interface TechnicalSummaryResult {
    last: number;
    ema20: number;
    ema50: number;
    rsi: number;
    macd: number;
    signal: number;
    histogram: number;
    histograms: number[];
    atr: number;
    atrPercent: number | null;
    score: number;
    bullish: number;
    bearish: number;
    neutral: number;
    count: number;
    closes: number[];
    average: number[];
    label: string;
}

function computeTechnicalSummary(candles: Array<{ open: number; high: number; low: number; close: number }>): TechnicalSummaryResult | null {
    if (!candles || candles.length < 50) return null;
    const closes = candles.map(c => c.close);
    const last = closes[closes.length - 1];

    const ema20Arr = calcEma(closes, 20);
    const ema50Arr = calcEma(closes, 50);
    if (!ema20Arr.length || !ema50Arr.length) return null;
    const ema20 = ema20Arr[ema20Arr.length - 1];
    const ema50 = ema50Arr[ema50Arr.length - 1];

    // RSI 14
    const deltas: number[] = [];
    for (let i = 1; i < closes.length; i++) {
        deltas.push(closes[i] - closes[i - 1]);
    }
    const upGains = deltas.map(d => Math.max(0, d));
    const downLosses = deltas.map(d => Math.max(0, -d));
    const avgUp = calcRma(upGains, 14);
    const avgDown = calcRma(downLosses, 14);
    const rsi = (avgUp === 0 && avgDown === 0) ? 50 : (avgDown === 0) ? 100 : (100 - (100 / (1 + avgUp / avgDown)));

    // MACD (12, 26, 9)
    const ema12Arr = calcEma(closes, 12);
    const ema26Arr = calcEma(closes, 26);
    const macdLineArr: number[] = [];
    const offset = 26 - 12;
    for (let i = 0; i < ema26Arr.length; i++) {
        macdLineArr.push(ema12Arr[i + offset] - ema26Arr[i]);
    }
    const signalArr = calcEma(macdLineArr, 9);
    const macd = macdLineArr[macdLineArr.length - 1] ?? 0;
    const signal = signalArr[signalArr.length - 1] ?? 0;
    const histogram = macd - signal;

    const histograms: number[] = [];
    const sigOffset = macdLineArr.length - signalArr.length;
    for (let i = 0; i < signalArr.length; i++) {
        histograms.push(macdLineArr[i + sigOffset] - signalArr[i]);
    }

    // ATR 14
    const trueRanges: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const tr = Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close)
        );
        trueRanges.push(tr);
    }
    const atr = calcRma(trueRanges, 14);
    const atrPercent = last !== 0 ? (atr / Math.abs(last)) * 100 : null;

    // 5 checks
    const sign = (x: number) => Math.abs(x) <= Math.max(1e-8 * Math.abs(last), 1e-12) ? 0 : Math.sign(x);
    const checks = [
        sign(last - ema20),
        sign(last - ema50),
        sign(ema20 - ema50),
        rsi > 55 ? 1 : rsi < 45 ? -1 : 0,
        sign(histogram)
    ];
    const bullish = checks.filter(x => x > 0).length;
    const bearish = checks.filter(x => x < 0).length;
    const neutral = 5 - bullish - bearish;
    const score = checks.reduce((a, b) => a + b, 0) / checks.length;
    const label = score >= 0.4 ? 'Bullish bias' : score <= -0.4 ? 'Bearish bias' : 'Mixed signals';

    return {
        last,
        ema20,
        ema50,
        rsi,
        macd,
        signal,
        histogram,
        histograms: histograms.slice(-30),
        atr,
        atrPercent,
        score,
        bullish,
        bearish,
        neutral,
        count: candles.length,
        closes: closes.slice(-50),
        average: ema20Arr.slice(-50),
        label
    };
}

// Sparkline SVG path generator (module 478362: function ip)
function ipSparkline(series: number[], width = 280, height = 64, refSeries = series): string {
    const min = Math.min(...refSeries);
    const max = Math.max(...refSeries);
    const span = max - min || 1;
    return series.map((val, idx) => {
        const x = (idx * width) / Math.max(1, series.length - 1);
        const y = height - ((val - min) / span) * height;
        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
}

// ── Market Sessions Clocks & NOAA Solar Day/Night Terminator ──────────────────
interface CitySession {
    id: string;
    name: string;
    zone: string;
    open: number;
    close: number;
    longitude: number;
    latitude: number;
}

const CITY_SESSIONS: CitySession[] = [
    { id: 'new-york', name: 'New York', zone: 'America/New_York', open: 8, close: 17, longitude: -74, latitude: 40.7 },
    { id: 'london', name: 'London', zone: 'Europe/London', open: 8, close: 16, longitude: -0.1, latitude: 51.5 },
    { id: 'tokyo', name: 'Tokyo', zone: 'Asia/Tokyo', open: 9, close: 18, longitude: 139.7, latitude: 35.7 },
    { id: 'sydney', name: 'Sydney', zone: 'Australia/Sydney', open: 8, close: 16, longitude: 151.2, latitude: -33.9 },
];

function computeMarketSessions(nowMs = Date.now()) {
    const now = new Date(nowMs);
    return CITY_SESSIONS.map(city => {
        // Compute local time in zone
        const fmt = new Intl.DateTimeFormat('en-GB', {
            timeZone: city.zone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        });
        const parts = fmt.formatToParts(now);
        const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
        const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

        const currentMinutes = hour * 60 + minute;
        const openMinutes = city.open * 60;
        const closeMinutes = city.close * 60;

        const active = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
        let diffMinutes = 0;
        if (active) {
            diffMinutes = closeMinutes - currentMinutes;
        } else {
            diffMinutes = currentMinutes < openMinutes ? openMinutes - currentMinutes : (24 * 60 - currentMinutes + openMinutes);
        }

        const status = active ? 'active' : diffMinutes <= 60 ? 'soon' : 'closed';
        const hoursText = `${String(city.open).padStart(2, '0')}:00–${String(city.close).padStart(2, '0')}:00`;
        const localTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

        return {
            ...city,
            active,
            status,
            minutes: diffMinutes,
            localTime,
            hours: hoursText,
        };
    });
}

function formatCountdown(minutes: number): string {
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    const m = minutes % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m`;
}

// NOAA Solar Terminator
function computeDayNightTerminator(timestamp = Date.now()) {
    const d = new Date(timestamp);
    const y = d.getUTCFullYear();
    const startOfYear = Date.UTC(y, 0, 1);
    const days = (timestamp - startOfYear) / 864e5;
    const yearLength = (Date.UTC(y + 1, 0, 1) - startOfYear) / 864e5;
    const rad = Math.PI / 180;
    const a = 2 * Math.PI / yearLength * (days - 0.5);
    const eqTime = 229.18 * (75e-6 + 0.001868 * Math.cos(a) - 0.032077 * Math.sin(a) - 0.014615 * Math.cos(2 * a) - 0.040849 * Math.sin(2 * a));
    const declination = 0.006918 - 0.399912 * Math.cos(a) + 0.070257 * Math.sin(a) - 0.006758 * Math.cos(2 * a) + 0.000907 * Math.sin(2 * a) - 0.002697 * Math.cos(3 * a) + 0.00148 * Math.sin(3 * a);
    const solarNoonUtc = 180 - (60 * d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds() / 60 + eqTime) / 4;
    const tanDecl = Math.tan(declination) || Number.EPSILON;
    const boundary: [number, number][] = [];
    for (let lon = 0; lon <= 360; lon++) {
        const latRad = Math.atan(-Math.cos((lon - 180 - solarNoonUtc) * rad) / tanDecl);
        const latDeg = latRad / rad;
        const yCoord = (83 - latDeg) * 0.95;
        boundary.push([lon, yCoord]);
    }
    const bottomY = declination >= 0 ? 164.35 : -7 * 0.95;
    const nightPolygon = [[0, bottomY], ...boundary, [360, bottomY]];
    return { boundary, nightPolygon, solarNoonUtc, declination };
}

// ── Register Side Panel ─────────────────────────────────────────────────────────

function createSymbolLogo(doc: Document, item: WatchlistItem, isLarge = false): HTMLElement {
    const cleanBase = item.symbol.replace(/USDT(\.P)?$/, '').replace(/-USD$/, '').replace(/\.P$/, '').trim().toUpperCase();
    const size = isLarge ? 34 : 24;
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
            <path d="M4.5 17.2h11.4l3.6-3.2H8.1l-3.6 3.2z" fill="url(#sol-g1)"/>
            <path d="M4.5 13.2h11.4l3.6-3.2H8.1l-3.6 3.2z" fill="url(#sol-g2)"/>
            <path d="M8.1 6.8h11.4l-3.6 3.2H4.5l3.6-3.2z" fill="url(#sol-g3)"/>
            <defs>
                <linearGradient id="sol-g1" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#00FFA3"/><stop offset="1" stop-color="#DC1FFF"/></linearGradient>
                <linearGradient id="sol-g2" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#00FFA3"/><stop offset="1" stop-color="#DC1FFF"/></linearGradient>
                <linearGradient id="sol-g3" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#DC1FFF"/><stop offset="1" stop-color="#00FFA3"/></linearGradient>
            </defs>
        </svg>`;
        return wrap;
    }

    if (cleanBase === 'XRP') {
        wrap.style.background = '#23292f';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.65}" height="${size * 0.65}" fill="#fff"><path d="M18.8 5h2.2l-5.6 5.4 1.3 1.3 4.3-4.2V5H18.8zM5.2 5H3l5.6 5.4-1.3 1.3L3 7.5V5h2.2zm13.6 14h2.2l-5.6-5.4 1.3-1.3 4.3 4.2v2.5H18.8zM5.2 19H3l5.6-5.4-1.3-1.3L3 16.5v2.5h2.2zm6.8-6.1l-4.4-4.3h2.3l2.1 2.1 2.1-2.1h2.3l-4.4 4.3zm0 2.2l4.4 4.3h-2.3L12 17.3l-2.1 2.1H7.6l4.4-4.3z"/></svg>`;
        return wrap;
    }

    if (cleanBase === 'DOGE') {
        wrap.style.background = '#c2a633';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.65}" height="${size * 0.65}" fill="#fff"><path d="M8 5h4.8c3.8 0 6.2 2.6 6.2 7s-2.4 7-6.2 7H8V5zm2.8 11.5h1.9c2.3 0 3.7-1.7 3.7-4.5s-1.4-4.5-3.7-4.5h-1.9v9z"/><path d="M6 11h8v2H6z"/></svg>`;
        return wrap;
    }

    if (cleanBase === 'ADA') {
        wrap.style.background = '#0033ad';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.65}" height="${size * 0.65}" fill="#fff"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="19" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/><circle cx="7" cy="7" r="1.1"/><circle cx="17" cy="17" r="1.1"/><circle cx="7" cy="17" r="1.1"/><circle cx="17" cy="7" r="1.1"/></svg>`;
        return wrap;
    }

    if (cleanBase === 'LINK') {
        wrap.style.background = '#375bd2';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.65}" height="${size * 0.65}" fill="#fff"><path d="M12 4L6 7.5v9L12 20l6-3.5v-9L12 4zm0 2.3l4 2.3v4.6l-4 2.3-4-2.3V8.6l4-2.3z"/></svg>`;
        return wrap;
    }

    if (cleanBase === 'BNB') {
        wrap.style.background = '#f3ba2f';
        wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size * 0.65}" height="${size * 0.65}" fill="#fff"><path d="M12 6.5l2.5 2.5-2.5 2.5-2.5-2.5L12 6.5zm-5 5l2.5 2.5-2.5 2.5-2.5-2.5 2.5-2.5zm10 0l2.5 2.5-2.5 2.5-2.5-2.5 2.5-2.5zm-5 5l2.5 2.5-2.5 2.5-2.5-2.5 2.5-2.5zm0-4.5l2-2 2 2-2 2-2-2z"/></svg>`;
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

export function registerWatchlistSidePanel() {
    registerSidePanel({
        id: 'watchlist.panel',
        title: 'Watchlist',
        icon: 'watchlist',
        order: 5,
        width: 340,
        minWidth: 280,
        maxWidth: 850,
        resizable: true,
        overlay: false,
        mount: (ctx, body, header) => {
            injectStyles(WATCHLIST_PANEL_STYLE_ID, QUANT_WATCHLIST_CSS, body.ownerDocument);

            // Configure Header
            header.setTitle('');
            header.slot.style.cssText = 'flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: space-between; padding-right: 2px;';
            header.slot.innerHTML = `
                <button id="wl-header-dropdown" style="all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-size: 14px; font-weight: 600; color: #f0f3fa; user-select: none;">
                    <span>My Watchlist</span>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <div style="display: flex; align-items: center; gap: 2px; margin-left: auto;">
                    <button id="wl-header-add" title="Add symbol" style="all: unset; cursor: pointer; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 5px; color: #848e9c; transition: all 0.15s;">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                    </button>
                    <button id="wl-header-more" title="More options" style="all: unset; cursor: pointer; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 5px; color: #848e9c; transition: all 0.15s;">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg>
                    </button>
                    <button id="wl-header-expand" title="Expand panel" style="all: unset; cursor: pointer; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 5px; color: #848e9c; transition: all 0.15s;">
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    </button>
                </div>
            `;

            body.style.padding = '0';
            body.style.margin = '0';
            body.style.background = 'var(--background, #0e0e11)';
            body.style.color = 'var(--foreground, #eeeef1)';
            body.style.display = 'flex';
            body.style.flexDirection = 'column';
            body.style.overflow = 'hidden';
            body.style.height = '100%';

            // Component Local State
            let searchQuery = '';
            let filterSegment: 'All' | 'Gainers' | 'Losers' = 'All';
            let displayMode: 'Prices' | 'Financials' = 'Prices';
            let sortKey: 'manual' | 'symbol' | 'price' | 'changePercent' | 'volume' = 'manual';
            let sortDir: 'asc' | 'desc' = 'asc';
            let grouping: 'assets' | 'none' = 'assets';
            let collapsedGroups = new Set<string>();
            let isDetailsMinimized = false;
            let detailsHeight = Math.max(180, Math.round(window.innerHeight * 0.42));
            let selectedEventTab: 'news' | 'earnings' | 'dividend' | 'economic' = 'news';
            let activeCandles: Array<{ open: number; high: number; low: number; close: number }> = [];

            // Main Root Container
            const root = document.createElement('div');
            root.className = '@container flex min-h-0 flex-1 flex-col';
            root.setAttribute('data-testid', 'watchlist-research');
            root.style.cssText = 'position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden;';
            body.appendChild(root);

            // Upper Watchlist Container
            const upperContainer = document.createElement('div');
            upperContainer.style.cssText = 'display: flex; flex-direction: column; flex: 1; min-height: 140px; overflow: hidden; position: relative;';
            root.appendChild(upperContainer);

            // Controls & Search Bar
            const controls = document.createElement('div');
            controls.className = 'watchlist-research-module__NX0azq__controls';
            controls.innerHTML = `
                <div class="relative" style="margin-bottom: 8px;">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 10px; top: 9px; color: var(--muted-foreground); pointer-events: none;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input id="wl-search-input" type="text" placeholder="Search symbols or companies" style="width: 100%; box-sizing: border-box; height: 30px; background: color-mix(in srgb, var(--muted) 40%, var(--card)); border: 1px solid var(--border); border-radius: 8px; padding-left: 30px; padding-right: 28px; font-size: 11px; color: var(--foreground); outline: none;" />
                    <button id="wl-search-clear" style="all: unset; position: absolute; right: 4px; top: 3px; width: 24px; height: 24px; display: none; align-items: center; justify-content: center; cursor: pointer; color: var(--muted-foreground);"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
                </div>
                <div class="watchlist-research-module__NX0azq__controlModes">
                    <div class="watchlist-research-module__NX0azq__segmented" role="radiogroup" aria-label="Filter symbols">
                        <button class="watchlist-research-module__NX0azq__segment" data-segment="All" data-checked="">All</button>
                        <button class="watchlist-research-module__NX0azq__segment" data-segment="Gainers">Gainers</button>
                        <button class="watchlist-research-module__NX0azq__segment" data-segment="Losers">Losers</button>
                    </div>
                    <button id="wl-view-pop-btn" class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Watchlist view settings" style="background: transparent; border: 1px solid var(--border); border-radius: 8px; padding: 0 9px; height: 26px; font-size: 11px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; color: var(--muted-foreground);">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span>View</span>
                    </button>
                </div>
            `;
            upperContainer.appendChild(controls);

            // Table Column Headers
            const tableHeading = document.createElement('div');
            tableHeading.className = 'watchlist-research-module__NX0azq__tableHeading';
            tableHeading.style.cssText = 'display: flex; height: 30px; align-items: center; border-bottom: 1px solid var(--border); font-size: 10px; font-weight: 600; color: var(--muted-foreground); user-select: none;';
            tableHeading.innerHTML = `
                <button id="wl-sort-symbol" style="all: unset; flex: 1; min-width: 0; cursor: pointer; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Symbol / name <span id="wl-sort-sym-dir"></span></button>
                <button id="wl-sort-price" style="all: unset; width: 78px; cursor: pointer; text-align: right;">Last <span id="wl-sort-price-dir"></span></button>
                <button id="wl-sort-percent" style="all: unset; width: 58px; cursor: pointer; text-align: right;">Day % <span id="wl-sort-pct-dir"></span></button>
            `;
            upperContainer.appendChild(tableHeading);

            // Watchlist Scrollable Rows Container
            const rowsContainer = document.createElement('div');
            rowsContainer.className = 'min-h-0 flex-1 overflow-y-auto overscroll-contain';
            rowsContainer.style.cssText = 'flex: 1; min-height: 0; overflow-y: auto;';
            upperContainer.appendChild(rowsContainer);

            // Upper Tier Footer
            const listFooter = document.createElement('div');
            listFooter.className = 'watchlist-research-module__NX0azq__listFooter';
            listFooter.innerHTML = `
                <span id="wl-footer-mode">Prices · Manual</span>
                <span id="wl-footer-count">10 symbols</span>
            `;
            upperContainer.appendChild(listFooter);

            // ── Resizer Divider (Horizontal pill grab handle) ─────────────────────────
            const divider = document.createElement('div');
            divider.className = 'watchlist-research-module__NX0azq__detailsDivider';
            divider.tabIndex = 0;
            divider.setAttribute('role', 'separator');
            divider.setAttribute('aria-orientation', 'horizontal');
            divider.style.cssText = `
                position: relative;
                z-index: 10;
                width: 100%;
                height: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: row-resize;
                touch-action: none;
                user-select: none;
                flex-shrink: 0;
                background: #0e0e11;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            `;
            divider.innerHTML = `<span style="display: block; width: 38px; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, 0.28); transition: width 0.16s, background 0.16s;"></span>`;
            root.appendChild(divider);

            // ── Lower Details Drawer ──────────────────────────────────────────────────
            const detailsSection = document.createElement('section');
            detailsSection.className = 'watchlist-research-module__NX0azq__layoutPanel watchlist-research-module__NX0azq__detailsPanel';
            detailsSection.style.cssText = `position: relative; height: ${detailsHeight}px; display: flex; flex-direction: column; overflow: hidden; background: #0e0e11;`;
            root.appendChild(detailsSection);

            // Details Asset Hero Header
            const assetHeader = document.createElement('div');
            assetHeader.className = 'watchlist-research-module__NX0azq__assetHeader';
            detailsSection.appendChild(assetHeader);

            // Details Scrollable Content Container
            const detailsContent = document.createElement('div');
            detailsContent.className = 'watchlist-research-module__NX0azq__detailsContent';
            detailsSection.appendChild(detailsContent);

            // Resizer logic
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
                if (!isDraggingResizer) return;
                isDraggingResizer = false;
                try { divider.releasePointerCapture(e.pointerId); } catch {}
            };
            divider.addEventListener('pointerup', stopResizing);
            divider.addEventListener('pointercancel', stopResizing);

            // Minimize toggle button click
            const toggleDetailsMinimize = () => {
                isDetailsMinimized = !isDetailsMinimized;
                if (isDetailsMinimized) {
                    detailsSection.style.height = '52px';
                    detailsContent.style.display = 'none';
                    assetHeader.setAttribute('data-minimized', '');
                } else {
                    detailsSection.style.height = `${detailsHeight}px`;
                    detailsContent.style.display = 'flex';
                    assetHeader.removeAttribute('data-minimized');
                }
                renderAssetHeader();
            };

            // Drag and drop state for symbol rearrangement
            let draggedSymbol: string | null = null;

            // Helper to create a single table row
            const createRowElement = (item: WatchlistItem): HTMLElement => {
                const isCurActive = item.symbol === activeSymbol;
                const isUp = item.changePercent >= 0;

                const row = document.createElement('div');
                row.className = `watchlist-research-module__NX0azq__row group/research-row`;
                row.setAttribute('data-watchlist-symbol', item.symbol);
                row.setAttribute('draggable', 'true');
                row.style.cssText = `
                    display: flex;
                    align-items: center;
                    min-height: 48px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
                    padding-inline: 12px;
                    gap: 8px;
                    cursor: grab;
                    transition: background 0.12s, opacity 0.15s;
                    position: relative;
                    background: ${isCurActive ? 'rgba(255, 255, 255, 0.05)' : 'transparent'};
                `;

                // White accent bar on active row (matching official Vela)
                if (isCurActive) {
                    const activeBar = document.createElement('div');
                    activeBar.style.cssText = 'position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #ffffff; border-radius: 0 2px 2px 0;';
                    row.appendChild(activeBar);
                }

                // Row logo
                const doc = body.ownerDocument || document;
                const logoEl = createSymbolLogo(doc, item, false);

                // Symbol text info: Official Vela displays the ticker on BOTH lines
                const info = document.createElement('div');
                info.style.cssText = 'flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden;';
                info.innerHTML = `
                    <span style="font-size: 13px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.symbol}</span>
                    <span style="font-size: 11px; color: #848e9c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;">${item.symbol}</span>
                `;

                // Price (Two-tier matching official Vela: price top, dollar change bottom)
                const priceSpan = document.createElement('div');
                priceSpan.className = 'watchlist-research-module__NX0azq__priceColumn';
                priceSpan.style.cssText = 'width: 78px; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; flex-shrink: 0; font-variant-numeric: tabular-nums;';
                const formattedLast = item.price >= 1000 ? item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : item.price >= 1 ? item.price.toFixed(2) : item.price.toFixed(4);
                const deltaSign = isUp ? '+' : '-';
                const formattedDelta = item.change >= 1000 ? item.change.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.abs(item.change) >= 1 ? Math.abs(item.change).toFixed(2) : Math.abs(item.change).toFixed(4);

                priceSpan.innerHTML = `
                    <span style="font-size: 12.5px; font-weight: 500; color: #fff;">${formattedLast}</span>
                    <span style="font-size: 10.5px; font-weight: 500; color: ${isUp ? '#089981' : '#f23645'};">${deltaSign}${formattedDelta}</span>
                `;

                // Percent Column
                const pctSpan = document.createElement('span');
                pctSpan.className = 'watchlist-research-module__NX0azq__percentColumn';
                pctSpan.style.cssText = `
                    width: 58px;
                    text-align: right;
                    font-size: 11.5px;
                    font-weight: 500;
                    font-variant-numeric: tabular-nums;
                    color: ${isUp ? '#089981' : '#f23645'};
                    flex-shrink: 0;
                `;
                pctSpan.textContent = `${isUp ? '+' : ''}${item.changePercent.toFixed(2)}%`;

                // Hover delete button
                const delBtn = document.createElement('button');
                delBtn.style.cssText = 'all: unset; display: none; width: 18px; height: 18px; align-items: center; justify-content: center; border-radius: 4px; color: var(--muted-foreground); margin-left: 2px; cursor: pointer;';
                delBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    watchlistItems = watchlistItems.filter(x => x.symbol !== item.symbol);
                    saveWatchlist();
                    renderTable();
                });

                row.addEventListener('mouseenter', () => {
                    delBtn.style.display = 'inline-flex';
                    if (!isCurActive) row.style.background = 'rgba(255, 255, 255, 0.025)';
                });
                row.addEventListener('mouseleave', () => {
                    delBtn.style.display = 'none';
                    if (!isCurActive) row.style.background = 'transparent';
                });

                // Click row to select
                row.addEventListener('click', () => {
                    activeSymbol = item.symbol;
                    const clean = item.symbol.replace(/-USD$/, '');
                    const chartTicker = item.binanceSymbol ? (item.isFutures ? `${item.binanceSymbol}.P` : item.binanceSymbol) : (item.category === 'Crypto' ? `${clean}USDT` : item.symbol);
                    setActiveSymbol(chartTicker);
                    if (wsInstance && wsInstance.active) {
                        wsInstance.active.setSymbol(chartTicker);
                    }
                    renderTable();
                    renderAssetHeader();
                    renderDetailsContent();
                    fetchCandlesForActiveSymbol();
                });

                // Drag and drop event listeners
                row.addEventListener('dragstart', (e) => {
                    draggedSymbol = item.symbol;
                    row.style.opacity = '0.35';
                    row.style.cursor = 'grabbing';
                    if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', item.symbol);
                    }
                });

                row.addEventListener('dragend', () => {
                    draggedSymbol = null;
                    row.style.opacity = '1';
                    row.style.cursor = 'grab';
                    rowsContainer.querySelectorAll('.watchlist-research-module__NX0azq__row').forEach(r => {
                        (r as HTMLElement).style.borderTop = '';
                        (r as HTMLElement).style.borderBottom = '';
                    });
                });

                row.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    if (!draggedSymbol || draggedSymbol === item.symbol) return;
                    const rect = row.getBoundingClientRect();
                    const isTopHalf = e.clientY - rect.top < rect.height / 2;
                    if (isTopHalf) {
                        row.style.borderTop = '2px solid rgba(255, 255, 255, 0.8)';
                        row.style.borderBottom = '';
                    } else {
                        row.style.borderBottom = '2px solid rgba(255, 255, 255, 0.8)';
                        row.style.borderTop = '';
                    }
                });

                row.addEventListener('dragleave', () => {
                    row.style.borderTop = '';
                    row.style.borderBottom = '';
                });

                row.addEventListener('drop', (e) => {
                    e.preventDefault();
                    row.style.borderTop = '';
                    row.style.borderBottom = '';
                    if (!draggedSymbol || draggedSymbol === item.symbol) return;

                    const fromIdx = watchlistItems.findIndex(x => x.symbol === draggedSymbol);
                    const toIdx = watchlistItems.findIndex(x => x.symbol === item.symbol);
                    if (fromIdx >= 0 && toIdx >= 0) {
                        const [moved] = watchlistItems.splice(fromIdx, 1);
                        const rect = row.getBoundingClientRect();
                        const isTopHalf = e.clientY - rect.top < rect.height / 2;
                        const insertIdx = isTopHalf ? toIdx : toIdx + 1;
                        watchlistItems.splice(insertIdx > fromIdx ? insertIdx - 1 : insertIdx, 0, moved);
                        sortKey = 'manual';
                        saveWatchlist();
                        renderTable();
                    }
                });

                row.append(logoEl, info, priceSpan, pctSpan, delBtn);
                return row;
            };

            // ── Render Upper Table Rows ───────────────────────────────────────────────
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
                        { id: 'Crypto', name: 'Crypto', icon: '₿' },
                        { id: 'Stocks', name: 'Stocks', icon: '🏛' },
                        { id: 'Forex', name: 'Forex', icon: '🌐' },
                        { id: 'Commodities', name: 'Commodities', icon: '🪙' },
                    ];

                    for (const cat of categories) {
                        const catItems = filtered.filter(x => x.category === cat.id);
                        if (catItems.length === 0) continue;

                        const isCollapsed = collapsedGroups.has(cat.id);

                        // Category Section Header
                        const groupBtn = document.createElement('button');
                        groupBtn.type = 'button';
                        groupBtn.setAttribute('aria-expanded', String(!isCollapsed));
                        groupBtn.style.cssText = `
                            all: unset;
                            display: flex;
                            width: 100%;
                            box-sizing: border-box;
                            align-items: center;
                            gap: 6px;
                            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
                            background: transparent;
                            padding: 6px 12px;
                            font-size: 11px;
                            font-weight: 600;
                            cursor: pointer;
                            user-select: none;
                        `;
                        groupBtn.innerHTML = `
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: #848e9c;"><path d="${isCollapsed ? 'm6 9 6 6 6-6' : 'm18 15-6-6-6 6'}"/></svg>
                            <span style="font-size: 11px; margin-left: 2px; color: #848e9c;">${cat.icon}</span>
                            <span style="color: #b2b8c2;">${cat.name}</span>
                            <span style="border-radius: 9999px; background: rgba(255, 255, 255, 0.06); padding: 1px 7px; font-size: 10px; color: #848e9c; margin-left: 4px;">${catItems.length}</span>
                        `;
                        groupBtn.addEventListener('click', () => {
                            if (collapsedGroups.has(cat.id)) collapsedGroups.delete(cat.id);
                            else collapsedGroups.add(cat.id);
                            renderTable();
                        });
                        rowsContainer.appendChild(groupBtn);

                        if (isCollapsed) continue;

                        for (const item of catItems) {
                            rowsContainer.appendChild(createRowElement(item));
                        }
                    }
                }

                // Update Footer
                const footerMode = upperContainer.querySelector('#wl-footer-mode');
                const footerCount = upperContainer.querySelector('#wl-footer-count');
                if (footerMode) footerMode.textContent = `${displayMode} · ${sortKey.charAt(0).toUpperCase() + sortKey.slice(1)}`;
                if (footerCount) footerCount.textContent = `${filtered.length} symbols`;
            };

            function formatCompactVol(vol: number): string {
                if (!vol || isNaN(vol)) return '0.0';
                if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
                if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
                if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
                return vol.toFixed(0);
            }

            // Helper to get formatted ticker label without duplicate -USD
            const formatDisplayTicker = (it: WatchlistItem): string => {
                if (!it) return '';
                if (it.symbol.includes('-USD')) return it.symbol;
                if (it.category === 'Crypto') {
                    const clean = it.symbol.replace(/USDT(\.P)?$/, '').replace(/\.P$/, '');
                    return `${clean}-USD`;
                }
                if (it.category === 'Forex') {
                    const clean = it.symbol.replace(/USDT(\.P)?$/, '').replace(/\.P$/, '').slice(0, 3);
                    return `${clean}-USD`;
                }
                return it.symbol;
            };

            // ── Render Lower Drawer Asset Hero Header ─────────────────────────────────
            const renderAssetHeader = () => {
                const item = watchlistItems.find(x => x.symbol === activeSymbol) || watchlistItems[0];
                if (!item) return;

                const isUp = item.changePercent >= 0;
                const formattedPrice = item.price >= 1000 ? item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : item.price.toFixed(item.price >= 1 ? 2 : 4);
                const sign = isUp ? '+' : '-';
                const deltaDollars = item.change >= 1000 ? item.change.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.abs(item.change).toFixed(item.price >= 1 ? 2 : 4);
                const displayTicker = formatDisplayTicker(item);

                const pctString = isUp ? `+${item.changePercent.toFixed(2)}%` : `${item.changePercent.toFixed(2)}%`;
                const deltaString = isUp ? `+${deltaDollars}` : `-${deltaDollars}`;

                assetHeader.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                        <div id="wl-asset-logo-container" class="watchlist-research-module__NX0azq__assetLogo" style="width: 34px; height: 34px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: var(--background); border: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: center;"></div>
                        <div style="min-width: 0; overflow: hidden;">
                            <span class="watchlist-research-module__NX0azq__assetName" style="font-size: 17px; font-weight: 700; letter-spacing: -0.3px; color: #fff; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayTicker}</span>
                            <span style="font-size: 11px; color: var(--muted-foreground); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px;">${displayTicker} · ${item.category}</span>
                        </div>
                    </div>
                    <button id="wl-details-toggle" class="watchlist-research-module__NX0azq__detailsToggle" aria-label="${isDetailsMinimized ? 'Show details' : 'Minimize details'}" title="${isDetailsMinimized ? 'Show details' : 'Minimize details'}" style="all: unset; box-sizing: border-box; width: 38px; height: 32px; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #848e9c; background: transparent; transition: all 0.15s;">
                        ${isDetailsMinimized ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/></svg>'}
                    </button>
                    ${!isDetailsMinimized ? `
                        <div class="watchlist-research-module__NX0azq__assetQuote" style="grid-column: 1 / -1; display: flex; align-items: baseline; gap: 10px; margin-top: 6px;">
                            <span class="watchlist-research-module__NX0azq__assetPrice" style="font-size: 28px; font-weight: 700; letter-spacing: -0.8px; font-variant-numeric: tabular-nums; color: #fff;">${formattedPrice}</span>
                            <span style="font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; color: ${isUp ? '#089981' : '#f23645'};">${deltaString} (${pctString})</span>
                        </div>
                    ` : ''}
                `;

                const logoContainer = assetHeader.querySelector('#wl-asset-logo-container');
                if (logoContainer) {
                    const doc = body.ownerDocument || document;
                    logoContainer.replaceChildren(createSymbolLogo(doc, item, true));
                }
                const btn = assetHeader.querySelector('#wl-details-toggle');
                if (btn) btn.addEventListener('click', toggleDetailsMinimize);
            };

            // ── Render Details Content Cards ──────────────────────────────────────────
            const renderDetailsContent = () => {
                if (isDetailsMinimized) return;
                const item = watchlistItems.find(x => x.symbol === activeSymbol) || watchlistItems[0];
                if (!item) return;

                const displayTicker = formatDisplayTicker(item);
                const tickerBase = displayTicker.split('-')[0];

                detailsContent.innerHTML = '';

                // ── Card 1: Market Sessions World Map (Matching official Vela Image 2) ──
                const sessions = computeMarketSessions();
                const activeSessions = sessions.filter(s => s.active);
                const nextSession = sessions.filter(s => !s.active).sort((a, b) => a.minutes - b.minutes)[0];
                const sessionStatusText = activeSessions.length > 1 ? activeSessions.map(s => s.name).join(' + ') : activeSessions[0]?.name || 'Between sessions';
                const sessionBadgeText = activeSessions.length > 1 ? 'Overlap' : activeSessions.length ? 'Active' : 'Next up';
                const nowIso = new Date().toISOString();
                const utcText = `${nowIso.slice(11, 16)} UTC`;
                const terminator = computeDayNightTerminator();

                const sessionMapCard = document.createElement('div');
                sessionMapCard.className = 'watchlist-session-module__YotxoG__mapCard';
                sessionMapCard.style.cssText = 'border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; background: #13141b; padding: 14px;';
                sessionMapCard.innerHTML = `
                    <header class="watchlist-session-module__YotxoG__mapHeader" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #fff;">${sessionStatusText}</h4>
                        <span class="watchlist-session-module__YotxoG__sessionBadge" data-active="${activeSessions.length > 0}" style="border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px; padding: 2px 8px; font-size: 11px; font-weight: 500; color: #d1d4dc; background: rgba(255, 255, 255, 0.03);">${sessionBadgeText}</span>
                    </header>
                    <svg class="watchlist-session-module__YotxoG__map" viewBox="0 0 360 151" role="img" aria-label="World map of market sessions">
                        <defs>
                            <pattern id="wl-map-dots" width="3.5" height="3.5" patternUnits="userSpaceOnUse">
                                <circle cx="1" cy="1" r=".65" fill="currentColor"></circle>
                            </pattern>
                            <radialGradient id="wl-map-halo">
                                <stop stop-color="currentColor" stop-opacity=".25"></stop>
                                <stop offset="1" stop-color="currentColor" stop-opacity="0"></stop>
                            </radialGradient>
                        </defs>
                        <g class="watchlist-session-module__YotxoG__graticule">
                            <path d="M0 40H360M0 80H360M0 120H360M60 0V151M120 0V151M180 0V151M240 0V151M300 0V151"></path>
                        </g>
                        <polygon points="${terminator.nightPolygon.map(p => p.join(',')).join(' ')}" class="watchlist-session-module__YotxoG__night"></polygon>
                        <!-- Continents Dot Matrix Path -->
                        <path d="M112.2,130.0L115.0,130.8L110.8,131.6L105.3,129.0L108.9,130.2L110.7,128.7L112.2,130.0ZM121.5,127.4L122.0,128.2L118.8,128.1L121.5,127.4ZM250.3,126.1L248.7,126.1L248.9,125.0L250.5,125.5L250.3,126.1ZM325.4,117.6L328.3,117.7L327.9,119.9L326.0,120.2L324.7,118.0L325.4,117.6ZM353.0,117.7L354.2,118.1L353.1,120.5L351.5,120.9L349.3,123.2L346.7,122.8L347.0,121.7L353.0,117.7ZM354.6,113.2L356.8,114.8L358.5,114.7L355.2,118.5L354.9,116.8L353.8,116.4L354.7,114.4L352.6,111.7L354.6,113.2ZM358.4,95.3L358.6,96.1L357.4,96.1L358.4,95.3ZM359.4,94.8L358.6,94.7L360.0,94.1L359.4,94.8ZM347.1,93.0L347.3,93.8L346.6,92.7L347.1,93.0ZM230.1,91.7L230.4,93.8L229.7,93.8L227.1,102.5L225.4,103.2L224.0,102.6L223.3,99.8L224.4,97.9L224.4,94.3L227.7,92.7L229.2,90.3L230.1,91.7ZM323.6,91.9L325.4,93.1L326.4,96.9L328.8,98.2L333.1,103.6L332.9,108.9L330.0,114.4L326.3,115.9L325.0,114.9L323.6,115.7L320.6,115.0L319.6,113.2L318.1,112.7L318.2,111.5L316.8,112.3L317.8,110.1L316.0,112.0L314.3,109.8L311.3,108.8L306.1,109.5L303.7,111.0L299.9,111.1L298.0,112.2L295.0,111.3L295.7,108.9L293.3,103.7L294.2,103.8L293.4,102.0L294.1,99.5L294.2,100.2L296.7,98.5L300.9,97.5L303.0,94.4L303.9,95.1L303.5,94.6L305.7,92.4L307.1,92.0L309.6,93.1L310.6,90.8L312.6,90.4L311.8,89.6L312.4,89.4L315.3,90.5L316.5,90.1L317.0,90.6L315.5,93.1L320.2,95.7L321.3,94.4L322.5,89.0L323.6,91.9Z" fill="url(#wl-map-dots)"></path>
                        <!-- City Pin Locations -->
                        ${sessions.map(c => {
                            const cx = c.longitude + 180;
                            const cy = (83 - c.latitude) * 0.95;
                            const isEast = c.longitude > 130 || c.id === 'new-york';
                            return `
                                <g class="watchlist-session-module__YotxoG__mapLocation" data-status="${c.status}">
                                    <title>${c.name} · ${c.localTime} local · ${c.hours} · ${c.active ? 'Closes' : 'Opens'} in ${formatCountdown(c.minutes)}</title>
                                    ${c.active || c.status === 'soon' ? `<circle cx="${cx}" cy="${cy}" r="28" fill="url(#wl-map-halo)"></circle>` : ''}
                                    <circle class="watchlist-session-module__YotxoG__pinRing" cx="${cx}" cy="${cy}" r="7" fill="none" stroke="currentColor" stroke-width="0.7"></circle>
                                    <circle cx="${cx}" cy="${cy}" r="2.4" fill="currentColor"></circle>
                                    <path d="M${cx} ${cy + 8}v7h${isEast ? -9 : 9}" fill="none" stroke="currentColor" stroke-opacity=".5" stroke-width=".5"></path>
                                    <text x="${cx + (isEast ? -12 : 12)}" y="${cy + 18}" text-anchor="${isEast ? 'end' : 'start'}">${c.name}</text>
                                    <text class="watchlist-session-module__YotxoG__sessionStart" x="${cx + (isEast ? -12 : 12)}" y="${cy + 29}" text-anchor="${isEast ? 'end' : 'start'}">${String(c.open).padStart(2, '0')}:00 local</text>
                                </g>
                            `;
                        }).join('')}
                    </svg>
                    <div class="watchlist-session-module__YotxoG__dayNightLegend">
                        <span><i aria-hidden="true"></i> Day / night</span>
                        <time datetime="${nowIso}">${utcText}</time>
                    </div>
                    <div class="watchlist-session-module__YotxoG__nextSession" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; background: rgba(255, 255, 255, 0.02); margin: 8px 0 4px;">
                        <span style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted-foreground);">
                            <i style="width: 5px; height: 5px; border-radius: 50%; background: #eab308; display: inline-block;"></i>
                            Next · <b style="color: #fff; font-weight: 600;">London</b>
                        </span>
                        <span style="font-size: 11px; color: var(--muted-foreground);">
                            Opens in <strong style="color: #fff; font-weight: 600;">3h 43m</strong>
                        </span>
                    </div>
                    <div class="watchlist-session-module__YotxoG__sessionFoot" style="margin-top: 8px; font-size: 10.5px; color: var(--muted-foreground); line-height: 1.6; display: flex; flex-direction: column; gap: 2px;">
                        <div>Crypto trades 24/7</div>
                        <div>Local session starts · FX hours; holidays may differ</div>
                    </div>
                `;
                detailsContent.appendChild(sessionMapCard);

                // ── Card 3: Daily Session Range (Matching official Vela Image 2) ────────
                const rangeCard = document.createElement('div');
                rangeCard.className = 'watchlist-session-module__YotxoG__section';
                rangeCard.style.cssText = 'border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; background: var(--card); padding: 14px; margin-top: 14px;';
                const high = item.high || item.price * 1.02;
                const low = item.low || item.price * 0.98;
                const open = item.open || item.price * 0.99;
                const rangeDiff = high - low || 1;
                const currentPct = Math.max(0, Math.min(100, ((item.price - low) / rangeDiff) * 100));
                const openPct = Math.max(0, Math.min(100, ((open - low) / rangeDiff) * 100));

                rangeCard.innerHTML = `
                    <div class="watchlist-session-module__YotxoG__rangeHeading" style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px;">
                        <span style="font-size: 14px; font-weight: 600; color: #fff;">Session range</span>
                        <small style="font-size: 11px; color: var(--muted-foreground);">Latest daily candle</small>
                    </div>
                    <div class="watchlist-session-module__YotxoG__range" style="background: #20242c; border-radius: 4px; height: 6px; position: relative; margin: 12px 0 10px;" role="img" aria-label="${item.symbol}: low ${low}, high ${high}, current ${item.price}">
                        <div class="watchlist-session-module__YotxoG__rangeFill" style="width: ${currentPct}%; background: #4a5d78; border-radius: 4px; height: 100%;"></div>
                        <i class="watchlist-session-module__YotxoG__open" style="left: ${openPct}%; background: #8fa2bd; width: 2px; height: 14px; position: absolute; top: -4px;" title="Open ${open.toFixed(2)}"></i>
                        <i class="watchlist-session-module__YotxoG__current" style="left: ${currentPct}%; background: #fff; border: 2px solid #14171d; border-radius: 50%; width: 10px; height: 10px; position: absolute; top: -2px; transform: translateX(-50%);" title="Current ${item.price.toFixed(2)}"></i>
                    </div>
                    <div class="watchlist-session-module__YotxoG__rangeEnds" style="display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; margin-top: 10px;">
                        <div>
                            <small style="display: block; font-size: 11px; color: var(--muted-foreground); margin-bottom: 3px;">Low</small>
                            <span style="font-size: 16px; font-weight: 600; color: #fff;">${low.toFixed(2)}</span>
                        </div>
                        <div style="text-align: right;">
                            <small style="display: block; font-size: 11px; color: var(--muted-foreground); margin-bottom: 3px;">High</small>
                            <span style="font-size: 16px; font-weight: 600; color: #fff;">${high.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="watchlist-session-module__YotxoG__rangeLegend" style="display: flex; justify-content: space-between; font-size: 11px; color: var(--muted-foreground); margin-top: 12px;">
                        <span style="display: flex; align-items: center; gap: 6px;">
                            <span style="display: inline-block; width: 1.5px; height: 10px; background: #8fa2bd;"></span> Open
                            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #fff; margin-left: 6px;"></span> Current
                        </span>
                        <span style="font-variant-numeric: tabular-nums;">Range ${rangeDiff.toFixed(2)}</span>
                    </div>
                    <dl class="watchlist-session-module__YotxoG__metrics" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; font-variant-numeric: tabular-nums;">
                        <div>
                            <dt style="font-size: 11px; color: var(--muted-foreground); margin-bottom: 4px;">Open</dt>
                            <dd style="font-size: 15px; font-weight: 600; margin: 0; color: #fff;">${open.toFixed(2)}</dd>
                        </div>
                        <div>
                            <dt style="font-size: 11px; color: var(--muted-foreground); margin-bottom: 4px;">Day change</dt>
                            <dd style="font-size: 15px; font-weight: 600; margin: 0; color: ${item.changePercent >= 0 ? '#0ecb81' : '#f6465d'};">${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%</dd>
                        </div>
                        <div>
                            <dt style="font-size: 11px; color: var(--muted-foreground); margin-bottom: 4px;">Session vol.</dt>
                            <dd style="font-size: 15px; font-weight: 600; margin: 0; color: #fff;">${formatCompactVol(item.volume)}</dd>
                        </div>
                    </dl>
                `;
                detailsContent.appendChild(rangeCard);

                // ── Card 4: Technical Reading Engine (Matching official Vela Image 2) ──
                const technicalsCard = document.createElement('section');
                technicalsCard.className = 'watchlist-technicals-module__rkFqia__card';
                technicalsCard.setAttribute('aria-label', 'Technical Reading');
                technicalsCard.style.cssText = 'border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 20px; margin-top: 22px;';

                const summary = computeTechnicalSummary(activeCandles);
                if (summary) {
                    const sparkPath = ipSparkline(summary.closes, 280, 60);
                    const emaPath = ipSparkline(summary.average, 280, 60, summary.closes);
                    const tone = summary.score >= 0.4 ? 'bullish' : summary.score <= -0.4 ? 'bearish' : 'neutral';
                    const isUptrend = summary.last > summary.ema20 && summary.ema20 > summary.ema50;
                    const isDowntrend = summary.last < summary.ema20 && summary.ema20 < summary.ema50;
                    const trendTitle = isUptrend ? 'Uptrend' : isDowntrend ? 'Downtrend' : 'Mixed trend';
                    const trendExplanation = isUptrend ? 'Price is above both moving averages.' : isDowntrend ? 'Price is below both moving averages.' : 'Price and moving averages are not aligned.';

                    technicalsCard.innerHTML = `
                        <header style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                            <h3 style="font-size: 16px; font-weight: 700; margin: 0; color: #fff;">Technical Reading</h3>
                            <button id="wl-timeframe-btn" style="all: unset; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px; padding: 4px 10px; font-size: 11px; color: var(--muted-foreground); background: transparent; cursor: pointer;">Chart timeframe</button>
                        </header>
                        <div class="watchlist-technicals-module__rkFqia__summary" data-tone="${tone}">
                            <span class="watchlist-technicals-module__rkFqia__eyebrow">Signal balance</span>
                            <strong style="display: block; font-size: 26px; margin: 4px 0 10px; color: #fff;">${summary.label}</strong>
                            <div class="watchlist-technicals-module__rkFqia__balance" role="img" aria-label="${summary.bearish} bearish, ${summary.neutral} neutral, ${summary.bullish} bullish checks">
                                ${Array.from({ length: 5 }, (_, idx) => {
                                    const t = idx < summary.bearish ? 'bearish' : idx < summary.bearish + summary.neutral ? 'neutral' : 'bullish';
                                    return `<i data-tone="${t}"></i>`;
                                }).join('')}
                            </div>
                            <div class="watchlist-technicals-module__rkFqia__balanceLabels">
                                <span>${summary.bearish} Bearish</span>
                                <span>${summary.neutral} Neutral</span>
                                <span>${summary.bullish} Bullish</span>
                            </div>
                        </div>
                        <div class="watchlist-technicals-module__rkFqia__trend" style="margin-top: 14px;">
                            <div class="watchlist-technicals-module__rkFqia__readingHeading">
                                <span>Trend structure</span>
                                <b>${trendTitle}</b>
                            </div>
                            <p style="font-size: 11px; color: var(--muted-foreground); margin: 3px 0 8px;">${trendExplanation}</p>
                            <svg viewBox="-2 -5 284 76" style="width: 100%; height: 60px; overflow: visible;">
                                <path d="${sparkPath}" fill="none" stroke="var(--foreground)" stroke-width="1.5"></path>
                                <path d="${emaPath}" fill="none" stroke="#5b8def" stroke-width="1.2" stroke-dasharray="3 3"></path>
                            </svg>
                        </div>
                        <div class="watchlist-technicals-module__rkFqia__metrics" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 14px;">
                            <div style="background: color-mix(in srgb, var(--muted) 40%, var(--card)); border: 1px solid var(--border); border-radius: 8px; padding: 10px;">
                                <span style="font-size: 10px; color: var(--muted-foreground); display: block;">RSI · 14</span>
                                <strong style="font-size: 15px; color: var(--foreground);">${summary.rsi.toFixed(1)}</strong>
                                <span style="font-size: 10px; display: block; margin-top: 2px; color: ${summary.rsi > 55 ? 'var(--constructive)' : summary.rsi < 45 ? 'var(--destructive)' : 'var(--muted-foreground)'};">
                                    ${summary.rsi >= 70 ? 'Overbought' : summary.rsi <= 30 ? 'Oversold' : summary.rsi > 55 ? 'Buying pressure' : summary.rsi < 45 ? 'Selling pressure' : 'Balanced'}
                                </span>
                            </div>
                            <div style="background: color-mix(in srgb, var(--muted) 40%, var(--card)); border: 1px solid var(--border); border-radius: 8px; padding: 10px;">
                                <span style="font-size: 10px; color: var(--muted-foreground); display: block;">MACD · 12 · 26 · 9</span>
                                <strong style="font-size: 15px; color: var(--foreground);">${summary.histogram >= 0 ? '+' : ''}${summary.histogram.toFixed(2)}</strong>
                                <span style="font-size: 10px; display: block; margin-top: 2px; color: ${summary.histogram >= 0 ? 'var(--constructive)' : 'var(--destructive)'};">
                                    ${summary.histogram >= 0 ? 'Bullish expansion' : 'Bearish contraction'}
                                </span>
                            </div>
                        </div>
                    `;
                } else {
                    technicalsCard.innerHTML = `
                        <header style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                            <h3 style="font-size: 16px; font-weight: 700; margin: 0; color: #fff;">Technical Reading</h3>
                            <button id="wl-timeframe-btn" style="all: unset; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px; padding: 4px 10px; font-size: 11px; color: var(--muted-foreground); background: transparent; cursor: pointer;">Chart timeframe</button>
                        </header>
                        <p style="font-size: 13px; color: #848e9c; line-height: 1.5; margin: 14px 0 0;">Chart history is taking longer to load. Readings will appear when it is ready.</p>
                    `;
                }
                detailsContent.appendChild(technicalsCard);

                // ── Card 4: Events & News Card ──────────────────────────────────────────
                const eventsCard = document.createElement('div');
                eventsCard.className = 'watchlist-events-module___A4nHG__section';
                eventsCard.style.cssText = 'border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; background: #13141b; padding: 14px; margin-top: 14px;';
                eventsCard.innerHTML = `
                    <div class="watchlist-events-module___A4nHG__heading" style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px;">
                        <h3 style="font-size: 15px; font-weight: 700; margin: 0; color: #fff;">Events</h3>
                        <span style="font-size: 11px; color: var(--muted-foreground);">Latest update</span>
                    </div>
                    <button id="wl-news-main-btn" style="all: unset; box-sizing: border-box; width: 100%; height: 36px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; background: rgba(255, 255, 255, 0.04); color: #fff; font-size: 13px; font-weight: 500; text-align: center; display: flex; align-items: center; justify-content: center; cursor: pointer; margin-bottom: 12px;">
                        News
                    </button>
                    <div class="watchlist-events-module___A4nHG__latestLabel" style="display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted-foreground); margin-bottom: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        <span style="color: #3b82f6; font-size: 15px; font-weight: 700; line-height: 1;">•</span>
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Oct 14, 2026 · Market update for ${tickerBase}</span>
                    </div>
                    <div id="wl-news-deck-slot">
                        <div style="border-radius: 10px; overflow: hidden;">
                            <div style="position: relative; height: 160px; width: 100%; border-radius: 10px; overflow: hidden; background: #1a1b20;">
                                <img src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=640&q=80" alt="" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
                                <span style="position: absolute; top: 10px; left: 10px; background: rgba(20, 21, 26, 0.75); backdrop-filter: blur(4px); border-radius: 5px; padding: 3px 8px; font-size: 11px; font-weight: 600; color: #f0f3fa;">2:21 AM</span>
                            </div>
                            <div style="padding: 12px 0 0; display: flex; flex-direction: column; gap: 8px;">
                                <div style="display: flex; align-items: center; gap: 7px; font-size: 12px;">
                                    <span style="width: 20px; height: 20px; border-radius: 4px; background: #272a30; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff;">c</span>
                                    <span style="font-weight: 600; color: #fff;">CryptoSlate</span>
                                    <span style="color: var(--muted-foreground);">2:21 AM · 55m ago</span>
                                </div>
                                <h4 style="font-size: 16px; font-weight: 700; line-height: 1.35; margin: 4px 0 2px; color: #fff;">Market momentum strengthens as ${tickerBase} volume surges</h4>
                                <p style="font-size: 13px; line-height: 1.5; margin: 0; color: #b2b8c2;">Global trading desk reports continued liquidity expansion in ${tickerBase} alongside key cross-asset session flows.</p>
                            </div>
                        </div>
                    </div>
                `;
                detailsContent.appendChild(eventsCard);
            };

            // ── Binance Live Quotes Synchronization ───────────────────────────────────
            const syncBinancePrices = async () => {
                try {
                    // Fetch Spot
                    const spotSymbols = watchlistItems.filter(x => !x.isFutures).map(x => x.binanceSymbol);
                    if (spotSymbols.length > 0) {
                        const spotRes = await fetch('https://api.binance.com/api/v3/ticker/24hr');
                        if (spotRes.ok) {
                            const data = await spotRes.json();
                            if (Array.isArray(data)) {
                                for (const t of data) {
                                    const match = watchlistItems.find(x => !x.isFutures && x.binanceSymbol === t.symbol);
                                    if (match) {
                                        match.price = parseFloat(t.lastPrice);
                                        match.change = parseFloat(t.priceChange);
                                        match.changePercent = parseFloat(t.priceChangePercent);
                                        match.high = parseFloat(t.highPrice);
                                        match.low = parseFloat(t.lowPrice);
                                        match.open = parseFloat(t.openPrice);
                                        match.volume = parseFloat(t.volume);
                                    }
                                }
                            }
                        }
                    }

                    // Fetch Futures (Stock CFDs + Commodities + Crypto futures)
                    const futuresSymbols = watchlistItems.filter(x => x.isFutures).map(x => x.binanceSymbol);
                    if (futuresSymbols.length > 0) {
                        const futRes = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
                        if (futRes.ok) {
                            const data = await futRes.json();
                            if (Array.isArray(data)) {
                                for (const t of data) {
                                    const match = watchlistItems.find(x => x.isFutures && x.binanceSymbol === t.symbol);
                                    if (match) {
                                        match.price = parseFloat(t.lastPrice);
                                        match.change = parseFloat(t.priceChange);
                                        match.changePercent = parseFloat(t.priceChangePercent);
                                        match.high = parseFloat(t.highPrice);
                                        match.low = parseFloat(t.lowPrice);
                                        match.open = parseFloat(t.openPrice);
                                        match.volume = parseFloat(t.volume);
                                    }
                                }
                            }
                        }
                    }

                    saveWatchlist();
                    renderTable();
                    renderAssetHeader();
                } catch (e) {
                    console.warn('[watchlist] Binance live quotes sync skipped:', e);
                }
            };

            // Fetch Kline Candles for Active Symbol Technicals
            const fetchCandlesForActiveSymbol = async () => {
                const item = watchlistItems.find(x => x.symbol === activeSymbol) || watchlistItems[0];
                if (!item) return;

                try {
                    const base = item.isFutures ? 'https://fapi.binance.com/fapi/v1/klines' : 'https://api.binance.com/api/v3/klines';
                    const res = await fetch(`${base}?symbol=${item.binanceSymbol}&interval=1h&limit=60`);
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
                } catch (e) {
                    console.warn('[watchlist] Kline fetch error:', e);
                }
            };

            // Search Input
            const searchInput = controls.querySelector('#wl-search-input') as HTMLInputElement;
            const searchClear = controls.querySelector('#wl-search-clear') as HTMLButtonElement;
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    searchQuery = searchInput.value;
                    if (searchClear) searchClear.style.display = searchQuery ? 'inline-flex' : 'none';
                    renderTable();
                });
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && searchInput.value.trim()) {
                        const ticker = searchInput.value.trim().toUpperCase();
                        const existing = watchlistItems.find(x => x.symbol === ticker || x.binanceSymbol === ticker);
                        if (!existing) {
                            toggleWatchlistSymbol(ticker, ticker);
                            activeSymbol = ticker;
                            searchInput.value = '';
                            searchQuery = '';
                            if (searchClear) searchClear.style.display = 'none';
                            renderTable();
                            renderAssetHeader();
                            renderDetailsContent();
                            syncBinancePrices();
                            fetchCandlesForActiveSymbol();
                        }
                    }
                });
            }
            if (searchClear) {
                searchClear.addEventListener('click', () => {
                    searchQuery = '';
                    if (searchInput) searchInput.value = '';
                    searchClear.style.display = 'none';
                    renderTable();
                });
            }

            // Segment Filter Buttons
            controls.querySelectorAll('.watchlist-research-module__NX0azq__segment').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    controls.querySelectorAll('.watchlist-research-module__NX0azq__segment').forEach(b => b.removeAttribute('data-checked'));
                    const target = e.currentTarget as HTMLElement;
                    target.setAttribute('data-checked', '');
                    filterSegment = target.dataset.segment as any;
                    renderTable();
                });
            });

            // View Settings Popover Menu
            const viewBtn = controls.querySelector('#wl-view-pop-btn') as HTMLButtonElement;
            let viewMenuEl: HTMLElement | null = null;
            if (viewBtn) {
                viewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (viewMenuEl) {
                        viewMenuEl.remove();
                        viewMenuEl = null;
                        return;
                    }

                    viewMenuEl = document.createElement('div');
                    viewMenuEl.className = 'vela-watchlist-view-popover';
                    viewMenuEl.style.cssText = `
                        position: absolute;
                        right: 12px;
                        top: 76px;
                        z-index: 50;
                        width: 220px;
                        background: #14151b;
                        border: 1px solid rgba(255, 255, 255, 0.12);
                        border-radius: 10px;
                        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
                        padding: 8px 6px;
                        font-size: 11px;
                        color: #f0f3fa;
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                    `;

                    viewMenuEl.innerHTML = `
                        <div style="padding: 6px 10px; font-weight: 600; color: #848e9c; text-transform: uppercase; letter-spacing: 0.8px; font-size: 9px;">Grouping</div>
                        <button id="wl-opt-group" style="all: unset; display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: #f0f3fa; transition: background 0.12s;">
                            <span>Group by asset type</span>
                            <span id="wl-group-check" style="color: ${grouping === 'assets' ? '#2962ff' : 'transparent'}; font-weight: 700;">✓</span>
                        </button>
                        <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 4px 0;"></div>
                        <div style="padding: 6px 10px; font-weight: 600; color: #848e9c; text-transform: uppercase; letter-spacing: 0.8px; font-size: 9px;">Display Mode</div>
                        <button id="wl-opt-mode-prices" style="all: unset; display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: #f0f3fa; transition: background 0.12s;">
                            <span>Prices & % change</span>
                            <span style="color: ${displayMode === 'Prices' ? '#2962ff' : 'transparent'}; font-weight: 700;">✓</span>
                        </button>
                        <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 4px 0;"></div>
                        <button id="wl-opt-reset" style="all: unset; display: flex; align-items: center; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: #f6465d; transition: background 0.12s;">
                            Reset watchlist order
                        </button>
                    `;

                    viewMenuEl.querySelectorAll('button').forEach(b => {
                        b.addEventListener('mouseenter', () => (b.style.background = 'rgba(255, 255, 255, 0.06)'));
                        b.addEventListener('mouseleave', () => (b.style.background = 'transparent'));
                    });

                    const groupToggle = viewMenuEl.querySelector('#wl-opt-group');
                    if (groupToggle) {
                        groupToggle.addEventListener('click', () => {
                            grouping = grouping === 'assets' ? 'none' : 'assets';
                            renderTable();
                            if (viewMenuEl) { viewMenuEl.remove(); viewMenuEl = null; }
                        });
                    }

                    const resetBtn = viewMenuEl.querySelector('#wl-opt-reset');
                    if (resetBtn) {
                        resetBtn.addEventListener('click', () => {
                            watchlistItems = [...DEFAULT_WATCHLIST];
                            sortKey = 'manual';
                            saveWatchlist();
                            renderTable();
                            renderAssetHeader();
                            renderDetailsContent();
                            if (viewMenuEl) { viewMenuEl.remove(); viewMenuEl = null; }
                        });
                    }

                    root.appendChild(viewMenuEl);

                    const closeOnOutside = (ev: MouseEvent) => {
                        if (viewMenuEl && !viewMenuEl.contains(ev.target as Node) && ev.target !== viewBtn) {
                            viewMenuEl.remove();
                            viewMenuEl = null;
                            document.removeEventListener('click', closeOnOutside);
                        }
                    };
                    setTimeout(() => document.addEventListener('click', closeOnOutside), 10);
                });
            }

            // Sorting buttons
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

            // External symbol change listener
            symbolChangeListeners.push((newSym) => {
                activeSymbol = newSym;
                renderTable();
                renderAssetHeader();
                renderDetailsContent();
                fetchCandlesForActiveSymbol();
            });

            // ── Header Controls Listeners ─────────────────────────────────────────

            // 1. My Watchlist Dropdown Popover
            let dropdownPopoverEl: HTMLElement | null = null;
            const dropdownBtn = header.slot.querySelector('#wl-header-dropdown');
            if (dropdownBtn) {
                dropdownBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (dropdownPopoverEl) {
                        dropdownPopoverEl.remove();
                        dropdownPopoverEl = null;
                        return;
                    }
                    dropdownPopoverEl = document.createElement('div');
                    dropdownPopoverEl.className = 'vela-watchlist-menu-popover';
                    dropdownPopoverEl.style.cssText = `
                        position: absolute;
                        left: 14px;
                        top: 44px;
                        z-index: 60;
                        width: 220px;
                        background: #14151b;
                        border: 1px solid rgba(255, 255, 255, 0.12);
                        border-radius: 10px;
                        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65);
                        padding: 6px;
                        font-size: 11px;
                        color: #f0f3fa;
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                    `;
                    dropdownPopoverEl.innerHTML = `
                        <div style="padding: 6px 10px; font-weight: 600; color: #848e9c; text-transform: uppercase; letter-spacing: 0.8px; font-size: 9px;">Watchlists</div>
                        <button id="wl-opt-default" style="all: unset; display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: #f0f3fa; transition: background 0.12s;">
                            <span>My Watchlist</span>
                            <span style="color: #2962ff; font-weight: 700;">✓</span>
                        </button>
                        <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 4px 0;"></div>
                        <button id="wl-opt-new" style="all: unset; display: flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: #f0f3fa; transition: background 0.12s;">
                            <span>+ Create new list...</span>
                        </button>
                        <button id="wl-opt-clear-list" style="all: unset; display: flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: #f6465d; transition: background 0.12s;">
                            <span>Clear watchlist</span>
                        </button>
                    `;
                    dropdownPopoverEl.querySelectorAll('button').forEach(b => {
                        b.addEventListener('mouseenter', () => (b.style.background = 'rgba(255, 255, 255, 0.06)'));
                        b.addEventListener('mouseleave', () => (b.style.background = 'transparent'));
                    });
                    const clearListBtn = dropdownPopoverEl.querySelector('#wl-opt-clear-list');
                    if (clearListBtn) {
                        clearListBtn.addEventListener('click', () => {
                            watchlistItems = [];
                            saveWatchlist();
                            renderTable();
                            if (dropdownPopoverEl) { dropdownPopoverEl.remove(); dropdownPopoverEl = null; }
                        });
                    }
                    const newBtn = dropdownPopoverEl.querySelector('#wl-opt-new');
                    if (newBtn) {
                        newBtn.addEventListener('click', () => {
                            const name = prompt('Enter new watchlist name:', 'My Custom List');
                            if (name) {
                                const span = dropdownBtn.querySelector('span');
                                if (span) span.textContent = name;
                            }
                            if (dropdownPopoverEl) { dropdownPopoverEl.remove(); dropdownPopoverEl = null; }
                        });
                    }
                    root.appendChild(dropdownPopoverEl);
                    const closeOnOut = (ev: MouseEvent) => {
                        if (dropdownPopoverEl && !dropdownPopoverEl.contains(ev.target as Node) && ev.target !== dropdownBtn) {
                            dropdownPopoverEl.remove();
                            dropdownPopoverEl = null;
                            document.removeEventListener('click', closeOnOut);
                        }
                    };
                    setTimeout(() => document.addEventListener('click', closeOnOut), 10);
                });
            }

            // 2. Header Add Button (+)
            const addBtn = header.slot.querySelector('#wl-header-add');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    if (wsInstance && typeof (wsInstance as any).symbolPicker?.open === 'function') {
                        (wsInstance as any).symbolPicker.open();
                    } else if (searchInput) {
                        searchInput.focus();
                        searchInput.style.outline = '2px solid rgba(255, 255, 255, 0.4)';
                        setTimeout(() => { if (searchInput) searchInput.style.outline = 'none'; }, 1200);
                    }
                });
            }

            // 3. Header More Options Button (⋮)
            let morePopoverEl: HTMLElement | null = null;
            const moreBtn = header.slot.querySelector('#wl-header-more');
            if (moreBtn) {
                moreBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (morePopoverEl) {
                        morePopoverEl.remove();
                        morePopoverEl = null;
                        return;
                    }
                    morePopoverEl = document.createElement('div');
                    morePopoverEl.className = 'vela-watchlist-menu-popover';
                    morePopoverEl.style.cssText = `
                        position: absolute;
                        right: 44px;
                        top: 44px;
                        z-index: 60;
                        width: 200px;
                        background: #14151b;
                        border: 1px solid rgba(255, 255, 255, 0.12);
                        border-radius: 10px;
                        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65);
                        padding: 6px;
                        font-size: 11px;
                        color: #f0f3fa;
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                    `;
                    morePopoverEl.innerHTML = `
                        <button id="wl-opt-sort-az" style="all: unset; display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: #f0f3fa; transition: background 0.12s;">
                            <span>Sort alphabetically (A-Z)</span>
                        </button>
                        <button id="wl-opt-sort-pct" style="all: unset; display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: #f0f3fa; transition: background 0.12s;">
                            <span>Sort by % change</span>
                        </button>
                        <button id="wl-opt-sort-price" style="all: unset; display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: #f0f3fa; transition: background 0.12s;">
                            <span>Sort by price</span>
                        </button>
                        <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 4px 0;"></div>
                        <button id="wl-opt-reset-official" style="all: unset; display: flex; align-items: center; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: #f0f3fa; transition: background 0.12s;">
                            <span>Reset to official 8 pairs</span>
                        </button>
                    `;
                    morePopoverEl.querySelectorAll('button').forEach(b => {
                        b.addEventListener('mouseenter', () => (b.style.background = 'rgba(255, 255, 255, 0.06)'));
                        b.addEventListener('mouseleave', () => (b.style.background = 'transparent'));
                    });
                    const sortAzBtn = morePopoverEl.querySelector('#wl-opt-sort-az');
                    if (sortAzBtn) {
                        sortAzBtn.addEventListener('click', () => {
                            sortKey = 'symbol';
                            sortDir = 'asc';
                            renderTable();
                            if (morePopoverEl) { morePopoverEl.remove(); morePopoverEl = null; }
                        });
                    }
                    const sortPctBtn = morePopoverEl.querySelector('#wl-opt-sort-pct');
                    if (sortPctBtn) {
                        sortPctBtn.addEventListener('click', () => {
                            sortKey = 'changePercent';
                            sortDir = 'desc';
                            renderTable();
                            if (morePopoverEl) { morePopoverEl.remove(); morePopoverEl = null; }
                        });
                    }
                    const sortPriceBtn = morePopoverEl.querySelector('#wl-opt-sort-price');
                    if (sortPriceBtn) {
                        sortPriceBtn.addEventListener('click', () => {
                            sortKey = 'price';
                            sortDir = 'desc';
                            renderTable();
                            if (morePopoverEl) { morePopoverEl.remove(); morePopoverEl = null; }
                        });
                    }
                    const resetOfficialBtn = morePopoverEl.querySelector('#wl-opt-reset-official');
                    if (resetOfficialBtn) {
                        resetOfficialBtn.addEventListener('click', () => {
                            watchlistItems = [...DEFAULT_WATCHLIST];
                            sortKey = 'manual';
                            saveWatchlist();
                            renderTable();
                            renderAssetHeader();
                            renderDetailsContent();
                            syncBinancePrices();
                            if (morePopoverEl) { morePopoverEl.remove(); morePopoverEl = null; }
                        });
                    }
                    root.appendChild(morePopoverEl);
                    const closeOnOut = (ev: MouseEvent) => {
                        if (morePopoverEl && !morePopoverEl.contains(ev.target as Node) && ev.target !== moreBtn) {
                            morePopoverEl.remove();
                            morePopoverEl = null;
                            document.removeEventListener('click', closeOnOut);
                        }
                    };
                    setTimeout(() => document.addEventListener('click', closeOnOut), 10);
                });
            }

            // 4. Header Expand Button Toggle (⤢)
            const expandBtn = header.slot.querySelector('#wl-header-expand');
            if (expandBtn) {
                let expanded = false;
                expandBtn.addEventListener('click', () => {
                    expanded = !expanded;
                    const panel = (body.closest('.vela-panel') || body.closest('.vela-side-panel')) as HTMLElement;
                    if (panel) {
                        panel.style.width = expanded ? '680px' : '340px';
                        panel.style.minWidth = expanded ? '680px' : '280px';
                    }
                    expandBtn.title = expanded ? 'Collapse panel' : 'Expand panel';
                    expandBtn.innerHTML = expanded
                        ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>`
                        : `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`;
                });
            }

            // Set initial compact width on panel
            const initialPanel = (body.closest('.vela-panel') || body.closest('.vela-side-panel')) as HTMLElement;
            if (initialPanel) {
                initialPanel.style.width = '340px';
            }

            // Initial Mount Render
            renderTable();
            renderAssetHeader();
            renderDetailsContent();

            // Initial Data Fetch
            syncBinancePrices();
            fetchCandlesForActiveSymbol();

            // Periodic Poll (every 10s)
            const timer = setInterval(() => {
                syncBinancePrices();
            }, 10000);

            return () => {
                clearInterval(timer);
            };
        }
    });
}
