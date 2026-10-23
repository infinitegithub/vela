import {
    registerSidePanel,
    registerIcon,
    type SidePanelDescriptor,
    type SidePanelHandle,
    type SidePanelHeader,
    type WidgetContext
} from '../src/plugin';
import {
    LiquidityClient,
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

function formatCompactUsd(val: number): string {
    if (val === 0) return '0';
    const abs = Math.abs(val);
    if (abs >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M';
    if (abs >= 1_000) return (val / 1_000).toFixed(1) + 'k';
    return val.toFixed(0);
}

function formatSignedUsd(val: number): string {
    if (Math.abs(val) < 1) return '—';
    const sign = val > 0 ? '+' : '−';
    return `${sign}${formatCompactUsd(Math.abs(val))}`;
}

interface PriceRow {
    price: number;
    side: 'bid' | 'ask';
    totalUsd: number;
    venues: Map<string, number>;
    pullStackUsd: number;
    touched: boolean;
}

interface DepthSnapshot {
    timestamp: number;
    bins: Map<number, number>; // price -> usd
}

export class DomLadderPanelController {
    private root: HTMLElement;
    private markPrice: number = 0;
    private selectedWindowSec: number = 60; // 15, 60, 300
    private manualStep: number = 0; // 0 = auto
    private snapshots: DepthSnapshot[] = [];
    private rows: PriceRow[] = [];
    private unsubscribeLevels: (() => void) | null = null;
    private unsubscribeTick: (() => void) | null = null;
    private animFrameId: number | null = null;
    private autoCenter = true;

    // DOM References
    private markBanner!: HTMLElement;
    private balanceBar!: HTMLElement;
    private balanceBidsLabel!: HTMLElement;
    private balanceAsksLabel!: HTMLElement;
    private tableBody!: HTMLElement;
    private tooltipEl!: HTMLElement;

    constructor(container: HTMLElement) {
        this.root = container;
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
                background: #121316;
                color: #d1d4dc;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                font-size: 11px;
                user-select: none;
                position: relative;
                overflow: hidden;
            }
            .vela-dom-header {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 10px 12px;
                background: #18191e;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            .vela-dom-mark-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .vela-dom-mark-price {
                font-size: 16px;
                font-weight: 700;
                color: #ffffff;
                letter-spacing: -0.02em;
            }
            .vela-dom-badge {
                font-size: 9px;
                padding: 2px 6px;
                border-radius: 3px;
                background: rgba(46, 189, 133, 0.2);
                color: #2ebd85;
                font-weight: 600;
                letter-spacing: 0.05em;
            }
            .vela-dom-controls {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 6px;
            }
            .vela-dom-pills {
                display: flex;
                gap: 4px;
                background: #101114;
                padding: 2px;
                border-radius: 4px;
            }
            .vela-dom-pill {
                padding: 2px 7px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 10px;
                color: #787b86;
                transition: all 0.15s;
            }
            .vela-dom-pill:hover {
                color: #d1d4dc;
            }
            .vela-dom-pill.active {
                background: #2a2e39;
                color: #ffffff;
                font-weight: 600;
            }
            .vela-dom-balance-wrap {
                display: flex;
                flex-direction: column;
                gap: 3px;
            }
            .vela-dom-balance-text {
                display: flex;
                justify-content: space-between;
                font-size: 9px;
                color: #787b86;
            }
            .vela-dom-balance-bar {
                height: 4px;
                border-radius: 2px;
                background: #f6465d;
                overflow: hidden;
                display: flex;
            }
            .vela-dom-balance-fill {
                background: #2ebd85;
                height: 100%;
                width: 50%;
                transition: width 0.3s;
            }
            .vela-dom-cols-header {
                display: flex;
                align-items: center;
                padding: 6px 12px;
                background: #14151a;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                font-size: 10px;
                font-weight: 600;
                color: #787b86;
            }
            .vela-dom-scroll-area {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                position: relative;
            }
            .vela-dom-scroll-area::-webkit-scrollbar {
                width: 4px;
            }
            .vela-dom-scroll-area::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.15);
                border-radius: 2px;
            }
            .vela-dom-table {
                display: flex;
                flex-direction: column;
                width: 100%;
            }
            .vela-dom-row {
                display: flex;
                align-items: center;
                height: 20px;
                padding: 0 12px;
                position: relative;
                cursor: default;
                border-bottom: 1px solid rgba(255, 255, 255, 0.02);
            }
            .vela-dom-row:hover {
                background: rgba(255, 255, 255, 0.04);
            }
            .vela-dom-row.mark-row {
                background: rgba(255, 255, 255, 0.08);
                border-top: 1px solid rgba(255, 255, 255, 0.2);
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                font-weight: 700;
            }
            .vela-col-ps {
                width: 54px;
                text-align: right;
                font-variant-numeric: tabular-nums;
            }
            .vela-col-ps.stack { color: #2ebd85; }
            .vela-col-ps.pull { color: #f6465d; }
            .vela-col-ps.zero { color: #50535e; }
            .vela-col-usd {
                width: 58px;
                text-align: right;
                font-variant-numeric: tabular-nums;
                color: #d1d4dc;
            }
            .vela-col-price {
                width: 62px;
                text-align: center;
                font-variant-numeric: tabular-nums;
                font-weight: 600;
            }
            .vela-col-price.ask { color: #f6465d; }
            .vela-col-price.bid { color: #2ebd85; }
            .vela-col-price.mark { color: #ffffff; }
            .vela-col-bar {
                flex: 1;
                height: 10px;
                display: flex;
                align-items: center;
                margin-left: 6px;
                position: relative;
                overflow: hidden;
                border-radius: 1px;
            }
            .vela-dom-segment {
                height: 100%;
            }
            .vela-dom-tooltip {
                position: absolute;
                display: none;
                z-index: 100;
                background: #1e2026;
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 4px;
                padding: 6px 10px;
                font-size: 10px;
                color: #ffffff;
                pointer-events: none;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                white-space: nowrap;
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
        this.markBanner.textContent = 'Connecting...';

        const badge = document.createElement('div');
        badge.className = 'vela-dom-badge';
        badge.textContent = 'AGG LIVE';

        markRow.appendChild(this.markBanner);
        markRow.appendChild(badge);
        header.appendChild(markRow);

        // Controls
        const controls = document.createElement('div');
        controls.className = 'vela-dom-controls';

        // Window pills
        const pills = document.createElement('div');
        pills.className = 'vela-dom-pills';

        const windows = [15, 60, 300];
        const labels: Record<number, string> = { 15: '15s', 60: '1m', 300: '5m' };

        for (const w of windows) {
            const p = document.createElement('div');
            p.className = `vela-dom-pill ${w === this.selectedWindowSec ? 'active' : ''}`;
            p.textContent = labels[w]!;
            p.addEventListener('click', () => {
                this.selectedWindowSec = w;
                pills.querySelectorAll('.vela-dom-pill').forEach(el => el.classList.remove('active'));
                p.classList.add('active');
                this.scheduleRender();
            });
            pills.appendChild(p);
        }

        controls.appendChild(pills);

        // Center Button
        const centerBtn = document.createElement('div');
        centerBtn.className = 'vela-dom-pill';
        centerBtn.textContent = 'Recenter';
        centerBtn.style.cursor = 'pointer';
        centerBtn.addEventListener('click', () => {
            this.autoCenter = true;
            this.recenterScroll();
        });
        controls.appendChild(centerBtn);

        header.appendChild(controls);

        // Balance Bar
        const balanceWrap = document.createElement('div');
        balanceWrap.className = 'vela-dom-balance-wrap';

        const balanceText = document.createElement('div');
        balanceText.className = 'vela-dom-balance-text';
        this.balanceBidsLabel = document.createElement('span');
        this.balanceBidsLabel.textContent = 'Bids: 50%';
        this.balanceAsksLabel = document.createElement('span');
        this.balanceAsksLabel.textContent = 'Asks: 50%';
        balanceText.appendChild(this.balanceBidsLabel);
        balanceText.appendChild(this.balanceAsksLabel);
        balanceWrap.appendChild(balanceText);

        const balanceBarContainer = document.createElement('div');
        balanceBarContainer.className = 'vela-dom-balance-bar';
        this.balanceBar = document.createElement('div');
        this.balanceBar.className = 'vela-dom-balance-fill';
        balanceBarContainer.appendChild(this.balanceBar);
        balanceWrap.appendChild(balanceBarContainer);

        header.appendChild(balanceWrap);
        this.root.appendChild(header);

        // Columns Header
        const colsHeader = document.createElement('div');
        colsHeader.className = 'vela-dom-cols-header';
        colsHeader.innerHTML = `
            <span class="vela-col-ps">PULL/STK</span>
            <span class="vela-col-usd">DEPTH</span>
            <span class="vela-col-price">PRICE</span>
            <span class="vela-col-bar" style="margin-left: 6px;">AGG DEPTH</span>
        `;
        this.root.appendChild(colsHeader);

        // Scrollable Table Area
        const scrollArea = document.createElement('div');
        scrollArea.className = 'vela-dom-scroll-area';

        this.tableBody = document.createElement('div');
        this.tableBody.className = 'vela-dom-table';
        scrollArea.appendChild(this.tableBody);
        this.root.appendChild(scrollArea);

        // Tooltip
        this.tooltipEl = document.createElement('div');
        this.tooltipEl.className = 'vela-dom-tooltip';
        this.root.appendChild(this.tooltipEl);

        scrollArea.addEventListener('scroll', () => {
            this.autoCenter = false;
        });
    }

    start(): void {
        this.unsubscribeTick = LiquidityClient.get().onTick((price) => {
            this.markPrice = price;
            this.markBanner.textContent = `$${price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
            this.scheduleRender();
        });

        this.unsubscribeLevels = LiquidityClient.get().onLevels((frame) => {
            this.processLevelsFrame(frame);
            this.scheduleRender();
        });
    }

    private processLevelsFrame(frame: LevelsFrame): void {
        if (!frame.books || frame.books.length === 0) return;

        // Determine step from mark price
        let step = this.manualStep;
        if (step <= 0) {
            if (this.markPrice >= 50000) step = 5;
            else if (this.markPrice >= 10000) step = 1;
            else if (this.markPrice >= 1000) step = 0.5;
            else if (this.markPrice >= 100) step = 0.1;
            else step = 0.01;
        }

        const snapshotMap = new Map<number, number>();
        const aggregatedBids = new Map<number, { usd: number; venues: Map<string, number> }>();
        const aggregatedAsks = new Map<number, { usd: number; venues: Map<string, number> }>();

        for (const book of frame.books) {
            const venue = book.venue;

            // Aggregate Bids
            const bids = book.bids;
            for (let i = 0; i < bids.lo.length; i++) {
                const price = bids.lo[i]!;
                const usd = bids.usd[i]!;
                if (usd <= 0) continue;

                const bin = Math.floor(price / step) * step;
                snapshotMap.set(bin, (snapshotMap.get(bin) || 0) + usd);

                let entry = aggregatedBids.get(bin);
                if (!entry) {
                    entry = { usd: 0, venues: new Map() };
                    aggregatedBids.set(bin, entry);
                }
                entry.usd += usd;
                entry.venues.set(venue, (entry.venues.get(venue) || 0) + usd);
            }

            // Aggregate Asks
            const asks = book.asks;
            for (let i = 0; i < asks.lo.length; i++) {
                const price = asks.lo[i]!;
                const usd = asks.usd[i]!;
                if (usd <= 0) continue;

                const bin = Math.floor(price / step) * step;
                snapshotMap.set(bin, (snapshotMap.get(bin) || 0) + usd);

                let entry = aggregatedAsks.get(bin);
                if (!entry) {
                    entry = { usd: 0, venues: new Map() };
                    aggregatedAsks.set(bin, entry);
                }
                entry.usd += usd;
                entry.venues.set(venue, (entry.venues.get(venue) || 0) + usd);
            }
        }

        // Record Snapshot for Pull/Stack
        const now = Date.now();
        this.snapshots.push({ timestamp: now, bins: snapshotMap });
        // Keep max 360 seconds of snapshots
        const cutoff = now - 360 * 1000;
        while (this.snapshots.length > 0 && this.snapshots[0]!.timestamp < cutoff) {
            this.snapshots.shift();
        }

        // Find reference snapshot for selected window
        const targetTime = now - this.selectedWindowSec * 1000;
        let pastSnapshot: DepthSnapshot | null = null;
        for (let i = this.snapshots.length - 1; i >= 0; i--) {
            if (this.snapshots[i]!.timestamp <= targetTime) {
                pastSnapshot = this.snapshots[i]!;
                break;
            }
        }
        if (!pastSnapshot && this.snapshots.length > 0) {
            pastSnapshot = this.snapshots[0]!;
        }

        // Build Rows around mark price
        const numHalfRows = 25;
        const markBin = Math.floor((this.markPrice || 80000) / step) * step;
        const newRows: PriceRow[] = [];

        // Asks (above mark price, descending)
        for (let k = numHalfRows; k >= 1; k--) {
            const p = markBin + k * step;
            const entry = aggregatedAsks.get(p);
            const totalUsd = entry ? entry.usd : 0;
            const venues = entry ? entry.venues : new Map();

            const pastUsd = pastSnapshot ? (pastSnapshot.bins.get(p) || 0) : totalUsd;
            const pullStackUsd = totalUsd - pastUsd;

            newRows.push({
                price: p,
                side: 'ask',
                totalUsd,
                venues,
                pullStackUsd,
                touched: false
            });
        }

        // Mark Price row
        newRows.push({
            price: markBin,
            side: 'bid',
            totalUsd: (aggregatedBids.get(markBin)?.usd || 0) + (aggregatedAsks.get(markBin)?.usd || 0),
            venues: aggregatedBids.get(markBin)?.venues || new Map(),
            pullStackUsd: 0,
            touched: true
        });

        // Bids (below mark price, descending)
        for (let k = 1; k <= numHalfRows; k++) {
            const p = markBin - k * step;
            const entry = aggregatedBids.get(p);
            const totalUsd = entry ? entry.usd : 0;
            const venues = entry ? entry.venues : new Map();

            const pastUsd = pastSnapshot ? (pastSnapshot.bins.get(p) || 0) : totalUsd;
            const pullStackUsd = totalUsd - pastUsd;

            newRows.push({
                price: p,
                side: 'bid',
                totalUsd,
                venues,
                pullStackUsd,
                touched: false
            });
        }

        this.rows = newRows;
    }

    private scheduleRender(): void {
        if (this.animFrameId !== null) return;
        this.animFrameId = requestAnimationFrame(() => {
            this.animFrameId = null;
            this.render();
        });
    }

    private render(): void {
        if (this.rows.length === 0) return;

        // Calculate max depth for bar scaling
        let maxDepth = 1;
        let totalBidsUsd = 0;
        let totalAsksUsd = 0;

        for (const r of this.rows) {
            if (r.totalUsd > maxDepth) maxDepth = r.totalUsd;
            if (r.side === 'bid') totalBidsUsd += r.totalUsd;
            else totalAsksUsd += r.totalUsd;
        }

        // Update balance bar
        const totalVisible = totalBidsUsd + totalAsksUsd;
        if (totalVisible > 0) {
            const bidPct = Math.round((totalBidsUsd / totalVisible) * 100);
            const askPct = 100 - bidPct;
            this.balanceBar.style.width = `${bidPct}%`;
            this.balanceBidsLabel.textContent = `Bids: ${bidPct}% ($${formatCompactUsd(totalBidsUsd)})`;
            this.balanceAsksLabel.textContent = `Asks: ${askPct}% ($${formatCompactUsd(totalAsksUsd)})`;
        }

        // Render Rows
        this.tableBody.innerHTML = '';
        const frag = document.createDocumentFragment();

        for (const row of this.rows) {
            const isMark = Math.abs(row.price - this.markPrice) < (this.rows[0]!.price - this.rows[1]!.price);
            const rowEl = document.createElement('div');
            rowEl.className = `vela-dom-row ${isMark ? 'mark-row' : ''}`;

            // Pull/Stack Column
            const psCol = document.createElement('div');
            const psVal = row.pullStackUsd;
            let psClass = 'zero';
            if (psVal > 500) psClass = 'stack';
            else if (psVal < -500) psClass = 'pull';
            psCol.className = `vela-col-ps ${psClass}`;
            psCol.textContent = formatSignedUsd(psVal);

            // Total USD Column
            const usdCol = document.createElement('div');
            usdCol.className = 'vela-col-usd';
            usdCol.textContent = row.totalUsd > 0 ? formatCompactUsd(row.totalUsd) : '—';

            // Price Column
            const priceCol = document.createElement('div');
            priceCol.className = `vela-col-price ${isMark ? 'mark' : row.side}`;
            priceCol.textContent = row.price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

            // Visual Depth Bar (segmented by venue)
            const barCol = document.createElement('div');
            barCol.className = 'vela-col-bar';

            if (row.totalUsd > 0) {
                const totalWidthPct = Math.min(100, (row.totalUsd / maxDepth) * 100);
                for (const [venue, usd] of row.venues.entries()) {
                    if (usd <= 0) continue;
                    const segPct = (usd / row.totalUsd) * totalWidthPct;
                    const seg = document.createElement('div');
                    seg.className = 'vela-dom-segment';
                    seg.style.width = `${segPct}%`;
                    seg.style.background = VENUE_COLORS[venue] || (row.side === 'bid' ? '#2ebd85' : '#f6465d');
                    seg.style.opacity = '0.85';
                    barCol.appendChild(seg);
                }
            }

            rowEl.appendChild(psCol);
            rowEl.appendChild(usdCol);
            rowEl.appendChild(priceCol);
            rowEl.appendChild(barCol);

            // Hover Tooltip
            rowEl.addEventListener('mouseenter', (e) => {
                let tooltipHtml = `<strong>$${row.price.toFixed(1)}</strong> — Total: $${row.totalUsd.toLocaleString()}<br/>`;
                tooltipHtml += `Pull/Stack (${this.selectedWindowSec}s): ${formatSignedUsd(row.pullStackUsd)}<br/>`;
                tooltipHtml += `<div style="margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 2px;">`;
                for (const [v, u] of row.venues.entries()) {
                    const pct = Math.round((u / (row.totalUsd || 1)) * 100);
                    const color = VENUE_COLORS[v] || '#ffffff';
                    tooltipHtml += `<span style="color:${color}">●</span> ${v}: $${formatCompactUsd(u)} (${pct}%)<br/>`;
                }
                tooltipHtml += `</div>`;

                this.tooltipEl.innerHTML = tooltipHtml;
                this.tooltipEl.style.display = 'block';
                this.tooltipEl.style.top = `${rowEl.offsetTop + 20}px`;
                this.tooltipEl.style.left = `20px`;
            });

            rowEl.addEventListener('mouseleave', () => {
                this.tooltipEl.style.display = 'none';
            });

            frag.appendChild(rowEl);
        }

        this.tableBody.appendChild(frag);

        if (this.autoCenter) {
            this.recenterScroll();
        }
    }

    private recenterScroll(): void {
        const markRow = this.tableBody.querySelector('.mark-row') as HTMLElement | null;
        if (markRow && markRow.parentElement) {
            const scroller = markRow.parentElement.parentElement;
            if (scroller) {
                scroller.scrollTop = markRow.offsetTop - scroller.clientHeight / 2 + markRow.clientHeight / 2;
            }
        }
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
        mount(_ctx: WidgetContext, body: HTMLElement, _header: SidePanelHeader): SidePanelHandle {
            const ctrl = new DomLadderPanelController(body);
            ctrl.start();
            return {
                destroy: () => ctrl.destroy()
            };
        }
    });
}
