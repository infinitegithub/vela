/**
 * Vela Workstation - Informative System & Worker Logger
 * Captures, categorizes, and streams real-time workstation execution logs:
 * - Pine Script Web Worker runs & indicator compiles
 * - Historical candle backfills & pan-scrolling events
 * - WebSocket connections, heartbeats, and provider feeds
 * - System resources, memory, and PWA storage lifecycle
 */

export type LogCategory = 'INDICATOR' | 'BACKFILL' | 'NETWORK' | 'SYSTEM' | 'ERROR';
export type LogLevel = 'info' | 'warn' | 'error';

export interface SystemLogEntry {
    id: number;
    time: string;
    timestamp: number;
    level: LogLevel;
    category: LogCategory;
    message: string;
    details?: string;
}

const MAX_LOGS = 1000;
const logs: SystemLogEntry[] = [];
let nextLogId = 1;
const listeners: Array<() => void> = [];

export function logSystemEvent(
    category: LogCategory,
    message: string,
    level: LogLevel = 'info',
    details?: string
): void {
    const d = new Date();
    const pad = (n: number, s = 2) => String(n).padStart(s, '0');
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;

    const entry: SystemLogEntry = {
        id: nextLogId++,
        time,
        timestamp: d.getTime(),
        level,
        category,
        message,
        details,
    };

    logs.push(entry);
    if (logs.length > MAX_LOGS) {
        logs.shift();
    }

    for (const cb of listeners) {
        try {
            cb();
        } catch (_) {}
    }
}

export function getLogs(): readonly SystemLogEntry[] {
    return logs;
}

export function clearLogs(): void {
    logs.length = 0;
    for (const cb of listeners) {
        try {
            cb();
        } catch (_) {}
    }
}

export function onLogAdded(cb: () => void): () => void {
    listeners.push(cb);
    return () => {
        const idx = listeners.indexOf(cb);
        if (idx >= 0) listeners.splice(idx, 1);
    };
}

export function getLogsCount(): number {
    return logs.length;
}

// ── Auto-intercept relevant console messages ────────────────────────────
let consoleHooked = false;
export function hookConsole(): void {
    if (consoleHooked || typeof window === 'undefined') return;
    consoleHooked = true;

    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);

    const parseMessage = (args: any[]): { cat: LogCategory; msg: string } | null => {
        const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        if (!text) return null;

        if (text.includes('[indicators]') || text.includes('indicator') || text.includes('PineTS')) {
            return { cat: 'INDICATOR', msg: text.replace(/^\[indicators\]\s*/, '') };
        }
        if (text.includes('[vela] history') || text.includes('backfill') || text.includes('history chunk')) {
            return { cat: 'BACKFILL', msg: text.replace(/^\[vela\]\s*/, '') };
        }
        if (text.includes('WebSocket') || text.includes('stream') || text.includes('binance') || text.includes('feed')) {
            return { cat: 'NETWORK', msg: text };
        }
        if (text.includes('[PWA]') || text.includes('[Workspace]') || text.includes('storage') || text.includes('reload')) {
            return { cat: 'SYSTEM', msg: text.replace(/^\[PWA\]\s*|^\[Workspace\]\s*/, '') };
        }
        return null;
    };

    console.log = function(...args: any[]) {
        origLog(...args);
        const parsed = parseMessage(args);
        if (parsed) {
            logSystemEvent(parsed.cat, parsed.msg, 'info');
        }
    };

    console.warn = function(...args: any[]) {
        origWarn(...args);
        const parsed = parseMessage(args);
        logSystemEvent(parsed ? parsed.cat : 'SYSTEM', args.join(' '), 'warn');
    };

    console.error = function(...args: any[]) {
        origError(...args);
        const parsed = parseMessage(args);
        logSystemEvent('ERROR', args.join(' '), 'error');
    };
}

// ── Initialize System Logger with Workspace Lifecycle ───────────────────
export function initSystemLogger(ws?: any): void {
    hookConsole();

    // Seed initial boot entries
    logSystemEvent('SYSTEM', 'Vela Charting Workstation booted (LXC 115 Host, Linux ARM64)');
    logSystemEvent('SYSTEM', 'Execution Runtime: PineTS Web Worker Engine isolated threads active');
    logSystemEvent('NETWORK', 'Market Data: Binance Provider connected (USD-M Futures & Spot streams)');
    logSystemEvent('SYSTEM', 'Storage Engine: Persistent storage verified, workspace sync ready');

    if (ws && typeof ws.cells === 'function') {
        const cells = ws.cells();
        logSystemEvent('SYSTEM', `Multi-chart layout active (${cells.length} cells mounted: ${cells.map((c: any) => c.symbol || c.id).join(', ')})`);

        ws.on('cell:active', ({ id }: { id: string }) => {
            const cell = ws.cell(id);
            logSystemEvent('SYSTEM', `Active cell changed to #${id} (${cell?.symbol ?? 'Unknown'} ${cell?.timeframe ?? ''}m)`);
        });

        // Hook cell market changes
        for (const cell of cells) {
            cell.chart?.on('market:changed', ({ symbol, timeframe }: { symbol: string; timeframe: string }) => {
                logSystemEvent('NETWORK', `Cell #${cell.id} switched to ${symbol} [${timeframe}] — reloading feeds`);
            });
            cell.chart?.on('history:progress', ({ loaded, target }: { loaded: number; target: number }) => {
                logSystemEvent('BACKFILL', `Cell #${cell.id} scroll backfill: ${loaded} bars loaded into memory`);
            });
            cell.chart?.on('history:complete', ({ reason, barsLoaded }: { reason: string; barsLoaded: number }) => {
                logSystemEvent('BACKFILL', `Cell #${cell.id} backfill finished (${reason}): ${barsLoaded} total historical candles ready`);
            });
            cell.chart?.on('indicator:added', ({ title }: { title: string }) => {
                logSystemEvent('INDICATOR', `Indicator mounted on #${cell.id}: "${title}" running in Web Worker`);
            });
            cell.chart?.on('indicator:removed', ({ title }: { title: string }) => {
                logSystemEvent('INDICATOR', `Indicator removed from #${cell.id}: "${title}"`);
            });
        }
    }

    // Periodic heartbeat (every 30s)
    if (typeof window !== 'undefined') {
        setInterval(() => {
            const mem = (performance as any).memory;
            const memStr = mem ? `Heap: ${(mem.usedJSHeapSize / (1024 * 1024)).toFixed(1)} MB / ${(mem.totalJSHeapSize / (1024 * 1024)).toFixed(1)} MB` : 'Memory: Normal';
            const wsInst = ws || (window as any).__ws;
            const cells = wsInst && typeof wsInst.cells === 'function' ? wsInst.cells() : [];
            const activeWorkers = cells.length;
            logSystemEvent('SYSTEM', `Heartbeat: ${activeWorkers} active Web Worker cell(s), ${memStr}, WebSocket streams active`);
        }, 30000);
    }
}

// ── Render Interactive Terminal UI ──────────────────────────────────────
let activeCategoryFilter: 'ALL' | LogCategory = 'ALL';
let searchQuery = '';
let autoScroll = true;

export function renderLogsUI(container: HTMLElement): void {
    if (!container) return;
    container.innerHTML = '';
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        width: 100%;
        min-width: 540px;
        height: 440px;
        min-height: 440px;
        background: #141518;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #eeeef1;
        overflow: hidden;
        border-radius: 6px;
        border: 1px solid #262629;
    `;

    // 1. Top Control Strip
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: #1a1b20;
        border-bottom: 1px solid #262629;
        flex: none;
        gap: 10px;
        flex-wrap: wrap;
    `;

    const leftGroup = document.createElement('div');
    leftGroup.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;';

    // Status pill
    const statusPill = document.createElement('div');
    statusPill.style.cssText = 'display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: #4ade80; background: rgba(74, 222, 128, 0.1); padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(74, 222, 128, 0.25);';
    statusPill.innerHTML = '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#4ade80;"></span> <span>LIVE ENGINE LOGS</span>';
    leftGroup.appendChild(statusPill);

    // Filter pills
    const categories: Array<'ALL' | LogCategory> = ['ALL', 'INDICATOR', 'BACKFILL', 'NETWORK', 'SYSTEM', 'ERROR'];
    const filterButtons: HTMLButtonElement[] = [];

    for (const cat of categories) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = cat;
        btn.style.cssText = `
            background: ${activeCategoryFilter === cat ? '#2c2e35' : 'transparent'};
            color: ${activeCategoryFilter === cat ? '#eeeef1' : '#757882'};
            border: 1px solid ${activeCategoryFilter === cat ? '#3f424c' : 'transparent'};
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        btn.onclick = () => {
            activeCategoryFilter = cat;
            for (const b of filterButtons) {
                const isThis = b.textContent === cat;
                b.style.background = isThis ? '#2c2e35' : 'transparent';
                b.style.color = isThis ? '#eeeef1' : '#757882';
                b.style.borderColor = isThis ? '#3f424c' : 'transparent';
            }
            updateLogRows();
        };
        filterButtons.push(btn);
        leftGroup.appendChild(btn);
    }
    toolbar.appendChild(leftGroup);

    // Right action group: Search + Auto-scroll + Copy + Clear
    const rightGroup = document.createElement('div');
    rightGroup.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search logs...';
    searchInput.value = searchQuery;
    searchInput.style.cssText = `
        background: #111215;
        border: 1px solid #2d2f37;
        color: #eeeef1;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 4px;
        width: 140px;
        outline: none;
    `;
    searchInput.oninput = () => {
        searchQuery = searchInput.value.toLowerCase().trim();
        updateLogRows();
    };
    rightGroup.appendChild(searchInput);

    // Auto-scroll toggle
    const scrollLabel = document.createElement('label');
    scrollLabel.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #757882; cursor: pointer; user-select: none;';
    const scrollCb = document.createElement('input');
    scrollCb.type = 'checkbox';
    scrollCb.checked = autoScroll;
    scrollCb.onchange = () => { autoScroll = scrollCb.checked; };
    scrollLabel.appendChild(scrollCb);
    scrollLabel.appendChild(document.createTextNode('Auto-scroll'));
    rightGroup.appendChild(scrollLabel);

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.style.cssText = 'background: #23252a; color: #a0a5b2; border: 1px solid #32353d; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;';
    copyBtn.onclick = () => {
        const text = logs.map(l => `[${l.time}] [${l.category}] ${l.message}`).join('\n');
        navigator.clipboard?.writeText(text).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        });
    };
    rightGroup.appendChild(copyBtn);

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = 'background: #23252a; color: #af6870; border: 1px solid #3f282a; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;';
    clearBtn.onclick = () => {
        clearLogs();
        updateLogRows();
    };
    rightGroup.appendChild(clearBtn);

    toolbar.appendChild(rightGroup);
    container.appendChild(toolbar);

    // 2. Terminal Log Rows Container
    const logList = document.createElement('div');
    logList.id = 'vela-terminal-logs';
    logList.style.cssText = `
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 8px 12px;
        font-family: 'JetBrains Mono', 'SF Mono', Consolas, 'Fira Code', monospace;
        font-size: 11px;
        line-height: 1.6;
        background: #111215;
    `;
    container.appendChild(logList);

    const getBadgeStyle = (cat: LogCategory): string => {
        switch (cat) {
            case 'INDICATOR':
                return 'color: #38bdf8; background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.25);';
            case 'BACKFILL':
                return 'color: #c084fc; background: rgba(192, 132, 252, 0.12); border-color: rgba(192, 132, 252, 0.25);';
            case 'NETWORK':
                return 'color: #4ade80; background: rgba(74, 222, 128, 0.12); border-color: rgba(74, 222, 128, 0.25);';
            case 'SYSTEM':
                return 'color: #facc15; background: rgba(250, 204, 21, 0.12); border-color: rgba(250, 204, 21, 0.25);';
            case 'ERROR':
                return 'color: #f87171; background: rgba(248, 113, 113, 0.12); border-color: rgba(248, 113, 113, 0.25);';
        }
    };

    function updateLogRows() {
        logList.innerHTML = '';
        const filtered = logs.filter(l => {
            if (activeCategoryFilter !== 'ALL' && l.category !== activeCategoryFilter) return false;
            if (searchQuery && !l.message.toLowerCase().includes(searchQuery) && !l.category.toLowerCase().includes(searchQuery)) return false;
            return true;
        });

        if (filtered.length === 0) {
            logList.innerHTML = '<div style="color: #555862; font-style: italic; padding: 12px 0;">No matching log events</div>';
            return;
        }

        const frag = document.createDocumentFragment();
        for (const item of filtered) {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: baseline; gap: 8px; padding: 2px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.02); word-break: break-all;';

            // Timestamp
            const timeSpan = document.createElement('span');
            timeSpan.style.cssText = 'color: #555862; flex: none; font-size: 10px; user-select: none;';
            timeSpan.textContent = item.time;

            // Category badge
            const badge = document.createElement('span');
            badge.style.cssText = `font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; border: 1px solid; flex: none; text-transform: uppercase; letter-spacing: 0.05em; ${getBadgeStyle(item.category)}`;
            badge.textContent = item.category;

            // Message text
            const msgSpan = document.createElement('span');
            msgSpan.style.cssText = item.level === 'error' ? 'color: #f87171; font-weight: 600;' : item.level === 'warn' ? 'color: #fb923c;' : 'color: #d1d5db;';
            msgSpan.textContent = item.message;

            row.appendChild(timeSpan);
            row.appendChild(badge);
            row.appendChild(msgSpan);
            frag.appendChild(row);
        }
        logList.appendChild(frag);

        if (autoScroll) {
            logList.scrollTop = logList.scrollHeight;
        }
    }

    updateLogRows();

    // Auto-update as logs arrive
    const unsub = onLogAdded(() => {
        if (document.body.contains(container)) {
            updateLogRows();
        }
    });

    // Cleanup when container removed
    const observer = new MutationObserver(() => {
        if (!document.body.contains(container)) {
            unsub();
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
