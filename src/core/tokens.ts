// The design tokens, as PURE DATA (no DOM) so every layer can share one vocabulary: the UI
// kit writes them onto its hosts, and the renderer's own chrome writes them onto the chart
// container. The chart's `VelaTheme` stays the single source of truth — there is no second
// UI palette to drift from it.
//
// STATIC tokens (spacing, radii, z-index, motion, type scale) are theme-independent;
// THEME tokens are computed per `VelaTheme`.

import type { VelaTheme } from './options';
import { isDarkColor, mix, withAlpha } from './color';
import { ACCENT, ACCENT_BRIGHT, HIGHLIGHT } from './palette';

/** Theme-independent tokens — the shared spacing/shape/motion/type scale. */
export const STATIC_TOKENS: Record<string, string> = {
    '--vela-space-1': '4px',
    '--vela-space-2': '8px',
    '--vela-space-3': '12px',
    '--vela-space-4': '16px',
    '--vela-radius-sm': '4px',
    '--vela-radius-md': '6px',
    '--vela-radius-lg': '10px',
    '--vela-z-tooltip': '60',
    '--vela-z-menu': '50',
    '--vela-z-dialog': '40',
    // Form popovers portal to <body> (or a chart host) and must sit above a dialog
    // whose own stacking context may be nested inside the chart container.
    '--vela-z-popover': '6000',
    '--vela-ease': 'cubic-bezier(0.22, 1, 0.36, 1)',
    '--vela-dur-fast': '90ms',
    '--vela-dur-med': '160ms',
    '--vela-font-size-sm': '11px',
    '--vela-font-size-md': '12px',
    '--vela-font-size-lg': '14px',
};

/** Compute every theme token as a `--vela-*` → value map for one theme. */
export function themeTokens(t: VelaTheme): Record<string, string> {
    // Elevation and hover are washes of the foreground over the chart surface, so panels
    // and menus always sit in the same color family as the chart they annotate.
    const dark = isDarkColor(t.background);
    const wash = (a: number) => (dark ? `rgba(255,255,255,${a})` : withAlpha(t.textColor, a + 0.02));
    const elevated = mix(t.background, dark ? '#ffffff' : t.textColor, dark ? 0.03 : 0.05);
    const bgMain = t.background;
    const bgPanel = t.bgPanel ?? (dark ? '#121215' : '#f8f9fa');
    const bgCard = t.bgCard ?? (dark ? '#232429' : '#ffffff');
    const bgBar = t.bgBar ?? (dark ? '#191a1e' : '#f1f3f5');
    const bgChip = t.bgChip ?? (dark ? '#292a2f' : '#e9ecef');
    const bgChipHover = dark ? mix(bgChip, '#ffffff', 0.08) : mix(bgChip, '#000000', 0.08);
    const bgHover = t.bgHover ?? (dark ? '#2b2d34' : wash(0.06));
    const border = t.border ?? t.borderColor;
    const textPrimary = t.textPrimary ?? (dark ? '#eeeef1' : '#000000');
    const textSecondary = t.textSecondary ?? t.textColor;
    const textMuted = t.textMuted ?? (dark ? '#46474b' : withAlpha(t.textColor, 0.5));

    return {
        '--vela-font': t.fontFamily,
        '--vela-bg': t.background,
        '--vela-bg-main': bgMain,
        '--vela-bg-panel': bgPanel,
        '--vela-bg-card': bgCard,
        '--vela-bg-bar': bgBar,
        '--vela-bg-chip': bgChip,
        '--vela-bg-chip-hover': bgChipHover,
        '--vela-bg-hover': bgHover,
        '--vela-border': border,
        '--vela-border-strong': border,
        '--vela-border-soft': border,
        '--vela-border-faint': border,
        '--vela-up': t.upColor,
        '--vela-down': t.downColor,
        '--vela-danger': t.downColor,
        '--vela-up-selected-bg': withAlpha(t.upColor, 0.25),
        '--vela-volume-up': mix(t.upColor, bgMain, 0.45),
        '--vela-volume-down': mix(t.downColor, bgMain, 0.45),
        '--vela-text-primary': textPrimary,
        '--vela-text-secondary': textSecondary,
        '--vela-text-muted': textMuted,
        '--vela-warning': '#fde047',
        '--vela-warning-bg': '#29261a',
        '--vela-button-light-bg': textPrimary,
        '--vela-button-light-text': bgPanel,
        // Native Vela chrome bindings
        '--vela-fg': textPrimary,
        '--vela-fg-muted': textSecondary,
        '--vela-fg-faint': textMuted,
        '--vela-fg-bright': textPrimary,
        '--vela-surface': bgMain,
        '--vela-surface-elev': bgCard,
        '--vela-surface-overlay': bgCard,
        '--vela-surface-sunken': bgPanel,
        '--vela-hover': bgHover,
        '--vela-active': withAlpha(t.upColor, 0.2),
        '--vela-hover-strong': bgChipHover,
        '--vela-focus': withAlpha(textSecondary, 0.5),
        '--vela-focus-soft': withAlpha(textSecondary, 0.12),
        '--vela-separator-hover-band': dark ? 'rgba(255,255,255,0.06)' : withAlpha(t.textColor, 0.1),
        '--vela-separator-hover-line': textSecondary,
        '--vela-scroll': bgChipHover,
        '--vela-accent': ACCENT,
        '--vela-accent-bright': ACCENT_BRIGHT,
        '--vela-highlight': HIGHLIGHT,
        '--vela-selected-bg': textPrimary,
        '--vela-selected-fg': bgPanel,
        '--vela-fg-on-fill': '#ffffff',
        '--vela-shadow': '0 8px 30px rgba(0,0,0,0.5)',
        '--vela-shadow-dialog': '0 20px 60px rgba(0,0,0,0.5)',
        '--vela-backdrop': 'rgba(0,0,0,0.6)',
    };
}