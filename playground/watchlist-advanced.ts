import type { WatchlistItem } from './watchlist-panel';
import { normalizeSymbol } from './watchlist-panel';

export interface WatchlistAdvancedOptions {
    watchlistItems: WatchlistItem[];
    activeSymbol: string;
    onSelectSymbol: (symbol: string) => void;
    onAddSymbol: () => void;
}

const SYMBOL_COLORS = [
    '#38bdf8', // Sky Blue
    '#10b981', // Emerald Green
    '#f59e0b', // Amber Orange
    '#a855f7', // Purple
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#f43f5e', // Rose Red
    '#84cc16', // Lime
    '#6366f1', // Indigo
    '#eab308', // Yellow
];

interface RawBar {
    time: number;
    close: number;
}

interface NormalizedSeries {
    symbol: string;
    color: string;
    points: { time: number; pct: number }[];
    finalPct: number;
}

// ── Daily Klines Fetcher ───────────────────────────────────────────────────────
async function fetchDailySeries(sym: string, days: number): Promise<{ symbol: string; data: RawBar[] }> {
    const cleanSym = sym.replace(/^BINANCE:/i, '').replace(/\.P$/i, '').replace(/-/g, '').toUpperCase();
    const urls = [
        `https://fapi.binance.com/fapi/v1/klines?symbol=${cleanSym}&interval=1d&limit=${days}`,
        `https://api.binance.com/api/v3/klines?symbol=${cleanSym}&interval=1d&limit=${days}`,
    ];
    for (const url of urls) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const arr = await res.json();
                if (Array.isArray(arr) && arr.length > 0) {
                    const data: RawBar[] = arr.map((b: any) => ({
                        time: Number(b[0]),
                        close: parseFloat(b[4]),
                    }));
                    return { symbol: sym, data };
                }
            }
        } catch (_) {}
    }
    return { symbol: sym, data: [] };
}

function getYTDDays(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(diff, 10);
}

// ── Open Watchlist Advanced View Modal ─────────────────────────────────────────
let activeModalEl: HTMLElement | null = null;

export function openWatchlistAdvancedModal(opts: WatchlistAdvancedOptions): void {
    if (activeModalEl) {
        activeModalEl.remove();
        activeModalEl = null;
        return;
    }

    const { watchlistItems, onSelectSymbol, onAddSymbol } = opts;
    let currentActiveSymbol = opts.activeSymbol;

    const modal = document.createElement('div');
    modal.className = 'vela-advanced-view-modal vela-ui';
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: var(--background, #14161a);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        color: var(--foreground, #eeeef1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    `;
    activeModalEl = modal;

    // Dynamic stats
    const upCount = watchlistItems.filter(x => x.changePercent > 0).length;
    const downCount = watchlistItems.filter(x => x.changePercent < 0).length;
    const flatCount = watchlistItems.length - upCount - downCount;
    const breadthPct = watchlistItems.length ? Math.round((upCount / watchlistItems.length) * 100) : 0;
    const avgChange = watchlistItems.reduce((acc, x) => acc + x.changePercent, 0) / (watchlistItems.length || 1);
    const sortedByChange = [...watchlistItems].sort((a, b) => b.changePercent - a.changePercent);
    const best = sortedByChange[0];
    const worst = sortedByChange[sortedByChange.length - 1];

    let currentNavTab = 'overview'; // 'overview' | 'symbols' | 'news'
    let currentPulseFilter: 'All' | 'Gainers' | 'Losers' = 'All';
    let currentTimeframe: '1M' | '3M' | '6M' | 'YTD' | '1Y' = '3M';

    modal.innerHTML = `
        <header style="flex-shrink: 0; border-bottom: 1px solid var(--border, #262832); background: var(--card, #181a20); padding: 14px 32px 0;">
            <div style="max-width: 1440px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 16px; font-weight: 600; color: var(--foreground, #eeeef1);">Watchlist Advanced Studio</span>
                        <span style="font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.25);">LIVE</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button id="adv-head-add" type="button" aria-label="Add symbol" title="Add symbol to watchlist" style="all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground, #8b949e); border: 1px solid var(--border, #262832); background: var(--muted, #1f232e);"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5v14"/></svg></button>
                        <button id="adv-head-restore" type="button" aria-label="Restore view" title="Minimize view" style="all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground, #8b949e); border: 1px solid var(--border, #262832); background: var(--muted, #1f232e);"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button>
                        <button id="adv-close-btn" type="button" aria-label="Close" title="Close" style="all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground, #8b949e); border: 1px solid var(--border, #262832); background: var(--muted, #1f232e);"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
                    </div>
                </div>
                <div style="display: flex; gap: 24px; font-size: 13px; font-weight: 500;">
                    <span id="adv-tab-overview" class="adv-nav-tab" data-tab="overview" style="color: var(--foreground, #eeeef1); border-bottom: 2px solid #3b82f6; padding-bottom: 8px; cursor: pointer;">Overview</span>
                    <span id="adv-tab-symbols" class="adv-nav-tab" data-tab="symbols" style="color: var(--muted-foreground, #8b949e); border-bottom: 2px solid transparent; padding-bottom: 8px; cursor: pointer;">Symbols Table</span>
                    <span id="adv-tab-news" class="adv-nav-tab" data-tab="news" style="color: var(--muted-foreground, #8b949e); border-bottom: 2px solid transparent; padding-bottom: 8px; cursor: pointer;">Market News</span>
                </div>
            </div>
        </header>

        <!-- Main Content Host -->
        <main style="padding: 24px 32px; display: flex; flex-direction: column; gap: 24px; max-width: 1440px; margin: 0 auto; width: 100%; box-sizing: border-box; flex: 1;">
            
            <!-- SECTION 1: OVERVIEW -->
            <div id="adv-section-overview" style="display: flex; flex-direction: column; gap: 24px;">
                <!-- Stat Cards -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
                    <div style="background: var(--card, #181a20); border: 1px solid var(--border, #262832); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;">
                        <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground, #8b949e);">Watchlist Breadth</span>
                        <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 2px;">
                            <span style="font-size: 22px; font-weight: 700; color: var(--foreground, #eeeef1);">${breadthPct}%</span>
                            <span style="font-size: 11px; color: var(--constructive, #10b981); font-weight: 500;">positive</span>
                        </div>
                        <span style="font-size: 11px; color: var(--muted-foreground, #8b949e);">${upCount} up · ${downCount} down · ${flatCount} flat</span>
                    </div>
                    <div style="background: var(--card, #181a20); border: 1px solid var(--border, #262832); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;">
                        <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground, #8b949e);">Avg 24h % Change</span>
                        <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                            <span style="font-size: 15px; font-weight: 700; padding: 4px 10px; border-radius: 5px; color: ${avgChange >= 0 ? 'var(--constructive, #10b981)' : 'var(--destructive, #ef4444)'}; background: ${avgChange >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'};">${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%</span>
                        </div>
                        <span style="font-size: 11px; color: var(--muted-foreground, #8b949e);">Across ${watchlistItems.length} symbols</span>
                    </div>
                    <div style="background: var(--card, #181a20); border: 1px solid var(--border, #262832); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;">
                        <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground, #8b949e);">Best 24h Performer</span>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                            <span style="font-size: 15px; font-weight: 700; color: var(--foreground, #eeeef1);">${best ? best.symbol : '—'}</span>
                            <span style="font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 4px; color: var(--constructive, #10b981); background: rgba(16, 185, 129, 0.12);">${best ? `+${best.changePercent.toFixed(2)}%` : '—'}</span>
                        </div>
                        <span style="font-size: 11px; color: var(--muted-foreground, #8b949e);">${best ? best.name : ''}</span>
                    </div>
                    <div style="background: var(--card, #181a20); border: 1px solid var(--border, #262832); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;">
                        <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground, #8b949e);">Worst 24h Performer</span>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                            <span style="font-size: 15px; font-weight: 700; color: var(--foreground, #eeeef1);">${worst ? worst.symbol : '—'}</span>
                            <span style="font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 4px; color: var(--destructive, #ef4444); background: rgba(239, 68, 68, 0.12);">${worst ? `${worst.changePercent.toFixed(2)}%` : '—'}</span>
                        </div>
                        <span style="font-size: 11px; color: var(--muted-foreground, #8b949e);">${worst ? worst.name : ''}</span>
                    </div>
                </div>

                <!-- Comparison Chart & Market Pulse Columns -->
                <div class="watchlist-advanced-module__iafjpG__overview">
                    <!-- Left: Multi-line Comparison Chart Pane -->
                    <div class="watchlist-advanced-module__iafjpG__panel" style="position: relative;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
                            <div>
                                <span class="watchlist-advanced-module__iafjpG__eyebrow">Watchlist Comparison</span>
                                <h3 style="margin: 3px 0 2px; font-size: 16px; font-weight: 600; color: var(--foreground, #eeeef1);">Performance Over Time</h3>
                                <p style="margin: 0; font-size: 11px; color: var(--muted-foreground, #8b949e);">Normalized percentage scale (0% base) · top watchlist assets</p>
                            </div>
                            <!-- Timeframe Buttons -->
                            <div id="adv-tf-bar" style="display: flex; gap: 3px; background: var(--muted, #1f232e); padding: 3px; border-radius: 6px; border: 1px solid var(--border, #262832);">
                                ${(['1M', '3M', '6M', 'YTD', '1Y'] as const).map(tf => `
                                    <button class="adv-tf-btn" data-tf="${tf}" style="all: unset; cursor: pointer; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: ${currentTimeframe === tf ? '600' : '500'}; background: ${currentTimeframe === tf ? 'var(--card, #181a20)' : 'transparent'}; color: ${currentTimeframe === tf ? 'var(--foreground, #eeeef1)' : 'var(--muted-foreground, #8b949e)'}; border: ${currentTimeframe === tf ? '1px solid var(--border, #262832)' : '1px solid transparent'}; transition: all 0.12s;">${tf}</button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Canvas Host with Crosshair Tooltip -->
                        <div id="adv-chart-container" style="position: relative; width: 100%; height: 290px; background: #111317; border: 1px solid var(--border, #262832); border-radius: 8px; overflow: hidden;">
                            <canvas id="adv-perf-canvas" style="display: block; width: 100%; height: 100%;"></canvas>
                            
                            <!-- Loading Overlay -->
                            <div id="adv-chart-loader" style="position: absolute; inset: 0; background: rgba(17, 19, 23, 0.7); display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; color: var(--muted-foreground, #8b949e); z-index: 5;">
                                <svg style="animation: spin 1s linear infinite;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                                <span>Loading historical daily data...</span>
                            </div>

                            <!-- Floating Crosshair Tooltip -->
                            <div id="adv-chart-tooltip" style="position: absolute; display: none; pointer-events: none; z-index: 10; background: #1c1f26; border: 1px solid #2f3442; border-radius: 6px; padding: 8px 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); font-size: 11px; min-width: 150px;">
                                <div id="adv-tt-date" style="font-weight: 600; color: #8b949e; margin-bottom: 6px; border-bottom: 1px solid #2f3442; padding-bottom: 4px;"></div>
                                <div id="adv-tt-items" style="display: flex; flex-direction: column; gap: 4px;"></div>
                            </div>
                        </div>

                        <!-- Legend Bar below chart -->
                        <div id="adv-chart-legend" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px;"></div>
                    </div>

                    <!-- Right: Market Pulse Pane -->
                    <div class="watchlist-advanced-module__iafjpG__panel">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <span class="watchlist-advanced-module__iafjpG__eyebrow">Market Pulse</span>
                                <h3 style="margin: 3px 0 2px; font-size: 16px; font-weight: 600; color: var(--foreground, #eeeef1);">Your markets, at a glance</h3>
                                <p style="margin: 0; font-size: 11px; color: var(--muted-foreground, #8b949e);">Daily moves · equal-sized tiles</p>
                            </div>
                        </div>

                        <!-- Pulse Filter Tabs -->
                        <div id="adv-pulse-filters" style="display: flex; gap: 8px; margin-top: 12px; font-size: 11px; font-weight: 500;">
                            <span class="adv-pulse-filter-btn" data-filter="All" style="color: var(--foreground, #eeeef1); cursor: pointer; border-bottom: 2px solid #3b82f6; padding-bottom: 4px;">All (${watchlistItems.length})</span>
                            <span class="adv-pulse-filter-btn" data-filter="Gainers" style="color: var(--muted-foreground, #8b949e); cursor: pointer; border-bottom: 2px solid transparent; padding-bottom: 4px;">Gainers (${upCount})</span>
                            <span class="adv-pulse-filter-btn" data-filter="Losers" style="color: var(--muted-foreground, #8b949e); cursor: pointer; border-bottom: 2px solid transparent; padding-bottom: 4px;">Losers (${downCount})</span>
                        </div>

                        <!-- Pulse Tiles Container -->
                        <div id="adv-pulse-tiles-host" class="watchlist-advanced-module__iafjpG__marketTiles"></div>
                    </div>
                </div>
            </div>

            <!-- SECTION 2: SYMBOLS TABLE -->
            <div id="adv-section-symbols" style="display: none; flex-direction: column; gap: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <div style="position: relative; width: 320px;">
                        <input id="adv-symbols-search" type="text" placeholder="Search symbols or names..." style="width: 100%; box-sizing: border-box; height: 32px; background: var(--muted, #1f232e); border: 1px solid var(--border, #262832); border-radius: 6px; padding: 0 12px; font-size: 12px; color: var(--foreground, #eeeef1); outline: none;" />
                    </div>
                    <div style="font-size: 12px; color: var(--muted-foreground, #8b949e);">
                        Showing <span id="adv-symbols-count">${watchlistItems.length}</span> assets
                    </div>
                </div>

                <div style="background: var(--card, #181a20); border: 1px solid var(--border, #262832); border-radius: 10px; overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border, #262832); color: var(--muted-foreground, #8b949e); font-size: 11px; text-transform: uppercase;">
                                <th style="padding: 12px 16px;">Symbol / Name</th>
                                <th style="padding: 12px 16px;">Category</th>
                                <th style="padding: 12px 16px; text-align: right;">Last Price</th>
                                <th style="padding: 12px 16px; text-align: right;">24h Change</th>
                                <th style="padding: 12px 16px; text-align: right;">24h %</th>
                                <th style="padding: 12px 16px; text-align: right;">24h High</th>
                                <th style="padding: 12px 16px; text-align: right;">24h Low</th>
                                <th style="padding: 12px 16px; text-align: right;">24h Volume</th>
                                <th style="padding: 12px 16px; text-align: center;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="adv-symbols-tbody"></tbody>
                    </table>
                </div>
            </div>

            <!-- SECTION 3: MARKET NEWS -->
            <div id="adv-section-news" style="display: none; flex-direction: column; gap: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                    <div>
                        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--foreground, #eeeef1);">Real-Time Market Headlines</h3>
                        <p style="margin: 2px 0 0; font-size: 11px; color: var(--muted-foreground, #8b949e);">Live financial news intelligence for your watchlist symbols</p>
                    </div>
                    <button id="adv-news-refresh-btn" style="all: unset; cursor: pointer; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 500; background: var(--muted, #1f232e); border: 1px solid var(--border, #262832); color: var(--foreground, #eeeef1);">↻ Refresh Feed</button>
                </div>
                <div id="adv-news-feed" style="display: flex; flex-direction: column; gap: 10px;">
                    <div style="padding: 30px; text-align: center; color: var(--muted-foreground, #8b949e); font-size: 12px;">Loading headlines...</div>
                </div>
            </div>

        </main>
    `;

    document.body.appendChild(modal);

    // ── Header Controls ────────────────────────────────────────────────────────
    const closeModal = () => {
        if (activeModalEl) {
            activeModalEl.remove();
            activeModalEl = null;
        }
    };

    modal.querySelector('#adv-close-btn')?.addEventListener('click', closeModal);
    modal.querySelector('#adv-head-restore')?.addEventListener('click', closeModal);
    modal.querySelector('#adv-head-add')?.addEventListener('click', () => {
        onAddSymbol();
    });

    // ── Navigation Tabs Switching ──────────────────────────────────────────────
    const navTabs = modal.querySelectorAll<HTMLElement>('.adv-nav-tab');
    const secOverview = modal.querySelector<HTMLElement>('#adv-section-overview')!;
    const secSymbols = modal.querySelector<HTMLElement>('#adv-section-symbols')!;
    const secNews = modal.querySelector<HTMLElement>('#adv-section-news')!;

    const switchNavTab = (tab: string) => {
        currentNavTab = tab;
        navTabs.forEach(t => {
            const isMatch = t.dataset.tab === tab;
            t.style.color = isMatch ? 'var(--foreground, #eeeef1)' : 'var(--muted-foreground, #8b949e)';
            t.style.borderBottomColor = isMatch ? '#3b82f6' : 'transparent';
        });

        secOverview.style.display = tab === 'overview' ? 'flex' : 'none';
        secSymbols.style.display = tab === 'symbols' ? 'flex' : 'none';
        secNews.style.display = tab === 'news' ? 'flex' : 'none';

        if (tab === 'symbols') renderSymbolsTable();
        if (tab === 'news') void loadNewsFeed();
    };

    navTabs.forEach(t => {
        t.addEventListener('click', () => {
            const tab = t.dataset.tab;
            if (tab) switchNavTab(tab);
        });
    });

    // ── Market Pulse Rendering & Filtering ─────────────────────────────────────
    const pulseTilesHost = modal.querySelector<HTMLElement>('#adv-pulse-tiles-host')!;
    const pulseFilterBtns = modal.querySelectorAll<HTMLElement>('.adv-pulse-filter-btn');

    const renderPulseTiles = () => {
        let items = [...watchlistItems];
        if (currentPulseFilter === 'Gainers') items = items.filter(x => x.changePercent >= 0);
        else if (currentPulseFilter === 'Losers') items = items.filter(x => x.changePercent < 0);

        pulseTilesHost.innerHTML = items.slice(0, 12).map(it => {
            const isUp = it.changePercent >= 0;
            return `
                <button class="adv-tile-btn" data-sym="${it.symbol}" style="all: unset; cursor: pointer; box-sizing: border-box; border: 1px solid var(--border, #262832); background: color-mix(in srgb, ${isUp ? 'var(--constructive, #10b981)' : 'var(--destructive, #ef4444)'} 12%, var(--card, #181a20)); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 4px; transition: transform 0.12s, border-color 0.12s;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                        <span style="font-size: 11px; font-weight: 600; color: var(--foreground, #eeeef1);">${it.symbol}</span>
                        <span style="font-size: 9px; color: var(--muted-foreground, #8b949e);">${it.category}</span>
                    </div>
                    <b style="font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; color: ${isUp ? 'var(--constructive, #10b981)' : 'var(--destructive, #ef4444)'};">${isUp ? '+' : ''}${it.changePercent.toFixed(2)}%</b>
                    <span style="font-size: 10px; color: var(--muted-foreground, #8b949e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${it.name}</span>
                </button>
            `;
        }).join('');

        pulseTilesHost.querySelectorAll<HTMLElement>('.adv-tile-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sym = btn.getAttribute('data-sym');
                if (sym) {
                    onSelectSymbol(sym);
                    closeModal();
                }
            });
        });
    };

    pulseFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const f = btn.dataset.filter as 'All' | 'Gainers' | 'Losers';
            if (f) {
                currentPulseFilter = f;
                pulseFilterBtns.forEach(b => {
                    const match = b.dataset.filter === f;
                    b.style.color = match ? 'var(--foreground, #eeeef1)' : 'var(--muted-foreground, #8b949e)';
                    b.style.borderBottomColor = match ? '#3b82f6' : 'transparent';
                });
                renderPulseTiles();
            }
        });
    });

    renderPulseTiles();

    // ── Performance Comparison Chart Implementation ───────────────────────────
    const canvas = modal.querySelector<HTMLCanvasElement>('#adv-perf-canvas')!;
    const chartContainer = modal.querySelector<HTMLElement>('#adv-chart-container')!;
    const chartLoader = modal.querySelector<HTMLElement>('#adv-chart-loader')!;
    const tooltip = modal.querySelector<HTMLElement>('#adv-chart-tooltip')!;
    const ttDate = modal.querySelector<HTMLElement>('#adv-tt-date')!;
    const ttItems = modal.querySelector<HTMLElement>('#adv-tt-items')!;
    const legendHost = modal.querySelector<HTMLElement>('#adv-chart-legend')!;
    const tfBtns = modal.querySelectorAll<HTMLElement>('.adv-tf-btn');

    let normalizedSeries: NormalizedSeries[] = [];
    let hoveredIndex: number | null = null;
    let hoveredSymbol: string | null = null;
    let crosshairX: number | null = null;

    const daysForTf = (tf: typeof currentTimeframe): number => {
        switch (tf) {
            case '1M': return 30;
            case '3M': return 90;
            case '6M': return 180;
            case 'YTD': return getYTDDays();
            case '1Y': return 365;
        }
    };

    const loadChartData = async () => {
        chartLoader.style.display = 'flex';
        const limitDays = daysForTf(currentTimeframe);

        // Fetch top 8 symbols from watchlist
        const symbolsToFetch = watchlistItems.slice(0, 8);
        const results = await Promise.all(symbolsToFetch.map(s => fetchDailySeries(s.binanceSymbol || s.symbol, limitDays)));

        const seriesList: NormalizedSeries[] = [];
        results.forEach((res, idx) => {
            if (res.data.length >= 2) {
                const baseClose = res.data[0].close;
                const points = res.data.map(d => ({
                    time: d.time,
                    pct: ((d.close - baseClose) / baseClose) * 100,
                }));
                const finalPct = points[points.length - 1].pct;
                seriesList.push({
                    symbol: res.symbol,
                    color: SYMBOL_COLORS[idx % SYMBOL_COLORS.length],
                    points,
                    finalPct,
                });
            }
        });

        normalizedSeries = seriesList;
        chartLoader.style.display = 'none';
        renderCanvas();
        renderLegend();
    };

    const renderCanvas = () => {
        const width = chartContainer.clientWidth || 700;
        const height = chartContainer.clientHeight || 290;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, width, height);

        if (normalizedSeries.length === 0) {
            ctx.fillStyle = '#8b949e';
            ctx.font = '12px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No historical klines available for selected symbols', width / 2, height / 2);
            return;
        }

        const padLeft = 14;
        const padRight = 55;
        const padTop = 18;
        const padBottom = 26;
        const plotWidth = width - padLeft - padRight;
        const plotHeight = height - padTop - padBottom;

        const allPcts = normalizedSeries.flatMap(s => s.points.map(p => p.pct));
        const minPct = Math.min(...allPcts, 0);
        const maxPct = Math.max(...allPcts, 0);
        const span = Math.max(maxPct - minPct, 4);
        const pad = span * 0.12;
        const yMin = minPct - pad;
        const yMax = maxPct + pad;
        const yRange = yMax - yMin;

        const getY = (pct: number) => padTop + plotHeight * (1 - (pct - yMin) / yRange);

        // Find reference point count
        const maxPoints = Math.max(...normalizedSeries.map(s => s.points.length));
        const getX = (idx: number, total: number) => padLeft + (idx / Math.max(1, total - 1)) * plotWidth;

        // ── Grid & Axes ────────────────────────────────────────────────────────
        // Horizontal Zero Line (0.0%)
        const y0 = getY(0);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padLeft, y0);
        ctx.lineTo(padLeft + plotWidth, y0);
        ctx.stroke();

        // Zero label
        ctx.setLineDash([]);
        ctx.fillStyle = '#60a5fa';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(' 0.0%', padLeft + plotWidth + 4, y0 + 3.5);
        ctx.restore();

        // Additional Horizontal Grid Lines
        const step = span > 80 ? 25 : span > 40 ? 15 : span > 20 ? 10 : 5;
        const firstGrid = Math.ceil(yMin / step) * step;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.setLineDash([2, 4]);

        for (let g = firstGrid; g <= yMax; g += step) {
            if (Math.abs(g) < 0.1) continue; // skip 0 (already drawn)
            const gy = getY(g);
            if (gy < padTop || gy > padTop + plotHeight) continue;
            ctx.beginPath();
            ctx.moveTo(padLeft, gy);
            ctx.lineTo(padLeft + plotWidth, gy);
            ctx.stroke();

            const lbl = (g > 0 ? '+' : '') + g.toFixed(0) + '%';
            ctx.fillText(lbl, padLeft + plotWidth + 4, gy + 3.5);
        }
        ctx.restore();

        // Date X Axis Labels
        const longestSeries = normalizedSeries.reduce((prev, curr) => curr.points.length > prev.points.length ? curr : prev, normalizedSeries[0]);
        if (longestSeries && longestSeries.points.length > 0) {
            const n = longestSeries.points.length;
            const dateTicks = 5;
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = '10px -apple-system, sans-serif';
            ctx.textAlign = 'center';

            for (let i = 0; i < dateTicks; i++) {
                const idx = Math.min(n - 1, Math.floor((i / (dateTicks - 1)) * (n - 1)));
                const pt = longestSeries.points[idx];
                const x = getX(idx, n);
                const dStr = new Date(pt.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                ctx.fillText(dStr, x, padTop + plotHeight + 18);
            }
            ctx.restore();
        }

        // ── Plot Multi-Lines ───────────────────────────────────────────────────
        for (const s of normalizedSeries) {
            const isTarget = hoveredSymbol === s.symbol;
            const isDimmed = hoveredSymbol !== null && !isTarget;
            const total = s.points.length;
            if (total < 2) continue;

            ctx.save();
            ctx.strokeStyle = s.color;
            ctx.lineWidth = isTarget ? 3 : 1.75;
            ctx.globalAlpha = isDimmed ? 0.2 : 1.0;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            ctx.beginPath();
            for (let i = 0; i < total; i++) {
                const x = getX(i, total);
                const y = getY(s.points[i].pct);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // End glowing point
            const lastIdx = total - 1;
            const endX = getX(lastIdx, total);
            const endY = getY(s.points[lastIdx].pct);
            ctx.beginPath();
            ctx.arc(endX, endY, isTarget ? 4.5 : 3, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.fill();
            if (isTarget) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            ctx.restore();
        }

        // ── Crosshair & Intersection Dots ─────────────────────────────────────
        if (hoveredIndex !== null && crosshairX !== null && longestSeries) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(crosshairX, padTop);
            ctx.lineTo(crosshairX, padTop + plotHeight);
            ctx.stroke();
            ctx.setLineDash([]);

            // Dot on each series
            for (const s of normalizedSeries) {
                const isTarget = hoveredSymbol === s.symbol;
                const isDimmed = hoveredSymbol !== null && !isTarget;
                const pt = s.points[hoveredIndex];
                if (!pt) continue;
                const y = getY(pt.pct);

                ctx.save();
                ctx.globalAlpha = isDimmed ? 0.2 : 1.0;
                ctx.beginPath();
                ctx.arc(crosshairX, y, isTarget ? 5 : 3.5, 0, Math.PI * 2);
                ctx.fillStyle = s.color;
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.restore();
            }
            ctx.restore();
        }
    };

    const renderLegend = () => {
        legendHost.innerHTML = normalizedSeries.map(s => `
            <div class="adv-legend-pill" data-sym="${s.symbol}" style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; background: var(--muted, #1f232e); border: 1px solid var(--border, #262832); font-size: 11px; cursor: pointer; transition: all 0.15s; ${hoveredSymbol === s.symbol ? 'border-color: ' + s.color + '; background: color-mix(in srgb, ' + s.color + ' 16%, var(--muted, #1f232e));' : ''}">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${s.color};"></span>
                <strong style="color: var(--foreground, #eeeef1);">${s.symbol}</strong>
                <span style="font-size: 10px; font-weight: 600; color: ${s.finalPct >= 0 ? 'var(--constructive, #10b981)' : 'var(--destructive, #ef4444)'};">${s.finalPct >= 0 ? '+' : ''}${s.finalPct.toFixed(1)}%</span>
            </div>
        `).join('');

        legendHost.querySelectorAll<HTMLElement>('.adv-legend-pill').forEach(pill => {
            const sym = pill.dataset.sym;
            pill.addEventListener('mouseenter', () => {
                hoveredSymbol = sym || null;
                renderCanvas();
            });
            pill.addEventListener('mouseleave', () => {
                hoveredSymbol = null;
                renderCanvas();
            });
            pill.addEventListener('click', () => {
                if (sym) {
                    onSelectSymbol(sym);
                    closeModal();
                }
            });
        });
    };

    // Canvas Mouse Interaction (Crosshair + Tooltip)
    chartContainer.addEventListener('mousemove', (e) => {
        if (normalizedSeries.length === 0) return;
        const rect = chartContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const padLeft = 14;
        const padRight = 55;
        const plotWidth = rect.width - padLeft - padRight;

        if (mouseX < padLeft || mouseX > padLeft + plotWidth) {
            tooltip.style.display = 'none';
            hoveredIndex = null;
            crosshairX = null;
            renderCanvas();
            return;
        }

        const longestSeries = normalizedSeries.reduce((prev, curr) => curr.points.length > prev.points.length ? curr : prev, normalizedSeries[0]);
        const n = longestSeries.points.length;
        const idx = Math.min(n - 1, Math.max(0, Math.round(((mouseX - padLeft) / plotWidth) * (n - 1))));

        hoveredIndex = idx;
        crosshairX = padLeft + (idx / Math.max(1, n - 1)) * plotWidth;

        // Populate tooltip
        const barTime = longestSeries.points[idx]?.time;
        if (barTime) {
            ttDate.textContent = new Date(barTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        }

        // Sort series by performance at this date
        const ranked = normalizedSeries
            .map(s => ({ symbol: s.symbol, color: s.color, pct: s.points[idx]?.pct ?? 0 }))
            .sort((a, b) => b.pct - a.pct);

        ttItems.innerHTML = ranked.map(r => `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 11px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 7px; height: 7px; border-radius: 50%; background: ${r.color};"></span>
                    <span style="font-weight: 600; color: #f0f3f6;">${r.symbol}</span>
                </div>
                <span style="font-weight: 700; font-family: monospace; color: ${r.pct >= 0 ? '#10b981' : '#ef4444'};">${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%</span>
            </div>
        `).join('');

        // Position Tooltip
        const tipWidth = 190;
        let tipX = crosshairX + 15;
        if (tipX + tipWidth > rect.width) tipX = crosshairX - tipWidth - 15;
        tooltip.style.left = `${tipX}px`;
        tooltip.style.top = `16px`;
        tooltip.style.display = 'block';

        renderCanvas();
    });

    chartContainer.addEventListener('mouseleave', () => {
        hoveredIndex = null;
        crosshairX = null;
        tooltip.style.display = 'none';
        renderCanvas();
    });

    window.addEventListener('resize', () => {
        if (activeModalEl && currentNavTab === 'overview') {
            renderCanvas();
        }
    });

    // Timeframe Button Clicks
    tfBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tf = btn.dataset.tf as typeof currentTimeframe;
            if (tf && tf !== currentTimeframe) {
                currentTimeframe = tf;
                tfBtns.forEach(b => {
                    const match = b.dataset.tf === tf;
                    b.style.fontWeight = match ? '600' : '500';
                    b.style.background = match ? 'var(--card, #181a20)' : 'transparent';
                    b.style.color = match ? 'var(--foreground, #eeeef1)' : 'var(--muted-foreground, #8b949e)';
                    b.style.borderColor = match ? 'var(--border, #262832)' : 'transparent';
                });
                void loadChartData();
            }
        });
    });

    void loadChartData();

    // ── Symbols Table View ─────────────────────────────────────────────────────
    const symbolsTbody = modal.querySelector<HTMLElement>('#adv-symbols-tbody')!;
    const symbolsSearch = modal.querySelector<HTMLInputElement>('#adv-symbols-search')!;
    const symbolsCount = modal.querySelector<HTMLElement>('#adv-symbols-count')!;

    const renderSymbolsTable = () => {
        const query = symbolsSearch.value.trim().toLowerCase();
        let items = watchlistItems;
        if (query) {
            items = items.filter(x => x.symbol.toLowerCase().includes(query) || x.name.toLowerCase().includes(query));
        }
        symbolsCount.textContent = String(items.length);

        symbolsTbody.innerHTML = items.map(it => {
            const isUp = it.changePercent >= 0;
            return `
                <tr style="border-bottom: 1px solid var(--border, #262832); transition: background 0.12s; cursor: pointer;" onmouseover="this.style.background='var(--muted, #1f232e)'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 12px 16px;">
                        <div style="display: flex; flex-direction: column;">
                            <strong style="color: var(--foreground, #eeeef1); font-size: 13px;">${it.symbol}</strong>
                            <span style="color: var(--muted-foreground, #8b949e); font-size: 11px;">${it.name}</span>
                        </div>
                    </td>
                    <td style="padding: 12px 16px;">
                        <span style="font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; background: rgba(255,255,255,0.06); color: var(--muted-foreground, #8b949e);">${it.category}</span>
                    </td>
                    <td style="padding: 12px 16px; text-align: right; font-weight: 600; font-family: monospace; color: var(--foreground, #eeeef1);">$${it.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                    <td style="padding: 12px 16px; text-align: right; font-weight: 500; font-family: monospace; color: ${isUp ? 'var(--constructive, #10b981)' : 'var(--destructive, #ef4444)'};">${isUp ? '+' : ''}${it.change.toFixed(2)}</td>
                    <td style="padding: 12px 16px; text-align: right;">
                        <span style="font-weight: 700; font-family: monospace; padding: 3px 8px; border-radius: 4px; color: ${isUp ? 'var(--constructive, #10b981)' : 'var(--destructive, #ef4444)'}; background: ${isUp ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'};">${isUp ? '+' : ''}${it.changePercent.toFixed(2)}%</span>
                    </td>
                    <td style="padding: 12px 16px; text-align: right; font-family: monospace; color: var(--muted-foreground, #8b949e);">$${it.high.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td style="padding: 12px 16px; text-align: right; font-family: monospace; color: var(--muted-foreground, #8b949e);">$${it.low.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td style="padding: 12px 16px; text-align: right; font-family: monospace; color: var(--muted-foreground, #8b949e);">${it.volume.toLocaleString()}</td>
                    <td style="padding: 12px 16px; text-align: center;">
                        <button class="adv-sym-open-btn" data-sym="${it.symbol}" style="all: unset; cursor: pointer; padding: 5px 12px; border-radius: 5px; font-size: 11px; font-weight: 600; background: #3b82f6; color: #fff;">Open Chart</button>
                    </td>
                </tr>
            `;
        }).join('');

        symbolsTbody.querySelectorAll<HTMLElement>('.adv-sym-open-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sym = btn.getAttribute('data-sym');
                if (sym) {
                    onSelectSymbol(sym);
                    closeModal();
                }
            });
        });

        symbolsTbody.querySelectorAll<HTMLTableRowElement>('tr').forEach(tr => {
            tr.addEventListener('click', () => {
                const btn = tr.querySelector<HTMLElement>('.adv-sym-open-btn');
                const sym = btn?.getAttribute('data-sym');
                if (sym) {
                    onSelectSymbol(sym);
                    closeModal();
                }
            });
        });
    };

    symbolsSearch.addEventListener('input', renderSymbolsTable);

    // ── News Feed View ─────────────────────────────────────────────────────────
    const newsFeed = modal.querySelector<HTMLElement>('#adv-news-feed')!;
    const newsRefreshBtn = modal.querySelector<HTMLElement>('#adv-news-refresh-btn')!;

    const loadNewsFeed = async () => {
        newsFeed.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--muted-foreground, #8b949e); font-size: 12px;">Fetching real-time intelligence...</div>';
        try {
            const sym = normalizeSymbol(currentActiveSymbol).replace(/USDT$/i, '') || 'BTC';
            const res = await fetch(`/api/markets/news?symbol=${encodeURIComponent(sym)}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.articles) && data.articles.length > 0) {
                    newsFeed.innerHTML = data.articles.map((a: any) => `
                        <div style="background: var(--card, #181a20); border: 1px solid var(--border, #262832); border-radius: 8px; padding: 14px 18px; display: flex; flex-direction: column; gap: 6px; transition: border-color 0.12s;" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='var(--border, #262832)'">
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(59, 130, 246, 0.15); color: #60a5fa;">${a.symbol || sym}</span>
                                    <span style="font-size: 11px; font-weight: 600; color: var(--muted-foreground, #8b949e);">${a.publisher || 'Market Wire'}</span>
                                </div>
                                <span style="font-size: 10px; color: var(--muted-foreground, #8b949e);">${a.publishedDate || ''}</span>
                            </div>
                            <a href="${a.url || '#'}" target="_blank" rel="noopener noreferrer" style="font-size: 14px; font-weight: 600; color: var(--foreground, #eeeef1); text-decoration: none; line-height: 1.4;">${a.title}</a>
                            ${a.text ? `<p style="margin: 0; font-size: 11px; color: var(--muted-foreground, #8b949e); line-height: 1.4;">${a.text}</p>` : ''}
                        </div>
                    `).join('');
                    return;
                }
            }
            newsFeed.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--muted-foreground, #8b949e); font-size: 12px;">No recent news found for this asset.</div>';
        } catch (e: any) {
            newsFeed.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--destructive, #ef4444); font-size: 12px;">Failed to load news: ${e.message}</div>`;
        }
    };

    newsRefreshBtn.addEventListener('click', () => {
        void loadNewsFeed();
    });
}
