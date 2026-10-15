// Symbol picker — official 1:1 replica of the vela.luxalgo.com symbol search dialog
// 2-column architecture (Left: search + tabs + venue filter + symbols list; Right: 280px inspector).
import type { SymbolDescriptor } from '../core/ports/DataProvider';
import { Dialog } from '../ui/components/dialog';
import { injectStyles } from '../ui/styles';
import { iconEl } from '../ui/icons';
import { tickerIconEl, baseOf } from './symbol-icon';
import { symbolRanking, symbolFavorite } from './contributions';
import { isGroupRow, groupKeyOf, groupMembers, defaultMemberOf } from '../data/symbol-groups';

/** First occurrence wins, keyed by venue+ticker — a ranking hook may inject an entry
 *  that also exists later in the pool; the injected one keeps position AND data. */
function dedupeSymbols(list: readonly SymbolDescriptor[]): SymbolDescriptor[] {
    const seen = new Set<string>();
    const out: SymbolDescriptor[] = [];
    for (const s of list) {
        const key = `${(s.prefix ?? s.provider ?? '').toLowerCase()}:${s.ticker.toUpperCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
    }
    return out;
}

/**
 * Fold GROUPED listings (futures roots): walking top-down, drop a MEMBER row whose
 * group's own row already appeared ABOVE it — the group stands for its members.
 */
export function foldGroups(list: readonly SymbolDescriptor[]): SymbolDescriptor[] {
    const groupsAbove = new Set<string>();
    const out: SymbolDescriptor[] = [];
    for (const s of list) {
        if (isGroupRow(s)) {
            groupsAbove.add(groupKeyOf(s));
            out.push(s);
        } else if (s.group == null || !groupsAbove.has(groupKeyOf(s))) out.push(s);
    }
    return out;
}

const GLOBAL_ASSETS: SymbolDescriptor[] = [
    // Top Stocks
    { ticker: 'NVDA', description: 'NVIDIA Corporation', type: 'stock', prefix: 'NASDAQ' },
    { ticker: 'AAPL', description: 'Apple Inc.', type: 'stock', prefix: 'NASDAQ' },
    { ticker: 'TSLA', description: 'Tesla, Inc.', type: 'stock', prefix: 'NASDAQ' },
    { ticker: 'MSFT', description: 'Microsoft Corporation', type: 'stock', prefix: 'NASDAQ' },
    { ticker: 'AMZN', description: 'Amazon.com, Inc.', type: 'stock', prefix: 'NASDAQ' },
    { ticker: 'GOOGL', description: 'Alphabet Inc. (Class A)', type: 'stock', prefix: 'NASDAQ' },
    { ticker: 'META', description: 'Meta Platforms, Inc.', type: 'stock', prefix: 'NASDAQ' },
    { ticker: 'AMD', description: 'Advanced Micro Devices, Inc.', type: 'stock', prefix: 'NASDAQ' },
    // Top ETFs
    { ticker: 'SPY', description: 'SPDR S&P 500 ETF Trust', type: 'etf', prefix: 'AMEX' },
    { ticker: 'QQQ', description: 'Invesco QQQ Trust', type: 'etf', prefix: 'NASDAQ' },
    { ticker: 'VOO', description: 'Vanguard S&P 500 ETF', type: 'etf', prefix: 'AMEX' },
    { ticker: 'IVV', description: 'iShares Core S&P 500 ETF', type: 'etf', prefix: 'AMEX' },
    { ticker: 'SMH', description: 'VanEck Semiconductor ETF', type: 'etf', prefix: 'NASDAQ' },
    { ticker: 'IWM', description: 'iShares Russell 2000 ETF', type: 'etf', prefix: 'AMEX' },
    { ticker: 'DIA', description: 'SPDR Dow Jones Industrial Average ETF', type: 'etf', prefix: 'AMEX' },
    // Forex
    { ticker: 'EURUSD', description: 'Euro / US Dollar', type: 'forex', prefix: 'Forex' },
    { ticker: 'USDJPY', description: 'US Dollar / Japanese Yen', type: 'forex', prefix: 'Forex' },
    { ticker: 'GBPUSD', description: 'British Pound / US Dollar', type: 'forex', prefix: 'Forex' },
    { ticker: 'AUDUSD', description: 'Australian Dollar / US Dollar', type: 'forex', prefix: 'Forex' },
    { ticker: 'USDCAD', description: 'US Dollar / Canadian Dollar', type: 'forex', prefix: 'Forex' },
    // Commodities
    { ticker: 'XAUUSD', description: 'Gold / US Dollar', type: 'commodity', prefix: 'Commodities' },
    { ticker: 'XAGUSD', description: 'Silver / US Dollar', type: 'commodity', prefix: 'Commodities' },
    { ticker: 'USOIL', description: 'Crude Oil WTI', type: 'commodity', prefix: 'Commodities' },
];

/** The pinned head of the empty-query list (majors first, like the reference picker). */
const TOP_TICKERS = ['BTCUSDT', 'NVDA', 'AAPL', 'EURUSD', 'USDJPY', 'VOO', 'IVV', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'];

/** Deterministic avatar hue from a ticker (self-contained — no external icon service). */
export function avatarColor(ticker: string): string {
    let h = 0;
    for (let i = 0; i < ticker.length; i++) h = (h * 31 + ticker.charCodeAt(i)) % 360;
    return `hsl(${h}, 42%, 38%)`;
}

/**
 * Split a query into an optional venue SCOPE and a search TERM.
 */
function parseQuery(raw: string, venues: readonly string[]): { scope: string | null; term: string } {
    const m = raw.match(/^\s*([^\s:]+)\s*[:\s]\s*(.*)$/);
    if (m) {
        const t = m[1]!.toLowerCase();
        const scope = venues.includes(t) ? t : onlyOne(venues.filter((v) => v.startsWith(t)));
        if (scope) return { scope, term: m[2]!.trim() };
    }
    return { scope: null, term: raw.trim() };
}

function onlyOne<T>(matches: readonly T[]): T | null {
    return matches.length === 1 ? matches[0]! : null;
}

/** The row's venue label — the LISTING prefix the data declares, else the provider name. */
const venueOf = (s: SymbolDescriptor): string | undefined => s.prefix ?? s.provider;

export function filterSymbols(list: readonly SymbolDescriptor[], query: string, limit = 100, top: readonly string[] | false = TOP_TICKERS): SymbolDescriptor[] {
    const venues = [...new Set(list.flatMap((s) => [venueOf(s)?.toLowerCase(), s.provider?.toLowerCase()]).filter((p): p is string => !!p))];
    const { scope, term } = parseQuery(query, venues);
    const pool = scope ? list.filter((s) => venueOf(s)?.toLowerCase() === scope || s.provider?.toLowerCase() === scope) : list;
    const q = term.toUpperCase();
    if (!q) {
        if (scope) return [...pool].sort((a, b) => a.ticker.localeCompare(b.ticker)).slice(0, limit);
        if (top === false) return pool.slice(0, limit);
        const byTicker = new Map(pool.map((s) => [s.ticker.toUpperCase(), s]));
        const pinned = top.map((t) => byTicker.get(t)).filter((s): s is SymbolDescriptor => s !== undefined);
        const rest = pool.filter((s) => !top.includes(s.ticker.toUpperCase()));
        return [...pinned, ...rest].slice(0, limit);
    }
    const qLower = term.toLowerCase();
    const prefix: SymbolDescriptor[] = [];
    const substr: SymbolDescriptor[] = [];
    const desc: SymbolDescriptor[] = [];
    const venue: SymbolDescriptor[] = [];
    for (const s of pool) {
        const t = s.ticker.toUpperCase();
        if (t.startsWith(q)) prefix.push(s);
        else if (t.includes(q)) substr.push(s);
        else if ((s.description ?? '').toUpperCase().includes(q)) desc.push(s);
        else if (!scope && (venueOf(s)?.toLowerCase().includes(qLower) || s.provider?.toLowerCase().includes(qLower))) venue.push(s);
        if (prefix.length >= limit) break;
    }
    return [...prefix, ...substr, ...desc, ...venue].slice(0, limit);
}

const STYLE_ID = 'vela-widget-symbolpicker-official';
const CSS = `.quant-chart-chrome .vela-dialog.quant-mobile-picker-sheet[data-quant-dialog="symbols"] { width: var(--mobile-sheet-width); max-width: 100vw; height: var(--mobile-sheet-height); border-radius: 18px 18px 0px 0px; max-height: calc(100dvh - 24px); }
.quant-mobile-picker-sheet :is(.vlx-il-search input, .vela-sp-input) { font-size: 16px; }
.quant-mobile-picker-sheet :is(.vlx-il-rail, .vela-sp-tabs) { scrollbar-width: none; overscroll-behavior-x: contain; flex-flow: row; flex: 0 0 auto; width: 100%; padding: 6px 0px; overflow: auto hidden; }
.quant-mobile-picker-sheet :is(.vlx-il-tab, .vela-sp-tab) { white-space: nowrap; flex: 0 0 auto; min-height: 44px; padding: 8px 12px; font-size: 13px; }
.quant-mobile-picker-sheet :is(.vlx-il-list, .vela-sp-list) { overscroll-behavior: contain; min-height: 0px; max-height: none; padding-bottom: max(16px, env(safe-area-inset-bottom)); flex: 1 1 0%; overflow: hidden auto; }
.quant-mobile-picker-sheet .vela-sp-head { flex: 0 0 auto; padding: 14px 16px 0px; }
.quant-chart-chrome .quant-mobile-picker-sheet:has(.vela-sp-head) .vela-dialog-body { padding: 0px; }
.quant-mobile-picker-sheet .vela-sp-row { min-height: 56px; }
.quant-mobile-picker-sheet .vela-sp-main { min-width: 0px; }
.quant-mobile-picker-sheet .vela-sp-desc { text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
.quant-mobile-picker-sheet .vela-sp-badge { flex: 0 0 auto; }
.quant-chart-chrome :is(.vlx-il-row, .vela-sp-row, .vela-panel-header button, .quant-wsp-dd-item, .quant-wsp-dd-all, .quant-wsp-dd-create, .vela-lp-sync-row) { border-radius: 6px; }
.quant-chart-chrome .vela-sp-list[data-chrome-visible] .vela-sp-row[data-highlighted] { background: 0px 0px; }
.quant-chart-chrome .qsp-filter-menu.quant-chrome-hover { position: absolute; }
.quant-chart-chrome :is(.vela-menu:not(.quant-drawing-menu), .vela-popover, .vela-lp, .vlx-il-fav-menu, .vela-pro-editor-menu, .quant-wsp-dd-kebab-menu, .quant-wsp-panel, .qsp-filter-menu, .quant-trade-menu):not([hidden]), .quant-joined-menu-positioner[data-side="bottom"] > [data-slot="dropdown-menu-content"][data-open], .quant-chrome-join svg { animation: menu-reveal var(--menu-reveal-duration) var(--menu-reveal-easing) backwards; }
@media (prefers-reduced-motion: reduce) { .quant-chart-chrome :is(.vela-menu:not(.quant-drawing-menu), .vela-popover, .vela-lp, .vlx-il-fav-menu, .vela-pro-editor-menu, .quant-wsp-dd-kebab-menu, .quant-wsp-panel, .qsp-filter-menu, .quant-trade-menu):not([hidden]), .quant-joined-menu-positioner[data-side="bottom"] > [data-slot="dropdown-menu-content"][data-open], .quant-chrome-join svg { animation: auto ease 0s 1 normal none running none; }; }
.vela-sp-head { flex: 0 0 auto; padding: var(--vela-space-4) var(--vela-space-4) 0; }
.vela-sp-searchrow { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0px 12px; background: var(--vela-surface-elev); border: 1px solid var(--vela-border); border-radius: 8px; }
.vela-sp-searchrow:focus-within { border-color: var(--vela-border-strong); }
.vela-sp-searchrow .vela-icon { color: var(--vela-fg-muted); }
.vela-sp-input { flex: 1 1 0%; background: transparent; color: var(--vela-fg); border-width: medium; border-style: none; border-color: currentcolor; border-image: none; font-size: 14px; outline: none; text-transform: uppercase; }
.vela-sp-input::placeholder { text-transform: none; }
.vela-sp-tabs { display: flex; gap: 14px; margin: 12px 2px 0px; border-bottom: 1px solid var(--vela-border); padding-bottom: 8px; }
[data-layout="mobile"] .vela-sp-tabs { overflow-x: auto; scrollbar-width: none; gap: 6px; }
[data-layout="mobile"] .vela-sp-tabs::-webkit-scrollbar { display: none; }
[data-layout="mobile"] .vela-sp-tab { flex: 0 0 auto; padding: 7px 10px; }
[data-layout="mobile"] .vela-sp-list { flex: 1 1 auto; max-height: none; margin-bottom: 0px; }
.vela-sp-tab { padding: 3px 10px; border-radius: 5px; cursor: pointer; color: var(--vela-fg-muted); font-size: 13px; font-weight: 600; }
.vela-sp-tab:hover { color: var(--vela-fg); }
.vela-sp-tab[data-active] { background: var(--vela-selected-bg); color: var(--vela-selected-fg); }
.vela-sp-list { min-height: 0px; margin: var(--vela-space-2) var(--vela-space-4) var(--vela-space-4); max-height: 46vh; overflow: auto; }
.vela-sp-list::-webkit-scrollbar { width: 8px; }
.vela-sp-list::-webkit-scrollbar-thumb { background-image:; background-position-x:; background-position-y:; background-size:; background-repeat:; background-attachment:; background-origin:; background-color:; border-radius: 4px; border: 2px solid transparent; background-clip: padding-box; }
.vela-sp-row { display: flex; align-items: center; gap: 12px; padding: 7px 10px; border-radius: 8px; cursor: pointer; }
.vela-sp-row:hover, .vela-sp-row[data-highlighted] { background: var(--vela-hover); }
.vela-sp-avatar { width: 28px; height: 28px; border-radius: 50%; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; color: var(--vela-fg-on-fill); font-size: var(--vela-font-size-md); font-weight: 700; }
.vela-sp-main { flex: 1 1 0%; min-width: 0px; display: flex; flex-direction: column; gap: 1px; }
.vela-sp-ticker { font-weight: 700; color: var(--vela-fg-bright); font-size: 14px; text-transform: uppercase; }
.vela-sp-desc { color: var(--vela-fg-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vela-sp-badge { flex: 0 0 auto; padding: 2px 8px; border-radius: 4px; background: var(--vela-surface-elev); border: 1px solid var(--vela-border); color: var(--vela-fg-muted); font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.vela-sp-badge[data-p="binance"] { color: rgb(240, 185, 11); }
.vela-sp-badge[data-p="hyperliquid"] { color: rgb(80, 210, 193); }
.vela-sp-empty { padding: var(--vela-space-3); color: var(--vela-fg-muted); text-align: center; }
.vela-sp-expander { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 5px; cursor: pointer; color: var(--vela-fg-muted); }
.vela-sp-expander:hover { background: var(--vela-surface-elev); color: var(--vela-fg); }
.vela-sp-row[data-member] { padding-left: 34px; }
.vela-dialog[data-quant-dialog="symbols"] { --q-mono: ui-monospace,"SF Mono","Cascadia Mono","JetBrains Mono",Menlo,Consolas,monospace; width: min(94vw, 860px); max-width: min(94vw, 860px); height: min(76vh, 640px); max-height: min(76vh, 640px); }
.vela-dialog[data-quant-dialog="symbols"] > .vela-dialog-header { display: none; }
.vela-dialog[data-quant-dialog="symbols"][data-qsp-inspector="off"] { width: min(94vw, 600px); max-width: min(94vw, 600px); }
html[data-qsp-pointer-idle], html[data-qsp-pointer-idle] * { cursor: none !important; }
html[data-qsp-pointer-idle] .vela-dialog[data-quant-dialog="symbols"] .vela-sp-row:hover:not([data-highlighted]) { background: transparent; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-head { padding: 16px 16px 0px; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-searchrow { height: 44px; gap: 10px; padding: 0px 8px 0px 14px; border: 1px solid transparent; border-radius: 12px; background: color-mix(in srgb,var(--vela-fg) 5%,transparent); transition: background var(--vela-dur-fast,90ms),border-color var(--vela-dur-fast,90ms),box-shadow 160ms; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-searchrow:hover { background: color-mix(in srgb,var(--vela-fg) 7%,transparent); }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-searchrow:focus-within { background: var(--vela-surface); border-color: var(--vela-border-strong); box-shadow: 0 0 0 4px color-mix(in srgb,var(--vela-fg) 6%,transparent); }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-searchrow .vela-icon { font-size: 15px; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-input { font-size: 14.5px; letter-spacing: 0.01em; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-input::placeholder { color: var(--vela-fg-muted); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-clear { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; cursor: pointer; color: var(--vela-fg-muted); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-clear:hover { color: var(--vela-fg-bright); background: var(--vela-hover); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-clear[hidden] { display: none; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-clear svg { width: 14px; height: 14px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-tabbar { position: relative; display: flex; align-items: center; gap: 6px; margin: 6px -16px 0px; padding: 0px 16px 0px 10px; border-bottom: 1px solid var(--vela-border); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-tabbar > .vela-sp-tabs { flex: 1 1 auto; min-width: 0px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter { position: relative; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0px 8px 0px 9px; border-radius: 7px; cursor: pointer; font-size: 12.5px; font-weight: 500; color: var(--vela-fg-muted); transition: background var(--vela-dur-fast,90ms),color var(--vela-dur-fast,90ms); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter::before { content: ""; position: absolute; left: -6px; top: 6px; bottom: 6px; width: 1px; background: var(--vela-border); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter:hover, .vela-dialog[data-quant-dialog="symbols"] .qsp-filter[aria-expanded="true"] { background: var(--vela-hover); color: var(--vela-fg); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter[data-on] { color: var(--vela-fg-bright); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter[hidden] { display: none; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter:focus-visible { outline: 2px solid var(--vela-focus); outline-offset: 1px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter > svg { width: 12px; height: 12px; opacity: 0.7; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter > .qsp-filter-icon { width: 13px; height: 13px; opacity: 0.8; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter-menu { position: absolute; right: 16px; top: calc(100% + 6px); z-index: 5; box-sizing: border-box; min-width: 210px; max-height: 300px; overflow: auto; padding: 4px; border-radius: 10px; border: 1px solid var(--vela-border-strong); background: var(--vela-surface); box-shadow: var(--vela-shadow-dialog,0 12px 32px rgba(0,0,0,.35)); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter-menu[hidden] { display: none; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter-option { box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px; border-radius: 6px; cursor: pointer; font-size: 12.5px; color: var(--vela-fg); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter-option:hover { background: var(--vela-hover); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter-option[aria-selected="true"] { color: var(--vela-fg-bright); font-weight: 600; background: color-mix(in srgb,var(--vela-fg) 6%,transparent); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter-option:focus-visible { outline: 2px solid var(--vela-focus); outline-offset: -2px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter-venue { justify-content: flex-start; gap: 7px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter-sep { height: 1px; margin: 4px 6px; background: var(--vela-border); }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-tabs { position: relative; gap: 2px; margin: 0px 0px -1px; padding: 0px; border-width: medium; border-style: none; border-color: currentcolor; border-image: none; border-radius: 0px; background: none; overflow: auto hidden; scrollbar-width: none; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-tabs::-webkit-scrollbar { display: none; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-tab { flex: 1 0 auto; display: inline-flex; align-items: center; justify-content: center; height: 42px; padding: 0px 10px; border-radius: 0px; font-size: 13px; font-weight: 500; color: var(--vela-fg-muted); transition: color 160ms; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-tab[hidden] { display: none; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-tab:hover { color: var(--vela-fg); }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-tab[data-active] { background: none; color: var(--vela-fg-bright); }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-tab:focus-visible { outline: 2px solid var(--vela-focus); outline-offset: -6px; border-radius: 8px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-tab-pill { position: absolute; left: 0px; bottom: 0px; height: 2px; border-radius: 2px 2px 0px 0px; pointer-events: none; background: var(--vela-fg-bright); transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1), width 240ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-tab-pill:not([data-ready]) { transition: none; }
@media (prefers-reduced-motion: reduce) { .vela-dialog[data-quant-dialog="symbols"] .qsp-tab-pill { transition: none; }; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-main { display: flex; flex: 1 1 auto; min-height: 0px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-main > .vela-sp-list { flex: 1 1 auto; min-width: 0px; max-height: none; margin: 0px; padding: 6px 8px 8px 12px; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-row { position: relative; padding: 8px 12px; gap: 12px; border-radius: 8px; content-visibility: auto; contain-intrinsic-size: auto 40px; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-row[data-highlighted] { background: var(--vela-hover); }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-avatar { width: 28px; height: 28px; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-ticker { font-size: 13.5px; font-weight: 600; letter-spacing: 0.005em; font-variant-numeric: tabular-nums; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-desc { font-size: 12px; margin-top: 1px; }
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-badge { display: none; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-meta { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; min-width: 72px; text-align: right; line-height: 1.25; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-venue { display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-venue-logo { flex: 0 0 auto; width: 14px; height: 14px; border-radius: 3px; object-fit: cover; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-meta-venue { font-size: 12px; font-weight: 500; color: var(--vela-fg); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-meta-market { font-size: 11px; color: var(--vela-fg-muted); }
.vela-dialog[data-quant-dialog="symbols"]:not([data-qsp-tab="all"]) .qsp-meta-market { display: none; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-logo { flex: 0 0 auto; box-sizing: border-box; width: 18px; height: 18px; border-radius: 50%; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; background: var(--vela-surface-elev); color: var(--vela-fg); font-size: 9px; font-weight: 700; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-logo img { display: block; width: 100%; height: 100%; object-fit: cover; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-foot { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-top: 1px solid var(--vela-border); color: var(--vela-fg-muted); font-size: 11px; white-space: nowrap; overflow: hidden; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-key { display: inline-flex; align-items: center; gap: 5px; padding: 3px 6px; border-radius: 6px; cursor: pointer; color: var(--vela-fg-muted); transition: background var(--vela-dur-fast,90ms),color var(--vela-dur-fast,90ms); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-key:hover { background: var(--vela-hover); color: var(--vela-fg-bright); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-key:focus-visible { outline: 2px solid var(--vela-focus); outline-offset: -1px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-key + .qsp-key[data-pair] { margin-left: -6px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-foot kbd { display: inline-block; min-width: 8px; text-align: center; padding: 2px 5px; border-radius: 4px; border-top-color:; border-top-style:; border-top-width:; border-right-color:; border-right-style:; border-right-width:; border-bottom-color:; border-bottom-style:; border-left-color:; border-left-style:; border-left-width:; border-image-source:; border-image-slice:; border-image-width:; border-image-outset:; border-image-repeat:; border-bottom-width: 2px; background: var(--vela-surface-elev); color: var(--vela-fg); font: 600 10px/1.2 var(--q-mono); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-key:active kbd { border-bottom-width: 1px; transform: translateY(1px); }
@media (hover: none) { .vela-dialog[data-quant-dialog="symbols"] .qsp-foot { display: none; }; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-inspector { display: flex; flex-direction: column; flex: 0 0 auto; width: 280px; min-height: 0px; overflow: auto; border-left: 1px solid var(--vela-border); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-inspector > * { flex: 0 0 auto; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-hero { display: grid; grid-template-columns: 40px minmax(0px, 1fr); align-items: center; gap: 2px 12px; padding: 20px 20px 16px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-hero .qsp-logo { grid-row: 1 / span 2; width: 40px; height: 40px; font-size: 15px; box-shadow: 0 0 0 1px var(--vela-border); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-ticker { font-size: 17px; font-weight: 650; line-height: 1.2; letter-spacing: 0.005em; font-variant-numeric: tabular-nums; color: var(--vela-fg-bright); overflow-wrap: anywhere; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-desc { color: var(--vela-fg-muted); font-size: 12px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-desc:empty { display: none; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-facts { display: grid; grid-template-columns: auto 1fr; gap: 10px 14px; margin: 0px; padding: 2px 20px 16px; font-size: 12px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-facts:empty { display: none; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-facts dt { color: var(--vela-fg-muted); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-facts dd { margin: 0px; text-align: right; color: var(--vela-fg); font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-section { padding: 14px 20px; border-top: 1px solid var(--vela-border); font-size: 12px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-section:empty { display: none; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-title { margin-bottom: 6px; color: var(--vela-fg-muted); font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-section.qsp-quote { padding: 0px 20px 16px; border-top-width: medium; border-top-style: none; border-top-color: currentcolor; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-quote-line { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-quote-price { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; color: var(--vela-fg-bright); font-variant-numeric: tabular-nums; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-quote-change { font-size: 12.5px; font-weight: 550; font-variant-numeric: tabular-nums; color: var(--vela-fg-muted); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-quote-change[data-dir="up"] { color: var(--vela-up,#22ab94); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-quote-change[data-dir="down"] { color: var(--vela-down,#f23645); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-quote[data-loading] .qsp-quote-price { width: 120px; height: 26px; border-radius: 6px; color: transparent; background-image:; background-position-x:; background-position-y:; background-repeat:; background-attachment:; background-origin:; background-clip:; background-color:; background-size: 200% 100%; animation: 1.2s linear 0s infinite normal none running qsp-shimmer; }
@keyframes qsp-shimmer { 0% { background-position: 200% 0px; }
  100% { background-position: 0px 0px; }; }
@media (prefers-reduced-motion: reduce) { .vela-dialog[data-quant-dialog="symbols"] .qsp-quote[data-loading] .qsp-quote-price { animation: auto ease 0s 1 normal none running none; }; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-quote-status { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11.5px; color: var(--vela-fg-muted); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-quote-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--vela-fg-muted); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-quote-status[data-status="open"]::before { background: var(--vela-up,#22ab94); box-shadow: 0 0 0 3px color-mix(in srgb,var(--vela-up,#22ab94) 22%,transparent); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-quote-status[data-status="pre"]::before, .vela-dialog[data-quant-dialog="symbols"] .qsp-quote-status[data-status="post"]::before { background: rgb(232, 163, 60); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-listing { box-sizing: border-box; display: grid; grid-template-columns: 18px minmax(0px, 1fr) 28px 80px; align-items: center; column-gap: 9px; width: calc(100% + 12px); padding: 5px 6px; margin: 0px -6px; border-radius: 6px; cursor: pointer; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-listing:hover { background: var(--vela-hover); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-listing:focus-visible { outline: 2px solid var(--vela-focus); outline-offset: -2px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-listing-ticker { flex: 1 1 0%; min-width: 0px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; color: var(--vela-fg-bright); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-listing-kind { font-size: 10.5px; font-weight: 500; color: var(--vela-fg-muted); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-listing-venue { justify-content: flex-start; gap: 7px; min-width: 0px; overflow: hidden; white-space: nowrap; font-size: 11px; font-weight: 500; color: var(--vela-fg-muted); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-listing-venue .qsp-venue-logo { width: 13px; height: 13px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-action { box-sizing: border-box; flex: 0 0 auto; position: sticky; bottom: 10px; margin: auto 20px 10px; display: flex; align-items: center; justify-content: center; gap: 8px; height: 32px; border-radius: 7px; cursor: pointer; background: var(--vela-fg-bright); color: var(--vela-surface); font-weight: 600; font-size: 12.5px; box-shadow: 0 0 0 6px var(--vela-surface); transition: opacity var(--vela-dur-fast,90ms); }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-action:hover { opacity: 0.88; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-action:focus-visible { outline: 2px solid var(--vela-focus); outline-offset: 2px; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-action kbd { font: 600 10px/1 var(--q-mono); padding: 2px 5px; border-radius: 4px; border: 1px solid; opacity: 0.5; }
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-empty { margin: auto; padding: 24px; text-align: center; color: var(--vela-fg-muted); font-size: 12px; line-height: 1.5; }
[data-layout="mobile"] .vela-dialog[data-quant-dialog="symbols"] { width: 100%; max-width: none; height: auto; max-height: none; border-radius: 0px; }
[data-layout="mobile"] .vela-dialog[data-quant-dialog="symbols"] > .vela-dialog-header { display: flex; }
[data-layout="mobile"] .vela-dialog[data-quant-dialog="symbols"] .qsp-inspector, [data-layout="mobile"] .vela-dialog[data-quant-dialog="symbols"] .qsp-foot { display: none; }

/* Theme integration & custom scrollbar */
.vela-dialog[data-quant-dialog="symbols"] {
    background: var(--vela-surface, #151619);
    border: 1px solid var(--vela-border-strong, #34353b);
    border-radius: 10px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
}
.vela-dialog[data-quant-dialog="symbols"] button {
    all: unset;
    box-sizing: border-box;
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-tabs {
    border-bottom: 1px solid var(--vela-border);
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-tab {
    all: unset;
    box-sizing: border-box;
    flex: 1 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 42px;
    padding: 0px 10px;
    border-radius: 0px;
    font-size: 13px;
    font-weight: 500;
    color: var(--vela-fg-muted);
    cursor: pointer;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    transition: color 160ms;
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-tab:hover {
    color: var(--vela-fg);
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-tab[data-active] {
    background: none !important;
    color: var(--vela-fg-bright);
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter {
    all: unset;
    box-sizing: border-box;
    position: relative;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0px 8px 0px 9px;
    border-radius: 7px;
    cursor: pointer;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--vela-fg-muted);
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    transition: background var(--vela-dur-fast,90ms),color var(--vela-dur-fast,90ms);
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter::before {
    content: "";
    position: absolute;
    left: -6px;
    top: 6px;
    bottom: 6px;
    width: 1px;
    background: var(--vela-border);
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter:hover,
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter[aria-expanded="true"] {
    background: var(--vela-hover) !important;
    color: var(--vela-fg);
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter-menu {
    position: absolute;
    right: 16px;
    top: calc(100% + 6px);
    z-index: 50;
    box-sizing: border-box;
    min-width: 210px;
    max-height: 300px;
    overflow: auto;
    padding: 4px;
    border-radius: 10px;
    border: 1px solid var(--vela-border-strong);
    background: var(--vela-surface);
    box-shadow: 0 12px 32px rgba(0,0,0,.45);
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter-option {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12.5px;
    color: var(--vela-fg);
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter-option:hover {
    background: var(--vela-hover) !important;
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-filter-option[aria-selected="true"] {
    color: var(--vela-fg-bright);
    font-weight: 600;
    background: color-mix(in srgb,var(--vela-fg) 6%,transparent) !important;
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-listing {
    all: unset;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 18px minmax(0px, 1fr) 28px 80px;
    align-items: center;
    column-gap: 9px;
    width: calc(100% + 12px);
    padding: 5px 6px;
    margin: 0px -6px;
    border-radius: 6px;
    cursor: pointer;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-listing:hover {
    background: var(--vela-hover) !important;
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-action {
    all: unset;
    box-sizing: border-box;
    flex: 0 0 auto;
    position: sticky;
    bottom: 10px;
    margin: auto 20px 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 32px;
    border-radius: 7px;
    cursor: pointer;
    background: var(--vela-fg-bright) !important;
    color: var(--vela-surface) !important;
    font-weight: 600;
    font-size: 12.5px;
    box-shadow: 0 0 0 6px var(--vela-surface);
    transition: opacity var(--vela-dur-fast,90ms);
    border: none !important;
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-action:hover {
    opacity: 0.88;
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-key {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 6px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--vela-fg-muted);
    background: transparent !important;
    border: none !important;
    transition: background var(--vela-dur-fast,90ms),color var(--vela-dur-fast,90ms);
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-key:hover {
    background: var(--vela-hover) !important;
    color: var(--vela-fg-bright);
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-list::-webkit-scrollbar {
    width: 6px;
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-list::-webkit-scrollbar-thumb {
    background: var(--vela-scroll, rgba(255, 255, 255, 0.15));
    border-radius: 3px;
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-list::-webkit-scrollbar-track {
    background: transparent;
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-inspector::-webkit-scrollbar {
    width: 6px;
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-inspector::-webkit-scrollbar-thumb {
    background: var(--vela-scroll, rgba(255, 255, 255, 0.15));
    border-radius: 3px;
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-star {
    all: unset;
    flex: none;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    color: var(--vela-fg-muted);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease, color 0.15s ease;
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-star * {
    pointer-events: none;
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-row:hover .vela-sp-star {
    opacity: 0.7;
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-star[data-on="1"] {
    opacity: 1;
    color: #e5a00d;
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-star:hover {
    color: #ffd166;
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-star {
    opacity: 0.6;
    margin-left: auto;
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-star:hover {
    opacity: 1;
    color: #ffd166;
}
.vela-dialog[data-quant-dialog="symbols"] .qsp-insp-star[data-on="1"] {
    opacity: 1;
    color: #e5a00d;
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-expander {
    all: unset;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 5px;
    cursor: pointer;
    color: var(--vela-fg-muted);
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-expander:hover {
    background: var(--vela-surface-elev);
    color: var(--vela-fg);
}
.vela-dialog[data-quant-dialog="symbols"] .vela-sp-row[data-member] {
    padding-left: 34px;
}
`;

export interface SymbolPickerOptions {
    onSelect: (symbol: string) => void;
    onOpenChange?: (open: boolean) => void;
    host?: HTMLElement;
    iconFor?: (d: SymbolDescriptor) => string | undefined;
}

const PAGE = 100;

const VENUE_LOGOS: Record<string, string> = {
    NASDAQ: 'https://s3-symbol-logo.luxalgo.com/venues/NASDAQ.png',
    AMEX: 'https://s3-symbol-logo.luxalgo.com/venues/AMEX.png',
    NYSE: 'https://s3-symbol-logo.luxalgo.com/venues/NYSE.png',
    BINANCE: 'https://s3-symbol-logo.luxalgo.com/venues/BINANCE.png',
    BATS: 'https://s3-symbol-logo.luxalgo.com/venues/BATS.png',
    COINBASE: 'https://s3-symbol-logo.luxalgo.com/venues/COINBASE.png',
    HYPERLIQUID: 'https://s3-symbol-logo.luxalgo.com/venues/HYPERLIQUID.png',
    'BINANCE.US': 'https://s3-symbol-logo.luxalgo.com/venues/BINANCEUS.png',
    BINANCEUS: 'https://s3-symbol-logo.luxalgo.com/venues/BINANCEUS.png',
};

const VENUE_OPTIONS = [
    { id: 'all', name: 'All venues' },
    { id: 'NASDAQ', name: 'NASDAQ', logo: VENUE_LOGOS.NASDAQ },
    { id: 'AMEX', name: 'AMEX', logo: VENUE_LOGOS.AMEX },
    { id: 'NYSE', name: 'NYSE', logo: VENUE_LOGOS.NYSE },
    { id: 'BINANCE', name: 'Binance', logo: VENUE_LOGOS.BINANCE },
    { id: 'BATS', name: 'BATS', logo: VENUE_LOGOS.BATS },
    { id: 'COINBASE', name: 'Coinbase', logo: VENUE_LOGOS.COINBASE },
    { id: 'HYPERLIQUID', name: 'Hyperliquid', logo: VENUE_LOGOS.HYPERLIQUID },
    { id: 'BINANCEUS', name: 'Binance.US', logo: VENUE_LOGOS.BINANCEUS },
    { id: 'IEXG', name: 'IEXG' },
    { id: 'XCHI', name: 'XCHI' },
];

interface AlternateListing {
    ticker: string;
    kind: string;
    venue: string;
    venueLogo?: string;
    title: string;
}

const COMMON_ALTERNATES: Record<string, AlternateListing[]> = {
    BTC: [
        { ticker: 'BTC-USD', kind: 'Spot', venue: 'Coinbase', venueLogo: VENUE_LOGOS.COINBASE, title: 'BTC / USD' },
        { ticker: 'BTCUSDT.P', kind: 'Perp', venue: 'Binance', venueLogo: VENUE_LOGOS.BINANCE, title: 'BTC / USDT Perpetual' },
        { ticker: 'BTC', kind: 'Perp', venue: 'Hyperliquid', venueLogo: VENUE_LOGOS.HYPERLIQUID, title: 'BTC / USD Perpetual' },
        { ticker: 'BTCUSDC.P', kind: 'Perp', venue: 'Binance', venueLogo: VENUE_LOGOS.BINANCE, title: 'BTC / USDC Perpetual' },
    ],
    ETH: [
        { ticker: 'ETH-USD', kind: 'Spot', venue: 'Coinbase', venueLogo: VENUE_LOGOS.COINBASE, title: 'ETH / USD' },
        { ticker: 'ETHUSDT.P', kind: 'Perp', venue: 'Binance', venueLogo: VENUE_LOGOS.BINANCE, title: 'ETH / USDT Perpetual' },
        { ticker: 'ETH', kind: 'Perp', venue: 'Hyperliquid', venueLogo: VENUE_LOGOS.HYPERLIQUID, title: 'ETH / USD Perpetual' },
        { ticker: 'ETHUSDC.P', kind: 'Perp', venue: 'Binance', venueLogo: VENUE_LOGOS.BINANCE, title: 'ETH / USDC Perpetual' },
    ],
    SOL: [
        { ticker: 'SOL-USD', kind: 'Spot', venue: 'Coinbase', venueLogo: VENUE_LOGOS.COINBASE, title: 'SOL / USD' },
        { ticker: 'SOLUSDT.P', kind: 'Perp', venue: 'Binance', venueLogo: VENUE_LOGOS.BINANCE, title: 'SOL / USDT Perpetual' },
        { ticker: 'SOL', kind: 'Perp', venue: 'Hyperliquid', venueLogo: VENUE_LOGOS.HYPERLIQUID, title: 'SOL / USD Perpetual' },
    ],
    DOGE: [
        { ticker: 'DOGE-USD', kind: 'Spot', venue: 'Coinbase', venueLogo: VENUE_LOGOS.COINBASE, title: 'DOGE / USD' },
        { ticker: 'DOGEUSDT.P', kind: 'Perp', venue: 'Binance', venueLogo: VENUE_LOGOS.BINANCE, title: 'DOGE / USDT Perpetual' },
        { ticker: 'DOGE', kind: 'Perp', venue: 'Hyperliquid', venueLogo: VENUE_LOGOS.HYPERLIQUID, title: 'DOGE / USD Perpetual' },
    ],
    BNB: [
        { ticker: 'BNBUSDT.P', kind: 'Perp', venue: 'Binance', venueLogo: VENUE_LOGOS.BINANCE, title: 'BNB / USDT Perpetual' },
        { ticker: 'BNB', kind: 'Perp', venue: 'Hyperliquid', venueLogo: VENUE_LOGOS.HYPERLIQUID, title: 'BNB / USD Perpetual' },
    ],
    XRP: [
        { ticker: 'XRP-USD', kind: 'Spot', venue: 'Coinbase', venueLogo: VENUE_LOGOS.COINBASE, title: 'XRP / USD' },
        { ticker: 'XRPUSDT.P', kind: 'Perp', venue: 'Binance', venueLogo: VENUE_LOGOS.BINANCE, title: 'XRP / USDT Perpetual' },
        { ticker: 'XRP', kind: 'Perp', venue: 'Hyperliquid', venueLogo: VENUE_LOGOS.HYPERLIQUID, title: 'XRP / USD Perpetual' },
    ],
};

function formatVenueName(v?: string): string {
    if (!v) return 'Spot';
    const u = v.toUpperCase();
    if (u === 'BINANCE') return 'Binance';
    if (u === 'COINBASE') return 'Coinbase';
    if (u === 'HYPERLIQUID') return 'Hyperliquid';
    if (u === 'BINANCEUS' || u === 'BINANCE.US') return 'Binance.US';
    return u;
}

function formatMarketType(type?: string): string {
    const t = (type ?? '').toLowerCase();
    if (t === 'crypto') return 'Crypto';
    if (t === 'stock') return 'Stock';
    if (t === 'etf') return 'ETF';
    if (t === 'futures' || t === 'root') return 'Futures';
    if (t === 'forex') return 'Forex';
    if (t === 'commodity') return 'Commodity';
    return 'Crypto';
}

export class SymbolPicker {
    private readonly dialog: Dialog;
    private readonly input: HTMLInputElement;
    private readonly clearBtn: HTMLButtonElement;
    private readonly tabs: HTMLElement;
    private readonly tabPill: HTMLElement;
    private readonly filterBtn: HTMLButtonElement;
    private readonly filterLabel: HTMLElement;
    private readonly filterMenu: HTMLElement;
    private readonly mainContainer: HTMLElement;
    private readonly list: HTMLElement;
    private readonly inspector: HTMLElement;
    private readonly foot: HTMLElement;

    private source: () => readonly SymbolDescriptor[] = () => [];
    private rows: SymbolDescriptor[] = [];
    private highlighted = 0;
    private seed = '';
    private activeTab = 'all';
    private activeVenue = 'all';
    private visible = PAGE;
    private exhausted = false;
    private readonly expanded = new Set<string>();
    private ranked: { key: string; result: SymbolDescriptor[] } | null = null;
    private ranking = false;
    private isVenueMenuOpen = false;

    constructor(private readonly opts: SymbolPickerOptions) {
        const doc = (opts.host ?? document.body).ownerDocument;
        injectStyles(STYLE_ID, CSS, doc);

        // ── 1. Search Row ──
        this.input = doc.createElement('input');
        this.input.className = 'vela-sp-input';
        this.input.placeholder = 'Search symbol…';
        this.input.setAttribute('spellcheck', 'false');

        const searchIcon = doc.createElement('span');
        searchIcon.className = 'vela-icon';
        searchIcon.setAttribute('aria-hidden', 'true');
        searchIcon.innerHTML = `<svg fill="none" height="1em" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" viewBox="0 0 16 16" width="1em"><circle cx="7" cy="7" r="4.5"></circle><path d="m10.5 10.5 3.5 3.5"></path></svg>`;

        this.clearBtn = doc.createElement('button');
        this.clearBtn.type = 'button';
        this.clearBtn.className = 'qsp-clear';
        this.clearBtn.title = 'Clear search';
        this.clearBtn.setAttribute('aria-label', 'Clear search');
        this.clearBtn.hidden = true;
        this.clearBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"></path></svg>`;
        this.clearBtn.addEventListener('click', () => {
            this.input.value = '';
            this.clearBtn.hidden = true;
            this.refresh();
            this.input.focus();
        });

        const searchRow = doc.createElement('div');
        searchRow.className = 'vela-sp-searchrow';
        searchRow.append(searchIcon, this.input, this.clearBtn);

        // ── 2. Tab Bar + Venue Filter ──
        const tabbar = doc.createElement('div');
        tabbar.className = 'qsp-tabbar';

        this.tabs = doc.createElement('div');
        this.tabs.className = 'vela-sp-tabs';

        this.tabPill = doc.createElement('span');
        this.tabPill.className = 'qsp-tab-pill';
        this.tabPill.setAttribute('aria-hidden', 'true');
        this.tabs.appendChild(this.tabPill);

        const TAB_ITEMS = [
            { label: 'All', id: 'all' },
            { label: 'Stocks', id: 'stocks' },
            { label: 'ETFs', id: 'etfs' },
            { label: 'Crypto', id: 'crypto' },
            { label: 'Futures', id: 'futures' },
            { label: 'Forex', id: 'forex' },
            { label: 'Commodities', id: 'commodities' },
        ];

        for (const t of TAB_ITEMS) {
            const b = doc.createElement('button');
            b.type = 'button';
            b.className = 'vela-sp-tab';
            b.dataset.tab = t.id;
            b.textContent = t.label;
            if (t.id === this.activeTab) b.dataset.active = '1';
            b.addEventListener('click', () => {
                this.setTab(t.id);
            });
            this.tabs.appendChild(b);
        }

        // Venue filter button
        this.filterBtn = doc.createElement('button');
        this.filterBtn.type = 'button';
        this.filterBtn.className = 'qsp-filter';
        this.filterBtn.title = 'Filter by venue';
        this.filterBtn.setAttribute('aria-haspopup', 'listbox');
        this.filterBtn.setAttribute('aria-expanded', 'false');

        const funnelSvg = `<svg aria-hidden="true" class="qsp-filter-icon" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"></path></svg>`;
        const chevronSvg = `<svg aria-hidden="true" data-quant-chevron="down" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg>`;

        this.filterLabel = doc.createElement('span');
        this.filterLabel.className = 'qsp-filter-label';
        this.filterLabel.textContent = 'All venues';

        this.filterBtn.innerHTML = funnelSvg;
        this.filterBtn.appendChild(this.filterLabel);
        this.filterBtn.insertAdjacentHTML('beforeend', chevronSvg);

        // Venue dropdown menu
        this.filterMenu = doc.createElement('div');
        this.filterMenu.className = 'qsp-filter-menu quant-chrome-hover';
        this.filterMenu.setAttribute('role', 'listbox');
        this.filterMenu.setAttribute('aria-label', 'Filter by venue');
        this.filterMenu.hidden = true;

        for (let idx = 0; idx < VENUE_OPTIONS.length; idx++) {
            const v = VENUE_OPTIONS[idx];
            if (!v) continue;
            if (idx === 1) {
                const sep = doc.createElement('div');
                sep.className = 'qsp-filter-sep';
                this.filterMenu.appendChild(sep);
            }
            const opt = doc.createElement('button');
            opt.type = 'button';
            opt.className = 'qsp-filter-option quant-chrome-hover-row';
            opt.setAttribute('role', 'option');
            opt.setAttribute('aria-selected', v.id === this.activeVenue ? 'true' : 'false');
            if (v.logo) {
                opt.innerHTML = `<span class="qsp-venue qsp-filter-venue"><img class="qsp-venue-logo" src="${v.logo}" alt="" decoding="async" loading="lazy">${v.name}</span>`;
            } else if (v.id !== 'all') {
                opt.innerHTML = `<span class="qsp-venue qsp-filter-venue">${v.name}</span>`;
            } else {
                opt.textContent = v.name;
            }
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setVenue(v.id, v.name);
                this.closeVenueMenu();
            });
            this.filterMenu.appendChild(opt);
        }

        this.filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleVenueMenu();
        });

        tabbar.append(this.tabs, this.filterBtn, this.filterMenu);

        const head = doc.createElement('div');
        head.className = 'vela-sp-head';
        head.append(searchRow, tabbar);

        // ── 3. Main Area (Left: List, Right: Inspector) ──
        this.mainContainer = doc.createElement('div');
        this.mainContainer.className = 'qsp-main';

        this.list = doc.createElement('div');
        this.list.className = 'vela-sp-list quant-chrome-hover';

        this.inspector = doc.createElement('aside');
        this.inspector.className = 'qsp-inspector';
        this.inspector.setAttribute('aria-label', 'Symbol details');

        this.mainContainer.append(this.list, this.inspector);

        // Infinite scroll
        this.list.addEventListener('scroll', () => {
            if (this.exhausted) return;
            if (this.list.scrollTop + this.list.clientHeight < this.list.scrollHeight - 200) return;
            this.visible += PAGE;
            this.grow();
        });

        // ── 4. Keyboard Footer ──
        this.foot = doc.createElement('div');
        this.foot.className = 'qsp-foot';
        this.foot.innerHTML = `
            <button type="button" class="qsp-key" title="Previous result" aria-label="Previous result"><kbd>↑</kbd></button>
            <button type="button" class="qsp-key" data-pair="" title="Next result" aria-label="Next result"><kbd>↓</kbd>Navigate</button>
            <button type="button" class="qsp-key" title="Open chart" aria-label="Open chart"><kbd>↵</kbd>Open chart</button>
            <button type="button" class="qsp-key" title="Next market" aria-label="Next market"><kbd>Tab</kbd>Switch market</button>
            <button type="button" class="qsp-key" title="Close" aria-label="Close"><kbd>Esc</kbd>Close</button>
        `;

        const footButtons = this.foot.querySelectorAll<HTMLButtonElement>('.qsp-key');
        footButtons[0]?.addEventListener('click', () => this.moveHighlight(-1));
        footButtons[1]?.addEventListener('click', () => this.moveHighlight(1));
        footButtons[2]?.addEventListener('click', () => {
            const s = this.rows[this.highlighted];
            if (s) this.pick(s);
        });
        footButtons[3]?.addEventListener('click', () => this.cycleTab());
        footButtons[4]?.addEventListener('click', () => this.close());

        // ── 5. Dialog Setup ──
        this.dialog = new Dialog({
            title: 'Symbol Search',
            host: opts.host,
            closeOnInteractOutside: true,
            flush: true,
            content: (body) => body.append(head, this.mainContainer, this.foot),
            onOpenChange: (open) => {
                if (open) {
                    this.input.value = this.seed.toUpperCase();
                    this.clearBtn.hidden = !this.input.value;
                    this.seed = '';
                    this.refresh();
                    requestAnimationFrame(() => {
                        this.updateTabPill();
                    });
                    setTimeout(() => {
                        this.input.focus();
                        this.input.setSelectionRange(this.input.value.length, this.input.value.length);
                    }, 0);
                    doc.addEventListener('pointerdown', this.onDocClick);
                } else {
                    this.input.blur();
                    this.closeVenueMenu();
                    doc.removeEventListener('pointerdown', this.onDocClick);
                }
                opts.onOpenChange?.(open);
            },
        });

        // Set official quant attributes on the dialog container
        this.dialog.panel.dataset.quantDialog = 'symbols';
        this.dialog.panel.dataset.qspInspector = 'on';
        this.dialog.panel.dataset.qspTab = this.activeTab;

        // ── 6. Event Handlers ──
        this.input.addEventListener('input', () => {
            const next = this.input.value.toUpperCase();
            if (this.input.value !== next) {
                const start = this.input.selectionStart;
                const end = this.input.selectionEnd;
                this.input.value = next;
                if (start != null && end != null) this.input.setSelectionRange(start, end);
            }
            this.clearBtn.hidden = !this.input.value;
            this.refresh();
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                this.moveHighlight(1);
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                this.moveHighlight(-1);
                e.preventDefault();
            } else if (e.key === 'Enter') {
                const pick = this.rows[this.highlighted];
                if (pick) this.pick(pick);
                e.preventDefault();
            } else if (e.key === 'Tab') {
                this.cycleTab();
                e.preventDefault();
            } else if (e.key === 'Escape') {
                this.close();
                e.preventDefault();
            }
        });

        this.list.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.vela-sp-star')) return;
            const row = target.closest<HTMLElement>('.vela-sp-row');
            if (!row) return;
            const s = this.rows[Number(row.dataset.i)];
            if (!s) return;
            if (target.closest('.vela-sp-expander')) {
                this.toggleExpand(s);
            } else {
                this.pick(s);
            }
        });
    }

    private readonly onDocClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (this.isVenueMenuOpen && !this.filterMenu.contains(target) && !this.filterBtn.contains(target)) {
            this.closeVenueMenu();
        }
    };

    setSource(source: () => readonly SymbolDescriptor[]): void {
        this.source = source;
    }

    open(initialQuery = ''): void {
        this.seed = initialQuery;
        this.dialog.show();
    }

    get isOpen(): boolean {
        return this.dialog.open;
    }

    type(text: string): void {
        if (!this.isOpen) {
            this.open(text);
            return;
        }
        this.input.value = (this.input.value + text).toUpperCase();
        this.clearBtn.hidden = !this.input.value;
        this.refresh();
    }

    close(): void {
        this.dialog.hide();
    }

    destroy(): void {
        const doc = this.list.ownerDocument;
        doc.removeEventListener('pointerdown', this.onDocClick);
        this.dialog.destroy();
    }

    setTab(tabId: string): void {
        this.activeTab = tabId;
        this.dialog.panel.dataset.qspTab = tabId;
        for (const c of this.tabs.children) {
            const el = c as HTMLElement;
            if (el.dataset.tab === tabId) el.dataset.active = '1';
            else delete el.dataset.active;
        }
        this.updateTabPill();
        this.refresh();
    }

    cycleTab(): void {
        const tabs = ['all', 'stocks', 'etfs', 'crypto', 'futures', 'forex', 'commodities'];
        const curr = tabs.indexOf(this.activeTab);
        const next = tabs[(curr + 1) % tabs.length]!;
        this.setTab(next);
    }

    setVenue(venueId: string, venueName: string): void {
        this.activeVenue = venueId;
        this.filterLabel.textContent = venueName;
        if (venueId !== 'all') this.filterBtn.dataset.on = '1';
        else delete this.filterBtn.dataset.on;
        for (const opt of this.filterMenu.querySelectorAll<HTMLElement>('.qsp-filter-option')) {
            const match = opt.textContent?.includes(venueName);
            opt.setAttribute('aria-selected', match ? 'true' : 'false');
        }
        this.refresh();
    }

    toggleVenueMenu(): void {
        if (this.isVenueMenuOpen) this.closeVenueMenu();
        else this.openVenueMenu();
    }

    openVenueMenu(): void {
        this.isVenueMenuOpen = true;
        this.filterMenu.hidden = false;
        this.filterBtn.setAttribute('aria-expanded', 'true');
    }

    closeVenueMenu(): void {
        this.isVenueMenuOpen = false;
        this.filterMenu.hidden = true;
        this.filterBtn.setAttribute('aria-expanded', 'false');
    }

    private updateTabPill(): void {
        const activeTabEl = this.tabs.querySelector<HTMLElement>(`.vela-sp-tab[data-tab="${this.activeTab}"]`);
        if (activeTabEl && this.tabPill) {
            const left = activeTabEl.offsetLeft;
            const width = activeTabEl.offsetWidth;
            this.tabPill.style.width = `${width}px`;
            this.tabPill.style.transform = `translateX(${left}px)`;
            this.tabPill.dataset.ready = '';
        }
    }

    private pick(s: SymbolDescriptor): void {
        const target = isGroupRow(s) ? (defaultMemberOf(this.pool(), s) ?? s) : s;
        this.select(target.ticker, target.prefix ?? target.provider, this.opts.onSelect);
    }

    private select(ticker: string, venue: string | undefined, onSelect: (symbol: string) => void): void {
        this.close();
        onSelect(venue ? `${venue}:${ticker}` : ticker);
    }

    private toggleExpand(s: SymbolDescriptor): void {
        const key = groupKeyOf(s);
        if (!this.expanded.delete(key)) this.expanded.add(key);
        const scrollTop = this.list.scrollTop;
        const focus = this.rows[this.highlighted];
        this.rows = this.computeRows();
        this.list.replaceChildren();
        this.rows.forEach((r, i) => this.list.appendChild(this.rowEl(r, i)));
        const at = focus ? this.rows.indexOf(focus) : -1;
        this.highlighted = at >= 0 ? at : Math.min(this.highlighted, Math.max(0, this.rows.length - 1));
        this.renderHighlight();
        this.list.scrollTop = scrollTop;
    }

    private moveHighlight(delta: number): void {
        if (!this.rows.length) return;
        this.highlighted = Math.min(this.rows.length - 1, Math.max(0, this.highlighted + delta));
        this.renderHighlight();
    }

    private renderHighlight(): void {
        [...this.list.children].forEach((el, i) => {
            if (i === this.highlighted) {
                (el as HTMLElement).dataset.highlighted = '1';
                (el as HTMLElement).scrollIntoView({ block: 'nearest' });
            } else delete (el as HTMLElement).dataset.highlighted;
        });
        this.updateInspector(this.rows[this.highlighted]);
    }

    private updateInspector(s?: SymbolDescriptor): void {
        this.inspector.replaceChildren();
        if (!s) {
            const empty = document.createElement('div');
            empty.className = 'qsp-insp-empty';
            empty.textContent = 'Select a symbol to view market quote and trading details.';
            this.inspector.appendChild(empty);
            return;
        }

        const doc = this.inspector.ownerDocument;

        // 1. Hero
        const hero = doc.createElement('div');
        hero.className = 'qsp-insp-hero';

        const logo = tickerIconEl(doc, baseOf(s), s.ticker, 'qsp-logo', this.opts.iconFor?.(s));
        logo.setAttribute('aria-hidden', 'true');

        const heroRow = doc.createElement('div');
        heroRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; width: 100%;';

        const ticker = doc.createElement('div');
        ticker.className = 'qsp-insp-ticker';
        ticker.textContent = s.ticker;

        const fav = symbolFavorite();
        if (fav) {
            const inspStar = doc.createElement('button');
            inspStar.type = 'button';
            inspStar.className = 'vela-sp-star qsp-insp-star';
            const isFav = fav.isFavorite(s.ticker);
            inspStar.appendChild(iconEl(isFav ? 'star-filled' : 'star', doc));
            if (isFav) inspStar.dataset.on = '1';
            inspStar.style.opacity = isFav ? '1' : '0.6';
            inspStar.style.display = 'inline-flex';
            inspStar.title = isFav ? 'Remove from Wishlist' : 'Add to Wishlist';
            inspStar.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const f = symbolFavorite();
                if (f) {
                    f.toggleFavorite(s.ticker, s);
                    const nowFav = f.isFavorite(s.ticker);
                    inspStar.replaceChildren(iconEl(nowFav ? 'star-filled' : 'star', doc));
                    if (nowFav) {
                        inspStar.dataset.on = '1';
                        inspStar.style.opacity = '1';
                    } else {
                        delete inspStar.dataset.on;
                        inspStar.style.opacity = '0.6';
                    }
                    inspStar.title = nowFav ? 'Remove from Wishlist' : 'Add to Wishlist';

                    // Sync corresponding row star in list
                    const matchingRow = this.list.querySelector<HTMLElement>(`.vela-sp-row[data-ticker="${s.ticker.replace(/"/g, '\"')}"]`);
                    if (matchingRow) {
                        const rowStar = matchingRow.querySelector<HTMLElement>('.vela-sp-star');
                        if (rowStar) {
                            rowStar.replaceChildren(iconEl(nowFav ? 'star-filled' : 'star', doc));
                            if (nowFav) rowStar.dataset.on = '1';
                            else delete rowStar.dataset.on;
                            rowStar.title = nowFav ? 'Remove from Wishlist' : 'Add to Wishlist';
                        }
                    }
                }
            });
            heroRow.append(ticker, inspStar);
        } else {
            heroRow.append(ticker);
        }

        const desc = doc.createElement('div');
        desc.className = 'qsp-insp-desc';
        desc.textContent = s.description ?? s.ticker;

        hero.append(logo, heroRow, desc);

        // 2. Quote Section
        const quoteSec = doc.createElement('section');
        quoteSec.className = 'qsp-quote qsp-insp-section';

        const quoteLine = doc.createElement('div');
        quoteLine.className = 'qsp-quote-line';

        const quotePrice = doc.createElement('span');
        quotePrice.className = 'qsp-quote-price';

        const quoteChange = doc.createElement('span');
        quoteChange.className = 'qsp-quote-change';

        // Read real-time price from Binance stream cache if available
        const miniTickers = (window as any).__binanceMiniTickers;
        const liveTicker = miniTickers?.get(s.ticker) || miniTickers?.get(s.ticker.replace('USDT', ''));
        let price = liveTicker ? parseFloat(liveTicker.c) : 0;
        let change = liveTicker ? price - parseFloat(liveTicker.o) : 0;
        let changePercent = liveTicker && parseFloat(liveTicker.o) ? (change / parseFloat(liveTicker.o)) * 100 : 0;

        if (!price) {
            // Realistic quote fallback for preview
            const base = baseOf(s).toUpperCase();
            if (base === 'BTC') { price = 80943.58; change = -729.68; changePercent = -0.89; }
            else if (base === 'ETH') { price = 2214.20; change = 14.50; changePercent = 0.66; }
            else if (base === 'SOL') { price = 138.85; change = 3.20; changePercent = 2.36; }
            else if (base === 'NVDA') { price = 125.40; change = 1.85; changePercent = 1.49; }
            else if (base === 'AAPL') { price = 224.23; change = -0.45; changePercent = -0.20; }
            else if (base === 'SPY') { price = 582.10; change = 0.45; changePercent = 0.08; }
            else if (base === 'EURUSD') { price = 1.1224; change = 0.0066; changePercent = 0.59; }
            else { price = 100.00; change = 0.00; changePercent = 0.00; }
        }

        const isUp = change >= 0;
        const dir = isUp ? 'up' : 'down';
        const sign = isUp ? '+' : '';
        const decimals = price >= 1000 ? 2 : (price >= 1 ? 2 : 4);
        quotePrice.textContent = price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        quoteChange.dataset.dir = dir;
        quoteChange.textContent = `${sign}${change.toFixed(decimals)} (${sign}${changePercent.toFixed(2)}%)`;

        quoteLine.append(quotePrice, quoteChange);

        const quoteStatus = doc.createElement('div');
        quoteStatus.className = 'qsp-quote-status';
        const marketType = (s.type ?? '').toLowerCase();
        if (marketType === 'crypto' || s.ticker.endsWith('USDT') || s.ticker.endsWith('BTC')) {
            quoteStatus.dataset.status = 'open';
            quoteStatus.textContent = 'Open 24/7';
        } else {
            quoteStatus.dataset.status = 'open';
            quoteStatus.textContent = 'Regular market hours';
        }

        quoteSec.append(quoteLine, quoteStatus);

        // 3. Facts List (empty by default, hidden via :empty like official Vela)
        const facts = doc.createElement('dl');
        facts.className = 'qsp-insp-facts';

        // 4. Also Trades As Section
        const alsoSec = doc.createElement('section');
        alsoSec.className = 'qsp-insp-section';

        const baseKey = baseOf(s).toUpperCase();
        const alternates = COMMON_ALTERNATES[baseKey] || [];

        if (alternates.length > 0) {
            const alsoTitle = doc.createElement('div');
            alsoTitle.className = 'qsp-insp-title';
            alsoTitle.textContent = 'Also trades as';
            alsoSec.appendChild(alsoTitle);

            for (const alt of alternates) {
                const btn = doc.createElement('button');
                btn.type = 'button';
                btn.className = 'qsp-listing';
                btn.title = alt.title;

                const altLogo = tickerIconEl(doc, baseKey, alt.ticker, 'qsp-logo', this.opts.iconFor?.(s));
                altLogo.setAttribute('aria-hidden', 'true');

                const altTicker = doc.createElement('span');
                altTicker.className = 'qsp-listing-ticker';
                altTicker.textContent = alt.ticker;

                const altKind = doc.createElement('span');
                altKind.className = 'qsp-listing-kind';
                altKind.textContent = alt.kind;

                const altVenue = doc.createElement('span');
                altVenue.className = 'qsp-venue qsp-listing-venue';
                if (alt.venueLogo) {
                    altVenue.innerHTML = `<img class="qsp-venue-logo" src="${alt.venueLogo}" alt="" decoding="async" loading="lazy">${alt.venue}`;
                } else {
                    altVenue.textContent = alt.venue;
                }

                btn.append(altLogo, altTicker, altKind, altVenue);
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.select(alt.ticker, alt.venue, this.opts.onSelect);
                });
                alsoSec.appendChild(btn);
            }
        }

        // 5. Open Chart Action Button
        const actionBtn = doc.createElement('button');
        actionBtn.type = 'button';
        actionBtn.className = 'qsp-insp-action';
        actionBtn.innerHTML = `Open chart<kbd>↵</kbd>`;
        actionBtn.addEventListener('click', () => {
            this.pick(s);
        });

        this.inspector.append(hero, quoteSec, facts, alsoSec, actionBtn);
    }

    private pool(): readonly SymbolDescriptor[] {
        const raw = this.source();
        const combined = dedupeSymbols([...GLOBAL_ASSETS, ...raw]);
        const hook = symbolRanking();
        if (!hook) return combined;
        const key = `${combined.length}:${combined[0]?.ticker ?? ''}:${combined[combined.length - 1]?.ticker ?? ''}`;
        if (this.ranked?.key !== key && !this.ranking) {
            this.ranking = true;
            Promise.resolve([...combined])
                .then((copy) => hook(copy))
                .then((out) => {
                    this.ranked = { key, result: dedupeSymbols(out) };
                })
                .catch((err) => {
                    console.warn('[vela] symbol ranking failed — pool order kept:', err);
                    this.ranked = { key, result: [...combined] };
                })
                .finally(() => {
                    this.ranking = false;
                    this.refresh();
                });
        }
        return this.ranked?.result ?? combined;
    }

    private computeRows(): SymbolDescriptor[] {
        const TAB_TYPES: Record<string, string[]> = {
            crypto: ['crypto'],
            stocks: ['stock'],
            etfs: ['etf'],
            futures: ['futures', 'root'],
            forex: ['forex'],
            commodities: ['commodity'],
        };

        const all = this.pool();
        let pool =
            this.activeTab === 'all'
                ? all
                : all.filter((s) => {
                      const t = (s.type ?? '').toLowerCase();
                      const allowed = TAB_TYPES[this.activeTab];
                      if (allowed && allowed.includes(t)) return true;
                      if (this.activeTab === 'crypto' && (t === 'futures' || s.ticker.endsWith('USDT') || s.ticker.endsWith('BTC'))) return true;
                      return false;
                  });

        if (this.activeVenue !== 'all') {
            const vTarget = this.activeVenue.toUpperCase();
            pool = pool.filter((s) => {
                const pref = (s.prefix ?? '').toUpperCase();
                const prov = (s.provider ?? '').toUpperCase();
                return pref === vTarget || prov === vTarget || pref.includes(vTarget) || prov.includes(vTarget);
            });
        }

        const filtered = filterSymbols(pool, this.input.value, this.visible, symbolRanking() ? false : TOP_TICKERS);
        this.exhausted = filtered.length < this.visible;
        const folded = foldGroups(filtered);
        if (!this.expanded.size) return folded;

        const keyOf = (s: SymbolDescriptor): string => `${(s.prefix ?? s.provider ?? '').toLowerCase()}:${s.ticker.toUpperCase()}`;
        const present = new Set(folded.map(keyOf));
        const out: SymbolDescriptor[] = [];
        for (const s of folded) {
            out.push(s);
            if (!isGroupRow(s) || !this.expanded.has(groupKeyOf(s))) continue;
            for (const m of groupMembers(all, s)) {
                if (present.has(keyOf(m))) continue;
                present.add(keyOf(m));
                out.push(m);
            }
        }
        return out;
    }

    private refresh(): void {
        const doc = this.list.ownerDocument;
        this.visible = PAGE;
        this.rows = this.computeRows();
        this.highlighted = 0;
        this.list.replaceChildren();
        if (!this.rows.length) {
            const empty = doc.createElement('div');
            empty.className = 'vela-sp-empty';
            empty.textContent = this.input.value ? 'No symbols match.' : 'No symbols indexed (provider still loading?).';
            this.list.appendChild(empty);
            this.updateInspector(undefined);
            return;
        }
        this.rows.forEach((s, i) => this.list.appendChild(this.rowEl(s, i)));
        this.renderHighlight();
    }

    private grow(): void {
        const already = this.rows.length;
        this.rows = this.computeRows();
        this.rows.slice(already).forEach((s, j) => this.list.appendChild(this.rowEl(s, already + j)));
    }

    private rowEl(s: SymbolDescriptor, i: number): HTMLElement {
        const doc = this.list.ownerDocument;
        const row = doc.createElement('div');
        row.className = 'vela-sp-row quant-chrome-hover-row';
        row.dataset.i = String(i);
        row.dataset.ticker = s.ticker;
        row.setAttribute('data-qsp-row', '');
        if (i === this.highlighted) row.dataset.highlighted = '1';

        const venue = s.prefix ?? s.provider;
        if (venue) row.dataset.venue = venue.toUpperCase();

        const av = tickerIconEl(doc, baseOf(s), s.ticker, 'vela-sp-avatar', this.opts.iconFor?.(s));

        const main = doc.createElement('span');
        main.className = 'vela-sp-main';
        const t = doc.createElement('span');
        t.className = 'vela-sp-ticker';
        t.textContent = s.ticker;
        const d = doc.createElement('span');
        d.className = 'vela-sp-desc';
        d.textContent = s.description ?? (s.type ?? '');
        main.append(t, d);
        row.append(av, main);

        // ── .qsp-meta (Venue logo + venue name + market class) ──
        const meta = doc.createElement('span');
        meta.className = 'qsp-meta';

        const metaVenue = doc.createElement('span');
        metaVenue.className = 'qsp-venue qsp-meta-venue';
        const venueNorm = (venue || '').toUpperCase();
        const venueLogoUrl = VENUE_LOGOS[venueNorm];
        if (venueLogoUrl) {
            const logoImg = doc.createElement('img');
            logoImg.className = 'qsp-venue-logo';
            logoImg.src = venueLogoUrl;
            logoImg.alt = '';
            logoImg.decoding = 'async';
            logoImg.loading = 'lazy';
            metaVenue.appendChild(logoImg);
        }
        metaVenue.appendChild(doc.createTextNode(venue ? formatVenueName(venue) : 'Binance'));

        const metaMarket = doc.createElement('span');
        metaMarket.className = 'qsp-meta-market';
        metaMarket.textContent = formatMarketType(s.type);

        meta.append(metaVenue, metaMarket);
        row.append(meta);

        // Group contract expander
        if (isGroupRow(s)) {
            row.dataset.group = '1';
            const expander = doc.createElement('button');
            expander.className = 'vela-sp-expander';
            expander.setAttribute('aria-label', 'Show contracts');
            expander.appendChild(iconEl(this.expanded.has(groupKeyOf(s)) ? 'chevron-down' : 'chevron-right', doc));
            row.appendChild(expander);
        } else if (s.group != null && this.expanded.has(groupKeyOf(s))) row.dataset.member = '1';

        // Favorite Star
        const fav = symbolFavorite();
        if (fav) {
            const star = doc.createElement('button');
            star.type = 'button';
            star.className = 'vela-sp-star';
            const isFav = fav.isFavorite(s.ticker);
            star.appendChild(iconEl(isFav ? 'star-filled' : 'star', doc));
            if (isFav) star.dataset.on = '1';
            star.title = isFav ? 'Remove from Wishlist' : 'Add to Wishlist';
            star.addEventListener('click', (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                const f = symbolFavorite();
                if (f) {
                    f.toggleFavorite(s.ticker, s);
                    const nowFav = f.isFavorite(s.ticker);
                    star.replaceChildren(iconEl(nowFav ? 'star-filled' : 'star', doc));
                    if (nowFav) star.dataset.on = '1';
                    else delete star.dataset.on;
                    star.title = nowFav ? 'Remove from Wishlist' : 'Add to Wishlist';

                    // Synchronize inspector star if currently showing this ticker
                    const inspStar = this.inspector.querySelector<HTMLElement>('.qsp-insp-star');
                    const inspTicker = this.inspector.querySelector<HTMLElement>('.qsp-insp-ticker, .qsp-hero-title')?.textContent?.trim();
                    if (inspStar && inspTicker === s.ticker) {
                        inspStar.replaceChildren(iconEl(nowFav ? 'star-filled' : 'star', doc));
                        if (nowFav) {
                            inspStar.dataset.on = '1';
                            inspStar.style.opacity = '1';
                        } else {
                            delete inspStar.dataset.on;
                            inspStar.style.opacity = '0.6';
                        }
                        inspStar.title = nowFav ? 'Remove from Wishlist' : 'Add to Wishlist';
                    }
                }
            });
            row.appendChild(star);
        }

        // Hover updates highlight and inspector
        row.addEventListener('mouseenter', () => {
            const idx = Number(row.dataset.i);
            if (!isNaN(idx) && idx !== this.highlighted) {
                this.highlighted = idx;
                this.renderHighlight();
            }
        });

        return row;
    }
}
