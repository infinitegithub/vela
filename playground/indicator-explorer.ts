/**
 * LuxAlgo Indicator Explorer for Vela Workstation
 * Rich TradingView / Vela official-grade indicator catalog dialog.
 * Provides instant search, category filtering, preview images, and 1-click execution
 * across all 810+ LuxAlgo Library indicators and native WebGL studies.
 */

import { registerWidgetAction } from '../src/plugin';
import type { VelaWorkspace } from '../src/workspace';

export interface CatalogIndicator {
    slug: string;
    name: string;
    family: string;
    description: string;
    tags?: string[];
    image_url?: string;
    url?: string;
    isNative?: boolean;
    isSaved?: boolean;
    script?: string;
}

const NATIVE_INDICATORS: CatalogIndicator[] = [
    {
        slug: 'native-vrvp',
        name: 'Visible Range Volume Profile (VRVP)',
        family: 'volume-orderflow',
        description: 'Native Visible Range Volume Profile with WebGL pane rendering, buy/sell split volume bars, Point of Control (POC), and Value Area (VAH/VAL).',
        isNative: true,
        tags: ['volume', 'profile', 'native', 'orderflow'],
    },
    {
        slug: 'native-footprint',
        name: 'Footprint Order Flow Clusters',
        family: 'volume-orderflow',
        description: 'Native cluster chart style with aggressive buy/sell imbalances, delta profiling, and per-bar volume/delta metrics.',
        isNative: true,
        tags: ['footprint', 'orderflow', 'delta', 'native'],
    },
    {
        slug: 'native-lux-smc',
        name: 'Smart Money Concepts (LuxAlgo SMC)',
        family: 'smc-ict',
        description: 'Automatic Swing Highs/Lows, Break of Structure (BOS), Change of Character (CHoCH), Order Blocks (OB), and Fair Value Gaps (FVG).',
        isNative: true,
        tags: ['smc', 'market-structure', 'order-blocks', 'fvg', 'native'],
    },
    {
        slug: 'native-lux-divergence',
        name: 'Multi-Oscillator Divergence Engine',
        family: 'momentum',
        description: 'Identifies Regular & Hidden Bullish and Bearish divergences across dynamic swing pivots on RSI and Stochastic with connecting trendlines.',
        isNative: true,
        tags: ['divergence', 'rsi', 'stochastic', 'momentum', 'native'],
    },
    {
        slug: 'native-lux-channels',
        name: 'Trend Channels & Liquidity Sweeps',
        family: 'trend',
        description: 'Dynamic parallel swing channels with liquidity probe detection (Stop Hunts) and wick reversal markers.',
        isNative: true,
        tags: ['channels', 'liquidity', 'sweeps', 'trend', 'native'],
    },
    {
        slug: 'native-supertrend',
        name: 'SuperTrend',
        family: 'trend',
        description: 'ATR-based volatility trailing stop line with directional color coding and trend breakout signals.',
        isNative: true,
        tags: ['trend', 'trailing-stop', 'atr', 'native'],
    },
    {
        slug: 'native-bollinger',
        name: 'Bollinger Bands (BB)',
        family: 'volatility',
        description: 'Standard-deviation volatility envelopes centered on a simple moving average baseline.',
        isNative: true,
        tags: ['volatility', 'bands', 'native'],
    },
    {
        slug: 'native-keltner',
        name: 'Keltner Channels (KC)',
        family: 'volatility',
        description: 'Volatility-based envelopes set above and below an exponential moving average using Average True Range.',
        isNative: true,
        tags: ['volatility', 'channels', 'atr', 'native'],
    },
    {
        slug: 'native-ema',
        name: 'Exponential Moving Average (EMA)',
        family: 'trend',
        description: 'Lag-reduced moving average placing greater weight on the most recent price points.',
        isNative: true,
        tags: ['moving-average', 'trend', 'native'],
    },
    {
        slug: 'native-rsi',
        name: 'Relative Strength Index (RSI)',
        family: 'momentum',
        description: 'Classic momentum oscillator measuring the speed and velocity of directional price moves.',
        isNative: true,
        tags: ['momentum', 'oscillator', 'native'],
    },
    {
        slug: 'native-macd',
        name: 'MACD (Moving Average Convergence Divergence)',
        family: 'momentum',
        description: 'Momentum indicator tracking relationship between fast and slow exponential moving averages.',
        isNative: true,
        tags: ['momentum', 'macd', 'native'],
    },
    {
        slug: 'native-atr',
        name: 'Average True Range (ATR)',
        family: 'volatility',
        description: 'Volatility indicator computing the average price range over a specified lookback window.',
        isNative: true,
        tags: ['volatility', 'atr', 'native'],
    },
];

const FAMILY_METADATA: Record<string, { label: string; icon: string }> = {
    all: { label: 'All Indicators', icon: '🌐' },
    saved: { label: 'Saved & Custom', icon: '⭐' },
    native: { label: 'Native Studies', icon: '⚡' },
    'smc-ict': { label: 'Smart Money (SMC / ICT)', icon: '🏛️' },
    trend: { label: 'Trend Following', icon: '📈' },
    'volume-orderflow': { label: 'Volume & Order Flow', icon: '📊' },
    'market-structure': { label: 'Market Structure', icon: '📐' },
    statistics: { label: 'Statistics & Quant', icon: '📉' },
    levels: { label: 'Support & Resistance / Levels', icon: '🧱' },
    momentum: { label: 'Momentum & Oscillators', icon: '⚡' },
    patterns: { label: 'Patterns & Harmonics', icon: '🎯' },
    'time-seasonality': { label: 'Time & Seasonality', icon: '⏱️' },
    volatility: { label: 'Volatility & Envelopes', icon: '🌊' },
    'machine-learning': { label: 'Machine Learning & AI', icon: '🤖' },
    'sentiment-breadth': { label: 'Sentiment & Breadth', icon: '🧭' },
    'risk-exits': { label: 'Risk & Trailing Exits', icon: '🛡️' },
    other: { label: 'Community & Specialized', icon: '💡' },
};

let wsInstance: VelaWorkspace | null = null;
let modalContainer: HTMLElement | null = null;
let cachedCatalog: CatalogIndicator[] = [];
let savedIndicators: CatalogIndicator[] = [];
let currentCategory = 'all';
let searchQuery = '';
let selectedIndicator: CatalogIndicator | null = null;
let isLoaded = false;
let displayedLimit = 40;

export function setExplorerWorkspaceInstance(ws: VelaWorkspace) {
    wsInstance = ws;
}

function showToast(message: string, isError: boolean = false) {
    const existing = document.getElementById('vela-explorer-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'vela-explorer-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: ${isError ? 'var(--vela-down, #af6870)' : 'var(--vela-up, #a7be94)'};
        color: ${isError ? 'var(--vela-text-primary, #eeeef1)' : 'var(--vela-bg-panel, #121215)'};
        padding: 8px 18px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        z-index: 9999999;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: opacity 0.3s ease;
    `;
    toast.innerHTML = `<span>${isError ? '✗' : '✓'}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

async function loadData(): Promise<void> {
    if (isLoaded) return;
    try {
        const [catRes, savRes] = await Promise.all([
            fetch('/api/lux/catalog').catch(() => null),
            fetch('/api/indicators').catch(() => null),
        ]);

        if (catRes && catRes.ok) {
            const data = await catRes.json();
            cachedCatalog = (data.indicators || []).map((ind: any) => ({
                slug: ind.slug,
                name: ind.name,
                family: ind.family || 'other',
                description: ind.description || '',
                tags: ind.tags || [],
                image_url: ind.image_url,
                url: ind.url,
                isNative: false,
                isSaved: false,
            }));
        }

        if (savRes && savRes.ok) {
            const savData = await savRes.json();
            savedIndicators = (savData || []).map((ind: any) => ({
                slug: ind.id,
                name: ind.name,
                family: 'saved',
                description: ind.description || 'Custom user indicator',
                script: ind.script,
                isNative: false,
                isSaved: true,
            }));
        }
        isLoaded = true;
    } catch (e) {
        console.warn('[IndicatorExplorer] Failed to load initial data:', e);
    }
}

export function registerIndicatorExplorer() {
    registerWidgetAction({
        id: 'indicators',
        target: 'topbar',
        label: 'Indicators',
        icon: 'indicators',
        order: 4,
        run: () => {
            openIndicatorExplorer();
        },
    });

    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', (e) => {
            if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
                e.preventDefault();
                openIndicatorExplorer();
            }
        });
    }
}

export async function openIndicatorExplorer() {
    if (modalContainer) {
        modalContainer.remove();
        modalContainer = null;
    }

    await loadData();

    modalContainer = document.createElement('div');
    modalContainer.id = 'vela-indicator-explorer-overlay';
    modalContainer.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: var(--vela-bg-card, #232429);
        border: 1px solid var(--vela-border, #262629);
        border-radius: 10px;
        width: 1040px;
        max-width: 95vw;
        height: 720px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.75);
        overflow: hidden;
        color: var(--vela-text-primary, #eeeef1);
    `;

    // ── Header ───────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        border-bottom: 1px solid var(--vela-border, #262629);
        background: var(--vela-bg-panel, #121215);
    `;
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <div style="color: var(--vela-up, #a7be94); display: flex; align-items: center;">
                <svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M2 13l4-5 3 3 5-7"/>
                    <circle cx="2" cy="13" r="1.5" fill="currentColor"/>
                    <circle cx="6" cy="8" r="1.5" fill="currentColor"/>
                    <circle cx="9" cy="11" r="1.5" fill="currentColor"/>
                    <circle cx="14" cy="4" r="1.5" fill="currentColor"/>
                </svg>
            </div>
            <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 700; font-size: 16px;">Indicators, Metrics & Strategies</span>
                    <span style="font-size: 10px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); padding: 2px 7px; border-radius: 10px; font-weight: 700;">LuxAlgo Library · 810+ Ready</span>
                </div>
                <div style="font-size: 11px; color: var(--vela-text-secondary, #757882);">Official LuxAlgo Library & Native High-Performance WebGL Studies</div>
            </div>
        </div>
        <button id="vela-ind-close-btn" style="background: transparent; border: none; color: var(--vela-text-secondary, #757882); font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 4px;">✕</button>
    `;

    // ── Search & Filter Bar ──────────────────────────────────────────────────
    const searchBar = document.createElement('div');
    searchBar.style.cssText = `
        display: flex;
        align-items: center;
        padding: 10px 20px;
        background: var(--vela-bg-main, #202126);
        border-bottom: 1px solid var(--vela-border, #262629);
        gap: 12px;
    `;

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search 810+ indicators (e.g. "supertrend", "divergence", "order blocks", "vwap", "clustering")...';
    searchInput.value = searchQuery;
    searchInput.style.cssText = `
        flex: 1;
        background: var(--vela-bg-panel, #121215);
        border: 1px solid var(--vela-border, #262629);
        color: var(--vela-text-primary, #eeeef1);
        padding: 9px 14px;
        border-radius: 6px;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s;
    `;
    searchInput.onfocus = () => { searchInput.style.borderColor = 'var(--vela-accent, #3b82f6)'; };
    searchInput.onblur = () => { searchInput.style.borderColor = 'var(--vela-border, #262629)'; };

    const countBadge = document.createElement('div');
    countBadge.style.cssText = 'font-size: 12px; color: var(--vela-text-secondary, #757882); white-space: nowrap;';

    searchBar.appendChild(searchInput);
    searchBar.appendChild(countBadge);

    // ── Body Container ────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.style.cssText = 'flex: 1; display: flex; overflow: hidden;';

    // 1. Sidebar (Categories)
    const sidebar = document.createElement('div');
    sidebar.style.cssText = `
        width: 220px;
        background: var(--vela-bg-panel, #121215);
        border-right: 1px solid var(--vela-border, #262629);
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        padding: 8px 6px;
        flex-shrink: 0;
    `;

    // 2. Middle List (Indicator Cards)
    const listPane = document.createElement('div');
    listPane.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        padding: 12px 16px;
        gap: 8px;
        background: var(--vela-bg-card, #232429);
    `;

    // 3. Right Preview Pane
    const previewPane = document.createElement('div');
    previewPane.style.cssText = `
        width: 320px;
        background: var(--vela-bg-panel, #121215);
        border-left: 1px solid var(--vela-border, #262629);
        display: flex;
        flex-direction: column;
        padding: 16px;
        overflow-y: auto;
        flex-shrink: 0;
    `;

    body.appendChild(sidebar);
    body.appendChild(listPane);
    body.appendChild(previewPane);

    dialog.appendChild(header);
    dialog.appendChild(searchBar);
    dialog.appendChild(body);
    modalContainer.appendChild(dialog);
    document.body.appendChild(modalContainer);

    // Close handlers
    const closeModal = () => {
        if (modalContainer) {
            modalContainer.remove();
            modalContainer = null;
        }
    };
    dialog.querySelector('#vela-ind-close-btn')?.addEventListener('click', closeModal);
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) closeModal();
    });
    window.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            closeModal();
            window.removeEventListener('keydown', escHandler);
        }
    });

    // ── Helper to filter indicators ──────────────────────────────────────────
    function getFilteredList(): CatalogIndicator[] {
        let pool: CatalogIndicator[] = [];

        if (currentCategory === 'saved') {
            pool = [...savedIndicators];
        } else if (currentCategory === 'native') {
            pool = [...NATIVE_INDICATORS];
        } else if (currentCategory === 'all') {
            pool = [...savedIndicators, ...NATIVE_INDICATORS, ...cachedCatalog];
        } else {
            pool = [
                ...NATIVE_INDICATORS.filter(i => i.family === currentCategory),
                ...cachedCatalog.filter(i => i.family === currentCategory),
            ];
        }

        const q = searchQuery.trim().toLowerCase();
        if (!q) return pool;

        return pool.filter(ind => {
            return (
                ind.name.toLowerCase().includes(q) ||
                ind.description.toLowerCase().includes(q) ||
                ind.slug.toLowerCase().includes(q) ||
                (ind.tags && ind.tags.some(t => t.toLowerCase().includes(q)))
            );
        });
    }

    // ── Render Sidebar ────────────────────────────────────────────────────────
    function renderSidebar() {
        sidebar.replaceChildren();

        const categories = [
            'all',
            'saved',
            'native',
            'smc-ict',
            'trend',
            'volume-orderflow',
            'market-structure',
            'statistics',
            'levels',
            'momentum',
            'patterns',
            'time-seasonality',
            'volatility',
            'machine-learning',
            'sentiment-breadth',
            'risk-exits',
            'other',
        ];

        for (const cat of categories) {
            const meta = FAMILY_METADATA[cat] || { label: cat, icon: '•' };
            const btn = document.createElement('button');
            const isActive = currentCategory === cat;

            // calculate count
            let count = 0;
            if (cat === 'all') count = cachedCatalog.length + NATIVE_INDICATORS.length + savedIndicators.length;
            else if (cat === 'saved') count = savedIndicators.length;
            else if (cat === 'native') count = NATIVE_INDICATORS.length;
            else count = cachedCatalog.filter(i => i.family === cat).length + NATIVE_INDICATORS.filter(i => i.family === cat).length;

            btn.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                background: ${isActive ? 'var(--vela-bg-card, #232429)' : 'transparent'};
                color: ${isActive ? 'var(--vela-text-primary, #eeeef1)' : 'var(--vela-text-secondary, #757882)'};
                border: none;
                border-left: 3px solid ${isActive ? 'var(--vela-up, #a7be94)' : 'transparent'};
                padding: 7px 10px;
                border-radius: 0 4px 4px 0;
                font-size: 12px;
                font-weight: ${isActive ? '700' : '500'};
                cursor: pointer;
                text-align: left;
                margin-bottom: 2px;
                transition: background 0.15s;
            `;

            btn.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <span>${meta.icon}</span>
                    <span style="overflow: hidden; text-overflow: ellipsis;">${meta.label}</span>
                </div>
                <span style="font-size: 10px; opacity: 0.7; margin-left: 4px;">${count}</span>
            `;

            btn.onmouseenter = () => {
                if (!isActive) btn.style.background = 'rgba(255,255,255,0.03)';
            };
            btn.onmouseleave = () => {
                if (!isActive) btn.style.background = 'transparent';
            };

            btn.onclick = () => {
                currentCategory = cat;
                displayedLimit = 40;
                renderSidebar();
                renderList();
            };

            sidebar.appendChild(btn);
        }
    }

    // ── Render Right Preview Pane ─────────────────────────────────────────────
    function renderPreview() {
        previewPane.replaceChildren();

        if (!selectedIndicator) {
            previewPane.innerHTML = `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--vela-text-secondary, #757882); gap: 10px;">
                    <div style="font-size: 32px; opacity: 0.4;">👁</div>
                    <div style="font-size: 13px; font-weight: 600;">Select an indicator to preview</div>
                    <div style="font-size: 11px; max-width: 200px;">Click any study in the catalog to view formulas, screenshot previews, and instant execution.</div>
                </div>
            `;
            return;
        }

        const ind = selectedIndicator;
        const meta = FAMILY_METADATA[ind.family] || { label: ind.family, icon: '•' };

        const content = document.createElement('div');
        content.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

        // Image preview if present
        let imgHtml = '';
        if (ind.image_url) {
            imgHtml = `
                <div style="border-radius: 6px; overflow: hidden; border: 1px solid var(--vela-border, #262629); background: #000; max-height: 160px; display: flex; align-items: center; justify-content: center;">
                    <img src="${ind.image_url}" alt="${ind.name}" style="width: 100%; height: auto; display: block; object-fit: cover;" onerror="this.parentElement.style.display='none'"/>
                </div>
            `;
        }

        content.innerHTML = `
            ${imgHtml}
            <div>
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                    <span style="font-size: 10px; background: rgba(167, 190, 148, 0.15); color: var(--vela-up, #a7be94); padding: 2px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">
                        ${ind.isNative ? 'Native WebGL' : 'Pine Script v5/v6'}
                    </span>
                    <span style="font-size: 10px; color: var(--vela-text-secondary, #757882);">${meta.icon} ${meta.label}</span>
                </div>
                <div style="font-size: 16px; font-weight: 700; color: var(--vela-text-primary, #eeeef1); line-height: 1.3;">
                    ${ind.name}
                </div>
            </div>

            <div style="font-size: 12px; color: var(--vela-text-secondary, #757882); line-height: 1.5; max-height: 200px; overflow-y: auto;">
                ${ind.description}
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                <button id="vela-preview-apply-btn" style="
                    background: var(--vela-up, #a7be94);
                    color: var(--vela-bg-panel, #121215);
                    border: none;
                    border-radius: 6px;
                    padding: 10px;
                    font-size: 13px;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                ">
                    <span>+ Add to Active Chart</span>
                </button>

                ${!ind.isNative ? `
                <button id="vela-preview-editor-btn" style="
                    background: transparent;
                    color: var(--vela-text-primary, #eeeef1);
                    border: 1px solid var(--vela-border, #262629);
                    border-radius: 6px;
                    padding: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                ">
                    ✏️ Inspect / Edit in Pine Editor
                </button>
                ` : ''}

                ${ind.url ? `
                <a href="${ind.url}" target="_blank" rel="noopener noreferrer" style="
                    font-size: 11px;
                    color: var(--vela-accent, #3b82f6);
                    text-decoration: none;
                    text-align: center;
                    margin-top: 4px;
                ">
                    View Formula & Docs on LuxAlgo ↗
                </a>
                ` : ''}
            </div>
        `;

        previewPane.appendChild(content);

        // Bind apply button
        const applyBtn = previewPane.querySelector('#vela-preview-apply-btn') as HTMLButtonElement;
        if (applyBtn) {
            applyBtn.onclick = () => applyIndicator(ind, applyBtn);
        }

        // Bind editor button
        const editorBtn = previewPane.querySelector('#vela-preview-editor-btn') as HTMLButtonElement;
        if (editorBtn) {
            editorBtn.onclick = async () => {
                editorBtn.textContent = 'Fetching source code...';
                try {
                    const res = await fetch(`/api/lux/source/${encodeURIComponent(ind.slug)}`);
                    if (res.ok) {
                        const data = await res.json();
                        closeModal();
                        // Open pine editor with this code
                        const pineBtn = document.querySelector('[data-action-id="pine.editor"]') as HTMLElement;
                        if (pineBtn) pineBtn.click();
                        setTimeout(() => {
                            const editorArea = document.querySelector('textarea') as HTMLTextAreaElement;
                            if (editorArea) {
                                editorArea.value = data.source;
                                showToast(`Loaded "${ind.name}" into Pine Script editor!`);
                            }
                        }, 200);
                    } else {
                        showToast('Failed to load source code for editor', true);
                        editorBtn.textContent = '✏️ Inspect / Edit in Pine Editor';
                    }
                } catch {
                    showToast('Network error retrieving script', true);
                    editorBtn.textContent = '✏️ Inspect / Edit in Pine Editor';
                }
            };
        }
    }

    // ── Apply Indicator to Active Chart ───────────────────────────────────────
    async function applyIndicator(ind: CatalogIndicator, btnElement?: HTMLButtonElement): Promise<void> {
        if (!wsInstance) {
            showToast('No active workspace available', true);
            return;
        }

        const active = wsInstance.active;
        if (!active || !active.chart) {
            showToast('Please select a chart cell first', true);
            return;
        }

        if (btnElement) {
            btnElement.disabled = true;
            btnElement.textContent = 'Compiling...';
        }

        try {
            if (ind.isNative) {
                // Native indicators
                const nativeType = ind.slug.replace('native-', '');
                if (typeof (active.chart as any).addNativeIndicator === 'function') {
                    await (active.chart as any).addNativeIndicator(nativeType);
                } else if (typeof (active as any).addNative === 'function') {
                    (active as any).addNative(nativeType);
                }
                showToast(`✓ Added native "${ind.name}" to chart!`);
                if (btnElement) {
                    btnElement.textContent = '✓ Added to Chart';
                    setTimeout(() => {
                        btnElement.disabled = false;
                        btnElement.textContent = '+ Add to Active Chart';
                    }, 2000);
                }
                return;
            }

            // Pine Script indicator from LuxAlgo Library
            let script = ind.script;
            if (!script) {
                const res = await fetch(`/api/lux/source/${encodeURIComponent(ind.slug)}`);
                if (!res.ok) {
                    throw new Error(`Failed to fetch source code (${res.statusText})`);
                }
                const data = await res.json();
                script = data.source;
            }

            if (!script) {
                throw new Error('Indicator script is empty');
            }

            // Run on active chart via PineWorkerEngine
            const result = await active.chart.runIndicator(script);
            if (result && result.ok) {
                showToast(`✓ Added "${ind.name}" to active chart!`);
                if (btnElement) {
                    btnElement.textContent = '✓ Added to Chart';
                    btnElement.style.background = '#4a7bb0';
                    setTimeout(() => {
                        btnElement.disabled = false;
                        btnElement.textContent = '+ Add to Active Chart';
                        btnElement.style.background = 'var(--vela-up, #a7be94)';
                    }, 2000);
                }
            } else {
                const msg = result?.error?.message || 'Script compilation failed';
                showToast(`Compilation error: ${msg}`, true);
                if (btnElement) {
                    btnElement.disabled = false;
                    btnElement.textContent = '✗ Error';
                    setTimeout(() => { btnElement.textContent = '+ Add to Active Chart'; }, 2000);
                }
            }
        } catch (err: any) {
            showToast(`Error: ${err.message}`, true);
            if (btnElement) {
                btnElement.disabled = false;
                btnElement.textContent = '+ Add to Active Chart';
            }
        }
    }

    // ── Render Center List ───────────────────────────────────────────────────
    function renderList() {
        listPane.replaceChildren();
        const items = getFilteredList();

        countBadge.textContent = `${items.length} ${items.length === 1 ? 'study' : 'studies'} found`;

        if (items.length === 0) {
            listPane.innerHTML = `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--vela-text-secondary, #757882); gap: 10px; padding: 40px;">
                    <div style="font-size: 28px;">🔍</div>
                    <div style="font-size: 14px; font-weight: 600;">No indicators found</div>
                    <div style="font-size: 12px;">Try adjusting your search terms or selecting another category.</div>
                </div>
            `;
            return;
        }

        const slice = items.slice(0, displayedLimit);

        for (const ind of slice) {
            const card = document.createElement('div');
            const isSelected = selectedIndicator?.slug === ind.slug;
            const meta = FAMILY_METADATA[ind.family] || { label: ind.family, icon: '•' };

            card.style.cssText = `
                background: ${isSelected ? 'var(--vela-bg-panel, #121215)' : 'var(--vela-surface-elev, #26272e)'};
                border: 1px solid ${isSelected ? 'var(--vela-accent, #3b82f6)' : 'var(--vela-border, #262629)'};
                border-radius: 6px;
                padding: 10px 14px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                cursor: pointer;
                transition: all 0.15s ease;
            `;

            card.onmouseenter = () => {
                if (!isSelected) card.style.borderColor = 'rgba(255,255,255,0.2)';
            };
            card.onmouseleave = () => {
                if (!isSelected) card.style.borderColor = 'var(--vela-border, #262629)';
            };

            const headerRow = document.createElement('div');
            headerRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px;';

            headerRow.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                    <span style="font-weight: 700; font-size: 13px; color: var(--vela-text-primary, #eeeef1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${ind.name}
                    </span>
                    <span style="font-size: 9px; background: rgba(255,255,255,0.06); color: var(--vela-text-secondary, #757882); padding: 1px 6px; border-radius: 4px; text-transform: uppercase; font-weight: 600; white-space: nowrap;">
                        ${meta.label}
                    </span>
                    ${ind.isNative ? `
                        <span style="font-size: 9px; background: rgba(167, 190, 148, 0.15); color: var(--vela-up, #a7be94); padding: 1px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">
                            Native
                        </span>
                    ` : `
                        <span style="font-size: 9px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 1px 6px; border-radius: 4px; font-weight: 700;">
                            Pine
                        </span>
                    `}
                </div>
            `;

            const applyBtn = document.createElement('button');
            applyBtn.textContent = '+ Apply';
            applyBtn.style.cssText = `
                background: var(--vela-up, #a7be94);
                color: var(--vela-bg-panel, #121215);
                border: none;
                border-radius: 4px;
                padding: 4px 10px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                flex-shrink: 0;
                transition: opacity 0.15s;
            `;
            applyBtn.onclick = (e) => {
                e.stopPropagation();
                applyIndicator(ind, applyBtn);
            };

            headerRow.appendChild(applyBtn);

            const descSnippet = document.createElement('div');
            descSnippet.style.cssText = `
                font-size: 11px;
                color: var(--vela-text-secondary, #757882);
                line-height: 1.4;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            `;
            descSnippet.textContent = ind.description || 'No description available.';

            card.appendChild(headerRow);
            card.appendChild(descSnippet);

            card.onclick = () => {
                selectedIndicator = ind;
                renderList();
                renderPreview();
            };

            listPane.appendChild(card);
        }

        // Infinite scroll / Load more
        if (slice.length < items.length) {
            const loadMore = document.createElement('button');
            loadMore.textContent = `Load More (${items.length - slice.length} remaining)...`;
            loadMore.style.cssText = `
                background: transparent;
                color: var(--vela-accent, #3b82f6);
                border: 1px dashed var(--vela-border, #262629);
                padding: 10px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                margin-top: 8px;
            `;
            loadMore.onclick = () => {
                displayedLimit += 40;
                renderList();
            };
            listPane.appendChild(loadMore);
        }
    }

    // Search input listener with debounce
    let searchTimer: any = null;
    searchInput.oninput = () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            searchQuery = searchInput.value;
            displayedLimit = 40;
            renderList();
        }, 120);
    };

    // Auto-select first item if none selected
    const initialList = getFilteredList();
    if (initialList.length > 0 && !selectedIndicator) {
        selectedIndicator = initialList[0];
    }

    renderSidebar();
    renderList();
    renderPreview();

    setTimeout(() => searchInput.focus(), 50);
}
