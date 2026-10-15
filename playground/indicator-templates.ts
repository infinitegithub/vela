import {
    injectStyles,
    registerIcon,
    iconEl,
    Dialog,
    Popover,
    Tooltip,
} from '../src/ui';
import {
    registerWidgetAttachment,
    registerWidgetAction,
    type WidgetContext,
} from '../src/widget/contributions';
import type { VelaWorkspace } from '../src/workspace';
import WORKSPACE_PICKER_CSS from './quant-workspace-picker.css?raw';
import INDICATOR_TEMPLATES_CSS from './quant-indicator-templates.css?raw';

// ── Types ───────────────────────────────────────────────────────────────────

export interface IndicatorTemplateEntry {
    kind: 'script' | 'native';
    name: string;
    script?: string;
    type?: string;
    inputs?: Record<string, any>;
    props?: Record<string, any>;
}

export interface IndicatorTemplate {
    id: string;
    name: string;
    indicatorNames: string[];
    indicators: IndicatorTemplateEntry[];
    symbol?: string;
    timeframe?: string;
    createdAt?: number | string;
    updatedAt?: number | string;
    favorite?: boolean;
}

export interface IndicatorTemplatesSource {
    templates: IndicatorTemplate[];
    load(id: string, callback: (template: IndicatorTemplate | null) => void): void;
    cells(): Array<{
        chart: any;
        setSymbol(sym: string): void;
        setTimeframe(tf: string): void;
        addExternalIndicator?(entry: any): void;
        addIndicator?(entry: any): void;
        addNative?(type: string): void;
        addNativeIndicator?(type: string): void;
    }>;
    ensureCanCreate(): boolean;
    create(data: Omit<IndicatorTemplate, 'id'>, callback: (success: boolean) => void): void;
    replace(id: string, data: Partial<IndicatorTemplate>, callback: (success: boolean) => void): void;
    rename(id: string, newName: string): void;
    remove(id: string, callback: (success: boolean) => void): void;
}

// ── SVG Icons (exact definitions from official Vela module 77908) ────────────

const svg = (path: string, strokeWidth: number, size = 16) =>
    `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}">${path}</svg>`;

const ICON_TPL = 'quant-tpl';
const SVG_TPL = svg('<path d="M3.6 1.8h8.8v12.4L8 11.1l-4.4 3.1Z" stroke-linecap="round" stroke-linejoin="round"/>', 1.3);

const ICON_PLUS = 'quant-tpl-plus';
const SVG_PLUS = svg('<path d="M8 3.5v9M3.5 8h9" stroke-linecap="round"/>', 1.5);

const ICON_FOLDER = 'quant-tpl-folder';
const SVG_FOLDER = svg('<path d="M1.6 4.4a1 1 0 0 1 1-1h2.7l1.3 1.7h6.8a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1z"/>', 1.4);

const ICON_CHECK = 'quant-tpl-check';
const SVG_CHECK = svg('<path d="M3.5 8.2 6.6 11.2 12.5 4.8" stroke-linecap="round" stroke-linejoin="round"/>', 1.8, 12);

const ICON_CHEVRON = 'quant-tpl-chevron';
const SVG_CHEVRON = svg('<path d="M4 6.2 8 10l4-3.8" stroke-linecap="round" stroke-linejoin="round"/>', 1.6, 12);

const ICON_RENAME = 'quant-tpl-rename';
const SVG_RENAME = svg('<path d="M9.5 3.2 12.8 6.5M3 13h3l6.4-6.4a1.5 1.5 0 0 0 0-2.1L11.5 3.2a1.5 1.5 0 0 0-2.1 0L3 9.6z" stroke-linecap="round" stroke-linejoin="round"/>', 1.4);

const ICON_DELETE = 'quant-tpl-delete';
const SVG_DELETE = svg('<g stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.3h11M6.2 4.3V3.1a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v1.2M4.2 4.3l.5 9.1a1.15 1.15 0 0 0 1.15 1.1h4.3a1.15 1.15 0 0 0 1.15-1.1l.5-9.1M6.5 7v4.5M9.5 7v4.5"/></g>', 1.6);

const ICON_ONE_CHART = 'quant-tpl-one-chart';
const SVG_ONE_CHART = svg('<g stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4 10.5l2.6-3.2 2.2 2.3 3.2-4"/></g>', 1.3);

const ICON_ALL_CHARTS = 'quant-tpl-all-charts';
const SVG_ALL_CHARTS = svg('<g stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/><path d="M8 1.5v13M1.5 8h13"/></g>', 1.3);

const ICON_CLOCK = 'quant-tpl-clock';
const SVG_CLOCK = svg('<g stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.6"/><path d="M8 4.8V8l2.3 1.6"/></g>', 1.4, 14);

const ICON_INFO = 'quant-tpl-info';
const SVG_INFO = svg('<g stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.6"/><path d="M8 7.4v3.4M8 5.3v.1"/></g>', 1.4, 14);

const ICON_MORE = 'quant-tpl-more';
const SVG_MORE = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" stroke="none"><circle cx="3.5" cy="8" r="1.35"/><circle cx="8" cy="8" r="1.35"/><circle cx="12.5" cy="8" r="1.35"/></svg>';

const ACTION_LABEL = 'Indicator Templates';
const WSP_STYLE_ID = 'quant-workspace-picker-9';
const TPL_STYLE_ID = 'quant-indicator-templates-9';

// ── Helpers ─────────────────────────────────────────────────────────────────

export function displaySymbol(s: string): string {
    const i = s.indexOf(':');
    return i === -1 ? s : s.slice(i + 1);
}

export function displayTimeframe(tf: string): string {
    const t = Number(tf);
    if (!Number.isInteger(t) || t <= 0) return tf;
    if (t % 1440 === 0) return `${t / 1440}D`;
    if (t % 60 === 0) return `${t / 60}h`;
    return `${t}m`;
}

export function templateMetaLabel(tpl: { symbol?: string; timeframe?: string; indicatorNames?: string[]; indicators?: any[] }): string {
    const parts: string[] = [];
    if (tpl.symbol) parts.push(displaySymbol(tpl.symbol));
    if (tpl.timeframe) parts.push(displayTimeframe(tpl.timeframe));
    const names = Array.isArray(tpl.indicatorNames) ? tpl.indicatorNames : (Array.isArray(tpl.indicators) ? tpl.indicators.map((i: any) => i?.name || i?.type || 'Indicator') : []);
    const count = names.length;
    parts.push(count === 1 ? '1 indicator' : `${count} indicators`);
    return parts.join(' · ');
}

export function formatUpdatedAt(d?: string | number, now = Date.now()): string {
    if (!d) return '';
    const t = typeof d === 'number' ? d : Date.parse(d);
    if (Number.isNaN(t)) return '';
    const mins = Math.floor(Math.max(0, now - t) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const DEFAULT_NEW_NAME = 'New template';
export function newTemplateName(name: string, existing: string[] = []): string {
    const trimmed = name.trim();
    if (trimmed) return trimmed;
    const set = new Set(existing.map((n) => n.trim().toLowerCase()));
    if (!set.has(DEFAULT_NEW_NAME.toLowerCase())) return DEFAULT_NEW_NAME;
    for (let i = 1; ; i++) {
        const cand = `${DEFAULT_NEW_NAME} ${i}`;
        if (!set.has(cand.toLowerCase())) return cand;
    }
}

export function templateWithName(templates: IndicatorTemplate[], name: string): IndicatorTemplate | undefined {
    const r = name.trim().toLowerCase();
    return templates.find((t) => t.name.trim().toLowerCase() === r);
}

const TITLE_REGEX = /^\s*(?:indicator|strategy)\s*\(\s*(?:title\s*=\s*)?(["'])((?:(?!\1).)+)\1/m;
export function getIndicatorTitle(ind: any): string {
    if (ind.source) {
        const match = TITLE_REGEX.exec(ind.source)?.[2];
        if (match) return match;
    }
    return ind.title?.trim() || ind.name?.trim() || 'Indicator';
}

const cleanRecord = (r?: Record<string, any>) => (r && Object.keys(r).length > 0 ? r : undefined);

// ── Applying Templates ──────────────────────────────────────────────────────

export function applyTemplateToCell(cell: any, tpl: IndicatorTemplate) {
    const chart = cell.chart;
    // Remove all existing indicators on the chart
    if (chart && typeof chart.indicators === 'function') {
        for (const ind of chart.indicators()) {
            try {
                ind.remove();
            } catch {}
        }
    }

    if (tpl.symbol && typeof cell.setSymbol === 'function') {
        cell.setSymbol(tpl.symbol);
    }
    if (tpl.timeframe && typeof cell.setTimeframe === 'function') {
        cell.setTimeframe(tpl.timeframe);
    }

    if (Array.isArray(tpl.indicators)) {
        for (const rawInd of tpl.indicators) {
            let ind = rawInd;
            if (!ind.kind && (ind.type === 'native' || ind.type === 'external')) {
                const name = (ind.name || '').toLowerCase();
                let nativeType = 'volume';
                if (name.includes('ema')) nativeType = 'ema';
                else if (name.includes('rsi')) nativeType = 'rsi';
                else if (name.includes('macd')) nativeType = 'macd';
                else if (name.includes('bollinger') || name.includes('bb')) nativeType = 'bb';
                else if (name.includes('atr')) nativeType = 'atr';
                else if (name.includes('supertrend')) nativeType = 'supertrend';
                else if (name.includes('vwap')) nativeType = 'vwap';
                else if (name.includes('stoch')) nativeType = 'stochastic';
                ind = {
                    kind: 'native',
                    type: nativeType,
                    name: ind.name,
                    inputs: ind.inputs || ind.config || {},
                };
            }

            if (ind.kind === 'script' && ind.script) {
                if (typeof cell.addIndicator === 'function') {
                    cell.addIndicator({
                        name: ind.name,
                        script: ind.script,
                        inputs: cleanRecord(ind.inputs),
                        props: cleanRecord(ind.props),
                    });
                } else if (typeof cell.addExternalIndicator === 'function') {
                    cell.addExternalIndicator({
                        name: ind.name,
                        script: ind.script,
                        inputs: cleanRecord(ind.inputs),
                        props: cleanRecord(ind.props),
                    });
                }
            } else if ((ind.kind === 'native' || !ind.kind) && ind.type) {
                const existingIds = new Set((chart?.indicators?.() || []).map((h: any) => h.id));
                if (typeof cell.addNativeIndicator === 'function') {
                    cell.addNativeIndicator(ind.type);
                } else if (typeof cell.addNative === 'function') {
                    cell.addNative(ind.type);
                }
                const inputs = cleanRecord(ind.inputs);
                if (inputs && chart && typeof chart.indicators === 'function') {
                    const added = chart
                        .indicators()
                        .filter((h: any) => h.nativeType === ind.type)
                        .find((h: any) => !existingIds.has(h.id));
                    try {
                        added?.setInputs(inputs);
                    } catch {}
                }
            }
        }
    }
}

export function extractChartIndicators(chart: any): IndicatorTemplateEntry[] {
    const list: IndicatorTemplateEntry[] = [];
    if (!chart || typeof chart.indicators !== 'function') return list;

    for (const ind of chart.indicators()) {
        if (ind.source) {
            list.push({
                kind: 'script',
                name: getIndicatorTitle(ind),
                script: ind.source,
                inputs: cleanRecord(ind.inputValues?.() || ind.inputs),
                props: cleanRecord(ind.propValues?.() || ind.props),
            });
        } else if (ind.nativeType) {
            list.push({
                kind: 'native',
                type: ind.nativeType,
                name: getIndicatorTitle(ind),
                inputs: cleanRecord(ind.inputValues?.() || ind.inputs),
            });
        }
    }
    return list;
}

// ── Global Source Management ────────────────────────────────────────────────

let currentSource: IndicatorTemplatesSource | null = null;
const sourceListeners = new Set<() => void>();
const hostRegistrations = new WeakMap<HTMLElement, { dropdown: () => void; dialog: () => void }>();

export function setIndicatorTemplatesPickerSource(source: IndicatorTemplatesSource | null) {
    currentSource = source;
    if (typeof window !== 'undefined') {
        (window as any).__indicatorTemplatesSource = source;
    }
    sourceListeners.forEach((fn) => fn());
}

export function clearIndicatorTemplatesPickerSource(source: IndicatorTemplatesSource) {
    if (currentSource === source) {
        setIndicatorTemplatesPickerSource(null);
    }
}

// ── Widget Attachment & Action Registration ─────────────────────────────────

export function registerIndicatorTemplatesPicker() {
    registerIcon(ICON_TPL, SVG_TPL);
    registerIcon(ICON_PLUS, SVG_PLUS);
    registerIcon(ICON_FOLDER, SVG_FOLDER);
    registerIcon(ICON_CHECK, SVG_CHECK);
    registerIcon(ICON_CHEVRON, SVG_CHEVRON);
    registerIcon(ICON_RENAME, SVG_RENAME);
    registerIcon(ICON_DELETE, SVG_DELETE);
    registerIcon(ICON_ONE_CHART, SVG_ONE_CHART);
    registerIcon(ICON_ALL_CHARTS, SVG_ALL_CHARTS);
    registerIcon(ICON_CLOCK, SVG_CLOCK);
    registerIcon(ICON_INFO, SVG_INFO);
    registerIcon(ICON_MORE, SVG_MORE);

    registerWidgetAttachment({
        id: 'quant:indicator-templates',
        mount(ctx: any) {
            const doc = ctx.host.ownerDocument;
            injectStyles(WSP_STYLE_ID, WORKSPACE_PICKER_CSS, doc);
            injectStyles(TPL_STYLE_ID, INDICATOR_TEMPLATES_CSS, doc);

            const el = (tag: string, className?: string, text?: string): HTMLElement => {
                const node = doc.createElement(tag);
                if (className) node.className = className;
                if (text !== undefined) node.textContent = text;
                return node;
            };

            const btn = (
                className?: string,
                opts: {
                    aria?: string;
                    icon?: string;
                    label?: string;
                    onClick?: (e: MouseEvent) => void;
                } = {}
            ): HTMLButtonElement => {
                const b = el('button', className) as HTMLButtonElement;
                b.type = 'button';
                if (opts.aria) b.setAttribute('aria-label', opts.aria);
                if (opts.icon) b.append(iconEl(opts.icon, doc));
                if (opts.label !== undefined) b.append(el('span', undefined, opts.label));
                if (opts.onClick) b.addEventListener('click', opts.onClick);
                return b;
            };

            let lastTarget: Element | null = null;
            let lastPointer = { x: 0, y: 0 };
            const onPointerDown = (ev: PointerEvent) => {
                lastTarget = ev.target instanceof Element ? ev.target : null;
                lastPointer = { x: ev.clientX, y: ev.clientY };
            };
            ctx.host.addEventListener('pointerdown', onPointerDown, true);

            // Execute template application
            const applyTpl = (tpl: IndicatorTemplate, scope: 'selected' | 'all') => {
                const source = currentSource;
                if (!source) return;
                mainDialog.hide();
                source.load(tpl.id, (loaded) => {
                    if (!loaded) {
                        ctx.toast("Couldn't load the template.", 'error');
                        return;
                    }
                    if (scope === 'all') {
                        const cells = source.cells() ?? [];
                        if (cells.length > 1) {
                            let count = 0;
                            for (const c of cells) {
                                try {
                                    applyTemplateToCell(
                                        {
                                            get chart() {
                                                return c.chart;
                                            },
                                            setSymbol: (s: string) => c.setSymbol(s),
                                            setTimeframe: (tf: string) => c.setTimeframe(tf),
                                            addIndicator: (entry: any) =>
                                                c.addExternalIndicator
                                                    ? c.addExternalIndicator(entry)
                                                    : c.addIndicator?.(entry),
                                            addNativeIndicator: (type: string) =>
                                                c.addNative ? c.addNative(type) : c.addNativeIndicator?.(type),
                                        },
                                        loaded
                                    );
                                    count++;
                                } catch {}
                            }
                            if (count === 0) {
                                ctx.toast("Couldn't apply the template.", 'error');
                            } else {
                                ctx.toast(`Applied ${tpl.name} to ${count} charts`, 'success');
                            }
                            return;
                        }
                    }
                    try {
                        applyTemplateToCell(ctx, loaded);
                        ctx.toast(`Applied ${tpl.name}`, 'success');
                    } catch {
                        ctx.toast("Couldn't apply the template.", 'error');
                    }
                });
            };

            const triggerApply = (tpl: IndicatorTemplate) => {
                dropdownPopover?.hide();
                const cells = currentSource?.cells() ?? [];
                if (cells.length > 1) {
                    openApplyScopePanel(tpl);
                } else {
                    applyTpl(tpl, 'selected');
                }
            };

            // ── Dialog Panels ───────────────────────────────────────────────
            const rootWsp = el('div', 'quant-wsp');
            const listView = el('div', 'quant-wsp-listview');
            const tplList = el('div', 'quant-wsp-list quant-tpl-list');
            const wspFooter = el('div', 'quant-wsp-footer');
            const createBtn = btn('quant-wsp-create', { icon: ICON_PLUS, label: 'New template' });
            wspFooter.append(createBtn);
            listView.append(tplList, wspFooter);

            const deletePanel = el('div', 'quant-wsp-panel');
            deletePanel.hidden = true;
            const newTplPanel = el('div', 'quant-wsp-panel');
            newTplPanel.hidden = true;
            const applyScopePanel = el('div', 'quant-wsp-panel');
            applyScopePanel.hidden = true;
            const replacePanel = el('div', 'quant-wsp-panel');
            replacePanel.hidden = true;
            const renamePanel = el('div', 'quant-wsp-panel');
            renamePanel.hidden = true;

            rootWsp.append(listView, deletePanel, newTplPanel, applyScopePanel, replacePanel, renamePanel);

            const mainDialog = new Dialog({
                title: 'Indicator templates',
                host: ctx.host,
                dimBackdrop: true,
                closeOnBackdrop: true,
                initialFocusEl: () =>
                    rootWsp.querySelector('.quant-wsp-panel:not([hidden]) .quant-wsp-input') as HTMLElement | null,
            });
            mainDialog.body.append(rootWsp);

            // ── Dropdown Popover ────────────────────────────────────────────
            const ddContent = el('div', 'quant-wsp-dd quant-tpl-dd');
            ddContent.setAttribute('role', 'menu');
            ddContent.setAttribute('aria-label', ACTION_LABEL);

            const ddHeading = el('div', 'quant-wsp-dd-heading', 'Recent templates');
            const ddList = el('div', 'quant-wsp-dd-list');
            const ddFooter = el('div', 'quant-wsp-dd-footer');
            const showAllBtn = btn('quant-wsp-dd-all', { icon: ICON_FOLDER, label: 'Show all' });
            showAllBtn.setAttribute('role', 'menuitem');
            const newTplDdBtn = btn('quant-wsp-dd-create', { icon: ICON_PLUS, label: 'New template' });
            newTplDdBtn.setAttribute('role', 'menuitem');
            ddFooter.append(showAllBtn, newTplDdBtn);

            const kebabMenu = el('div', 'quant-wsp-dd-kebab-menu');
            kebabMenu.hidden = true;
            kebabMenu.setAttribute('role', 'menu');
            const kebabRenameBtn = btn('quant-wsp-dd-kebab-item', { icon: ICON_RENAME, label: 'Rename' });
            kebabRenameBtn.setAttribute('role', 'menuitem');
            const kebabDeleteBtn = btn('quant-wsp-dd-kebab-item', { icon: ICON_DELETE, label: 'Delete' });
            kebabDeleteBtn.setAttribute('role', 'menuitem');
            kebabDeleteBtn.setAttribute('data-danger', '1');
            kebabMenu.append(kebabRenameBtn, kebabDeleteBtn);

            ddContent.append(ddHeading, ddList, ddFooter, kebabMenu);

            let activeKebabAnchor: HTMLElement | null = null;
            let activeKebabTemplate: IndicatorTemplate | null = null;

            const closeKebab = () => {
                kebabMenu.hidden = true;
                activeKebabAnchor?.removeAttribute('data-open');
                activeKebabAnchor?.setAttribute('aria-expanded', 'false');
                activeKebabAnchor = null;
                activeKebabTemplate = null;
            };

            const openKebab = (anchor: HTMLElement, tpl: IndicatorTemplate) => {
                if (activeKebabAnchor === anchor && !kebabMenu.hidden) {
                    closeKebab();
                    return;
                }
                activeKebabAnchor?.removeAttribute('data-open');
                activeKebabAnchor?.setAttribute('aria-expanded', 'false');
                activeKebabAnchor = anchor;
                activeKebabTemplate = tpl;
                anchor.setAttribute('data-open', '1');
                anchor.setAttribute('aria-expanded', 'true');
                kebabMenu.hidden = false;

                const ddRect = ddContent.getBoundingClientRect();
                const anchorRect = anchor.getBoundingClientRect();
                kebabMenu.style.top = `${anchorRect.bottom - ddRect.top + 2}px`;
                kebabMenu.style.right = `${ddRect.right - anchorRect.right}px`;
            };

            ddContent.addEventListener('pointerdown', (ev) => {
                if (kebabMenu.hidden) return;
                const target = ev.target;
                if (
                    !(target instanceof Node) ||
                    kebabMenu.contains(target) ||
                    (target instanceof Element && target.closest('.quant-wsp-dd-kebab'))
                ) {
                    return;
                }
                closeKebab();
            });

            const dummyAnchor = el('span');
            dummyAnchor.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none;';

            let dropdownPopover: Popover | null = null;
            const hidePopover = () => dropdownPopover?.hide();

            const onBackdropPointerDown = (ev: PointerEvent) => {
                if (!mainDialog.open) return;
                const target = ev.target;
                if (target instanceof Node && !(mainDialog.panel.contains(target) || ddContent.contains(target))) {
                    mainDialog.hide();
                    if (
                        target === mainDialog.backdrop ||
                        mainDialog.backdrop.contains(target) ||
                        target === mainDialog.positioner
                    ) {
                        ev.stopPropagation();
                    }
                }
            };
            doc.addEventListener('pointerdown', onBackdropPointerDown, true);

            let activeDeleteId: string | null = null;
            const expandedTemplates = new Set<string>();

            const animatePanel = (targetEl: HTMLElement) => {
                if (doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                targetEl.animate(
                    [
                        { opacity: 0, transform: 'translateY(5px)' },
                        { opacity: 1, transform: 'none' },
                    ],
                    { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
                );
            };

            const allPanels = [listView, deletePanel, newTplPanel, applyScopePanel, replacePanel, renamePanel];
            const switchPanel = (targetPanel: HTMLElement, animate = true) => {
                for (const p of allPanels) p.hidden = p !== targetPanel;
                if (animate) animatePanel(targetPanel);
            };

            const showListView = (animate = true) => {
                activeDeleteId = null;
                renderListView();
                switchPanel(listView, animate);
            };

            const makeHead = (subtitle: string | null, title: string, onBack = () => showListView()) => {
                const head = el('div', 'quant-wsp-head');
                const backBtn = btn('quant-wsp-back', {
                    icon: ICON_CHEVRON,
                    aria: 'Back to templates',
                    onClick: onBack,
                });
                const titles = el('div', 'quant-wsp-head-titles');
                if (subtitle) titles.append(el('span', 'quant-wsp-head-sub', subtitle));
                titles.append(el('span', 'quant-wsp-head-name', title));
                head.append(backBtn, titles);
                return head;
            };

            // ── Rename View ─────────────────────────────────────────────────
            let openedRenameFromOutside = false;
            const backFromRename = () => {
                if (openedRenameFromOutside) mainDialog.hide();
                else showListView();
            };

            const openRenamePanel = (tpl: IndicatorTemplate) => {
                hidePopover();
                activeDeleteId = null;
                openedRenameFromOutside = !mainDialog.open;
                renamePanel.replaceChildren();

                const searchRow = el('div', 'quant-wsp-searchrow');
                const input = el('input', 'quant-wsp-input') as HTMLInputElement;
                input.type = 'text';
                input.value = tpl.name;
                input.setAttribute('aria-label', `New name for ${tpl.name}`);
                input.setAttribute('spellcheck', 'false');
                input.setAttribute('autocomplete', 'off');
                searchRow.append(iconEl(ICON_RENAME, doc), input);

                const doSave = () => {
                    const newName = input.value.trim();
                    if (newName && newName !== tpl.name) {
                        currentSource?.rename(tpl.id, newName);
                    }
                    backFromRename();
                };

                input.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') doSave();
                    else if (e.key === 'Escape') backFromRename();
                });

                const actions = el('div', 'quant-wsp-confirm-actions');
                actions.append(
                    btn('quant-wsp-cancel', { label: 'Cancel', onClick: backFromRename }),
                    btn('quant-wsp-primary', { label: 'Save', onClick: doSave })
                );

                renamePanel.append(makeHead('Rename template', tpl.name, backFromRename), searchRow, actions);
                switchPanel(renamePanel, false);
                if (!mainDialog.open) mainDialog.show();
                animatePanel(renamePanel);
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 0);
            };

            // ── Delete View ─────────────────────────────────────────────────
            let openedDeleteFromOutside = false;
            const backFromDelete = () => {
                if (openedDeleteFromOutside) {
                    activeDeleteId = null;
                    mainDialog.hide();
                } else {
                    showListView();
                }
            };

            const renderDeletePanel = () => {
                const tpl = currentSource?.templates.find((t) => t.id === activeDeleteId);
                deletePanel.replaceChildren();
                if (!tpl) {
                    backFromDelete();
                    return;
                }

                const status = el(
                    'div',
                    'quant-wsp-status',
                    'This permanently removes the saved template. This can’t be undone.'
                );
                const confirmDelBtn = btn('quant-wsp-primary', { label: 'Delete' });
                confirmDelBtn.setAttribute('data-danger', '1');
                confirmDelBtn.addEventListener('click', () => {
                    const fn = currentSource?.remove;
                    if (fn) {
                        confirmDelBtn.setAttribute('disabled', 'true');
                        confirmDelBtn.textContent = 'Deleting…';
                        fn(tpl.id, (ok) => {
                            if (!ok) {
                                confirmDelBtn.removeAttribute('disabled');
                                confirmDelBtn.textContent = 'Delete';
                                ctx.toast("Couldn't delete the template.", 'error');
                                return;
                            }
                            expandedTemplates.delete(tpl.id);
                            backFromDelete();
                            ctx.toast(`Deleted ${tpl.name}`, 'info');
                        });
                    }
                });

                const actions = el('div', 'quant-wsp-confirm-actions');
                actions.append(btn('quant-wsp-cancel', { label: 'Cancel', onClick: backFromDelete }), confirmDelBtn);
                deletePanel.append(makeHead('Delete template', tpl.name, backFromDelete), status, actions);
            };

            const openDeletePanel = (tpl: IndicatorTemplate) => {
                hidePopover();
                activeDeleteId = tpl.id;
                openedDeleteFromOutside = !mainDialog.open;
                switchPanel(deletePanel, false);
                renderDeletePanel();
                if (!mainDialog.open) mainDialog.show();
                animatePanel(deletePanel);
            };

            // ── Multi-Chart Scope Choice View ───────────────────────────────
            let openedScopeFromOutside = false;
            const openApplyScopePanel = (tpl: IndicatorTemplate) => {
                activeDeleteId = null;
                openedScopeFromOutside = !mainDialog.open;
                applyScopePanel.replaceChildren();

                const totalCells = currentSource?.cells().length ?? 0;
                applyScopePanel.append(makeHead('Apply template', tpl.name));

                const choices = [
                    {
                        scope: 'selected' as const,
                        icon: ICON_ONE_CHART,
                        title: 'Apply to selected chart',
                        hint: 'Replaces the indicators on the active chart only.',
                    },
                    {
                        scope: 'all' as const,
                        icon: ICON_ALL_CHARTS,
                        title: 'Apply to all charts',
                        hint: `Replaces the indicators on all ${totalCells} charts in this layout.`,
                    },
                ];

                const choicesBox = el('div', 'quant-wsp-choices');
                for (const item of choices) {
                    const choiceBtn = btn('quant-wsp-choice', {
                        onClick: () => applyTpl(tpl, item.scope),
                    });
                    const iconBox = el('span', 'quant-wsp-choice-icon');
                    iconBox.append(iconEl(item.icon, doc));
                    const textBox = el('span', 'quant-wsp-choice-text');
                    textBox.append(
                        el('span', 'quant-wsp-choice-title', item.title),
                        el('span', 'quant-wsp-choice-hint', item.hint)
                    );
                    choiceBtn.append(iconBox, textBox);
                    choicesBox.append(choiceBtn);
                }
                applyScopePanel.append(choicesBox);

                const actions = el('div', 'quant-wsp-confirm-actions');
                actions.append(
                    btn('quant-wsp-cancel', {
                        label: 'Cancel',
                        onClick: () => (openedScopeFromOutside ? mainDialog.hide() : showListView()),
                    })
                );
                applyScopePanel.append(actions);

                switchPanel(applyScopePanel, false);
                if (!mainDialog.open) mainDialog.show();
                animatePanel(applyScopePanel);
            };

            // ── New Template View ───────────────────────────────────────────
            let currentChartIndicators: IndicatorTemplateEntry[] = [];
            let rememberSymbol = false;
            let rememberTimeframe = false;
            let currentSymbol = '';
            let currentTimeframe = '';
            let infoTooltip: Tooltip | null = null;

            const makeChip = (opts: {
                icon: HTMLElement;
                label: string;
                value: string;
                on: boolean;
                onChange: (val: boolean) => void;
            }) => {
                let isOn = opts.on;
                const chip = btn('quant-tpl-chip', {
                    aria: `Save chart ${opts.label.toLowerCase()} ${opts.value}`,
                    onClick: () => {
                        isOn = !isOn;
                        chip.setAttribute('aria-pressed', isOn ? 'true' : 'false');
                        opts.onChange(isOn);
                    },
                });
                chip.setAttribute('aria-pressed', isOn ? 'true' : 'false');
                chip.title = `Loading the template will also switch the chart to ${opts.value}`;

                const check = iconEl(ICON_CHECK, doc);
                check.classList.add('quant-tpl-chip-check');
                chip.append(opts.icon, el('span', 'quant-tpl-chip-text', opts.value), check);
                return chip;
            };

            const openNewTemplatePanel = () => {
                hidePopover();
                if (currentSource && !currentSource.ensureCanCreate()) {
                    if (mainDialog.open) mainDialog.hide();
                    return;
                }

                activeDeleteId = null;
                rememberSymbol = false;
                rememberTimeframe = false;
                currentSymbol = ctx.symbol || '';
                currentTimeframe = ctx.timeframe || '';

                // Extract live indicators on active chart
                try {
                    currentChartIndicators = extractChartIndicators(ctx.chart);
                } catch {
                    currentChartIndicators = [];
                }

                infoTooltip?.destroy();
                infoTooltip = null;

                newTplPanel.replaceChildren();
                newTplPanel.append(makeHead(null, 'New template'));

                const searchRow = el('div', 'quant-wsp-searchrow');
                const nameInput = el('input', 'quant-wsp-input') as HTMLInputElement;
                nameInput.type = 'text';
                nameInput.placeholder = 'Template name…';
                nameInput.setAttribute('aria-label', 'New template name');
                nameInput.setAttribute('spellcheck', 'false');
                nameInput.setAttribute('autocomplete', 'off');
                searchRow.append(iconEl(ICON_TPL, doc), nameInput);
                newTplPanel.append(searchRow);

                // Indicators field
                const indField = el('div', 'quant-tpl-field');
                const indLabel = el('div', 'quant-tpl-label', 'Indicators');
                if (currentChartIndicators.length > 0) {
                    indLabel.append(el('span', 'quant-tpl-label-count', ` (${currentChartIndicators.length})`));
                }
                indField.append(indLabel);

                if (currentChartIndicators.length === 0) {
                    indField.append(
                        el(
                            'div',
                            'quant-tpl-tags-empty',
                            'No indicators on this chart yet — add some, then save a template.'
                        )
                    );
                } else {
                    const tags = el('div', 'quant-tpl-tags');
                    for (const ind of currentChartIndicators) {
                        tags.append(el('span', 'quant-tpl-tag', ind.name));
                    }
                    indField.append(tags);
                }
                newTplPanel.append(indField);

                // Chart toggles field
                const chipsContainer = el('div', 'quant-tpl-chips');
                if (currentSymbol) {
                    const symIconFallback = el(
                        'span',
                        'quant-tpl-symicon quant-tpl-symicon-fallback',
                        (displaySymbol(currentSymbol).trim()[0] ?? '?').toUpperCase()
                    );
                    chipsContainer.append(
                        makeChip({
                            icon: symIconFallback,
                            label: 'symbol',
                            value: displaySymbol(currentSymbol),
                            on: rememberSymbol,
                            onChange: (val) => {
                                rememberSymbol = val;
                            },
                        })
                    );
                }

                if (currentTimeframe) {
                    chipsContainer.append(
                        makeChip({
                            icon: iconEl(ICON_CLOCK, doc),
                            label: 'timeframe',
                            value: displayTimeframe(currentTimeframe),
                            on: rememberTimeframe,
                            onChange: (val) => {
                                rememberTimeframe = val;
                            },
                        })
                    );
                }

                if (chipsContainer.childElementCount > 0) {
                    const chartField = el('div', 'quant-tpl-field');
                    const chartLabel = el('div', 'quant-tpl-label', 'Chart');
                    const infoBtn = btn('quant-tpl-label-info', {
                        icon: ICON_INFO,
                        aria: 'About linking the chart',
                    });
                    infoTooltip = new Tooltip(infoBtn, {
                        content: el(
                            'div',
                            'quant-tpl-info-tip',
                            'Link the chart symbol and/or timeframe with the indicator template. Loading the template will change the chart to the linked symbol and/or timeframe.'
                        ),
                        host: ctx.host,
                        placement: 'right',
                        openDelay: 300,
                    });
                    chartLabel.append(infoBtn);
                    chartField.append(chartLabel, chipsContainer);
                    newTplPanel.append(chartField);
                }

                const handleSave = () => {
                    const source = currentSource;
                    if (!source || currentChartIndicators.length === 0) return;

                    const finalName = newTemplateName(
                        nameInput.value,
                        source.templates.map((t) => t.name)
                    );
                    const newTplData = {
                        name: finalName,
                        indicators: currentChartIndicators,
                        indicatorNames: currentChartIndicators.map((i) => i.name),
                        ...(rememberSymbol && currentSymbol ? { symbol: currentSymbol } : {}),
                        ...(rememberTimeframe && currentTimeframe ? { timeframe: currentTimeframe } : {}),
                    };

                    const existing = templateWithName(source.templates, finalName);
                    if (existing) {
                        openReplacePanel(existing, newTplData);
                    } else {
                        mainDialog.hide();
                        source.create(newTplData, (ok) => {
                            ctx.toast(
                                ok ? `Saved ${finalName}` : "Couldn't save the template.",
                                ok ? 'success' : 'error'
                            );
                        });
                    }
                };

                const saveBtn = btn('quant-wsp-primary', { label: 'Save template', onClick: handleSave });
                if (currentChartIndicators.length === 0) {
                    saveBtn.setAttribute('disabled', 'true');
                }

                const actions = el('div', 'quant-wsp-confirm-actions');
                actions.append(btn('quant-wsp-cancel', { label: 'Cancel', onClick: () => showListView() }), saveBtn);
                newTplPanel.append(actions);

                nameInput.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') handleSave();
                });

                switchPanel(newTplPanel, false);
                if (!mainDialog.open) mainDialog.show();
                animatePanel(newTplPanel);
                setTimeout(() => {
                    nameInput.focus();
                }, 0);
            };

            // ── Replace View ────────────────────────────────────────────────
            const openReplacePanel = (existing: IndicatorTemplate, newTplData: any) => {
                replacePanel.replaceChildren();
                replacePanel.append(makeHead('Replace template', existing.name, () => switchPanel(newTplPanel)));

                const indNames = Array.isArray(existing.indicatorNames) ? existing.indicatorNames : (Array.isArray(existing.indicators) ? existing.indicators.map((i: any) => i.name || i.type || 'Indicator') : []);
                const count = indNames.length;
                const status = el(
                    'div',
                    'quant-wsp-status',
                    `A template named “${existing.name}” already exists (${
                        count === 1 ? '1 indicator' : `${count} indicators`
                    }). Replacing it overwrites its indicators and saved market with this chart's. This can’t be undone.`
                );

                const replaceBtn = btn('quant-wsp-primary', { label: 'Replace' });
                replaceBtn.setAttribute('data-danger', '1');
                replaceBtn.addEventListener('click', () => {
                    const fn = currentSource?.replace;
                    if (fn) {
                        replaceBtn.setAttribute('disabled', 'true');
                        replaceBtn.textContent = 'Replacing…';
                        fn(existing.id, { ...newTplData, name: existing.name }, (ok) => {
                            if (!ok) {
                                replaceBtn.removeAttribute('disabled');
                                replaceBtn.textContent = 'Replace';
                                ctx.toast("Couldn't replace the template.", 'error');
                                return;
                            }
                            mainDialog.hide();
                            ctx.toast(`Replaced ${existing.name}`, 'success');
                        });
                    }
                });

                const actions = el('div', 'quant-wsp-confirm-actions');
                actions.append(
                    btn('quant-wsp-cancel', { label: 'Cancel', onClick: () => switchPanel(newTplPanel) }),
                    replaceBtn
                );
                replacePanel.append(status, actions);

                switchPanel(replacePanel, false);
                animatePanel(replacePanel);
            };

            // ── Render All Templates List ───────────────────────────────────
            const renderListView = () => {
                tplList.replaceChildren();
                const list = currentSource?.templates ?? [];
                if (list.length === 0) {
                    const empty = el('div', 'quant-wsp-empty');
                    empty.append(
                        el('div', 'quant-wsp-empty-title', 'No templates yet'),
                        el(
                            'div',
                            'quant-wsp-empty-hint',
                            "Save this chart's indicators as a template to reuse them anywhere."
                        )
                    );
                    tplList.append(empty);
                    return;
                }

                for (const tpl of list) {
                    const item = el('div', 'quant-tpl-item');
                    const row = el('div', 'quant-wsp-row');
                    row.setAttribute('role', 'button');
                    row.tabIndex = 0;

                    const avatar = el('span', 'quant-wsp-avatar', (tpl.name.trim()[0] ?? '?').toUpperCase());
                    const main = el('span', 'quant-wsp-main');
                    main.append(el('span', 'quant-wsp-name', tpl.name));

                    const metaParts = [templateMetaLabel(tpl), formatUpdatedAt(tpl.updatedAt)].filter(Boolean);
                    if (metaParts.length > 0) {
                        main.append(el('span', 'quant-wsp-meta', metaParts.join(' · ')));
                    }
                    row.append(avatar, main);

                    // Indicator tags row
                    const indsRow = el('div', 'quant-tpl-row-inds');
                    indsRow.setAttribute('role', 'list');
                    indsRow.setAttribute('aria-label', `Indicators in ${tpl.name}`);
                    const indNames = Array.isArray(tpl.indicatorNames) ? tpl.indicatorNames : (Array.isArray(tpl.indicators) ? tpl.indicators.map((i: any) => i.name || i.type || 'Indicator') : []);
                    if (indNames.length === 0) {
                        indsRow.append(el('div', 'quant-tpl-row-inds-empty', 'No indicators'));
                    } else {
                        for (const name of indNames) {
                            const tag = el('div', 'quant-tpl-tag', name);
                            tag.setAttribute('role', 'listitem');
                            indsRow.append(tag);
                        }
                    }

                    const isExpanded = expandedTemplates.has(tpl.id);
                    indsRow.hidden = !isExpanded;

                    const actions = el('span', 'quant-wsp-actions');
                    const expandBtn = btn('quant-wsp-iconbtn quant-tpl-expand', {
                        icon: ICON_CHEVRON,
                        aria: `Show indicators in ${tpl.name}`,
                    });
                    expandBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
                    expandBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const next = indsRow.hidden;
                        indsRow.hidden = !next;
                        expandBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
                        if (next) expandedTemplates.add(tpl.id);
                        else expandedTemplates.delete(tpl.id);
                        if (next) animatePanel(indsRow);
                    });

                    actions.append(
                        btn('quant-wsp-iconbtn', {
                            icon: ICON_RENAME,
                            aria: `Rename ${tpl.name}`,
                            onClick: (e) => {
                                e.stopPropagation();
                                openRenamePanel(tpl);
                            },
                        }),
                        btn('quant-wsp-iconbtn quant-wsp-delete', {
                            icon: ICON_DELETE,
                            aria: `Delete ${tpl.name}`,
                            onClick: (e) => {
                                e.stopPropagation();
                                openDeletePanel(tpl);
                            },
                        }),
                        expandBtn
                    );

                    row.append(actions);
                    row.addEventListener('click', () => triggerApply(tpl));
                    row.addEventListener('keydown', (e) => {
                        if (e.target === row && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            triggerApply(tpl);
                        }
                    });

                    item.append(row, indsRow);
                    tplList.append(item);
                }
            };

            const openMainDialog = () => {
                hidePopover();
                showListView(false);
                mainDialog.show();
            };

            createBtn.addEventListener('click', () => openNewTemplatePanel());

            // ── Render Dropdown Popover ─────────────────────────────────────
            let lastDdKey = '';
            const renderDropdown = () => {
                const recents = (currentSource?.templates ?? []).slice(0, 5);
                const key = recents.map((t) => `${t.id}\0${t.name}\0${templateMetaLabel(t)}`).join('\x01');
                if (key === lastDdKey && ddList.childElementCount > 0) return;
                lastDdKey = key;

                const preservedKebabId = kebabMenu.hidden ? null : activeKebabTemplate?.id ?? null;
                closeKebab();
                ddList.replaceChildren();

                if (recents.length === 0) {
                    const empty = el('div', 'quant-wsp-dd-empty', 'No templates yet');
                    empty.setAttribute('role', 'menuitem');
                    empty.setAttribute('aria-disabled', 'true');
                    ddList.append(empty);
                    return;
                }

                const kebabMap = new Map<string, { kebab: HTMLElement; template: IndicatorTemplate }>();
                for (const tpl of recents) {
                    const item = el('div', 'quant-wsp-dd-item');
                    const selectBtn = btn('quant-wsp-dd-select', {
                        onClick: () => triggerApply(tpl),
                    });
                    selectBtn.setAttribute('role', 'menuitem');

                    const text = el('span', 'quant-tpl-dd-text');
                    text.append(
                        el('span', 'quant-wsp-dd-item-name', tpl.name),
                        el('span', 'quant-tpl-dd-meta', templateMetaLabel(tpl))
                    );
                    selectBtn.append(text);
                    item.append(selectBtn);

                    const kebabBtn = btn('quant-wsp-dd-kebab', {
                        icon: ICON_MORE,
                        aria: `Actions for ${tpl.name}`,
                        onClick: (e) => {
                            e.stopPropagation();
                            openKebab(kebabBtn, tpl);
                        },
                    });
                    kebabBtn.setAttribute('aria-haspopup', 'menu');
                    kebabBtn.setAttribute('aria-expanded', 'false');
                    item.append(kebabBtn);
                    ddList.append(item);

                    kebabMap.set(tpl.id, { kebab: kebabBtn, template: tpl });
                }

                if (preservedKebabId) {
                    const match = kebabMap.get(preservedKebabId);
                    if (match) openKebab(match.kebab, match.template);
                }
            };

            showAllBtn.addEventListener('click', () => openMainDialog());
            newTplDdBtn.addEventListener('click', () => openNewTemplatePanel());

            kebabRenameBtn.addEventListener('click', () => {
                const tpl = activeKebabTemplate;
                closeKebab();
                if (tpl) openRenamePanel(tpl);
            });

            kebabDeleteBtn.addEventListener('click', () => {
                const tpl = activeKebabTemplate;
                closeKebab();
                if (tpl) openDeletePanel(tpl);
            });

            // Register host methods
            hostRegistrations.set(ctx.host, {
                dropdown: () => {
                    if (dropdownPopover?.open) {
                        dropdownPopover.hide();
                        return;
                    }
                    if (mainDialog.open) mainDialog.hide();
                    dropdownPopover?.destroy();

                    // Find trigger button or fallback
                    let triggerBtn: HTMLElement | null = lastTarget?.closest('button') as HTMLElement | null;
                    if (!triggerBtn || !ctx.host.contains(triggerBtn)) {
                        triggerBtn = ctx.host.querySelector(
                            `button[aria-label="${ACTION_LABEL}"]`
                        ) as HTMLElement | null;
                    }
                    if (!triggerBtn) {
                        const hostRect = ctx.host.getBoundingClientRect();
                        const x = lastPointer.x || hostRect.left + 16;
                        const y = lastPointer.y || hostRect.top + 16;
                        dummyAnchor.style.left = `${x}px`;
                        dummyAnchor.style.top = `${y}px`;
                        if (!dummyAnchor.isConnected) ctx.host.append(dummyAnchor);
                        triggerBtn = dummyAnchor;
                    }

                    triggerBtn.setAttribute('aria-haspopup', 'menu');
                    dropdownPopover = new Popover({
                        trigger: triggerBtn,
                        host: ctx.host,
                        content: ddContent,
                        align: 'start',
                        onClose: () => {
                            closeKebab();
                            triggerBtn?.setAttribute('aria-expanded', 'false');
                        },
                    });

                    renderDropdown();
                    dropdownPopover.show();
                    triggerBtn.setAttribute('aria-expanded', 'true');
                },
                dialog: openMainDialog,
            });

            const onSourceUpdated = () => {
                if (!listView.hidden) renderListView();
                if (activeDeleteId) renderDeletePanel();
                if (dropdownPopover?.open) {
                    renderDropdown();
                    dropdownPopover.reposition();
                }
            };

            onSourceUpdated();
            sourceListeners.add(onSourceUpdated);

            return () => {
                sourceListeners.delete(onSourceUpdated);
                hostRegistrations.delete(ctx.host);
                ctx.host.removeEventListener('pointerdown', onPointerDown, true);
                doc.removeEventListener('pointerdown', onBackdropPointerDown, true);
                dropdownPopover?.destroy();
                infoTooltip?.destroy();
                dummyAnchor.remove();
                mainDialog.destroy();
            };
        },
    });

    // Contribute the topbar actions
    registerWidgetAction({
        id: 'quant:indicator-templates.open',
        target: 'topbar',
        label: ACTION_LABEL,
        icon: ICON_TPL,
        iconOnly: true,
        align: 'left',
        run: (ctx) => {
            hostRegistrations.get(ctx.host)?.dropdown();
        },
    });

    registerWidgetAction({
        id: 'quant:indicator-templates.open-mobile',
        target: 'topbar',
        label: ACTION_LABEL,
        icon: ICON_TPL,
        order: 999,
        when: (ctx) => ctx.host.getAttribute('data-layout') === 'mobile',
        run: (ctx) => {
            const entry = hostRegistrations.get(ctx.host);
            if (entry) queueMicrotask(entry.dialog);
        },
    });
}

// ── Local Storage Source Factory ────────────────────────────────────────────

const STORAGE_KEY = 'vela:indicator-templates';

function getStarterTemplates(): IndicatorTemplate[] {
    const now = Date.now();
    return [
        {
            id: 'tpl-starter-ema-ribbon',
            name: 'EMA Ribbon',
            indicatorNames: ['EMA 20', 'EMA 50', 'EMA 200'],
            indicators: [
                { kind: 'native', type: 'ema', name: 'EMA 20', inputs: { length: 20 } },
                { kind: 'native', type: 'ema', name: 'EMA 50', inputs: { length: 50 } },
                { kind: 'native', type: 'ema', name: 'EMA 200', inputs: { length: 200 } },
            ],
            updatedAt: now - 1000 * 3600 * 3,
            createdAt: now - 1000 * 3600 * 24,
        },
        {
            id: 'tpl-starter-rsi-macd',
            name: 'RSI + MACD',
            indicatorNames: ['RSI', 'MACD'],
            indicators: [
                { kind: 'native', type: 'rsi', name: 'RSI', inputs: { length: 14 } },
                { kind: 'native', type: 'macd', name: 'MACD', inputs: { fast: 12, slow: 26, signal: 9 } },
            ],
            updatedAt: now - 1000 * 3600 * 12,
            createdAt: now - 1000 * 3600 * 48,
        },
        {
            id: 'tpl-starter-bb-volume',
            name: 'Bollinger Bands & Volume',
            indicatorNames: ['Bollinger Bands', 'Volume'],
            indicators: [
                { kind: 'native', type: 'bb', name: 'Bollinger Bands', inputs: { length: 20, mult: 2 } },
                { kind: 'native', type: 'volume', name: 'Volume' },
            ],
            updatedAt: now - 1000 * 3600 * 24,
            createdAt: now - 1000 * 3600 * 72,
        },
        {
            id: 'tpl-starter-supertrend-atr',
            name: 'Supertrend & ATR',
            indicatorNames: ['Supertrend', 'Average True Range'],
            indicators: [
                { kind: 'native', type: 'supertrend', name: 'Supertrend', inputs: { period: 10, multiplier: 3 } },
                { kind: 'native', type: 'atr', name: 'Average True Range', inputs: { length: 14 } },
            ],
            updatedAt: now - 1000 * 3600 * 36,
            createdAt: now - 1000 * 3600 * 96,
        },
    ];
}

export function createLocalIndicatorTemplatesSource(ws: VelaWorkspace): IndicatorTemplatesSource {
    let templates: IndicatorTemplate[] = [];
    let isServerHydrated = false;

    const pushToServer = (list: IndicatorTemplate[]) => {
        if (typeof window === 'undefined' || !isServerHydrated) return;
        try {
            fetch('/api/indicator-templates', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(list),
                keepalive: true,
            }).catch((err) => {
                console.warn('[IndicatorTemplates] Remote sync error:', err);
            });
        } catch (_) {}
    };

    let syncTimeout: any = null;
    const saveToStorage = (syncRemote = true) => {
        try {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
            }
        } catch {}
        if (syncRemote && isServerHydrated) {
            clearTimeout(syncTimeout);
            syncTimeout = setTimeout(() => pushToServer(templates), 300);
        }
    };

    const normalizeTpl = (t: any): IndicatorTemplate => ({
        ...t,
        indicatorNames: Array.isArray(t.indicatorNames) && t.indicatorNames.length > 0
            ? t.indicatorNames
            : (Array.isArray(t.indicators) ? t.indicators.map((i: any) => i.name || i.type || 'Indicator') : []),
        indicators: Array.isArray(t.indicators) ? t.indicators : [],
    });

    const loadFromStorage = () => {
        try {
            if (typeof window !== 'undefined') {
                const raw = window.localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        templates = parsed.map(normalizeTpl);
                        return;
                    }
                }
            }
        } catch {}
        templates = [];
    };

    loadFromStorage();

    let isHydrating = false;
    const syncFromServer = async () => {
        if (isHydrating) return;
        isHydrating = true;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3500);
            const res = await fetch('/api/indicator-templates', { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    templates = data.map(normalizeTpl);
                    saveToStorage(false);
                    setIndicatorTemplatesPickerSource(source);
                    isServerHydrated = true;
                    isHydrating = false;
                    return;
                }
            }
        } catch (e) {
            console.warn('[IndicatorTemplates] Server hydration warning:', e);
        }
        isServerHydrated = true;
        isHydrating = false;
    };

    void syncFromServer();

    if (typeof window !== 'undefined') {
        const handleSync = () => {
            if (document.visibilityState === 'visible') {
                void syncFromServer();
            }
        };
        window.addEventListener('visibilitychange', handleSync);
        window.addEventListener('focus', handleSync);
    }

    const source: IndicatorTemplatesSource = {
        get templates() {
            return templates;
        },
        load(id: string, callback: (template: IndicatorTemplate | null) => void) {
            const found = templates.find((t) => t.id === id) ?? null;
            callback(found);
        },
        cells() {
            return ws.cells().map((c: any) => ({
                chart: c.chart,
                setSymbol: (s: string) => c.setSymbol?.(s),
                setTimeframe: (tf: string) => c.setTimeframe?.(tf),
                addExternalIndicator: (entry: any) =>
                    c.addExternalIndicator ? c.addExternalIndicator(entry) : c.addIndicator?.(entry),
                addNative: (type: string) => (c.addNative ? c.addNative(type) : c.addNativeIndicator?.(type)),
            }));
        },
        ensureCanCreate() {
            return true;
        },
        create(data: Omit<IndicatorTemplate, 'id'>, callback: (success: boolean) => void) {
            const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newTpl: IndicatorTemplate = {
                ...data,
                id,
                indicatorNames: data.indicatorNames || (Array.isArray(data.indicators) ? data.indicators.map((i: any) => i.name || i.type || 'Indicator') : []),
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            templates.unshift(newTpl);
            saveToStorage();
            setIndicatorTemplatesPickerSource(source);
            callback(true);
        },
        replace(id: string, data: Partial<IndicatorTemplate>, callback: (success: boolean) => void) {
            const idx = templates.findIndex((t) => t.id === id);
            if (idx === -1) {
                callback(false);
                return;
            }
            templates[idx] = {
                ...templates[idx]!,
                ...data,
                updatedAt: Date.now(),
            };
            saveToStorage();
            setIndicatorTemplatesPickerSource(source);
            callback(true);
        },
        rename(id: string, newName: string) {
            const tpl = templates.find((t) => t.id === id);
            if (tpl) {
                tpl.name = newName;
                tpl.updatedAt = Date.now();
                saveToStorage();
                setIndicatorTemplatesPickerSource(source);
            }
        },
        remove(id: string, callback: (success: boolean) => void) {
            templates = templates.filter((t) => t.id !== id);
            saveToStorage(true);
            try {
                fetch(`/api/indicator-templates/${encodeURIComponent(id)}`, { method: 'DELETE', keepalive: true }).catch(() => {});
            } catch (_) {}
            setIndicatorTemplatesPickerSource(source);
            callback(true);
        },
    };

    setIndicatorTemplatesPickerSource(source);
    return source;
}
