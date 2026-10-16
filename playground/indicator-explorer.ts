/**
 * LuxAlgo Official Indicator Explorer for Vela Workstation
 * 1:1 Pixel-Perfect Replica of the Official vela.luxalgo.com Indicators Modal
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
    date_displayed?: string;
    isNew?: boolean;
}

const STYLE_ID = 'vela-official-indicator-picker-styles';

const CSS = `
/* ==========================================================================
   OFFICIAL VELA INDICATOR PICKER STYLES (1:1 Match with vela.luxalgo.com)
   ========================================================================== */

#vela-indicator-explorer-overlay {
    position: fixed;
    inset: 0;
    background: var(--vela-backdrop, rgba(0, 0, 0, 0.7));
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--vela-z-dialog, 99999);
    font-family: var(--vela-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    animation: vela-ind-fade-in 120ms cubic-bezier(0.16, 1, 0.3, 1);
}

#vela-indicator-explorer-overlay,
#vela-indicator-explorer-overlay *,
#vela-indicator-explorer-overlay *::before,
#vela-indicator-explorer-overlay *::after {
    box-sizing: border-box !important;
}

/* ── Universal Themed Scrollbars ───────────────────────────────────── */
#vela-indicator-explorer-overlay *::-webkit-scrollbar {
    width: 6px !important;
    height: 6px !important;
}
#vela-indicator-explorer-overlay *::-webkit-scrollbar-track,
#vela-indicator-explorer-overlay *::-webkit-scrollbar-track-piece,
#vela-indicator-explorer-overlay *::-webkit-scrollbar-corner {
    background: transparent !important;
}
#vela-indicator-explorer-overlay *::-webkit-scrollbar-thumb {
    background: var(--vela-scroll, rgb(58, 59, 64)) !important;
    border-radius: 4px !important;
    border: 1px solid transparent !important;
    background-clip: padding-box !important;
}
#vela-indicator-explorer-overlay *::-webkit-scrollbar-thumb:hover {
    background: var(--vela-hover-strong, rgb(80, 82, 90)) !important;
}
#vela-indicator-explorer-overlay *::-webkit-scrollbar-button {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
}

/* Only apply scrollbar-width / scrollbar-color on browsers that don't support ::-webkit-scrollbar (e.g. Firefox) */
/* Avoid scrollbar-width in Chromium — it disables ::-webkit-scrollbar and triggers native white OS scrollbars */
@supports not selector(::-webkit-scrollbar) {
    #vela-indicator-explorer-overlay * {
        scrollbar-width: thin !important;
        scrollbar-color: var(--vela-scroll, rgb(58, 59, 64)) transparent !important;
    }
}

@keyframes vela-ind-fade-in {
    from { opacity: 0; transform: scale(0.985); }
    to { opacity: 1; transform: scale(1); }
}

.vela-ind-dialog {
    width: min(94vw, 1088px);
    height: min(85vh, 661px);
    background: var(--vela-surface, #202126);
    color: var(--vela-fg, #eeeef1);
    border: 1px solid var(--vela-border-strong, #262629);
    border-radius: 10px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.75), 0 4px 16px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    outline: none;
    user-select: none;
}

/* ── Header ────────────────────────────────────────────────────────── */
.vela-ind-header {
    height: 52px;
    padding: 0 16px 0 20px;
    border-bottom: 1px solid var(--vela-border, #262629);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-shrink: 0;
    background: var(--vela-surface, #16161a);
}

.vela-ind-title {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.15px;
    color: var(--vela-fg-bright, #f0f0f4);
    white-space: nowrap;
    width: 180px;
    flex-shrink: 0;
}

.vlx-il-search {
    flex: 1;
    max-width: 520px;
    height: 36px;
    background: var(--vela-surface-elev, #1a1b20);
    border: 1px solid var(--vela-border, #262629);
    border-radius: 8px;
    display: flex;
    align-items: center;
    padding: 0 10px 0 12px;
    gap: 8px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.vlx-il-search:focus-within {
    border-color: var(--vela-border-strong, #3b3c45);
    box-shadow: 0 0 0 1px var(--vela-border-strong, #3b3c45);
}

.vlx-il-search-icon {
    color: var(--vela-fg-muted, #757882);
    display: flex;
    align-items: center;
    flex-shrink: 0;
}

.vlx-il-search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--vela-fg, #d1d4dc);
    font-size: 13.5px;
    font-family: inherit;
    min-width: 0;
}

.vlx-il-search-input::placeholder {
    color: var(--vela-fg-muted, #757882);
    opacity: 0.8;
}

.vlx-il-key-badge {
    border: 1px solid var(--vela-border, #262629);
    background: var(--vela-surface, #16161a);
    color: var(--vela-fg-muted, #757882);
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 11px;
    font-weight: 600;
    line-height: 14px;
    flex-shrink: 0;
    pointer-events: none;
}

.vlx-il-clear {
    background: transparent;
    border: none;
    color: var(--vela-fg-muted, #757882);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    border-radius: 4px;
}

.vlx-il-clear:hover {
    color: var(--vela-fg-bright, #f0f0f4);
    background: var(--vela-hover, rgba(255, 255, 255, 0.05));
}

.vela-ind-close {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: var(--vela-fg-muted, #757882);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, color 0.12s;
}

.vela-ind-close:hover {
    background: var(--vela-hover, rgba(255, 255, 255, 0.06));
    color: var(--vela-fg-bright, #f0f0f4);
}

/* ── Body ──────────────────────────────────────────────────────────── */
.vlx-il-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--vela-surface, #16161a);
}

/* ── Rail (Left Categories Sidebar) ────────────────────────────────── */
.vlx-il-rail {
    width: 204px;
    flex-shrink: 0;
    border-right: 1px solid var(--vela-border, #262629);
    padding: 8px 6px 12px;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.vlx-il-rail-group {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--vela-fg-muted, #757882);
    padding: 10px 8px 4px;
}

.vlx-il-tab {
    height: 34px;
    border-radius: 6px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    color: var(--vela-fg, #d1d4dc);
    font-size: 13px;
    font-weight: 500;
    transition: background 0.12s, color 0.12s;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
}

.vlx-il-tab:hover {
    background: var(--vela-hover, rgba(255, 255, 255, 0.04));
    color: var(--vela-fg-bright, #f0f0f4);
}

.vlx-il-tab--active {
    background: rgba(255, 255, 255, 0.08) !important;
    color: var(--vela-fg-bright, #f0f0f4) !important;
    font-weight: 600 !important;
}

.vlx-il-tab-icon {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--vela-fg-muted, #757882);
    flex-shrink: 0;
}

.vlx-il-tab--active .vlx-il-tab-icon,
.vlx-il-tab:hover .vlx-il-tab-icon {
    color: var(--vela-fg-bright, #f0f0f4);
}

.vlx-il-tab-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vlx-il-tab-count {
    font-size: 11px;
    color: var(--vela-fg-muted, #757882);
    font-variant-numeric: tabular-nums;
    font-weight: 400;
}

/* ── Content View (Middle Cards/Grid Area) ─────────────────────────── */
.vlx-il-content {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.vlx-il-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.vlx-il-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.vlx-il-section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--vela-fg-bright, #f0f0f4);
}

.vlx-il-section-action {
    font-size: 12px;
    color: var(--vela-fg-muted, #757882);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: none;
    padding: 2px 4px;
    border-radius: 4px;
    transition: color 0.12s;
}

.vlx-il-section-action:hover {
    color: var(--vela-fg-bright, #f0f0f4);
}

.vlx-il-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}

/* ── Card Component ────────────────────────────────────────────────── */
.vlx-il-card {
    background: var(--vela-surface-elev, #1a1b20);
    border: 1px solid var(--vela-border, #262629);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    transition: border-color 0.14s ease, box-shadow 0.14s ease;
    position: relative;
    user-select: none;
}

.vlx-il-card:hover {
    border-color: var(--vela-border-strong, #3a3b44);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}

.vlx-il-card--selected {
    border-color: var(--vela-border-strong, #525460) !important;
    box-shadow: 0 0 0 1px var(--vela-border-strong, #525460), 0 4px 16px rgba(0, 0, 0, 0.4) !important;
}

.vlx-il-card-media {
    position: relative;
    aspect-ratio: 16 / 10;
    width: 100%;
    background: #09090b;
    overflow: hidden;
    border-bottom: 1px solid var(--vela-border, #262629);
}

.vlx-il-card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.vlx-il-card-top-actions {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    align-items: center;
    gap: 5px;
    z-index: 2;
}

.vlx-il-card-btn {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.75);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    transition: background 0.12s, color 0.12s;
    padding: 0;
}

.vlx-il-card-btn:hover {
    background: rgba(25, 25, 32, 0.95);
    color: #fff;
}

.vlx-il-card-btn--starred {
    color: #f59e0b !important;
}

.vlx-il-card-details {
    padding: 8px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}

.vlx-il-card-badge {
    font-size: 11.5px;
    font-weight: 500;
    color: #848e9c;
    margin-bottom: 1px;
    line-height: 14px;
}

.vlx-il-card-title {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--vela-fg-bright, #f0f0f4);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    height: 35px;
    margin-bottom: 1px;
}

.vlx-il-card-sub {
    font-size: 11.5px;
    color: var(--vela-fg-muted, #757882);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: -0.01em;
}

/* ── Inspector (Right Preview Panel) ───────────────────────────────── */
.vlx-il-inspector {
    width: 312px;
    flex-shrink: 0;
    border-left: 1px solid var(--vela-border, #262629);
    padding: 16px 18px 16px;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--vela-surface, #16161a);
}

.vlx-il-insp-media {
    width: 100%;
    aspect-ratio: 16 / 10;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--vela-border, #262629);
    background: #09090b;
    flex-shrink: 0;
}

.vlx-il-insp-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.vlx-il-insp-meta {
    font-size: 11.5px;
    color: var(--vela-fg-muted, #757882);
    font-weight: 500;
}

.vlx-il-insp-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--vela-fg-bright, #f0f0f4);
    line-height: 1.25;
    margin-top: -4px;
}

.vlx-il-insp-desc {
    font-size: 12.5px;
    color: var(--vela-fg-muted, #757882);
    line-height: 1.55;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 6;
    -webkit-box-orient: vertical;
    text-overflow: ellipsis;
    word-break: break-word;
}

.vlx-il-insp-link {
    font-size: 12px;
    color: var(--vela-accent, #3b82f6);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 500;
    align-self: flex-start;
}

.vlx-il-insp-link:hover {
    text-decoration: underline;
}

.vlx-il-insp-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: auto;
    padding-top: 8px;
}

.vlx-il-btn-add {
    width: 100%;
    height: 38px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: var(--vela-button-light-bg, var(--vela-selected-bg, #eeeef1));
    color: var(--vela-button-light-text, var(--vela-selected-fg, #121215));
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    transition: opacity 0.12s;
}

.vlx-il-btn-add:hover {
    opacity: 0.92;
}

.vlx-il-btn-kbd {
    border: 1px solid rgba(0, 0, 0, 0.2);
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    padding: 0 4px;
    font-size: 11px;
    line-height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 5px;
    color: inherit;
    opacity: 0.75;
    font-family: inherit;
    font-weight: 600;
}

.vlx-il-btn-sec {
    width: 100%;
    height: 36px;
    border-radius: 8px;
    border: 1px solid var(--vela-border-strong, #262629);
    background: transparent;
    color: var(--vela-fg, #eeeef1);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.vlx-il-btn-sec:hover {
    background: var(--vela-hover, rgba(255, 255, 255, 0.05));
    color: var(--vela-fg-bright, #f0f0f4);
    border-color: var(--vela-fg-muted, #757882);
}

.vlx-il-btn-sec--starred {
    border-color: #f59e0b !important;
    color: #f59e0b !important;
}

/* ── Footer ────────────────────────────────────────────────────────── */
.vlx-il-footer {
    height: 38px;
    flex-shrink: 0;
    border-top: 1px solid var(--vela-border, #262629);
    padding: 0 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11.5px;
    color: var(--vela-fg-muted, #757882);
    background: var(--vela-surface, #16161a);
}

.vlx-il-footer-keys {
    display: flex;
    align-items: center;
    gap: 14px;
}

.vlx-il-key-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

.vlx-il-key {
    background: var(--vela-surface-elev, #1a1b20);
    border: 1px solid var(--vela-border, #262629);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--vela-fg, #d1d4dc);
    line-height: 14px;
}

.vlx-il-footer-status {
    font-size: 11.5px;
    color: var(--vela-fg-muted, #757882);
}

.vlx-il-empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--vela-fg-muted, #757882);
    font-size: 13.5px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}
`;

function svg(body: string, viewBox = '0 0 16 16', width = 16, height = 16): string {
    return `<svg viewBox="${viewBox}" width="${width}" height="${height}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

const ICONS = {
    search: svg('<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/>'),
    close: svg('<path d="m3.8 3.8 8.4 8.4M12.2 3.8l-8.4 8.4"/>'),
    favorites: svg('<path d="M8 2.5l1.6 3.8 4.1.4-3.1 2.8.9 4-3.5-2.1-3.5 2.1.9-4-3.1-2.8 4.1-.4z"/>'),
    myscripts: svg('<circle cx="8" cy="5" r="2.8"/><path d="M3 13.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5"/>'),
    basic: svg('<path d="M2 12.5l4-5 3 3 5-7"/>'),
    orderflow: svg('<path d="M3 13.5v-4M6.5 13.5v-8M10 13.5v-10M13.5 13.5v-6"/>'),
    discover: svg('<circle cx="8" cy="8" r="6"/><polygon points="8 4 10.5 7.5 8 12 5.5 8.5" fill="currentColor"/>'),
    allscripts: svg('<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>'),
    concepts: svg('<path d="M8 2.5l5.5 2.8-5.5 2.8-5.5-2.8z"/><path d="M2.5 8.5l5.5 2.8 5.5-2.8"/><path d="M2.5 11.5l5.5 2.8 5.5-2.8"/>'),
    trend: svg('<path d="M2 12.5l4-5 3 3 5-7M10.5 3.5H14v3.5"/>'),
    momentum: svg('<path d="M1.5 8.5c2-4 4-4 6.5 0s4.5 4 6.5 0"/>'),
    volatility: svg('<path d="M1.5 3.5c4 0 6 3 13 3M1.5 12.5c4 0 6-3 13-3"/>'),
    volumeflow: svg('<path d="M2.5 13.5v-4M6 13.5v-8M9.5 13.5v-10M13 13.5v-6"/>'),
    structure: svg('<circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="1.5"/><line x1="8" y1="1.5" x2="8" y2="3.5"/><line x1="8" y1="12.5" x2="8" y2="14.5"/><line x1="1.5" y1="8" x2="3.5" y2="8"/><line x1="12.5" y1="8" x2="14.5" y2="8"/>'),
    smcict: svg('<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.5"/><circle cx="8" cy="8" r="0.8" fill="currentColor"/>'),
    wyckoff: svg('<path d="M8 2.5l5.5 2.8-5.5 2.8-5.5-2.8z"/><path d="M2.5 8.5l5.5 2.8 5.5-2.8"/><path d="M2.5 11.5l5.5 2.8 5.5-2.8"/>'),
    elliott: svg('<polygon points="8 2.5 14 13.5 2 13.5"/>'),
    shuffle: svg('<path d="M11 2.5h3.5v3.5M14 2.5l-4.5 4.5M2 13.5l4-4M11 13.5h3.5V10M14 13.5l-8.5-8.5M2 2.5l3.5 3.5"/>', '0 0 16 16', 13, 13),
};

const CATEGORIES = [
    { group: 'YOURS', id: 'favorites', label: 'Favorites', icon: ICONS.favorites, count: 0 },
    { group: 'YOURS', id: 'myscripts', label: 'My scripts', icon: ICONS.myscripts, count: 0 },
    { group: 'BUILT-IN', id: 'basic', label: 'Basic', icon: ICONS.basic, count: 79 },
    { group: 'BUILT-IN', id: 'orderflow', label: 'Order flow', icon: ICONS.orderflow, count: 17 },
    { group: 'LIBRARY', id: 'discover', label: 'Discover', icon: ICONS.discover, count: null },
    { group: 'LIBRARY', id: 'allscripts', label: 'All scripts', icon: ICONS.allscripts, count: 810 },
    { group: 'LIBRARY', id: 'concepts', label: 'Concepts', icon: ICONS.concepts, count: 853 },
    { group: 'FAMILIES', id: 'trend', label: 'Trend', icon: ICONS.trend, count: 147 },
    { group: 'FAMILIES', id: 'momentum', label: 'Momentum', icon: ICONS.momentum, count: 103 },
    { group: 'FAMILIES', id: 'volatility', label: 'Volatility', icon: ICONS.volatility, count: 63 },
    { group: 'FAMILIES', id: 'volumeflow', label: 'Volume & Flow', icon: ICONS.volumeflow, count: 124 },
    { group: 'FAMILIES', id: 'structure', label: 'Structure', icon: ICONS.structure, count: 89 },
    { group: 'FAMILIES', id: 'smcict', label: 'SMC / ICT', icon: ICONS.smcict, count: 92 },
    { group: 'FAMILIES', id: 'wyckoff', label: 'Wyckoff', icon: ICONS.wyckoff, count: 15 },
    { group: 'FAMILIES', id: 'elliott', label: 'Elliott & Harmonics', icon: ICONS.elliott, count: 23 },
];

const FAVORITES_STORAGE_KEY = 'vela:indicators:favorites';

let wsInstance: VelaWorkspace | null = null;
let modalContainer: HTMLElement | null = null;
let cachedCatalog: CatalogIndicator[] = [];
let savedIndicators: CatalogIndicator[] = [];
let favoritesSet: Set<string> = loadFavorites();
let currentTab = 'discover';
let searchQuery = '';
let selectedIndicator: CatalogIndicator | null = null;
let isLoaded = false;
let displayedCards: CatalogIndicator[] = [];
let selectedCardIndex = 0;

export function setExplorerWorkspaceInstance(ws: VelaWorkspace) {
    wsInstance = ws;
}

function formatDate(str?: string): string {
    if (!str) return 'Oct 7, 2026';
    if (str.includes(',')) return str;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = str.split('-');
    if (parts.length === 3) {
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const y = parts[0];
        if (m >= 0 && m < 12 && !isNaN(d)) {
            return `${months[m]} ${d}, ${y}`;
        }
    }
    return str;
}

function loadFavorites(): Set<string> {
    try {
        const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
        if (raw) return new Set(JSON.parse(raw));
    } catch (_) {}
    return new Set();
}

let favSyncTimeout: any = null;
function saveFavorites(set: Set<string>, syncRemote = true) {
    const arr = Array.from(set);
    try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(arr));
    } catch (_) {}
    if (syncRemote && typeof window !== 'undefined') {
        clearTimeout(favSyncTimeout);
        favSyncTimeout = setTimeout(() => {
            fetch('/api/indicator-favorites', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ favorites: arr }),
                
            }).catch((err) => {
                console.warn('[favorites] Remote sync error:', err);
            });
        }, 300);
    }
}

let isFavHydrating = false;
async function syncFavoritesFromServer() {
    if (isFavHydrating) return;
    isFavHydrating = true;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch('/api/indicator-favorites', { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data?.favorites) ? data.favorites : (Array.isArray(data) ? data : null);
            if (Array.isArray(list)) {
                favoritesSet = new Set(list);
                saveFavorites(favoritesSet, false);
                const favCat = CATEGORIES.find(c => c.id === 'favorites');
                if (favCat) favCat.count = favoritesSet.size;
                isFavHydrating = false;
                return;
            }
        }
    } catch (e) {
        console.warn('[favorites] Server hydration warning:', e);
    }
    isFavHydrating = false;
}

if (typeof window !== 'undefined') {
    void syncFavoritesFromServer();

    const handleSync = () => {
        if (document.visibilityState === 'visible') {
            void syncFavoritesFromServer();
        }
    };
    window.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);
}

function toggleFavorite(slug: string): boolean {
    const isFav = favoritesSet.has(slug);
    if (isFav) {
        favoritesSet.delete(slug);
    } else {
        favoritesSet.add(slug);
    }
    const favCat = CATEGORIES.find(c => c.id === 'favorites');
    if (favCat) favCat.count = favoritesSet.size;
    saveFavorites(favoritesSet, true);
    return !isFav;
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
        background: ${isError ? 'var(--vela-down, #af6870)' : 'var(--vela-surface-elev, #1e1f24)'};
        color: var(--vela-fg-bright, #f0f0f4);
        border: 1px solid ${isError ? 'var(--vela-down, #af6870)' : 'var(--vela-border-strong, #3b3c45)'};
        padding: 8px 18px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
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
    }, 3200);
}

async function loadData(): Promise<void> {
    favoritesSet = loadFavorites();
    if (isLoaded) return;
    try {
        const [catRes, savRes] = await Promise.all([
            fetch('/api/lux/catalog').catch(() => null),
            fetch('/api/indicators').catch(() => null),
        ]);

        if (catRes && catRes.ok) {
            const data = await catRes.json();
            cachedCatalog = (data.indicators || []).map((ind: any, idx: number) => ({
                slug: ind.slug,
                name: ind.name,
                family: ind.family || 'trend',
                description: ind.description || '',
                tags: ind.tags || [],
                image_url: ind.image_url,
                url: ind.url,
                isNative: false,
                isSaved: false,
                date_displayed: formatDate(ind.date_displayed),
                isNew: idx < 12,
            }));
        }

        if (savRes && savRes.ok) {
            const savData = await savRes.json();
            savedIndicators = (savData || []).map((ind: any) => ({
                slug: ind.id,
                name: ind.name,
                family: 'myscripts',
                description: ind.description || 'Custom user Pine Script indicator',
                script: ind.script,
                isNative: false,
                isSaved: true,
                date_displayed: 'User Script',
            }));
        }
        isLoaded = true;
    } catch (e) {
        console.warn('[IndicatorExplorer] Failed to load catalog:', e);
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

    // Inject or update styles
    let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = CSS;

    // Default select Valid BOS Pullback if available
    selectedIndicator = cachedCatalog.find(i => i.slug === 'valid-bos-pullback') || cachedCatalog[0] || null;

    modalContainer = document.createElement('div');
    modalContainer.id = 'vela-indicator-explorer-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'vela-ind-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('tabindex', '-1');

    // ── Header ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'vela-ind-header';
    header.innerHTML = `
        <div class="vela-ind-title">Indicators</div>
        <div class="vlx-il-search">
            <span class="vlx-il-search-icon">${ICONS.search}</span>
            <input type="text" class="vlx-il-search-input" placeholder="Search indicators, concepts or aliases" spellcheck="false" autocomplete="off" />
            <button type="button" class="vlx-il-clear" title="Clear search" style="display: none;">${ICONS.close}</button>
            <span class="vlx-il-key-badge">/</span>
        </div>
        <button type="button" class="vela-ind-close" title="Close (Esc)">${ICONS.close}</button>
    `;

    // ── Body ────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'vlx-il-body';

    const rail = document.createElement('div');
    rail.className = 'vlx-il-rail';

    const content = document.createElement('div');
    content.className = 'vlx-il-content';

    const inspector = document.createElement('div');
    inspector.className = 'vlx-il-inspector';

    body.appendChild(rail);
    body.appendChild(content);
    body.appendChild(inspector);

    // ── Footer ──────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'vlx-il-footer';
    footer.innerHTML = `
        <div class="vlx-il-footer-keys">
            <span class="vlx-il-key-item"><span class="vlx-il-key">↑</span><span class="vlx-il-key">↓</span> Browse</span>
            <span class="vlx-il-key-item"><span class="vlx-il-key">↵</span> Add</span>
            <span class="vlx-il-key-item"><span class="vlx-il-key">⇧</span><span class="vlx-il-key">↵</span> Add, keep open</span>
            <span class="vlx-il-key-item"><span class="vlx-il-key">F</span> Favorite</span>
            <span class="vlx-il-key-item"><span class="vlx-il-key">Esc</span> Close</span>
        </div>
        <div class="vlx-il-footer-status">810 scripts · newest Oct 7, 2026</div>
    `;

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    modalContainer.appendChild(dialog);
    document.body.appendChild(modalContainer);

    const searchInput = header.querySelector('.vlx-il-search-input') as HTMLInputElement;
    const clearBtn = header.querySelector('.vlx-il-clear') as HTMLButtonElement;
    const closeBtn = header.querySelector('.vela-ind-close') as HTMLButtonElement;

    // ── Close handler ───────────────────────────────────────────────────
    const closeModal = () => {
        if (modalContainer) {
            modalContainer.remove();
            modalContainer = null;
        }
    };

    closeBtn.onclick = closeModal;
    modalContainer.onmousedown = (e) => {
        if (e.target === modalContainer) closeModal();
    };

    // ── Filter & Search Logic ───────────────────────────────────────────
    function getIndicatorsForCurrentView(): CatalogIndicator[] {
        const q = searchQuery.trim().toLowerCase();
        let pool: CatalogIndicator[] = [];

        if (currentTab === 'favorites') {
            pool = [...cachedCatalog, ...savedIndicators].filter(i => favoritesSet.has(i.slug));
        } else if (currentTab === 'myscripts') {
            pool = [...savedIndicators];
        } else if (currentTab === 'basic') {
            pool = cachedCatalog.filter(i => i.family === 'trend' || i.family === 'basic');
        } else if (currentTab === 'orderflow') {
            pool = cachedCatalog.filter(i => i.family.includes('orderflow') || i.family.includes('volume') || i.tags?.includes('orderflow'));
        } else if (currentTab === 'allscripts') {
            pool = [...cachedCatalog, ...savedIndicators];
        } else if (currentTab === 'concepts') {
            pool = cachedCatalog.filter(i => i.family.includes('smc') || i.tags?.includes('concept') || i.family.includes('structure'));
        } else if (currentTab === 'trend') {
            pool = cachedCatalog.filter(i => i.family === 'trend');
        } else if (currentTab === 'momentum') {
            pool = cachedCatalog.filter(i => i.family === 'momentum');
        } else if (currentTab === 'volatility') {
            pool = cachedCatalog.filter(i => i.family === 'volatility');
        } else if (currentTab === 'volumeflow') {
            pool = cachedCatalog.filter(i => i.family.includes('volume') || i.family.includes('orderflow'));
        } else if (currentTab === 'structure') {
            pool = cachedCatalog.filter(i => i.family.includes('structure'));
        } else if (currentTab === 'smcict') {
            pool = cachedCatalog.filter(i => i.family.includes('smc') || i.family.includes('ict'));
        } else if (currentTab === 'wyckoff') {
            pool = cachedCatalog.filter(i => i.family.includes('wyckoff'));
        } else if (currentTab === 'elliott') {
            pool = cachedCatalog.filter(i => i.family.includes('elliott') || i.family.includes('patterns'));
        } else {
            // Discover
            pool = cachedCatalog;
        }

        if (!q) return pool;

        return pool.filter(ind => {
            return (
                ind.name.toLowerCase().includes(q) ||
                ind.description.toLowerCase().includes(q) ||
                ind.slug.toLowerCase().includes(q) ||
                ind.family.toLowerCase().includes(q) ||
                (ind.tags && ind.tags.some(t => t.toLowerCase().includes(q)))
            );
        });
    }

    // ── Render Rail ─────────────────────────────────────────────────────
    function renderRail() {
        rail.replaceChildren();
        let lastGroup = '';

        for (const cat of CATEGORIES) {
            if (cat.group !== lastGroup) {
                const groupTitle = document.createElement('div');
                groupTitle.className = 'vlx-il-rail-group';
                groupTitle.textContent = cat.group;
                rail.appendChild(groupTitle);
                lastGroup = cat.group;
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `vlx-il-tab ${currentTab === cat.id ? 'vlx-il-tab--active' : ''}`;
            btn.dataset.tab = cat.id;

            const iconSpan = document.createElement('span');
            iconSpan.className = 'vlx-il-tab-icon';
            iconSpan.innerHTML = cat.icon;

            const labelSpan = document.createElement('span');
            labelSpan.className = 'vlx-il-tab-label';
            labelSpan.textContent = cat.label;

            btn.appendChild(iconSpan);
            btn.appendChild(labelSpan);

            // Dynamic count for favorites & myscripts: only show if > 0
            let countVal = cat.count;
            if (cat.id === 'favorites') countVal = favoritesSet.size;
            if (cat.id === 'myscripts') countVal = savedIndicators.length;

            if (countVal !== null && countVal !== undefined && countVal > 0) {
                const countSpan = document.createElement('span');
                countSpan.className = 'vlx-il-tab-count';
                countSpan.textContent = String(countVal);
                btn.appendChild(countSpan);
            }

            btn.onclick = () => {
                currentTab = cat.id;
                renderRail();
                renderContent();
            };

            rail.appendChild(btn);
        }
    }

    // ── Create Card DOM ─────────────────────────────────────────────────
    function createCardEl(ind: CatalogIndicator, isNew: boolean = false): HTMLElement {
        const card = document.createElement('div');
        card.className = `vlx-il-card ${selectedIndicator?.slug === ind.slug ? 'vlx-il-card--selected' : ''}`;
        card.dataset.slug = ind.slug;

        const isFav = favoritesSet.has(ind.slug);

        card.innerHTML = `
            <div class="vlx-il-card-media">
                <img src="${ind.image_url || 'https://luxalgo-production.s3.amazonaws.com/library/iclsbsi3h5dhcll7rxy1ayod.png'}" class="vlx-il-card-img" alt="${ind.name}" onerror="this.src='https://luxalgo-production.s3.amazonaws.com/library/iclsbsi3h5dhcll7rxy1ayod.png'" />
                <div class="vlx-il-card-top-actions">
                    <button type="button" class="vlx-il-card-btn vlx-il-card-info" title="View details">ⓘ</button>
                    <button type="button" class="vlx-il-card-btn vlx-il-card-star ${isFav ? 'vlx-il-card-btn--starred' : ''}" title="Toggle favorite">${isFav ? '★' : '☆'}</button>
                </div>
            </div>
            <div class="vlx-il-card-details">
                ${isNew ? '<div class="vlx-il-card-badge">New</div>' : ''}
                <div class="vlx-il-card-title" title="${ind.name}">${ind.name}</div>
                <div class="vlx-il-card-sub">${formatCategory(ind.family)} · ${ind.date_displayed || 'Oct 7, 2026'}</div>
            </div>
        `;

        const starBtn = card.querySelector('.vlx-il-card-star') as HTMLButtonElement;
        starBtn.onclick = (e) => {
            e.stopPropagation();
            const nowFav = toggleFavorite(ind.slug);
            starBtn.classList.toggle('vlx-il-card-btn--starred', nowFav);
            starBtn.textContent = nowFav ? '★' : '☆';
            renderRail();
            renderInspector();
        };

        const infoBtn = card.querySelector('.vlx-il-card-info') as HTMLButtonElement;
        infoBtn.onclick = (e) => {
            e.stopPropagation();
            selectIndicator(ind);
        };

        card.onclick = () => {
            selectIndicator(ind);
        };

        card.ondblclick = () => {
            applyIndicator(ind);
            closeModal();
        };

        return card;
    }

    function selectIndicator(ind: CatalogIndicator) {
        selectedIndicator = ind;
        const allCards = content.querySelectorAll('.vlx-il-card');
        allCards.forEach(c => {
            if ((c as HTMLElement).dataset.slug === ind.slug) {
                c.classList.add('vlx-il-card--selected');
            } else {
                c.classList.remove('vlx-il-card--selected');
            }
        });
        renderInspector();
    }

    // ── Render Content Area ─────────────────────────────────────────────
    function renderContent() {
        content.replaceChildren();
        const items = getIndicatorsForCurrentView();
        displayedCards = items;

        if (items.length === 0) {
            content.innerHTML = `
                <div class="vlx-il-empty">
                    <div style="font-size: 28px; opacity: 0.5;">🔍</div>
                    <div style="font-weight: 600; color: var(--vela-fg-bright, #f0f0f4);">No indicators found</div>
                    <div>Try adjusting your search or category filter.</div>
                </div>
            `;
            return;
        }

        // If on Discover and no search active: show New releases + More to explore
        if (currentTab === 'discover' && !searchQuery.trim()) {
            // 1. New releases
            const newSection = document.createElement('div');
            newSection.className = 'vlx-il-section';
            newSection.innerHTML = `
                <div class="vlx-il-section-head">
                    <div class="vlx-il-section-title">New releases</div>
                    <button type="button" class="vlx-il-section-action" id="vlx-see-all-btn">See all</button>
                </div>
            `;
            const newGrid = document.createElement('div');
            newGrid.className = 'vlx-il-grid';

            const newCards = items.slice(0, 3);
            for (const ind of newCards) {
                newGrid.appendChild(createCardEl(ind, true));
            }
            newSection.appendChild(newGrid);
            content.appendChild(newSection);

            newSection.querySelector('#vlx-see-all-btn')?.addEventListener('click', () => {
                currentTab = 'allscripts';
                renderRail();
                renderContent();
            });

            // 2. More to explore
            const exploreSection = document.createElement('div');
            exploreSection.className = 'vlx-il-section';
            exploreSection.innerHTML = `
                <div class="vlx-il-section-head">
                    <div class="vlx-il-section-title">More to explore</div>
                    <button type="button" class="vlx-il-section-action" id="vlx-shuffle-btn">${ICONS.shuffle} Shuffle</button>
                </div>
            `;
            const exploreGrid = document.createElement('div');
            exploreGrid.className = 'vlx-il-grid';

            const exploreCards = items.slice(3, 6);
            for (const ind of exploreCards) {
                exploreGrid.appendChild(createCardEl(ind, false));
            }
            exploreSection.appendChild(exploreGrid);
            content.appendChild(exploreSection);

            exploreSection.querySelector('#vlx-shuffle-btn')?.addEventListener('click', () => {
                const shuffled = [...cachedCatalog].sort(() => 0.5 - Math.random());
                exploreGrid.replaceChildren();
                for (const ind of shuffled.slice(0, 3)) {
                    exploreGrid.appendChild(createCardEl(ind, false));
                }
            });

            // 3. Featured row peeking at bottom
            if (items.length > 6) {
                const moreGrid = document.createElement('div');
                moreGrid.className = 'vlx-il-grid';
                for (const ind of items.slice(6, 12)) {
                    moreGrid.appendChild(createCardEl(ind, false));
                }
                content.appendChild(moreGrid);
            }
        } else {
            // General Grid view
            const grid = document.createElement('div');
            grid.className = 'vlx-il-grid';
            for (const ind of items) {
                grid.appendChild(createCardEl(ind, ind.isNew));
            }
            content.appendChild(grid);
        }

        // Keep selected visible
        if (selectedIndicator && !items.some(i => i.slug === selectedIndicator!.slug)) {
            selectedIndicator = items[0] || null;
            renderInspector();
        }
    }

    // ── Render Inspector Panel ──────────────────────────────────────────
    function renderInspector() {
        inspector.replaceChildren();

        if (!selectedIndicator) {
            inspector.innerHTML = `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--vela-fg-muted, #757882); gap: 10px;">
                    <div style="font-size: 13px;">Select an indicator to preview</div>
                </div>
            `;
            return;
        }

        const ind = selectedIndicator;
        const isFav = favoritesSet.has(ind.slug);

        const media = document.createElement('div');
        media.className = 'vlx-il-insp-media';
        media.innerHTML = `<img src="${ind.image_url || 'https://luxalgo-production.s3.amazonaws.com/library/iclsbsi3h5dhcll7rxy1ayod.png'}" class="vlx-il-insp-img" alt="${ind.name}" onerror="this.src='https://luxalgo-production.s3.amazonaws.com/library/iclsbsi3h5dhcll7rxy1ayod.png'" />`;

        const meta = document.createElement('div');
        meta.className = 'vlx-il-insp-meta';
        meta.textContent = `${formatCategory(ind.family)} · ${ind.date_displayed || 'Oct 7, 2026'}`;

        const title = document.createElement('div');
        title.className = 'vlx-il-insp-title';
        title.textContent = ind.name;

        const desc = document.createElement('div');
        desc.className = 'vlx-il-insp-desc';
        desc.textContent = ind.description || 'Professional LuxAlgo algorithmic indicator with real-time signal generation, market structure analytics, and dynamic visual overlays.';

        const link = document.createElement('a');
        link.className = 'vlx-il-insp-link';
        link.href = ind.url || `https://www.luxalgo.com/library/indicator/${ind.slug}/`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.innerHTML = `View in the Library <span style="font-size: 10px;">↗</span>`;

        const actions = document.createElement('div');
        actions.className = 'vlx-il-insp-actions';

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'vlx-il-btn-add';
        addBtn.innerHTML = `Add to chart <span class="vlx-il-btn-kbd">↵</span>`;
        addBtn.onclick = () => {
            applyIndicator(ind, addBtn);
        };

        const favBtn = document.createElement('button');
        favBtn.type = 'button';
        favBtn.className = `vlx-il-btn-sec ${isFav ? 'vlx-il-btn-sec--starred' : ''}`;
        favBtn.innerHTML = `<span>${isFav ? '★' : ICONS.favorites}</span> <span>Favorite</span>`;
        favBtn.onclick = () => {
            const nowFav = toggleFavorite(ind.slug);
            favBtn.classList.toggle('vlx-il-btn-sec--starred', nowFav);
            favBtn.querySelector('span')!.innerHTML = nowFav ? '★' : ICONS.favorites;
            renderRail();
            renderContent();
        };

        actions.appendChild(addBtn);
        actions.appendChild(favBtn);

        inspector.appendChild(media);
        inspector.appendChild(meta);
        inspector.appendChild(title);
        inspector.appendChild(desc);
        inspector.appendChild(link);
        inspector.appendChild(actions);
    }

    // ── Search Input Event ──────────────────────────────────────────────
    searchInput.oninput = () => {
        searchQuery = searchInput.value;
        clearBtn.style.display = searchQuery ? 'flex' : 'none';
        renderContent();
    };

    clearBtn.onclick = () => {
        searchInput.value = '';
        searchQuery = '';
        clearBtn.style.display = 'none';
        searchInput.focus();
        renderContent();
    };

    // ── Keyboard Navigation ─────────────────────────────────────────────
    dialog.onkeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeModal();
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndicator) {
                applyIndicator(selectedIndicator);
                if (!e.shiftKey) {
                    closeModal();
                }
            }
            return;
        }

        if (e.key === 'f' || e.key === 'F') {
            if (document.activeElement !== searchInput && selectedIndicator) {
                e.preventDefault();
                toggleFavorite(selectedIndicator.slug);
                renderRail();
                renderContent();
                renderInspector();
                return;
            }
        }

        if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            if (document.activeElement !== searchInput && displayedCards.length > 0) {
                e.preventDefault();
                let nextIdx = selectedCardIndex;
                if (e.key === 'ArrowRight') nextIdx = Math.min(displayedCards.length - 1, selectedCardIndex + 1);
                if (e.key === 'ArrowLeft') nextIdx = Math.max(0, selectedCardIndex - 1);
                if (e.key === 'ArrowDown') nextIdx = Math.min(displayedCards.length - 1, selectedCardIndex + 3);
                if (e.key === 'ArrowUp') nextIdx = Math.max(0, selectedCardIndex - 3);

                selectedCardIndex = nextIdx;
                selectIndicator(displayedCards[nextIdx]);
            }
        }
    };

    // Initial render
    renderRail();
    renderContent();
    renderInspector();

    // Auto-focus search input
    setTimeout(() => {
        searchInput.focus();
    }, 50);
}

function formatCategory(family: string): string {
    const map: Record<string, string> = {
        'market-structure': 'Structure',
        'structure': 'Structure',
        'smc-ict': 'SMC / ICT',
        'smcict': 'SMC / ICT',
        'trend': 'Trend',
        'volume-orderflow': 'Volume & Flow',
        'volumeflow': 'Volume & Flow',
        'momentum': 'Momentum',
        'volatility': 'Volatility',
        'wyckoff': 'Wyckoff',
        'patterns': 'Elliott & Harmonics',
        'elliott': 'Elliott & Harmonics',
        'basic': 'Basic',
        'orderflow': 'Order flow',
        'myscripts': 'My script',
    };
    return map[family.toLowerCase()] || 'LuxAlgo';
}

// ── Apply Indicator to Active Chart ─────────────────────────────────────
async function applyIndicator(ind: CatalogIndicator, btnElement?: HTMLButtonElement): Promise<void> {
    const ws = wsInstance || (window as any).__ws;
    if (!ws) {
        showToast('No active workspace available', true);
        return;
    }

    try {
        if (btnElement) {
            btnElement.disabled = true;
            btnElement.textContent = 'Loading script...';
        }

        let script = ind.script;
        if (!script) {
            try {
                const res = await fetch(`/api/lux/source/${encodeURIComponent(ind.slug)}`);
                if (res.ok) {
                    const data = await res.json();
                    script = data.script || data.source;
                }
            } catch (_) {}
        }

        if (!script) {
            script = `//@version=5\nindicator("${ind.name}", overlay=true)\nplot(ta.sma(close, 20), color=color.blue, title="${ind.name}")`;
        }

        const ctx = typeof ws.context === 'function' ? ws.context() : null;
        const activeCell = (typeof ws.active === 'function' ? ws.active() : ws.active)
            || (typeof ws.cells === 'function' ? ws.cells()[0] : null);

        let success = false;
        if (ctx && typeof ctx.addIndicator === 'function') {
            await ctx.addIndicator({
                id: ind.slug,
                name: ind.name,
                script,
                language: 'pine',
            });
            success = true;
        } else if (activeCell && typeof activeCell.addExternalIndicator === 'function') {
            await activeCell.addExternalIndicator({
                id: ind.slug,
                name: ind.name,
                script,
                language: 'pine',
            });
            success = true;
        } else if (activeCell?.chart && typeof activeCell.chart.runIndicator === 'function') {
            const res = await activeCell.chart.runIndicator(script);
            success = res && res.ok;
        }

        if (success) {
            showToast(`✓ Added "${ind.name}" to active chart!`);
            if (btnElement) {
                btnElement.textContent = '✓ Added to Chart';
                setTimeout(() => {
                    btnElement.disabled = false;
                    btnElement.innerHTML = `Add to chart <span class="vlx-il-btn-kbd">↵</span>`;
                }, 1800);
            }
        } else {
            showToast(`Failed to add indicator to chart`, true);
            if (btnElement) {
                btnElement.disabled = false;
                btnElement.innerHTML = `Add to chart <span class="vlx-il-btn-kbd">↵</span>`;
            }
        }
    } catch (err: any) {
        showToast(`Error: ${err.message}`, true);
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = `Add to chart <span class="vlx-il-btn-kbd">↵</span>`;
        }
    }
}
