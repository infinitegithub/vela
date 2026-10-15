import { registerSidePanel, registerIcon, type WidgetContext } from '../src/plugin';
import type { VelaWorkspace } from '../src/workspace';

// Register alert / bell icons
registerIcon('bell', `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2a4 4 0 0 0-4 4v2.5L2.5 11v1h11v-1L12 8.5V6a4 4 0 0 0-4-4z"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/></svg>`);
registerIcon('alert-clock', `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>`);

export interface ChartAlert {
    id: string;
    symbol: string;
    condition: 'crossing' | 'crossing_up' | 'crossing_down' | 'greater_than' | 'less_than';
    targetPrice: number;
    createdAt: number;
    message?: string;
    active: boolean;
    triggerCount: number;
    lastTriggeredAt?: number;
    prevPrice?: number;
}

export interface AlertLogItem {
    id: string;
    alertId: string;
    symbol: string;
    message: string;
    price: number;
    time: number;
}

const ALERTS_STORAGE_KEY = 'vela-alerts-v1';
const ALERTS_LOGS_STORAGE_KEY = 'vela-alert-logs-v1';

let wsInstance: VelaWorkspace | null = null;
let currentSymbol: string = 'BTCUSDT';
let activeAlerts: ChartAlert[] = [];
let alertLogs: AlertLogItem[] = [];
let priceCheckInterval: any = null;
let rerenderPanel: (() => void) | null = null;

export function setAlertsWorkspaceInstance(ws: VelaWorkspace) {
    wsInstance = ws;

    // Hook into workspace cells for indicator alerts
    const hookCell = (cell: any) => {
        if (!cell || !cell.chart || (cell.chart as any).__alertsHooked) return;
        (cell.chart as any).__alertsHooked = true;
        try {
            cell.chart.on('alert', (evt: any) => {
                const sym = (cell.symbol || currentSymbol).replace(/^BINANCE(\.F)?:/i, '').toUpperCase();
                const logItem: AlertLogItem = {
                    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    alertId: 'indicator',
                    symbol: sym,
                    message: `[${evt.indicator || 'Indicator'}] ${evt.title ? evt.title + ': ' : ''}${evt.message || 'Alert fired'}`,
                    price: 0,
                    time: evt.time || Date.now(),
                };
                alertLogs.unshift(logItem);
                if (alertLogs.length > 100) alertLogs.pop();
                saveAlertsStorage();
                rerenderPanel?.();
                playAlertBeep();
            });
        } catch {}
    };

    try {
        for (const cell of (ws as any).cellsById?.values?.() || []) {
            hookCell(cell);
        }
        (ws as any).on?.('cell:added', ({ cell }: any) => hookCell(cell));
        (ws as any).on?.('cell:active', ({ cell }: any) => hookCell(cell));
    } catch {}
}

export function setAlertsActiveSymbol(symbol: string) {
    if (!symbol) return;
    currentSymbol = symbol.replace(/^BINANCE(\.F)?:/i, '').toUpperCase();
}

function loadAlertsStorage() {
    try {
        if (typeof window !== 'undefined') {
            const rawA = window.localStorage.getItem(ALERTS_STORAGE_KEY);
            if (rawA) activeAlerts = JSON.parse(rawA);

            const rawL = window.localStorage.getItem(ALERTS_LOGS_STORAGE_KEY);
            if (rawL) alertLogs = JSON.parse(rawL);
        }
    } catch {}
}

let syncTimeout: any = null;
function saveAlertsStorage(syncRemote = true) {
    try {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(activeAlerts));
            window.localStorage.setItem(ALERTS_LOGS_STORAGE_KEY, JSON.stringify(alertLogs));
        }
    } catch {}

    if (syncRemote && typeof window !== 'undefined') {
        clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            fetch('/api/alerts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alerts: activeAlerts, logs: alertLogs }),
                keepalive: true,
            }).catch(() => {});
        }, 500);
    }
}

// Background sync from server
async function syncAlertsFromServer() {
    try {
        const res = await fetch('/api/alerts');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.alerts)) {
                activeAlerts = data.alerts;
            }
            if (Array.isArray(data?.logs)) {
                alertLogs = data.logs;
            }
            saveAlertsStorage(false);
            rerenderPanel?.();
        }
    } catch {}
}

// Audio chime for triggered alert
function playAlertBeep() {
    try {
        if (typeof window === 'undefined') return;
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15); // E6
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
    } catch {}
}

// Evaluate alerts against latest market prices
function checkAlerts(symbol: string, currentPrice: number) {
    if (!currentPrice || isNaN(currentPrice)) return;
    const cleanSym = symbol.replace(/^BINANCE(\.F)?:/i, '').toUpperCase();
    let triggeredAny = false;

    for (const alert of activeAlerts) {
        if (!alert.active) continue;
        const alertSym = alert.symbol.replace(/^BINANCE(\.F)?:/i, '').toUpperCase();
        if (alertSym !== cleanSym) continue;

        const prevPrice = alert.prevPrice ?? currentPrice;
        let isTriggered = false;

        switch (alert.condition) {
            case 'crossing':
                if ((prevPrice <= alert.targetPrice && currentPrice >= alert.targetPrice) ||
                    (prevPrice >= alert.targetPrice && currentPrice <= alert.targetPrice)) {
                    isTriggered = true;
                }
                break;
            case 'crossing_up':
                if (prevPrice < alert.targetPrice && currentPrice >= alert.targetPrice) {
                    isTriggered = true;
                }
                break;
            case 'crossing_down':
                if (prevPrice > alert.targetPrice && currentPrice <= alert.targetPrice) {
                    isTriggered = true;
                }
                break;
            case 'greater_than':
                if (currentPrice >= alert.targetPrice) {
                    isTriggered = true;
                }
                break;
            case 'less_than':
                if (currentPrice <= alert.targetPrice) {
                    isTriggered = true;
                }
                break;
        }

        alert.prevPrice = currentPrice;

        if (isTriggered) {
            alert.triggerCount = (alert.triggerCount || 0) + 1;
            alert.lastTriggeredAt = Date.now();
            alert.active = false; // default one-shot
            triggeredAny = true;

            const logItem: AlertLogItem = {
                id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                alertId: alert.id,
                symbol: alert.symbol,
                message: alert.message || `${alert.symbol} ${alert.condition.replace('_', ' ')} ${alert.targetPrice.toLocaleString()}`,
                price: currentPrice,
                time: Date.now(),
            };
            alertLogs.unshift(logItem);
            if (alertLogs.length > 100) alertLogs.pop();

            playAlertBeep();

            // Trigger notification
            try {
                const toast = document.createElement('div');
                toast.style.cssText = `
                    position: fixed;
                    top: 48px;
                    right: 24px;
                    background: var(--vela-bg-card, #202126);
                    border: 1px solid var(--vela-border, #262629);
                    border-left: 4px solid var(--vela-up, #a7be94);
                    color: var(--vela-text-primary, #eeeef1);
                    padding: 12px 16px;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 600;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
                    z-index: 999999;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    animation: slideInRight 0.25s ease-out;
                `;
                toast.innerHTML = `<span style="font-size: 18px;">🔔</span><div><div style="font-weight: 700; color: var(--vela-text-primary, #fff);">Alert Triggered · ${alert.symbol}</div><div style="font-size: 12px; color: var(--vela-text-secondary, #9da0a9);">${logItem.message} (Price: ${currentPrice.toLocaleString()})</div></div>`;
                document.body.appendChild(toast);
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.3s ease';
                    setTimeout(() => toast.remove(), 300);
                }, 5000);
            } catch {}

            if (wsInstance) {
                try {
                    (wsInstance as any).alerts = (wsInstance as any).alerts || [];
                    (wsInstance as any).alerts.unshift({
                        cellId: wsInstance.active?.id || 'c1',
                        source: alert.symbol,
                        title: alert.condition.replace('_', ' ').toUpperCase(),
                        message: logItem.message,
                        time: logItem.time,
                    });
                    (wsInstance as any).topbar?.setAlertCount?.((wsInstance as any).alerts.length);
                    wsInstance.toast?.(`${alert.symbol} · ${logItem.message} (${currentPrice.toLocaleString()})`, 'info', 5000);
                } catch {}
            }
        }
    }

    if (triggeredAny) {
        saveAlertsStorage();
        rerenderPanel?.();
    }
}

// ── Polling / active chart price listener ────────────────────────────────────
function startPriceTracking() {
    if (priceCheckInterval) clearInterval(priceCheckInterval);
    priceCheckInterval = setInterval(() => {
        if (!wsInstance) return;
        const activeCell = wsInstance.active;
        if (!activeCell || !activeCell.chart) return;

        const sym = activeCell.symbol || currentSymbol;
        try {
            // Read latest close from active cell chart
            const lastBar = (activeCell.chart as any).lastBar?.();
            const price = lastBar?.close || lastBar?.c;
            if (price) {
                checkAlerts(sym, price);
            }
        } catch {}
    }, 1000);
}

// ── Register Side Panel ───────────────────────────────────────────────────────
export function registerAlertsSidePanel() {
    loadAlertsStorage();
    void syncAlertsFromServer();
    startPriceTracking();

    registerSidePanel({
        id: 'alerts.panel',
        title: 'Alerts',
        icon: 'bell',
        order: 6, // Placed right below Watchlist (order 5)
        width: 320,
        minWidth: 260,
        maxWidth: 500,
        resizable: true,
        overlay: false,
        mount: (ctx: WidgetContext, body: HTMLElement, header: any) => {
            header.setTitle?.('Alerts');

            let activeTab: 'active' | 'log' = 'active';

            const container = document.createElement('div');
            container.style.cssText = `
                display: flex;
                flex-direction: column;
                height: 100%;
                background: var(--vela-bg-panel, #121215);
                color: var(--vela-text-primary, #eeeef1);
                font-family: var(--vela-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                font-size: 13px;
                user-select: none;
            `;

            // ── Top Action Bar ──────────────────────────────────────────────
            const topBar = document.createElement('div');
            topBar.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 14px;
                border-bottom: 1px solid var(--vela-border, #262629);
                background: var(--vela-bg-bar, #191a1e);
            `;

            const tabRow = document.createElement('div');
            tabRow.style.cssText = 'display: flex; gap: 4px;';

            const btnActive = document.createElement('button');
            const btnLog = document.createElement('button');

            const styleTab = (btn: HTMLElement, isActive: boolean) => {
                btn.style.cssText = `
                    background: ${isActive ? 'var(--vela-bg-chip, #292a2f)' : 'transparent'};
                    border: 1px solid ${isActive ? 'var(--vela-border, #36383e)' : 'transparent'};
                    color: ${isActive ? 'var(--vela-text-primary, #ffffff)' : 'var(--vela-text-secondary, #757882)'};
                    padding: 4px 10px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 120ms ease;
                `;
            };

            btnActive.textContent = `Active (${activeAlerts.filter(a => a.active).length})`;
            btnLog.textContent = `Log (${alertLogs.length})`;
            styleTab(btnActive, true);
            styleTab(btnLog, false);

            btnActive.onclick = () => {
                activeTab = 'active';
                styleTab(btnActive, true);
                styleTab(btnLog, false);
                renderContent();
            };

            btnLog.onclick = () => {
                activeTab = 'log';
                styleTab(btnActive, false);
                styleTab(btnLog, true);
                renderContent();
            };

            tabRow.append(btnActive, btnLog);

            const addBtn = document.createElement('button');
            addBtn.innerHTML = '<span style="font-size: 14px; font-weight: 400; line-height: 1;">+</span> Create Alert';
            addBtn.style.cssText = `
                background: var(--vela-selected-bg, #eeeef1);
                color: var(--vela-selected-fg, #121215);
                border: 1px solid var(--vela-border, rgba(255,255,255,0.15));
                padding: 4px 11px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 5px;
                transition: filter 120ms ease, opacity 120ms ease;
            `;
            addBtn.onmouseenter = () => { addBtn.style.filter = 'brightness(0.9)'; };
            addBtn.onmouseleave = () => { addBtn.style.filter = 'none'; };
            addBtn.onclick = () => openCreateDialog();

            topBar.append(tabRow, addBtn);
            container.appendChild(topBar);

            // ── Scrollable List Area ─────────────────────────────────────────
            const listArea = document.createElement('div');
            listArea.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 10px 12px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            container.appendChild(listArea);

            // ── Create Alert Modal / Form ────────────────────────────────────
            const openCreateDialog = () => {
                let defaultPrice = 0;
                try {
                    const lastBar = (wsInstance?.active?.chart as any)?.lastBar?.();
                    defaultPrice = lastBar?.close || lastBar?.c || 0;
                } catch {}

                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.65);
                    backdrop-filter: blur(2px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 99999;
                `;

                const modal = document.createElement('div');
                modal.style.cssText = `
                    background: var(--vela-bg-card, #202126);
                    border: 1px solid var(--vela-border, #2e3036);
                    border-radius: 8px;
                    width: 380px;
                    padding: 20px;
                    box-shadow: 0 16px 40px rgba(0,0,0,0.7);
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                    color: var(--vela-text-primary, #eeeef1);
                    font-family: var(--vela-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                `;

                modal.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--vela-border, #28292d); padding-bottom: 10px;">
                        <span style="font-weight: 700; font-size: 14px; color: var(--vela-text-primary, #fff);">Create Alert</span>
                        <button id="alert-modal-close" style="background: none; border: none; color: var(--vela-text-secondary, #757882); font-size: 18px; cursor: pointer;">✕</button>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label style="font-size: 11px; font-weight: 700; color: var(--vela-text-secondary, #8d909b); text-transform: uppercase;">Symbol</label>
                        <input id="alert-sym" value="${currentSymbol}" style="background: var(--vela-bg-panel, #18191d); border: 1px solid var(--vela-border, #2d2e33); color: var(--vela-text-primary, #fff); padding: 8px 10px; border-radius: 4px; font-size: 13px; outline: none;" />
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label style="font-size: 11px; font-weight: 700; color: var(--vela-text-secondary, #8d909b); text-transform: uppercase;">Condition</label>
                        <select id="alert-cond" style="background: var(--vela-bg-panel, #18191d); border: 1px solid var(--vela-border, #2d2e33); color: var(--vela-text-primary, #fff); padding: 8px 10px; border-radius: 4px; font-size: 13px; outline: none;">
                            <option value="crossing">Crossing Target Price</option>
                            <option value="crossing_up">Crossing Up (Bullish)</option>
                            <option value="crossing_down">Crossing Down (Bearish)</option>
                            <option value="greater_than">Greater Than (&ge;)</option>
                            <option value="less_than">Less Than (&le;)</option>
                        </select>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label style="font-size: 11px; font-weight: 700; color: var(--vela-text-secondary, #8d909b); text-transform: uppercase;">Target Price</label>
                        <input id="alert-price" type="number" step="any" value="${defaultPrice || ''}" placeholder="e.g. 68500" style="background: var(--vela-bg-panel, #18191d); border: 1px solid var(--vela-border, #2d2e33); color: var(--vela-text-primary, #fff); padding: 8px 10px; border-radius: 4px; font-size: 13px; outline: none;" />
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label style="font-size: 11px; font-weight: 700; color: var(--vela-text-secondary, #8d909b); text-transform: uppercase;">Note / Message</label>
                        <input id="alert-msg" placeholder="e.g. Resistance test" style="background: var(--vela-bg-panel, #18191d); border: 1px solid var(--vela-border, #2d2e33); color: var(--vela-text-primary, #fff); padding: 8px 10px; border-radius: 4px; font-size: 13px; outline: none;" />
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
                        <button id="alert-modal-cancel" style="background: var(--vela-bg-chip, #2a2b30); border: 1px solid var(--vela-border, #33353c); color: var(--vela-text-primary, #eeeef1); padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">Cancel</button>
                        <button id="alert-modal-submit" style="background: var(--vela-selected-bg, #eeeef1); border: 1px solid var(--vela-border, #262629); color: var(--vela-selected-fg, #121215); padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">Create Alert</button>
                    </div>
                `;

                overlay.appendChild(modal);
                document.body.appendChild(overlay);

                const close = () => overlay.remove();
                modal.querySelector('#alert-modal-close')!.addEventListener('click', close);
                modal.querySelector('#alert-modal-cancel')!.addEventListener('click', close);

                modal.querySelector('#alert-modal-submit')!.addEventListener('click', () => {
                    const sym = (modal.querySelector('#alert-sym') as HTMLInputElement).value.trim().toUpperCase() || currentSymbol;
                    const cond = (modal.querySelector('#alert-cond') as HTMLSelectElement).value as any;
                    const price = parseFloat((modal.querySelector('#alert-price') as HTMLInputElement).value);
                    const msg = (modal.querySelector('#alert-msg') as HTMLInputElement).value.trim();

                    if (!price || isNaN(price)) {
                        alert('Please enter a valid price.');
                        return;
                    }

                    const newAlert: ChartAlert = {
                        id: `alt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        symbol: sym,
                        condition: cond,
                        targetPrice: price,
                        message: msg || `${sym} ${cond.replace('_', ' ')} ${price}`,
                        active: true,
                        triggerCount: 0,
                        createdAt: Date.now(),
                    };

                    activeAlerts.unshift(newAlert);
                    saveAlertsStorage();
                    close();
                    renderContent();
                });
            };

            // ── Render Content Function ───────────────────────────────────────
            const renderContent = () => {
                listArea.replaceChildren();
                btnActive.textContent = `Active (${activeAlerts.filter(a => a.active).length})`;
                btnLog.textContent = `Log (${alertLogs.length})`;

                if (activeTab === 'active') {
                    if (activeAlerts.length === 0) {
                        const empty = document.createElement('div');
                        empty.style.cssText = 'color: var(--vela-text-secondary, #757882); text-align: center; padding: 32px 16px; font-size: 12px; line-height: 1.6; font-family: var(--vela-font);';
                        empty.innerHTML = `<div>🔔</div><div style="font-weight: 600; margin-top: 6px; color: var(--vela-text-primary, #eeeef1);">No alerts created yet</div><div>Click <b>+ Create Alert</b> to monitor price levels for ${currentSymbol}.</div>`;
                        listArea.appendChild(empty);
                        return;
                    }

                    for (const alert of activeAlerts) {
                        const card = document.createElement('div');
                        card.style.cssText = `
                            background: var(--vela-bg-card, #202126);
                            border: 1px solid ${alert.active ? 'var(--vela-border, #2c2d33)' : 'var(--vela-border, #24252a)'};
                            border-radius: 6px;
                            padding: 10px 12px;
                            display: flex;
                            flex-direction: column;
                            gap: 6px;
                            opacity: ${alert.active ? '1' : '0.6'};
                        `;

                        const isUp = alert.condition.includes('up') || alert.condition.includes('greater');
                        const isDown = alert.condition.includes('down') || alert.condition.includes('less');
                        const badgeBg = isUp ? 'rgba(167, 190, 148, 0.12)' : isDown ? 'rgba(175, 104, 112, 0.12)' : 'var(--vela-bg-chip, #292a2f)';
                        const badgeColor = isUp ? 'var(--vela-up, #a7be94)' : isDown ? 'var(--vela-down, #af6870)' : 'var(--vela-text-primary, #eeeef1)';
                        const badgeBorder = isUp ? '1px solid rgba(167, 190, 148, 0.25)' : isDown ? '1px solid rgba(175, 104, 112, 0.25)' : '1px solid var(--vela-border, #36383e)';

                        const row1 = document.createElement('div');
                        row1.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
                        row1.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="font-weight: 700; color: var(--vela-text-primary, #eeeef1);">${alert.symbol}</span>
                                <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; background: ${alert.active ? badgeBg : 'transparent'}; color: ${alert.active ? badgeColor : 'var(--vela-text-secondary, #757882)'}; border: ${alert.active ? badgeBorder : '1px solid var(--vela-border, #262629)'}; text-transform: uppercase;">${alert.condition.replace('_', ' ')}</span>
                            </div>
                            <span style="font-weight: 700; font-variant-numeric: tabular-nums; color: var(--vela-text-primary, #eeeef1);">${alert.targetPrice.toLocaleString()}</span>
                        `;

                        const row2 = document.createElement('div');
                        row2.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--vela-text-secondary, #757882);';
                        row2.innerHTML = `
                            <span>${alert.message || 'Alert on price target'}</span>
                            <div style="display: flex; gap: 8px;">
                                <button class="alt-toggle" style="background: none; border: none; color: ${alert.active ? 'var(--vela-up, #a7be94)' : 'var(--vela-text-secondary, #757882)'}; cursor: pointer; font-size: 11px; font-weight: 600;">${alert.active ? 'Active' : 'Resume'}</button>
                                <button class="alt-del" style="background: none; border: none; color: var(--vela-down, #af6870); cursor: pointer; font-size: 11px;">✕</button>
                            </div>
                        `;

                        row2.querySelector('.alt-toggle')!.addEventListener('click', () => {
                            alert.active = !alert.active;
                            saveAlertsStorage();
                            renderContent();
                        });

                        row2.querySelector('.alt-del')!.addEventListener('click', () => {
                            activeAlerts = activeAlerts.filter(a => a.id !== alert.id);
                            saveAlertsStorage();
                            renderContent();
                        });

                        card.append(row1, row2);
                        listArea.appendChild(card);
                    }
                } else {
                    // Log View
                    if (alertLogs.length === 0) {
                        const empty = document.createElement('div');
                        empty.style.cssText = 'color: var(--vela-text-secondary, #757882); text-align: center; padding: 32px 16px; font-size: 12px; font-family: var(--vela-font);';
                        empty.innerHTML = '<div>📋</div><div style="font-weight: 600; margin-top: 6px; color: var(--vela-text-primary, #eeeef1);">No alert triggers yet</div><div>Fired alerts will be logged here.</div>';
                        listArea.appendChild(empty);
                        return;
                    }

                    // Clear logs button
                    const clearBtn = document.createElement('button');
                    clearBtn.textContent = 'Clear Alert Log';
                    clearBtn.style.cssText = 'background: var(--vela-bg-chip, #24252a); border: 1px solid var(--vela-border, #2e2f35); color: var(--vela-text-secondary, #8d909b); padding: 6px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-bottom: 4px; font-weight: 600; font-family: var(--vela-font);';
                    clearBtn.onclick = () => {
                        alertLogs = [];
                        saveAlertsStorage();
                        renderContent();
                    };
                    listArea.appendChild(clearBtn);

                    for (const log of alertLogs) {
                        const card = document.createElement('div');
                        card.style.cssText = 'background: var(--vela-bg-card, #202126); border: 1px solid var(--vela-border, #262629); border-left: 3px solid var(--vela-up, #a7be94); border-radius: 4px; padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; font-size: 12px; font-family: var(--vela-font);';
                        const timeStr = new Date(log.time).toLocaleTimeString();
                        card.innerHTML = `
                            <div style="display: flex; justify-content: space-between;">
                                <span style="font-weight: 700; color: var(--vela-text-primary, #eeeef1);">${log.symbol}</span>
                                <span style="font-size: 11px; color: var(--vela-text-secondary, #757882);">${timeStr}</span>
                            </div>
                            <div style="color: var(--vela-text-secondary, #c9ccd5); font-size: 12px;">${log.message}</div>
                            <div style="font-size: 11px; color: var(--vela-text-primary, #eeeef1); font-weight: 600;">Price: ${log.price?.toLocaleString()}</div>
                        `;
                        listArea.appendChild(card);
                    }
                }
            };

            rerenderPanel = renderContent;
            renderContent();
            body.appendChild(container);

            return () => {
                rerenderPanel = null;
            };
        },
    });
}
