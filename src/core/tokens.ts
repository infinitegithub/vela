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
    return {
        '--vela-font': t.fontFamily,
        '--vela-bg': t.background,
        // Reference design palette variables
        '--vela-bg-main': dark ? '#202126' : t.background,
        '--vela-bg-panel': dark ? '#121215' : '#f8f9fa',
        '--vela-bg-card': dark ? '#232429' : '#ffffff',
        '--vela-bg-bar': dark ? '#191a1e' : '#f1f3f5',
        '--vela-bg-chip': dark ? '#292a2f' : '#e9ecef',
        '--vela-bg-chip-hover': dark ? '#30323a' : '#dee2e6',
        '--vela-bg-hover': dark ? '#2b2d34' : wash(0.06),
        '--vela-border': dark ? '#262629' : t.borderColor,
        '--vela-border-strong': dark ? '#262629' : withAlpha(t.textColor, 0.28),
        '--vela-border-soft': dark ? '#262629' : t.borderColor,
        '--vela-border-faint': dark ? '#262629' : withAlpha(t.textColor, 0.08),
        '--vela-up': t.upColor,
        '--vela-down': t.downColor,
        '--vela-danger': t.downColor,
        '--vela-up-selected-bg': dark ? '#363a38' : 'rgba(167, 190, 148, 0.25)',
        '--vela-volume-up': dark ? '#3a403c' : '#3a403c',
        '--vela-volume-down': dark ? '#3d2f34' : '#3d2f34',
        '--vela-text-primary': dark ? '#eeeef1' : '#000000',
        '--vela-text-secondary': dark ? '#757882' : t.textColor,
        '--vela-text-muted': dark ? '#46474b' : withAlpha(t.textColor, 0.5),
        '--vela-warning': '#fde047',
        '--vela-warning-bg': '#29261a',
        '--vela-button-light-bg': '#eeeef1',
        '--vela-button-light-text': '#121215',
        // Native Vela chrome bindings
        '--vela-fg': dark ? '#eeeef1' : t.textColor,
        '--vela-fg-muted': dark ? '#757882' : withAlpha(t.textColor, 0.62),
        '--vela-fg-faint': dark ? '#46474b' : withAlpha(t.textColor, 0.35),
        '--vela-fg-bright': dark ? '#eeeef1' : '#000000',
        '--vela-surface': dark ? '#202126' : t.background,
        '--vela-surface-elev': dark ? '#232429' : elevated,
        '--vela-surface-overlay': dark ? '#232429' : elevated,
        '--vela-surface-sunken': dark ? '#121215' : t.background,
        '--vela-hover': dark ? '#2b2d34' : wash(0.06),
        '--vela-active': dark ? '#363a38' : wash(0.1),
        '--vela-hover-strong': dark ? '#30323a' : wash(0.16),
        '--vela-focus': withAlpha(t.textColor, 0.5),
        '--vela-focus-soft': withAlpha(t.textColor, 0.12),
        '--vela-separator-hover-band': dark ? 'rgba(255,255,255,0.06)' : withAlpha(t.textColor, 0.1),
        '--vela-separator-hover-line': dark ? '#757882' : withAlpha(t.textColor, 0.55),
        '--vela-scroll': dark ? '#30323a' : withAlpha(t.textColor, 0.3),
        '--vela-accent': ACCENT,
        '--vela-accent-bright': ACCENT_BRIGHT,
        '--vela-highlight': HIGHLIGHT,
        '--vela-selected-bg': dark ? '#eeeef1' : t.textColor,
        '--vela-selected-fg': dark ? '#121215' : '#ffffff',
        '--vela-fg-on-fill': '#ffffff',
        '--vela-shadow': '0 8px 30px rgba(0,0,0,0.5)',
        '--vela-shadow-dialog': '0 20px 60px rgba(0,0,0,0.5)',
        '--vela-backdrop': 'rgba(0,0,0,0.6)',
    };
}