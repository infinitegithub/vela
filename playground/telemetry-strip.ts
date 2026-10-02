import type { VelaWorkspace } from '../src/workspace';
import { fetchDerivativesStats } from './binance-service';

let currentSymbol = 'BTCUSDT';
let pollTimer: any = null;
let stripEl: HTMLElement | null = null;

function formatCompactUsd(num: number): string {
    if (!num || isNaN(num)) return '$0.00';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
}

function formatCountdown(targetTimeMs: number): string {
    if (!targetTimeMs) return '07:15:20';
    const diff = targetTimeMs - Date.now();
    if (diff <= 0) return '00:00:00';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function mountTelemetryStrip(ws: VelaWorkspace) {
    if (document.getElementById('vela-topbar-telemetry-ribbon')) return;

    stripEl = document.createElement('div');
    stripEl.id = 'vela-topbar-telemetry-ribbon';
    stripEl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 16px;
        margin-left: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11px;
        white-space: nowrap;
        user-select: none;
    `;

    // Try to find the topbar element
    const topbar = document.querySelector('.vela-widget-topbar');
    if (topbar) {
        const rightCluster = topbar.querySelector('.vela-topbar-right');
        if (rightCluster) {
            topbar.insertBefore(stripEl, rightCluster);
        } else {
            topbar.appendChild(stripEl);
        }
    }

    // Follow active cell symbol
    const updateActiveSymbol = () => {
        const active = ws.activeCell;
        if (active && active.symbol) {
            currentSymbol = active.symbol.replace(/[-_]/g, '').toUpperCase();
            refreshTelemetry();
        }
    };

    ws.on('cell:active', updateActiveSymbol);
    updateActiveSymbol();

    // Poll every 3 seconds for live ticker and funding
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refreshTelemetry, 3000);
    refreshTelemetry();
}

async function refreshTelemetry() {
    if (!stripEl) return;
    try {
        const stats = await fetchDerivativesStats(currentSymbol);
        if (!stripEl) return;

        const isUp = stats.priceChangePercent >= 0;
        const sign = isUp ? '+' : '';
        const changeClass = isUp ? 'var(--vela-up, #a7be94)' : 'var(--vela-down, #af6870)';
        const lastPriceFormatted = stats.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
        const countdownStr = formatCountdown(stats.nextFundingTime);
        const fundingRateStr = (stats.fundingRate >= 0 ? '+' : '') + (stats.fundingRate * 100).toFixed(4) + '%';

        stripEl.innerHTML = `
            <div style="display: inline-flex; align-items: baseline; gap: 6px;">
                <span style="font-size: 13px; font-weight: 700; color: var(--vela-text-primary, #eeeef1); font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', monospace;">
                    ${lastPriceFormatted}
                </span>
                <span style="font-size: 11px; font-weight: 600; color: ${changeClass};">
                    ${sign}${stats.priceChangePercent.toFixed(2)}%
                </span>
            </div>

            <div style="display: inline-flex; flex-direction: column; line-height: 1.15;">
                <span style="font-size: 9px; font-weight: 600; text-transform: uppercase; color: var(--vela-text-muted, #46474b); letter-spacing: 0.3px;">24h Volume</span>
                <span style="font-size: 11px; font-weight: 600; color: var(--vela-text-primary, #eeeef1);">${formatCompactUsd(stats.volume24h)}</span>
            </div>

            <div style="display: inline-flex; flex-direction: column; line-height: 1.15;">
                <span style="font-size: 9px; font-weight: 600; text-transform: uppercase; color: var(--vela-text-muted, #46474b); letter-spacing: 0.3px;">Open Interest</span>
                <span style="font-size: 11px; font-weight: 600; color: var(--vela-text-primary, #eeeef1);">${formatCompactUsd(stats.openInterestValue)}</span>
            </div>

            <div style="display: inline-flex; flex-direction: column; line-height: 1.15;">
                <span style="font-size: 9px; font-weight: 600; text-transform: uppercase; color: var(--vela-text-muted, #46474b); letter-spacing: 0.3px;">Funding / Countdown</span>
                <span style="font-size: 11px; font-weight: 600; color: ${changeClass};">${fundingRateStr} <span style="color: var(--vela-text-secondary, #757882); font-weight: 500;">${countdownStr}</span></span>
            </div>

            <div style="display: inline-flex; flex-direction: column; line-height: 1.15;">
                <span style="font-size: 9px; font-weight: 600; text-transform: uppercase; color: var(--vela-text-muted, #46474b); letter-spacing: 0.3px;">Next Event</span>
                <span style="font-size: 11px; font-weight: 600; color: var(--vela-text-primary, #eeeef1);">NFP <span style="color: var(--vela-text-secondary, #757882); font-weight: 500;">in 10h 42m</span></span>
            </div>
        `;
    } catch (e) {
        // Keep previous or silent
    }
}
