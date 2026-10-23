import {
    registerSidePanel,
    registerIcon,
    type SidePanelHandle,
    type SidePanelHeader,
    type WidgetContext
} from '../src/plugin';
import {
    LiquidityClient,
    gridStepFor,
    formatVol,
    type LevelsFrame,
    type LiveBook
} from './liquidity-client';

const DOM_LADDER_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 2v12M12 2v12M4 4h8M4 7h8M4 10h8M4 13h8"/></svg>`;

const VENUE_COLORS: Record<string, string> = {
    binance: '#d4a106',
    binancespot: '#d4a106',
    bybit: '#e8590c',
    bybitspot: '#e8590c',
    okx: '#7a5af8',
    okxspot: '#7a5af8',
    coinbase: '#3d8bfd',
    hyperliquid: '#00b4d8',
    deribit: '#cc79a7',
    bitget: '#0ca5b8',
    bitgetspot: '#0ca5b8',
};

function getVenueColor(venue: string): string {
    const v = venue.toLowerCase();
    for (const [key, color] of Object.entries(VENUE_COLORS)) {
        if (v.includes(key)) return color;
    }
    return '#787b86';
}

function formatSignedUsd(val: number): string {
    if (Math.abs(val) < 1) return '—';
    const sign = val > 0 ? '+' : '−';
    return `${sign}${formatVol(Math.abs(val))}`;
}

const ROW_H = 18;
const PRICE_W = 64;
const USD_W = 56;
const PS_W = 58;

interface VenueDepth {
    venue: string;
    usd: number;
}

interface GroupedLevel {
    price: number;
    side: 'bid' | 'ask';
    usd: number;
    cumUsd: number;
    venues: VenueDepth[];
    pullStackUsd: number;
    touched: boolean;
}

interface DepthSnapshot {
    timestamp: number;
    bins: Map<number, number>; // price -> usd
    markPrice: number;
}

export class DomLadderPanelController {
    private root: HTMLElement;
    private ctx: WidgetContext | null = null;
    private currentSymbol: string = 'BTCUSDT';
    private markPrice: number = 0;
    private selectedWindowSec: number = 60; // 0=off, 15, 60, 300
    private manualStep: number = 0; // 0 = auto
    private mode: 'aggregated' | 'compact' = 'aggregated';

    private snapshots: DepthSnapshot[] = [];
    private currentFrame: LevelsFrame | null = null;
    private levels: GroupedLevel[] = [];
    private offsetRows: number = 0;

    private unsubscribeLevels: (() => void) | null = null;
    private unsubscribeTick: (() => void) | null = null;
    private unsubscribeMarket: (() => void) | null = null;

    private animFrameId: number | null = null;
    private flingId: number | null = null;

    // Canvas & UI elements
    private canvas!: HTMLCanvasElement;
    private ctx2d!: CanvasRenderingContext2D;
    private markBanner!: HTMLElement;
    private badgeEl!: HTMLElement;
    private groupSelect!: HTMLSelectElement;
    private pullSelect!: HTMLSelectElement;
    private modeSelect!: HTMLSelectElement;
    private balanceBarFill!: HTMLElement;
    private balanceBidsLabel!: HTMLElement;
    private balanceAsksLabel!: HTMLElement;
    private colsHeader!: HTMLElement;
    private tooltipEl!: HTMLElement;

    // Interaction state
    private drag: { kind: 'pan' | 'zoom'; startY: number; startOffset: number; startStep: number } | null = null;
    private hoverRow: number | null = null;
    private hoverPt: { x: number; y: number } | null = null;

    constructor(container: HTMLElement, ctx?: WidgetContext) {
        this.root = container;
        this.ctx = ctx || null;
        if (ctx && ctx.symbol) {
            this.currentSymbol = ctx.symbol;
        }
        this.buildUI();
    }

    private buildUI(): void {
        this.root.innerHTML = '';
        this.root.className = 'vela-dom-panel-root';

        const style = document.createElement('style');
        style.textContent = `
            .vela-dom-panel-root {
                display: flex;
                flex-direction: column;
                height: 100%;
                width: 100%;
                background: var(--panel, #111315);
                color: var(--text, #d9e2df);
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                font-size: 11px;
                user-select: none;
                position: relative;
                overflow: hidden;
            }
            .vela-dom-header {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 8px 10px;
                background: var(--title, #17171b);
                border-bottom: 1px solid var(--line, #252b2c);
                flex-shrink: 0;
            }
            .vela-dom-mark-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .vela-dom-mark-price {
                font-size: 17px;
                font-weight: 700;
                color: #ffffff;
                letter-spacing: -0.02em;
            }
            .vela-dom-badge {
                font-size: 9px;
                padding: 2px 6px;
                border-radius: 3px;
                background: color-mix(in srgb, var(--bid, #28cf72) 18%, transparent);
                color: var(--bid, #28cf72);
                font-weight: 700;
                letter-spacing: 0.04em;
            }
            .vela-dom-controls {
                display: flex;
                align-items: center;
                gap: 5px;
                flex-wrap: wrap;
            }
            .vela-dom-select-wrap {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 10px;
                color: var(--muted, #7d8785);
            }
            .vela-dom-select {
                background: var(--face, #141618);
                color: var(--text, #d9e2df);
                border: 1px solid var(--edge, #252b2c);
                border-radius: 3px;
                padding: 2px 4px;
                font-size: 10px;
                font-family: inherit;
                outline: none;
                cursor: pointer;
            }
            .vela-dom-select:hover {
                border-color: rgba(255, 255, 255, 0.25);
            }
            .vela-dom-btn {
                background: var(--face, #141618);
                color: var(--text, #d9e2df);
                border: 1px solid var(--edge, #252b2c);
                border-radius: 3px;
                padding: 2px 7px;
                font-size: 10px;
                font-family: inherit;
                cursor: pointer;
                transition: all 0.12s;
            }
            .vela-dom-btn:hover {
                background: #2f3442;
                color: #ffffff;
            }
            .vela-dom-balance-wrap {
                display: flex;
                flex-direction: column;
                gap: 2px;
                padding-top: 2px;
            }
            .vela-dom-balance-text {
                display: flex;
                justify-content: space-between;
                font-size: 9px;
                color: var(--muted, #7d8785);
            }
            .vela-dom-balance-bar {
                height: 4px;
                border-radius: 2px;
                background: var(--ask, #f05d67);
                overflow: hidden;
                display: flex;
            }
            .vela-dom-balance-fill {
                background: var(--bid, #28cf72);
                height: 100%;
                width: 50%;
                transition: width 0.2s ease-out;
            }
            .vela-dom-cols-header {
                display: flex;
                align-items: center;
                height: 22px;
                padding: 0 4px;
                background: #14151a;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                font-size: 9px;
                font-weight: 700;
                color: #787b86;
                flex-shrink: 0;
            }
            .vela-dom-canvas-wrap {
                flex: 1;
                position: relative;
                width: 100%;
                height: 100%;
                overflow: hidden;
                cursor: grab;
            }
            .vela-dom-canvas-wrap:active {
                cursor: grabbing;
            }
            .vela-dom-tooltip {
                position: absolute;
                display: none;
                z-index: 100;
                background: #1c1e24;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                padding: 6px 10px;
                font-size: 10px;
                color: #ffffff;
                pointer-events: none;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
                line-height: 1.4;
            }
        `;
        this.root.appendChild(style);

        // Header
        const header = document.createElement('div');
        header.className = 'vela-dom-header';

        const markRow = document.createElement('div');
        markRow.className = 'vela-dom-mark-row';

        this.markBanner = document.createElement('div');
        this.markBanner.className = 'vela-dom-mark-price';
        this.markBanner.textContent = '---';

        this.badgeEl = document.createElement('div');
        this.badgeEl.className = 'vela-dom-badge';
        this.badgeEl.textContent = 'AGG LIVE';

        markRow.appendChild(this.markBanner);
        markRow.appendChild(this.badgeEl);
        header.appendChild(markRow);

        // Controls
        const controls = document.createElement('div');
        controls.className = 'vela-dom-controls';

        // Recenter Button
        const recenterBtn = document.createElement('button');
        recenterBtn.className = 'vela-dom-btn';
        recenterBtn.textContent = 'Recenter';
        recenterBtn.onclick = () => this.recenter();
        controls.appendChild(recenterBtn);

        // Group Select
        const groupWrap = document.createElement('div');
        groupWrap.className = 'vela-dom-select-wrap';
        groupWrap.append('Step:');
        this.groupSelect = document.createElement('select');
        this.groupSelect.className = 'vela-dom-select';
        this.groupSelect.onchange = () => {
            const v = this.groupSelect.value;
            this.manualStep = v === 'auto' ? 0 : Number(v);
            this.rebuildLevels();
            this.invalidate();
        };
        groupWrap.appendChild(this.groupSelect);
        controls.appendChild(groupWrap);

        // Pull/Stack Select
        const pullWrap = document.createElement('div');
        pullWrap.className = 'vela-dom-select-wrap';
        pullWrap.append('P/S:');
        this.pullSelect = document.createElement('select');
        this.pullSelect.className = 'vela-dom-select';
        const pullOpts: [number, string][] = [[0, 'off'], [15, '15s'], [60, '1m'], [300, '5m']];
        for (const [val, txt] of pullOpts) {
            const opt = new Option(txt, String(val));
            if (val === this.selectedWindowSec) opt.selected = true;
            this.pullSelect.append(opt);
        }
        this.pullSelect.onchange = () => {
            this.selectedWindowSec = Number(this.pullSelect.value);
            this.updateColsHeader();
            this.rebuildLevels();
            this.invalidate();
        };
        pullWrap.appendChild(this.pullSelect);
        controls.appendChild(pullWrap);

        // Mode Select
        const modeWrap = document.createElement('div');
        modeWrap.className = 'vela-dom-select-wrap';
        modeWrap.append('Mode:');
        this.modeSelect = document.createElement('select');
        this.modeSelect.className = 'vela-dom-select';
        this.modeSelect.append(new Option('Aggregated', 'aggregated'), new Option('Compact', 'compact'));
        this.modeSelect.value = this.mode;
        this.modeSelect.onchange = () => {
            this.mode = this.modeSelect.value as any;
            this.invalidate();
        };
        modeWrap.appendChild(this.modeSelect);
        controls.appendChild(modeWrap);

        header.appendChild(controls);

        // Balance Bar
        const balanceWrap = document.createElement('div');
        balanceWrap.className = 'vela-dom-balance-wrap';

        const balanceText = document.createElement('div');
        balanceText.className = 'vela-dom-balance-text';
        this.balanceBidsLabel = document.createElement('span');
        this.balanceBidsLabel.textContent = 'Bids: 50%';
        this.balanceAsksLabel = document.createElement('span');
        this.balanceAsksLabel.textContent = '50% :Asks';
        balanceText.appendChild(this.balanceBidsLabel);
        balanceText.appendChild(this.balanceAsksLabel);
        balanceWrap.appendChild(balanceText);

        const balanceBarContainer = document.createElement('div');
        balanceBarContainer.className = 'vela-dom-balance-bar';
        this.balanceBarFill = document.createElement('div');
        this.balanceBarFill.className = 'vela-dom-balance-fill';
        balanceBarContainer.appendChild(this.balanceBarFill);
        balanceWrap.appendChild(balanceBarContainer);

        header.appendChild(balanceWrap);
        this.root.appendChild(header);

        // Columns Header
        this.colsHeader = document.createElement('div');
        this.colsHeader.className = 'vela-dom-cols-header';
        this.updateColsHeader();
        this.root.appendChild(this.colsHeader);

        // Canvas Wrap
        const canvasWrap = document.createElement('div');
        canvasWrap.className = 'vela-dom-canvas-wrap';

        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
        canvasWrap.appendChild(this.canvas);

        const ctx2d = this.canvas.getContext('2d');
        if (!ctx2d) throw new Error('Could not get 2d context for DOM ladder');
        this.ctx2d = ctx2d;

        // Tooltip
        this.tooltipEl = document.createElement('div');
        this.tooltipEl.className = 'vela-dom-tooltip';
        canvasWrap.appendChild(this.tooltipEl);

        this.root.appendChild(canvasWrap);

        this.setupGestures(canvasWrap);
        this.updateStepOptions();

        const ro = new ResizeObserver(() => {
            this.syncCanvasSize();
            this.rebuildLevels();
            this.invalidate();
        });
        ro.observe(canvasWrap);
    }

    private updateColsHeader(): void {
        const hasPs = this.selectedWindowSec > 0;
        this.colsHeader.innerHTML = `
            ${hasPs ? `<span style="width: ${PS_W}px; text-align: right; padding-right: 6px;">PULL/STK</span>` : ''}
            <span style="width: ${USD_W}px; text-align: right; padding-right: 6px;">DEPTH</span>
            <span style="width: ${PRICE_W}px; text-align: center;">PRICE</span>
            <span style="flex: 1; text-align: left; padding-left: 8px;">AGG DEPTH / VENUES</span>
        `;
    }

    private updateStepOptions(): void {
        const mark = this.markPrice || 80000;
        const auto = gridStepFor(mark);
        const steps: number[] = [];

        if (mark >= 10000) steps.push(0.5, 1, 2, 5, 10, 25, 50);
        else if (mark >= 1000) steps.push(0.1, 0.2, 0.5, 1, 2, 5);
        else if (mark >= 50) steps.push(0.01, 0.02, 0.05, 0.1, 0.2, 0.5);
        else steps.push(0.0001, 0.0005, 0.001, 0.005, 0.01);

        this.groupSelect.innerHTML = '';
        this.groupSelect.append(new Option(`Auto (${auto})`, 'auto'));
        for (const s of steps) {
            const opt = new Option(String(s), String(s));
            if (s === this.manualStep) opt.selected = true;
            this.groupSelect.append(opt);
        }
    }

    private getActiveStep(): number {
        if (this.manualStep > 0) return this.manualStep;
        return gridStepFor(this.markPrice || 80000);
    }

    private syncCanvasSize(): void {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        if (w <= 0 || h <= 0) return;

        if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
            this.canvas.width = w * dpr;
            this.canvas.height = h * dpr;
        }
    }

    private setupGestures(wrap: HTMLElement): void {
        wrap.addEventListener('pointerdown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.stopFling();

            const isPriceAxis = x >= (this.selectedWindowSec > 0 ? PS_W + USD_W : USD_W) && x <= (this.selectedWindowSec > 0 ? PS_W + USD_W + PRICE_W : USD_W + PRICE_W);
            this.drag = {
                kind: isPriceAxis ? 'zoom' : 'pan',
                startY: y,
                startOffset: this.offsetRows,
                startStep: this.getActiveStep()
            };
            wrap.setPointerCapture(e.pointerId);
        });

        wrap.addEventListener('pointermove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (this.drag) {
                const dy = y - this.drag.startY;
                if (this.drag.kind === 'pan') {
                    const rowDelta = Math.round(dy / ROW_H);
                    this.offsetRows = this.drag.startOffset + rowDelta;
                    this.rebuildLevels();
                    this.invalidate();
                } else if (this.drag.kind === 'zoom') {
                    const notches = Math.trunc(-dy / 25);
                    if (notches !== 0) {
                        const factor = notches > 0 ? 1.5 : 0.67;
                        this.manualStep = Number((this.drag.startStep * factor).toPrecision(4));
                        this.updateStepOptions();
                        this.rebuildLevels();
                        this.invalidate();
                    }
                }
            } else {
                const r = Math.floor(y / ROW_H);
                if (r >= 0 && r < this.levels.length) {
                    this.hoverRow = r;
                    this.hoverPt = { x, y };
                    this.updateTooltip(this.levels[r]!, x, y);
                } else {
                    this.hoverRow = null;
                    this.hoverPt = null;
                    this.tooltipEl.style.display = 'none';
                }
                this.invalidate();
            }
        });

        wrap.addEventListener('pointerup', (e) => {
            this.drag = null;
            try { wrap.releasePointerCapture(e.pointerId); } catch (_) {}
        });

        wrap.addEventListener('pointercancel', () => {
            this.drag = null;
        });

        wrap.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY;
            const step = this.getActiveStep();
            const nextStep = delta < 0 ? step * 0.8 : step * 1.25;
            this.manualStep = Number(nextStep.toPrecision(3));
            this.updateStepOptions();
            this.rebuildLevels();
            this.invalidate();
        }, { passive: false });

        wrap.addEventListener('dblclick', () => {
            this.recenter();
        });

        wrap.addEventListener('mouseleave', () => {
            this.hoverRow = null;
            this.hoverPt = null;
            this.tooltipEl.style.display = 'none';
            this.invalidate();
        });
    }

    private updateTooltip(level: GroupedLevel, x: number, y: number): void {
        const decimals = this.markPrice >= 1000 ? 1 : this.markPrice >= 10 ? 2 : 4;
        const priceStr = `$${level.price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
        const depthStr = `$${formatVol(level.usd)}`;
        const cumStr = `$${formatVol(level.cumUsd)}`;
        const psStr = this.selectedWindowSec > 0 ? formatSignedUsd(level.pullStackUsd) : '';

        let venuesHtml = '';
        if (level.venues.length > 0) {
            venuesHtml = '<div style="margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">';
            for (const v of level.venues) {
                const color = getVenueColor(v.venue);
                venuesHtml += `<div style="display: flex; justify-content: space-between; gap: 8px;">
                    <span style="color: ${color}; font-weight: 600;">${v.venue}</span>
                    <span>$${formatVol(v.usd)}</span>
                </div>`;
            }
            venuesHtml += '</div>';
        }

        this.tooltipEl.innerHTML = `
            <div style="font-weight: 700; color: ${level.side === 'ask' ? '#f6465d' : '#2ebd85'};">${priceStr} (${level.side.toUpperCase()})</div>
            <div>Resting: <strong>${depthStr}</strong> · Cumulative: ${cumStr}</div>
            ${this.selectedWindowSec > 0 ? `<div>Pull/Stack: <span style="font-weight: 600; color: ${level.pullStackUsd >= 0 ? '#2ebd85' : '#f6465d'};">${psStr}</span></div>` : ''}
            ${venuesHtml}
        `;

        const wrapRect = this.canvas.getBoundingClientRect();
        const tooltipX = Math.min(x + 12, wrapRect.width - 200);
        const tooltipY = Math.min(y + 10, wrapRect.height - 120);

        this.tooltipEl.style.left = `${tooltipX}px`;
        this.tooltipEl.style.top = `${tooltipY}px`;
        this.tooltipEl.style.display = 'block';
    }

    private stopFling(): void {
        if (this.flingId !== null) {
            cancelAnimationFrame(this.flingId);
            this.flingId = null;
        }
    }

    recenter(): void {
        this.offsetRows = 0;
        this.rebuildLevels();
        this.invalidate();
    }

    async start(): Promise<void> {
        const resolved = LiquidityClient.get().resolveCoin(this.currentSymbol);
        this.badgeEl.textContent = `${resolved.base} AGG LIVE`;

        void LiquidityClient.get().switchMarket(this.currentSymbol);

        try {
            const state = await LiquidityClient.get().getState();
            if (state && typeof state.markPrice === 'number' && state.markPrice > 0) {
                this.markPrice = state.markPrice;
                this.updateMarkDisplay(state.markPrice);
                this.updateStepOptions();
                this.rebuildLevels();
                this.invalidate();
            }
        } catch (_) {}

        this.unsubscribeTick = LiquidityClient.get().onTick((price) => {
            this.markPrice = price;
            this.updateMarkDisplay(price);
            this.rebuildLevels();
            this.invalidate();
        });

        this.unsubscribeLevels = LiquidityClient.get().onLevels((frame) => {
            this.currentFrame = frame;
            this.recordSnapshot(frame);
            this.rebuildLevels();
            this.invalidate();
        });

        this.unsubscribeMarket = LiquidityClient.get().onMarketSwitch((sym) => {
            this.setSymbol(sym);
        });

        if (this.ctx && this.ctx.chart) {
            this.ctx.chart.on('market:changed', ({ symbol }: { symbol: string }) => {
                if (symbol) this.setSymbol(symbol);
            });
        }
    }

    setSymbol(sym: string): void {
        if (!sym || sym === this.currentSymbol) return;
        this.currentSymbol = sym;
        const resolved = LiquidityClient.get().resolveCoin(sym);
        this.badgeEl.textContent = `${resolved.base} AGG LIVE`;
        this.snapshots = [];
        this.levels = [];
        this.offsetRows = 0;
        void LiquidityClient.get().switchMarket(sym);
        this.updateStepOptions();
        this.invalidate();
    }

    private updateMarkDisplay(price: number): void {
        const decimals = price >= 1000 ? 1 : price >= 10 ? 2 : 4;
        this.markBanner.textContent = `$${price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    }

    private recordSnapshot(frame: LevelsFrame): void {
        const now = Date.now();
        const step = this.getActiveStep();
        const bins = new Map<number, number>();

        for (const book of frame.books) {
            for (let i = 0; i < book.bids.lo.length; i++) {
                const p = book.bids.lo[i]!;
                const usd = book.bids.usd[i]!;
                if (usd > 0) {
                    const bin = Math.round((Math.floor(p / step) * step) * 1e8) / 1e8;
                    bins.set(bin, (bins.get(bin) || 0) + usd);
                }
            }
            for (let i = 0; i < book.asks.lo.length; i++) {
                const p = book.asks.lo[i]!;
                const usd = book.asks.usd[i]!;
                if (usd > 0) {
                    const bin = Math.round((Math.floor(p / step) * step) * 1e8) / 1e8;
                    bins.set(bin, (bins.get(bin) || 0) + usd);
                }
            }
        }

        this.snapshots.push({ timestamp: now, bins, markPrice: this.markPrice });
        const cutoff = now - 360 * 1000;
        while (this.snapshots.length > 0 && this.snapshots[0]!.timestamp < cutoff) {
            this.snapshots.shift();
        }
    }

    private rebuildLevels(): void {
        const h = this.canvas?.getBoundingClientRect()?.height || 400;
        const numRows = Math.max(10, Math.floor(h / ROW_H));
        const step = this.getActiveStep();
        const mark = this.markPrice || 80000;

        const markBin = Math.round((Math.floor(mark / step) * step) * 1e8) / 1e8;
        const centerBin = Math.round((markBin + this.offsetRows * step) * 1e8) / 1e8;

        const halfRows = Math.floor(numRows / 2);
        const topPrice = Math.round((centerBin + halfRows * step) * 1e8) / 1e8;

        // Group live orderbook
        const bidsMap = new Map<number, { usd: number; venues: Map<string, number> }>();
        const asksMap = new Map<number, { usd: number; venues: Map<string, number> }>();

        if (this.currentFrame && this.currentFrame.books) {
            for (const book of this.currentFrame.books) {
                const v = book.venue;
                // Bids
                for (let i = 0; i < book.bids.lo.length; i++) {
                    const lo = book.bids.lo[i]!, usd = book.bids.usd[i]!;
                    if (usd <= 0) continue;
                    const bin = Math.round((Math.floor(lo / step) * step) * 1e8) / 1e8;
                    let entry = bidsMap.get(bin);
                    if (!entry) { entry = { usd: 0, venues: new Map() }; bidsMap.set(bin, entry); }
                    entry.usd += usd;
                    entry.venues.set(v, (entry.venues.get(v) || 0) + usd);
                }
                // Asks
                for (let i = 0; i < book.asks.lo.length; i++) {
                    const lo = book.asks.lo[i]!, usd = book.asks.usd[i]!;
                    if (usd <= 0) continue;
                    const bin = Math.round((Math.floor(lo / step) * step) * 1e8) / 1e8;
                    let entry = asksMap.get(bin);
                    if (!entry) { entry = { usd: 0, venues: new Map() }; asksMap.set(bin, entry); }
                    entry.usd += usd;
                    entry.venues.set(v, (entry.venues.get(v) || 0) + usd);
                }
            }
        }

        // Pull/Stack delta lookup
        const now = Date.now();
        const targetTime = now - this.selectedWindowSec * 1000;
        let refSnapshot: DepthSnapshot | null = null;
        if (this.selectedWindowSec > 0) {
            for (let i = this.snapshots.length - 1; i >= 0; i--) {
                if (this.snapshots[i]!.timestamp <= targetTime) {
                    refSnapshot = this.snapshots[i]!;
                    break;
                }
            }
            if (!refSnapshot && this.snapshots.length > 0) {
                refSnapshot = this.snapshots[0]!;
            }
        }

        const built: GroupedLevel[] = [];

        for (let r = 0; r < numRows; r++) {
            const p = Math.round((topPrice - r * step) * 1e8) / 1e8;
            const isAsk = p > markBin;
            const entry = isAsk ? asksMap.get(p) : bidsMap.get(p);
            const usd = entry ? entry.usd : 0;

            const venues: VenueDepth[] = [];
            if (entry) {
                for (const [venue, vUsd] of entry.venues.entries()) {
                    if (vUsd > 0) venues.push({ venue, usd: vUsd });
                }
                venues.sort((a, b) => b.usd - a.usd);
            }

            let pullStackUsd = 0;
            if (refSnapshot) {
                const pastUsd = refSnapshot.bins.get(p) || 0;
                pullStackUsd = usd - pastUsd;
            }

            built.push({
                price: p,
                side: isAsk ? 'ask' : 'bid',
                usd,
                cumUsd: 0,
                venues,
                pullStackUsd,
                touched: Math.abs(p - mark) < step
            });
        }

        let runAsk = 0;
        for (let r = built.length - 1; r >= 0; r--) {
            const item = built[r]!;
            if (item.side === 'ask') {
                runAsk += item.usd;
                item.cumUsd = runAsk;
            }
        }
        let runBid = 0;
        for (let r = 0; r < built.length; r++) {
            const item = built[r]!;
            if (item.side === 'bid') {
                runBid += item.usd;
                item.cumUsd = runBid;
            }
        }

        this.levels = built;

        let visibleBids = 0, visibleAsks = 0;
        for (const l of built) {
            if (l.side === 'bid') visibleBids += l.usd;
            else visibleAsks += l.usd;
        }
        const totalVis = visibleBids + visibleAsks;
        if (totalVis > 0) {
            const bidPct = Math.round((visibleBids / totalVis) * 100);
            const askPct = 100 - bidPct;
            this.balanceBarFill.style.width = `${bidPct}%`;
            this.balanceBidsLabel.textContent = `Bids: ${bidPct}% ($${formatVol(visibleBids)})`;
            this.balanceAsksLabel.textContent = `${askPct}% ($${formatVol(visibleAsks)}) :Asks`;
        }
    }

    private invalidate(): void {
        if (this.animFrameId !== null) return;
        this.animFrameId = requestAnimationFrame(() => {
            this.animFrameId = null;
            this.render();
        });
    }

    private render(): void {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        if (w <= 0 || h <= 0) return;

        this.syncCanvasSize();
        const ctx = this.ctx2d;

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const hasPs = this.selectedWindowSec > 0;
        const psW = hasPs ? PS_W : 0;
        const usdW = USD_W;
        const priceW = PRICE_W;
        const barX = psW + usdW + priceW + 8;
        const barW = Math.max(20, w - barX - 10);

        let maxDepth = 1;
        for (const l of this.levels) {
            if (l.usd > maxDepth) maxDepth = l.usd;
        }

        const decimals = this.markPrice >= 1000 ? 1 : this.markPrice >= 10 ? 2 : 4;
        const step = this.getActiveStep();

        ctx.font = '10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textBaseline = 'middle';

        for (let r = 0; r < this.levels.length; r++) {
            const l = this.levels[r]!;
            const y = r * ROW_H;
            const isMark = Math.abs(l.price - this.markPrice) < (step * 0.9);
            const isHover = this.hoverRow === r;

            // Row background
            if (isMark) {
                ctx.fillStyle = 'rgba(212, 161, 6, 0.16)';
                ctx.fillRect(0, y, w, ROW_H);
                ctx.fillStyle = '#d4a106';
                ctx.fillRect(0, y, 3, ROW_H);
            } else if (isHover) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.fillRect(0, y, w, ROW_H);
            }

            // Row separator
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.fillRect(0, y + ROW_H - 1, w, 1);

            let curX = 0;

            // 1. PULL / STACK Column
            if (hasPs) {
                const psVal = l.pullStackUsd;
                ctx.textAlign = 'right';
                if (l.touched) {
                    ctx.fillStyle = '#787b86';
                    ctx.fillText('•', curX + 10, y + ROW_H / 2);
                }
                if (Math.abs(psVal) > 100) {
                    ctx.fillStyle = psVal > 0 ? '#2ebd85' : '#f6465d';
                    ctx.fillText(formatSignedUsd(psVal), curX + psW - 6, y + ROW_H / 2);
                } else {
                    ctx.fillStyle = '#50535e';
                    ctx.fillText('—', curX + psW - 6, y + ROW_H / 2);
                }
                curX += psW;
            }

            // 2. DEPTH USD Column
            ctx.textAlign = 'right';
            ctx.fillStyle = '#d1d4dc';
            if (l.usd > 0) {
                ctx.fillText(formatVol(l.usd), curX + usdW - 6, y + ROW_H / 2);
            } else {
                ctx.fillStyle = '#3a3d47';
                ctx.fillText('—', curX + usdW - 6, y + ROW_H / 2);
            }
            curX += usdW;

            // 3. PRICE Column
            ctx.textAlign = 'center';
            if (isMark) {
                ctx.fillStyle = '#ffffff';
                ctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
            } else {
                ctx.fillStyle = l.side === 'ask' ? '#f6465d' : '#2ebd85';
                ctx.font = '10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
            }
            const pStr = l.price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
            ctx.fillText(pStr, curX + priceW / 2, y + ROW_H / 2);
            curX += priceW;

            // 4. AGG DEPTH BAR (segmented by venue)
            if (l.usd > 0) {
                const totalBarLen = Math.max(2, (l.usd / maxDepth) * barW);
                let segX = barX;

                if (this.mode === 'compact') {
                    const color = l.venues[0] ? getVenueColor(l.venues[0].venue) : (l.side === 'ask' ? '#f6465d' : '#2ebd85');
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.85;
                    ctx.fillRect(segX, y + 2, totalBarLen, ROW_H - 4);
                    ctx.globalAlpha = 1.0;
                } else {
                    for (const v of l.venues) {
                        const segW = Math.max(1, (v.usd / l.usd) * totalBarLen);
                        ctx.fillStyle = getVenueColor(v.venue);
                        ctx.globalAlpha = 0.88;
                        ctx.fillRect(segX, y + 2, segW - 0.5, ROW_H - 4);
                        segX += segW;
                    }
                    ctx.globalAlpha = 1.0;
                }
            }
        }

        ctx.restore();
    }

    destroy(): void {
        if (this.unsubscribeLevels) {
            this.unsubscribeLevels();
            this.unsubscribeLevels = null;
        }
        if (this.unsubscribeTick) {
            this.unsubscribeTick();
            this.unsubscribeTick = null;
        }
        if (this.unsubscribeMarket) {
            this.unsubscribeMarket();
            this.unsubscribeMarket = null;
        }
        this.stopFling();
        if (this.animFrameId !== null) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
    }
}

export function registerLiquidityDomPanel(): void {
    registerIcon('dom-ladder', DOM_LADDER_ICON);

    registerSidePanel({
        id: 'liquidity.dom',
        title: 'DOM Ladder',
        icon: 'dom-ladder',
        order: 40,
        width: 320,
        resizable: true,
        minWidth: 260,
        maxWidth: 480,
        button: true,
        mount(ctx: WidgetContext, body: HTMLElement, _header: SidePanelHeader): SidePanelHandle {
            const ctrl = new DomLadderPanelController(body, ctx);
            ctrl.start();
            return {
                destroy: () => ctrl.destroy()
            };
        }
    });
}
