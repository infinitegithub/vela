import type { VelaTheme, ThemeName } from './options';

// ── 1. Reference Vela Dark Palette (Muted, Matte, Desaturated Sage/Rose) ──
export const DARK_THEME: VelaTheme = {
    name: 'dark',
    background: '#202126',
    textColor: '#757882',
    gridColor: '#24252a',
    borderColor: '#262629',
    upColor: '#a7be94',
    downColor: '#af6870',
    fontFamily: 'sans-serif',
    bgPanel: '#121215',
    bgCard: '#232429',
    bgBar: '#191a1e',
    bgChip: '#292a2f',
    bgHover: '#2b2d34',
    border: '#262629',
    textPrimary: '#eeeef1',
    textSecondary: '#757882',
    textMuted: '#46474b',
};

// ── 2. Standard Classic Palette (Original TradingView: Neon Turquoise & Bright Red) ──
export const CLASSIC_THEME: VelaTheme = {
    name: 'classic',
    background: '#131722',
    textColor: '#d1d4dc',
    gridColor: '#1e222d',
    borderColor: '#2a2e39',
    upColor: '#089981',
    downColor: '#f23645',
    fontFamily: 'sans-serif',
    bgPanel: '#1e222d',
    bgCard: '#2a2e39',
    bgBar: '#171b26',
    bgChip: '#2a2e39',
    bgHover: '#363a45',
    border: '#2a2e39',
    textPrimary: '#ffffff',
    textSecondary: '#d1d4dc',
    textMuted: '#787b86',
};

// ── 3. Light Palette ──
export const LIGHT_THEME: VelaTheme = {
    name: 'light',
    background: '#ffffff',
    textColor: '#1e293b',
    gridColor: '#e0e3eb',
    borderColor: '#d4dae3',
    upColor: '#089981',
    downColor: '#f23645',
    fontFamily: 'sans-serif',
    bgPanel: '#f8f9fa',
    bgCard: '#ffffff',
    bgBar: '#f1f3f5',
    bgChip: '#e9ecef',
    bgHover: '#dee2e6',
    border: '#d4dae3',
    textPrimary: '#000000',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
};

export function resolveTheme(theme?: ThemeName | VelaTheme): VelaTheme {
    if (!theme || theme === 'dark' || theme === 'vela') return DARK_THEME;
    if (theme === 'classic' || theme === 'standard') return CLASSIC_THEME;
    if (theme === 'light') return LIGHT_THEME;
    return {
        ...DARK_THEME,
        ...theme,
        upColor: theme.upColor || DARK_THEME.upColor,
        downColor: theme.downColor || DARK_THEME.downColor,
    };
}
