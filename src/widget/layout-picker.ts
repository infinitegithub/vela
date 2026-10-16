// Layout picker — the topbar's LAYOUT dropdown.
// Contains:
// 1. Slim, compact OpenMarket-grade visual presets organized by cell count (1, 2, 3, 4, 5, 6, 8, 9, 12, 16)
//    with subtle row labels and divider lines.
// 2. The compact 4×4 custom grid canvas below it.
// 3. The 2-column SYNC pill switches below the canvas.

import { injectStyles } from '../ui/styles';

const STYLE_ID = 'vela-widget-layout-picker-v16';

const CSS = `
.vela-lp-layer { position: absolute; z-index: var(--vela-z-menu); }
.vela-lp {
    width: 178px;
    background: var(--vela-surface-elev, #1c1e24);
    color: var(--vela-fg, #e5e7eb);
    border: 1px solid var(--vela-border-strong, rgba(255, 255, 255, 0.09));
    border-radius: 10px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5), var(--vela-shadow);
    padding: 10px 12px 14px 12px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    user-select: none;
    transform-origin: top;
    animation: vela-lp-in var(--vela-dur-fast) var(--vela-ease);
}
@keyframes vela-lp-in {
    from { opacity: 0; transform: translateY(-4px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.vela-lp-section-title {
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--vela-fg-faint, #636875);
    margin-bottom: 7px;
}

/* ── Splits section ─────────────────────────────────────────────────── */
.vela-lp-split-rows {
    display: flex;
    flex-direction: column;
    gap: 1px;
}
.vela-lp-split-row {
    display: flex;
    align-items: center;
    height: 20px;
}
.vela-lp-row-num {
    width: 18px;
    font-size: 9.5px;
    font-weight: 600;
    color: var(--vela-fg-faint, #636875);
    flex: none;
    line-height: 1;
}
.vela-lp-row-icons {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
}
.vela-lp-preset-btn {
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 16px;
    border-radius: 3px;
    cursor: pointer;
    color: var(--vela-fg-muted, #5c6270);
    border: 1px solid transparent;
    box-sizing: border-box;
    transition: all var(--vela-dur-fast) var(--vela-ease);
}
.vela-lp-preset-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--vela-fg-bright, #c5c8d1);
}
.vela-lp-preset-btn[data-checked='1'] {
    background: rgba(255, 255, 255, 0.1) !important;
    border-color: rgba(255, 255, 255, 0.3) !important;
    color: #ffffff !important;
}
.vela-lp-preset-btn svg {
    width: 16px;
    height: 11.5px;
    display: block;
    overflow: visible;
}

.vela-lp-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 4px 0 3px 0;
}
.vela-lp-section-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.07);
    margin: 8px 0;
}

/* ── Custom section ─────────────────────────────────────────────────── */
.vela-lp-custom-section {
    display: flex;
    flex-direction: column;
}
.vela-lp-custom-grid {
    display: grid;
    grid-template-columns: repeat(4, 15px);
    grid-auto-rows: 14px;
    gap: 3px;
    margin-top: 2px;
}
.vela-lp-sq {
    all: unset;
    box-sizing: border-box;
    border-radius: 3px;
    background: #242730;
    border: 1px solid rgba(255, 255, 255, 0.05);
    cursor: pointer;
    transition: all var(--vela-dur-fast) var(--vela-ease);
}
.vela-lp-sq:hover {
    background: #323744;
    border-color: rgba(255, 255, 255, 0.2);
}
.vela-lp-sq[data-on='1'] {
    background: rgba(255, 255, 255, 0.18) !important;
    border-color: rgba(255, 255, 255, 0.35) !important;
}

/* ── Sync section ──────────────────────────────────────────────────── */
.vela-lp-sync-section {
    display: flex;
    flex-direction: column;
}
.vela-lp-sync-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 10px;
    margin-top: 2px;
}
.vela-lp-sync-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.vela-lp-sync-label {
    font-size: 9.5px;
    color: var(--vela-fg-muted, #7b8190);
    font-weight: 500;
}
.vela-lp-sync-pill {
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 8px 3px 7px;
    background: #22252e;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    font-size: 8.5px;
    font-weight: 700;
    color: #636875;
    cursor: pointer;
    box-sizing: border-box;
    transition: all var(--vela-dur-fast) var(--vela-ease);
}
.vela-lp-sync-pill:hover {
    background: #282c37;
    color: #a0a5b2;
}
.vela-lp-sync-pill[data-checked='1'] {
    background: #232d3d;
    border-color: rgba(64, 150, 255, 0.4);
    color: #60a5fa;
}
.vela-lp-sync-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.6;
    margin-left: 4px;
}
.vela-lp-sync-pill[data-checked='1'] .vela-lp-sync-dot {
    opacity: 1;
}

.vela-lp-extra-presets {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 6px;
}
.vela-lp-preset-text {
    all: unset;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--vela-fg-muted);
    font-size: 10px;
    white-space: nowrap;
}
.vela-lp-preset-text:hover { background: var(--vela-hover); }
.vela-lp-preset-text[data-checked='1'] { background: var(--vela-hover-strong); color: var(--vela-fg-bright); }
`;

/** 4×4 canvas factory for mobile or other views. */
export function layoutGridCanvas(doc: Document): { el: HTMLElement; squares: HTMLButtonElement[] } {
    const el = doc.createElement('div');
    el.className = 'vela-lp-custom-grid';
    const squares: HTMLButtonElement[] = [];
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            const sq = doc.createElement('button');
            sq.type = 'button';
            sq.className = 'vela-lp-sq';
            sq.dataset.r = String(r);
            sq.dataset.c = String(c);
            sq.setAttribute('aria-label', `${c + 1} by ${r + 1} layout`);
            el.appendChild(sq);
            squares.push(sq);
        }
    }
    return { el, squares };
}

export type LayoutPickerShape = { rows: number; cols: number };

/** Light the `shape` rectangle from the top-left (null = nothing lit). */
export function paintLayoutGrid(squares: readonly HTMLButtonElement[], shape: LayoutPickerShape | null): void {
    for (const sq of squares) {
        const on = shape !== null && Number(sq.dataset.r) < shape.rows && Number(sq.dataset.c) < shape.cols;
        if (on) sq.dataset.on = '1';
        else delete sq.dataset.on;
    }
}

interface SlimPresetItem {
    id: string;
    label: string;
    lines: string;
}

interface SlimRowGroup {
    countLabel: string;
    presets: SlimPresetItem[];
    trailingDivider?: boolean;
}

const SLIM_PRESET_ROWS: SlimRowGroup[] = [
    // ── 1 ──
    {
        countLabel: '1',
        presets: [
            { id: '1', label: 'Single', lines: '' },
        ],
        trailingDivider: true,
    },
    // ── 2 ──
    {
        countLabel: '2',
        presets: [
            { id: '2h', label: '2 side by side', lines: '<line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '2v', label: '2 stacked', lines: '<line x1="0.6" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/>' },
        ],
    },
    // ── 3 ──
    {
        countLabel: '3',
        presets: [
            { id: '3v', label: '3 columns', lines: '<line x1="5.5" y1="0.6" x2="5.5" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="10.5" y1="0.6" x2="10.5" y2="10.9" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '3h', label: '3 rows', lines: '<line x1="0.6" y1="4" x2="15.4" y2="4" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="7.5" x2="15.4" y2="7.5" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '3-left-main', label: '3 (1 left, 2 right)', lines: '<line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="8" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '3-right-main', label: '3 (2 left, 1 right)', lines: '<line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="5.75" x2="8" y2="5.75" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '3-top-main', label: '3 (1 top, 2 bottom)', lines: '<line x1="0.6" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="8" y1="5.75" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '3-bottom-main', label: '3 (2 top, 1 bottom)', lines: '<line x1="0.6" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="8" y1="0.6" x2="8" y2="5.75" stroke="currentColor" stroke-width="1.1"/>' },
        ],
    },
    // ── 4 ──
    {
        countLabel: '4',
        presets: [
            { id: '4', label: '4 grid', lines: '<line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '4-left-main', label: '4 (1 left, 3 right)', lines: '<line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="8" y1="4" x2="15.4" y2="4" stroke="currentColor" stroke-width="1.1"/><line x1="8" y1="7.5" x2="15.4" y2="7.5" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '4-right-main', label: '4 (3 left, 1 right)', lines: '<line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="4" x2="8" y2="4" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="7.5" x2="8" y2="7.5" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '4-top-main', label: '4 (1 top, 3 bottom)', lines: '<line x1="0.6" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="5.5" y1="5.75" x2="5.5" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="10.5" y1="5.75" x2="10.5" y2="10.9" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '4-bottom-main', label: '4 (3 top, 1 bottom)', lines: '<line x1="0.6" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="5.5" y1="0.6" x2="5.5" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="10.5" y1="0.6" x2="10.5" y2="5.75" stroke="currentColor" stroke-width="1.1"/>' },
        ],
        trailingDivider: true,
    },
    // ── 5 ──
    {
        countLabel: '5',
        presets: [
            { id: '5-left-main', label: '5 (1 left, 4 right)', lines: '<line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="8" y1="3.2" x2="15.4" y2="3.2" stroke="currentColor" stroke-width="1.1"/><line x1="8" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="8" y1="8.3" x2="15.4" y2="8.3" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '5-right-main', label: '5 (4 left, 1 right)', lines: '<line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="3.2" x2="8" y2="3.2" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="5.75" x2="8" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="8.3" x2="8" y2="8.3" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '5-top-main', label: '5 (1 top, 4 bottom)', lines: '<line x1="0.6" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="4.2" y1="5.75" x2="4.2" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="8" y1="5.75" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="11.8" y1="5.75" x2="11.8" y2="10.9" stroke="currentColor" stroke-width="1.1"/>' },
        ],
    },
    // ── 6 ──
    {
        countLabel: '6',
        presets: [
            { id: '6-3x2', label: '6 (3 × 2)', lines: '<line x1="0.6" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="5.5" y1="0.6" x2="5.5" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="10.5" y1="0.6" x2="10.5" y2="10.9" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '6-2x3', label: '6 (2 × 3)', lines: '<line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="4" x2="15.4" y2="4" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="7.5" x2="15.4" y2="7.5" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '6-asym-tv', label: '6 asymmetric', lines: '<line x1="10.3" y1="0.6" x2="10.3" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="10.3" y1="4" x2="15.4" y2="4" stroke="currentColor" stroke-width="1.1"/><line x1="10.3" y1="7.5" x2="15.4" y2="7.5" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="7.5" x2="10.3" y2="7.5" stroke="currentColor" stroke-width="1.1"/><line x1="5.1" y1="7.5" x2="5.1" y2="10.9" stroke="currentColor" stroke-width="1.1"/>' },
        ],
        trailingDivider: true,
    },
    // ── 8 ──
    {
        countLabel: '8',
        presets: [
            { id: '8', label: '8 (2 × 4)', lines: '<line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="3.2" x2="15.4" y2="3.2" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="8.3" x2="15.4" y2="8.3" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '8-4x2', label: '8 (4 × 2)', lines: '<line x1="0.6" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="4.2" y1="0.6" x2="4.2" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="11.8" y1="0.6" x2="11.8" y2="10.9" stroke="currentColor" stroke-width="1.1"/>' },
        ],
    },
    // ── 9 ──
    {
        countLabel: '9',
        presets: [
            { id: '9', label: '9 (3 × 3)', lines: '<line x1="5.5" y1="0.6" x2="5.5" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="10.5" y1="0.6" x2="10.5" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="4" x2="15.4" y2="4" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="7.5" x2="15.4" y2="7.5" stroke="currentColor" stroke-width="1.1"/>' },
        ],
    },
    // ── 12 ──
    {
        countLabel: '12',
        presets: [
            { id: '12-4x3', label: '12 (4 × 3)', lines: '<line x1="4.2" y1="0.6" x2="4.2" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="11.8" y1="0.6" x2="11.8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="4" x2="15.4" y2="4" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="7.5" x2="15.4" y2="7.5" stroke="currentColor" stroke-width="1.1"/>' },
            { id: '12-3x4', label: '12 (3 × 4)', lines: '<line x1="5.5" y1="0.6" x2="5.5" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="10.5" y1="0.6" x2="10.5" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="3.2" x2="15.4" y2="3.2" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="8.3" x2="15.4" y2="8.3" stroke="currentColor" stroke-width="1.1"/>' },
        ],
        trailingDivider: true,
    },
    // ── 16 ──
    {
        countLabel: '16',
        presets: [
            { id: '16', label: '16 (4 × 4)', lines: '<line x1="4.2" y1="0.6" x2="4.2" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="8" y1="0.6" x2="8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="11.8" y1="0.6" x2="11.8" y2="10.9" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="3.2" x2="15.4" y2="3.2" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="5.75" x2="15.4" y2="5.75" stroke="currentColor" stroke-width="1.1"/><line x1="0.6" y1="8.3" x2="15.4" y2="8.3" stroke="currentColor" stroke-width="1.1"/>' },
        ],
    },
];

export interface LayoutPickerOptions {
    /** Topbar button that toggles the panel. */
    trigger: HTMLElement;
    /** Positioning/theming host (the widget root — the panel portals inside it). */
    host: HTMLElement;
    /** Current layout id getter. */
    currentId?: () => string | null;
    /** Current layout's canvas shape (null = a preset the canvas cannot express). */
    shape: () => LayoutPickerShape | null;
    /** Registered layouts NOT expressible on the canvas — rendered as labeled rows. */
    presets: () => Array<{ id: string; label: string; checked: boolean }>;
    onSelectGrid: (rows: number, cols: number) => void;
    onSelectPreset: (id: string) => void;
    /** SYNC switch rows (re-read on every open and after every toggle). */
    syncs: () => Array<{ id: string; label: string; checked: boolean }>;
    onToggleSync: (id: string) => void;
    onOpenChange?: (open: boolean) => void;
}

export class LayoutPicker {
    private readonly opts: LayoutPickerOptions;
    private readonly doc: Document;
    private readonly layer: HTMLElement;
    private readonly squares: HTMLButtonElement[] = []; // row-major, 16 entries
    private readonly presetButtons: Map<string, HTMLButtonElement> = new Map();
    private readonly extraPresetsEl: HTMLElement;
    private readonly syncGridEl: HTMLElement;

    private isOpen = false;
    /** Hover preview (1-based rows/cols), null = show current shape. */
    private hover: { rows: number; cols: number } | null = null;

    private readonly onDocPointerDown = (e: PointerEvent): void => {
        const t = e.target as Node | null;
        if (t && (this.layer.contains(t) || this.opts.trigger.contains(t))) return;
        this.close();
    };
    private readonly onDocKeydown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') this.close();
    };

    constructor(opts: LayoutPickerOptions) {
        this.opts = opts;
        this.doc = opts.trigger.ownerDocument;
        injectStyles(STYLE_ID, CSS, this.doc);

        this.layer = this.doc.createElement('div');
        this.layer.className = 'vela-lp-layer';
        this.layer.style.display = 'none';

        const lp = this.doc.createElement('div');
        lp.className = 'vela-lp';

        // ── SPLITS SECTION ──
        const splitsTitle = this.doc.createElement('div');
        splitsTitle.className = 'vela-lp-section-title';
        splitsTitle.textContent = 'SPLITS';
        lp.appendChild(splitsTitle);

        const splitRowsEl = this.doc.createElement('div');
        splitRowsEl.className = 'vela-lp-split-rows';

        for (const rowGroup of SLIM_PRESET_ROWS) {
            const rowEl = this.doc.createElement('div');
            rowEl.className = 'vela-lp-split-row';

            const numSpan = this.doc.createElement('span');
            numSpan.className = 'vela-lp-row-num';
            numSpan.textContent = rowGroup.countLabel;
            rowEl.appendChild(numSpan);

            const iconsWrap = this.doc.createElement('div');
            iconsWrap.className = 'vela-lp-row-icons';

            for (const item of rowGroup.presets) {
                const btn = this.doc.createElement('button');
                btn.type = 'button';
                btn.className = 'vela-lp-preset-btn';
                btn.title = item.label;
                btn.setAttribute('aria-label', item.label);
                btn.dataset.id = item.id;
                btn.innerHTML = `<svg viewBox="0 0 16 11.5" fill="none"><rect x="0.6" y="0.6" width="14.8" height="10.3" rx="2.5" stroke="currentColor" stroke-width="1.1"/>${item.lines}</svg>`;
                btn.addEventListener('click', () => {
                    this.opts.onSelectPreset(item.id);
                    this.close();
                });
                this.presetButtons.set(item.id, btn);
                iconsWrap.appendChild(btn);
            }
            rowEl.appendChild(iconsWrap);
            splitRowsEl.appendChild(rowEl);

            if (rowGroup.trailingDivider) {
                const div = this.doc.createElement('div');
                div.className = 'vela-lp-divider';
                splitRowsEl.appendChild(div);
            }
        }
        lp.appendChild(splitRowsEl);

        // Section divider
        const sep1 = this.doc.createElement('div');
        sep1.className = 'vela-lp-section-divider';
        lp.appendChild(sep1);

        // ── CUSTOM SECTION ──
        const customSec = this.doc.createElement('div');
        customSec.className = 'vela-lp-custom-section';

        const customTitle = this.doc.createElement('div');
        customTitle.className = 'vela-lp-section-title';
        customTitle.textContent = 'CUSTOM';
        customSec.appendChild(customTitle);

        const { el: canvasGrid, squares } = layoutGridCanvas(this.doc);
        this.squares.push(...squares);

        // Interactive hover/click on custom grid canvas
        canvasGrid.addEventListener('pointerenter', (e) => {
            const sq = this.squareAt(e);
            if (!sq) return;
            this.setHover(this.squarePos(sq));
        });
        canvasGrid.addEventListener('pointermove', (e) => {
            const sq = this.squareAt(e);
            if (!sq) return;
            const pos = this.squarePos(sq);
            if (!this.hover || this.hover.rows !== pos.r + 1 || this.hover.cols !== pos.c + 1) {
                this.setHover(pos);
            }
        });
        canvasGrid.addEventListener('pointerleave', () => this.clearHover());
        canvasGrid.addEventListener('click', (e) => {
            const sq = this.squareAt(e);
            if (!sq) return;
            const pos = this.squarePos(sq);
            this.opts.onSelectGrid(pos.r + 1, pos.c + 1);
            this.close();
        });
        customSec.appendChild(canvasGrid);

        this.extraPresetsEl = this.doc.createElement('div');
        this.extraPresetsEl.className = 'vela-lp-extra-presets';
        customSec.appendChild(this.extraPresetsEl);

        lp.appendChild(customSec);

        // Section divider
        const sep2 = this.doc.createElement('div');
        sep2.className = 'vela-lp-section-divider';
        lp.appendChild(sep2);

        // ── SYNC SECTION ──
        const syncSec = this.doc.createElement('div');
        syncSec.className = 'vela-lp-sync-section';

        const syncTitle = this.doc.createElement('div');
        syncTitle.className = 'vela-lp-section-title';
        syncTitle.textContent = 'SYNC';
        syncSec.appendChild(syncTitle);

        this.syncGridEl = this.doc.createElement('div');
        this.syncGridEl.className = 'vela-lp-sync-grid';
        syncSec.appendChild(this.syncGridEl);

        lp.appendChild(syncSec);

        this.layer.appendChild(lp);
        this.opts.host.appendChild(this.layer);

        this.opts.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
    }

    toggle(): void {
        if (this.isOpen) this.close();
        else this.open();
    }

    open(): void {
        if (this.isOpen) return;
        this.isOpen = true;
        this.opts.trigger.setAttribute('aria-expanded', 'true');
        this.position();
        this.layer.style.display = '';
        this.refresh();
        this.doc.addEventListener('pointerdown', this.onDocPointerDown, true);
        this.doc.addEventListener('keydown', this.onDocKeydown);
        this.opts.onOpenChange?.(true);
    }

    close(): void {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.opts.trigger.setAttribute('aria-expanded', 'false');
        this.layer.style.display = 'none';
        this.clearHover();
        this.doc.removeEventListener('pointerdown', this.onDocPointerDown, true);
        this.doc.removeEventListener('keydown', this.onDocKeydown);
        this.opts.onOpenChange?.(false);
    }

    private position(): void {
        const hostRect = this.opts.host.getBoundingClientRect();
        const trgRect = this.opts.trigger.getBoundingClientRect();
        const top = trgRect.bottom - hostRect.top + 4;
        let left = trgRect.left - hostRect.left;
        this.layer.style.top = `${top}px`;
        this.layer.style.left = `${left}px`;
        const layerRect = this.layer.getBoundingClientRect();
        if (layerRect.right > hostRect.right - 8) {
            left = Math.max(8, hostRect.width - layerRect.width - 8);
            this.layer.style.left = `${left}px`;
        }
    }

    refresh(): void {
        this.renderPresetButtons();
        this.renderExtraPresets();
        this.renderSyncs();
        this.render();
    }

    destroy(): void {
        this.close();
        this.layer.remove();
    }

    // ── internals ──
    private squareAt(e: PointerEvent): HTMLButtonElement | null {
        const sq = (e.target as Element | null)?.closest?.('.vela-lp-sq');
        return sq instanceof HTMLButtonElement ? sq : null;
    }

    private squarePos(sq: HTMLButtonElement): { r: number; c: number } {
        return { r: Number(sq.dataset.r), c: Number(sq.dataset.c) };
    }

    private render(): void {
        paintLayoutGrid(this.squares, this.hover ?? this.opts.shape());
    }

    private activeId(): string | null {
        if (this.opts.currentId) return this.opts.currentId();
        const activePreset = this.opts.presets().find((p) => p.checked);
        return activePreset?.id ?? null;
    }

    private renderPresetButtons(): void {
        const cur = this.activeId();
        for (const [id, btn] of this.presetButtons) {
            let matches = cur === id;
            if (!matches && cur) {
                // Dynamic alias matching
                if (id === '1' && cur === 'g1x1') matches = true;
                else if (id === '2h' && cur === 'g1x2') matches = true;
                else if (id === '2v' && cur === 'g2x1') matches = true;
                else if (id === '3v' && cur === 'g1x3') matches = true;
                else if (id === '3h' && cur === 'g3x1') matches = true;
                else if (id === '4' && cur === 'g2x2') matches = true;
                else if (id === '6-3x2' && cur === 'g2x3') matches = true;
                else if (id === '6-2x3' && cur === 'g3x2') matches = true;
                else if (id === '8' && cur === 'g4x2') matches = true;
                else if (id === '8-4x2' && cur === 'g2x4') matches = true;
                else if (id === '9' && cur === 'g3x3') matches = true;
                else if (id === '12-4x3' && cur === 'g3x4') matches = true;
                else if (id === '12-3x4' && cur === 'g4x3') matches = true;
                else if (id === '16' && cur === 'g4x4') matches = true;
            }
            if (matches) btn.dataset.checked = '1';
            else delete btn.dataset.checked;
        }
    }

    private renderExtraPresets(): void {
        const doc = this.doc;
        this.extraPresetsEl.replaceChildren();
        const allKnownIds = new Set<string>();
        for (const rg of SLIM_PRESET_ROWS) {
            for (const p of rg.presets) allKnownIds.add(p.id);
        }
        const nonTvPresets = this.opts.presets().filter((p) => !allKnownIds.has(p.id));
        if (nonTvPresets.length === 0) {
            this.extraPresetsEl.style.display = 'none';
            return;
        }
        this.extraPresetsEl.style.display = '';
        for (const p of nonTvPresets) {
            const btn = doc.createElement('button');
            btn.type = 'button';
            btn.className = 'vela-lp-preset-text';
            btn.textContent = p.label;
            if (p.checked) btn.dataset.checked = '1';
            btn.addEventListener('click', () => {
                this.opts.onSelectPreset(p.id);
                this.close();
            });
            this.extraPresetsEl.appendChild(btn);
        }
    }

    private renderSyncs(): void {
        const doc = this.doc;
        this.syncGridEl.replaceChildren();
        const syncs = this.opts.syncs();
        for (const s of syncs) {
            const item = doc.createElement('div');
            item.className = 'vela-lp-sync-item';

            const label = doc.createElement('span');
            label.className = 'vela-lp-sync-label';
            label.textContent = s.label;
            item.appendChild(label);

            const pill = doc.createElement('button');
            pill.type = 'button';
            pill.className = 'vela-lp-sync-pill';
            if (s.checked) pill.dataset.checked = '1';

            const stateText = doc.createElement('span');
            stateText.textContent = s.checked ? 'ON' : 'OFF';
            pill.appendChild(stateText);

            const dot = doc.createElement('span');
            dot.className = 'vela-lp-sync-dot';
            pill.appendChild(dot);

            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                this.opts.onToggleSync(s.id);
                this.refresh();
            });

            item.appendChild(pill);
            this.syncGridEl.appendChild(item);
        }
    }

    private setHover(pos: { r: number; c: number }): void {
        this.hover = { rows: pos.r + 1, cols: pos.c + 1 };
        this.render();
    }

    private clearHover(): void {
        if (this.hover === null) return;
        this.hover = null;
        this.render();
    }
}
