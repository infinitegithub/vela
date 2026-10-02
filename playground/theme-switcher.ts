import type { VelaWorkspace } from '../src/workspace';
import { registerWidgetAction } from '../src/widget';
import { registerIcon } from '../src/ui/icons';
import type { ThemeName } from '../src/core/options';

let wsInstance: VelaWorkspace | null = null;
const THEME_STORAGE_KEY = 'vela-play:theme';

// Register half-moon / palette theme toggle icon
registerIcon(
    'theme-toggle',
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
);

export function getSavedTheme(): ThemeName {
    try {
        const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'classic' || saved === 'standard') return 'classic';
        if (saved === 'light') return 'light';
        return 'dark';
    } catch {
        return 'dark';
    }
}

export function setThemeWorkspaceInstance(ws: VelaWorkspace) {
    wsInstance = ws;
    // Apply saved theme on mount
    const saved = getSavedTheme();
    if (saved !== 'dark') {
        ws.setTheme(saved);
    }
}

function showThemeToast(msg: string) {
    const existing = document.getElementById('vela-theme-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'vela-theme-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: var(--vela-bg-card, #232429);
        color: var(--vela-text-primary, #eeeef1);
        border: 1px solid var(--vela-border, #262629);
        padding: 10px 16px;
        border-radius: 6px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        font-weight: 550;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: vela-toast-in 0.2s ease-out;
    `;
    toast.innerHTML = `<span style="color: var(--vela-up, #a7be94); font-size: 14px;">●</span> ${msg}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

export function toggleTheme() {
    if (!wsInstance) return;
    const current = getSavedTheme();
    const next: ThemeName = current === 'dark' ? 'classic' : 'dark';

    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}

    wsInstance.setTheme(next);

    const label = next === 'classic' ? 'Standard Classic (TradingView)' : 'Vela Muted (Reference Theme)';
    showThemeToast(`Theme changed to ${label}`);
}

export function registerThemeSwitcher() {
    registerWidgetAction({
        id: 'theme.toggle',
        target: 'topbar',
        label: 'Toggle Theme (Vela Muted / Standard Classic)',
        icon: 'theme-toggle',
        iconOnly: true,
        align: 'right',
        order: 3,
        run: () => {
            toggleTheme();
        },
    });
}
