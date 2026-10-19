import {
    injectStyles,
    registerIcon,
    iconEl,
    Dialog,
    Popover,
    Tooltip,
} from '../src/ui';
import { registerWidgetAttachment, registerWidgetAction } from '../src/widget/contributions';
import type { WidgetContext } from '../src/widget/contributions';
import type { VelaWorkspace } from '../src/workspace';
import type { WorkspaceState } from '../src/state/document';

// Import CSS as raw string or inject directly
import WORKSPACE_PICKER_CSS from './quant-workspace-picker.css?raw';

// ── Icons (verbatim SVG definitions from official Vela module 77908) ────────
const k = (content: string, strokeWidth: number, size = 16) =>
    `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}">${content}</svg>`;

const S = 'quant-layouts';
const C = k('<g stroke-linecap="round" stroke-linejoin="round"><rect x="1.8" y="2.3" width="12.4" height="8.6" rx="1.4"/><path d="M8 10.9v2.7M5.3 13.6h5.4"/></g>', 1.3);

const E = 'quant-wsp-search';
const A = k('<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 13.5 13.5" stroke-linecap="round"/>', 1.4);

const N = 'quant-wsp-plus';
const I = k('<path d="M8 3.5v9M3.5 8h9" stroke-linecap="round"/>', 1.5);

const M = 'quant-wsp-folder';
const T = k('<path d="M1.6 4.4a1 1 0 0 1 1-1h2.7l1.3 1.7h6.8a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1z"/>', 1.4);

const P = 'quant-wsp-check';
const D = k('<path d="M3.5 8.2 6.6 11.2 12.5 4.8" stroke-linecap="round" stroke-linejoin="round"/>', 1.6);

const L = 'quant-wsp-chevron';
const R = k('<path d="M4 6.2 8 10l4-3.8" stroke-linecap="round" stroke-linejoin="round"/>', 1.6, 12);

const $ = 'quant-wsp-share';
const O = k('<circle cx="12" cy="3.5" r="1.7"/><circle cx="4" cy="8" r="1.7"/><circle cx="12" cy="12.5" r="1.7"/><path d="M5.5 7.2 10.4 4.4M5.5 8.8 10.4 11.6" stroke-linecap="round"/>', 1.4);

const q = 'quant-wsp-rename';
const F = k('<path d="M9.5 3.2 12.8 6.5M3 13h3l6.4-6.4a1.5 1.5 0 0 0 0-2.1L11.5 3.2a1.5 1.5 0 0 0-2.1 0L3 9.6z" stroke-linecap="round" stroke-linejoin="round"/>', 1.4);

const B = 'quant-wsp-chart';
const V = k('<path d="M2 13.5h12" stroke-linecap="round"/><path d="M2.5 10.5 6 6.5l2.5 2.5 5-5.5" stroke-linecap="round" stroke-linejoin="round"/>', 1.4);

const j = 'quant-wsp-widgets';
const z = k('<rect x="1.5" y="1.5" width="5.6" height="5.6" rx="1.2"/><rect x="8.9" y="1.5" width="5.6" height="5.6" rx="1.2"/><rect x="1.5" y="8.9" width="5.6" height="5.6" rx="1.2"/><rect x="8.9" y="8.9" width="5.6" height="5.6" rx="1.2"/>', 1.3);

const U = 'quant-wsp-copy';
const W = k('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" stroke-linecap="round"/>', 1.4, 14);

const H = 'quant-wsp-delete';
const K = k('<g stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.3h11M6.2 4.3V3.1a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v1.2M4.2 4.3l.5 9.1a1.15 1.15 0 0 0 1.15 1.1h4.3a1.15 1.15 0 0 0 1.15-1.1l.5-9.1M6.5 7v4.5M9.5 7v4.5"/></g>', 1.6);

const G = 'quant-wsp-more';
const G_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" stroke="none"><circle cx="3.5" cy="8" r="1.35"/><circle cx="8" cy="8" r="1.35"/><circle cx="12.5" cy="8" r="1.35"/></svg>';


const CLOUD_SAVE_ID = 'quant-wsp-cloud-save';
const CLOUD_SAVE_SVG = k('<path d="M4.5 12.5h7a3 3 0 0 0 .5-5.96 4 4 0 0 0-7.8 1.16A2.8 2.8 0 0 0 4.5 12.5z" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12V7.5M6 9.5 8 7.5l2 2" stroke-linecap="round" stroke-linejoin="round"/>', 1.4);

const Y = 'quant-wsp-linkglyph';
const X = k('<g stroke-linecap="round"><path d="M6.5 9.5 9.5 6.5"/><path d="M7.5 4.5 9 3a2.5 2.5 0 0 1 3.5 3.5L11 8"/><path d="M8.5 11.5 7 13a2.5 2.5 0 0 1-3.5-3.5L5 8"/></g>', 1.4, 14);

// ── Helpers (verbatim from official module 811836) ──────────────────────────
export interface WorkspaceItem {
    id: string;
    name: string;
    updatedAt?: string | number;
    shared?: boolean;
    shareToken?: string | null;
    includeChart?: boolean;
    includeWidgets?: boolean;
    document?: WorkspaceState;
}

export interface WorkspaceLayoutPickerSource {
    workspaces: WorkspaceItem[];
    activeId: string | null;
    preview?: boolean;
    isDirty?: boolean;
    saveActive?: (targetId?: string) => Promise<boolean>;
    apply: (id: string) => void | Promise<void>;
    ensureCanCreate: () => boolean;
    create: (name: string) => void | Promise<void>;
    rename: (id: string, name: string) => void | Promise<void>;
    duplicate: (id: string, name: string, cb?: (res: boolean) => void) => void | Promise<void>;
    publishShare?: (id: string, mode: { includeChart: boolean; includeWidgets: boolean }, cb: (token: string | null) => void) => void;
    revokeShare?: (id: string) => void | Promise<void>;
    remove: (id: string, cb?: (res: boolean) => void) => void | Promise<void>;
}

async function copyToClipboard(view: Window | null | undefined, text: string): Promise<boolean> {
    const clipboard = view?.navigator?.clipboard;
    if (!clipboard) return false;
    try {
        await clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function filterWorkspaces(workspaces: WorkspaceItem[], query: string): WorkspaceItem[] {
    const q = query.trim().toLowerCase();
    return q ? workspaces.filter((w) => w.name.toLowerCase().includes(q)) : workspaces;
}

function newWorkspaceName(query: string): string {
    return query.trim() || 'New workspace';
}

function duplicateWorkspaceName(name: string, existingNames: string[]): string {
    const set = new Set(existingNames.map((n) => n.trim().toLowerCase()));
    const base = name.trim() || 'Workspace';
    for (let i = 1; ; i++) {
        const suffix = i === 1 ? ' copy' : ` copy ${i}`;
        const candidate = base.slice(0, 200 - suffix.length).trimEnd() + suffix;
        if (!set.has(candidate.toLowerCase())) return candidate;
    }
}

function createButtonLabel(query: string): string {
    const t = query.trim();
    return t ? `Create “${t}”` : 'New workspace';
}

function formatWorkspaceUpdatedAt(rawDate?: string | number, now = Date.now()): string {
    if (!rawDate) return '';
    const ts = typeof rawDate === 'number' ? rawDate : Date.parse(rawDate);
    if (Number.isNaN(ts)) return '';
    const mins = Math.floor(Math.max(0, now - ts) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return days < 7 ? `${days}d ago` : new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function shareSelectionFromMode(mode: 'chart' | 'widgets' | 'both'): { includeChart: boolean; includeWidgets: boolean } {
    return { includeChart: mode !== 'widgets', includeWidgets: mode !== 'chart' };
}

function shareModeFromSelection(sel: { includeChart?: boolean; includeWidgets?: boolean }): 'chart' | 'widgets' | 'both' {
    return sel.includeChart && sel.includeWidgets ? 'both' : sel.includeWidgets ? 'widgets' : 'chart';
}

function shareBadgeLabel(ws: WorkspaceItem): string {
    if (!ws.shared) return '';
    if (ws.includeChart && ws.includeWidgets) return 'Shared';
    if (ws.includeChart) return 'Shared · Chart';
    if (ws.includeWidgets) return 'Shared · Panels';
    return 'Shared';
}

const RECENTS_KEY = 'quant:workspace-recents';

function recordRecentWorkspaceId(id: string, list: string[], max = 20): string[] {
    return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

function recentWorkspaces(all: WorkspaceItem[], recentIds: string[], limit = 5): WorkspaceItem[] {
    const byId = new Map(all.map((w) => [w.id, w]));
    const seen = new Set<string>();
    const out: WorkspaceItem[] = [];
    for (const id of recentIds) {
        const ws = byId.get(id);
        if (ws && !seen.has(id)) {
            seen.add(id);
            out.push(ws);
            if (out.length >= limit) return out;
        }
    }
    for (const ws of all) {
        if (!seen.has(ws.id)) {
            out.push(ws);
            if (out.length >= limit) break;
        }
    }
    return out;
}

function readRecentWorkspaceIds(storage: Storage | null): string[] {
    if (!storage) return [];
    try {
        const raw = storage.getItem(RECENTS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
    } catch {
        return [];
    }
}

function writeRecentWorkspaceIds(ids: string[], storage: Storage | null): void {
    if (!storage) return;
    try {
        storage.setItem(RECENTS_KEY, JSON.stringify(ids));
    } catch {}
}

// ── State Registry ──────────────────────────────────────────────────────────
let activeSource: WorkspaceLayoutPickerSource | null = null;
const sourceListeners = new Set<() => void>();
const triggerInstances = new WeakMap<HTMLElement, () => void>();

export function setWorkspaceLayoutPickerSource(source: WorkspaceLayoutPickerSource | null): void {
    activeSource = source;
    if (typeof window !== 'undefined') {
        (window as any).__workspacePickerSource = source;
    }
    sourceListeners.forEach((fn) => fn());
}

export function clearWorkspaceLayoutPickerSource(source?: WorkspaceLayoutPickerSource | null): void {
    if (!source || activeSource === source) {
        setWorkspaceLayoutPickerSource(null);
    }
}

// ── Registration: Attachment ────────────────────────────────────────────────
const STYLE_ID = 'quant-workspace-picker-9';
const TOOLTIP_DELAY_MS = 300;

export function registerWorkspaceLayoutPicker(): () => void {
    // 1. Register icons
    registerIcon(S, C);
    registerIcon(E, A);
    registerIcon(N, I);
    registerIcon(M, T);
    registerIcon(P, D);
    registerIcon(L, R);
    registerIcon($, O);
    registerIcon(q, F);
    registerIcon(B, V);
    registerIcon(j, z);
    registerIcon(U, W);
    registerIcon(H, K);
    registerIcon(G, G_SVG);
    registerIcon(Y, X);
    registerIcon(CLOUD_SAVE_ID, CLOUD_SAVE_SVG);

    // 2. Register widget attachment
    const unregAtt = registerWidgetAttachment({
        id: 'quant:workspace-layouts',
        mount(ctx: WidgetContext) {
            const bottombar = ctx.host.querySelector('.vela-widget-bottombar') as HTMLElement | null;
            if (!bottombar) return () => {};
            const topbarRight = ctx.host.querySelector('.vela-widget-topbar .vela-topbar-right') as HTMLElement | null;
            const doc = ctx.host.ownerDocument;

            injectStyles(STYLE_ID, WORKSPACE_PICKER_CSS, doc);

            const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
                const node = doc.createElement(tag);
                if (className) node.className = className;
                if (text !== undefined) node.textContent = text;
                return node;
            };

            const tooltips: Array<{ trigger: HTMLElement; tooltip: Tooltip }> = [];
            const pruneTooltips = () => {
                for (let i = tooltips.length - 1; i >= 0; i--) {
                    const item = tooltips[i];
                    if (item && !item.trigger.isConnected) {
                        item.tooltip.destroy();
                        tooltips.splice(i, 1);
                    }
                }
            };

            const makeBtn = (className: string, opts: { icon?: string; label?: string; aria?: string; tip?: string; onClick?: (e: MouseEvent) => void } = {}) => {
                const b = el('button', className);
                b.type = 'button';
                if (opts.aria) b.setAttribute('aria-label', opts.aria);
                if (opts.icon) b.append(iconEl(opts.icon, doc));
                if (opts.label !== undefined) b.append(el('span', undefined, opts.label));
                if (opts.onClick) b.addEventListener('click', opts.onClick);
                if (opts.tip) {
                    tooltips.push({
                        trigger: b,
                        tooltip: new Tooltip(b, {
                            content: opts.tip,
                            host: ctx.host,
                            placement: topbarRight ? 'bottom' : 'top',
                            openDelay: TOOLTIP_DELAY_MS,
                        }),
                    });
                }
                return b;
            };

            const bbRangeButtons: HTMLElement[] = topbarRight ? [] : Array.from(bottombar.querySelectorAll('.vela-bb-range'));
            for (const r of bbRangeButtons) r.style.display = 'none';

            // Topbar trigger button
            const triggerBtn = makeBtn('vela-bb-range quant-bb-layouts', { icon: S, aria: 'Workspaces', tip: 'Workspaces' });
            triggerBtn.setAttribute('aria-haspopup', 'menu');
            triggerBtn.setAttribute('aria-expanded', 'false');

            const labelSpan = el('span');
            labelSpan.style.minWidth = '0';
            labelSpan.style.maxWidth = '10rem';
            labelSpan.style.overflow = 'hidden';
            labelSpan.style.textOverflow = 'ellipsis';
            labelSpan.style.whiteSpace = 'nowrap';
            labelSpan.textContent = 'Workspaces';
            triggerBtn.append(labelSpan);

            const chevron = iconEl(L, doc);
            chevron.classList.add('quant-bb-chevron');
            triggerBtn.append(chevron);

            if (topbarRight) {
                triggerBtn.classList.add('quant-topbar-layouts');
                topbarRight.prepend(triggerBtn);
            } else if (bbRangeButtons[0]) {
                bbRangeButtons[0].before(triggerBtn);
            } else {
                bottombar.prepend(triggerBtn);
            }

            const shareTopbarBtn = makeBtn('vela-bb-range quant-bb-share', { icon: $, aria: 'Share workspace', tip: 'Share workspace' });
            shareTopbarBtn.hidden = true;
            triggerBtn.after(shareTopbarBtn);

            // Topbar Cloud Save Button & Unsaved Changes Dot
            const saveTopbarBtn = makeBtn('vela-bb-range quant-bb-save', {
                icon: CLOUD_SAVE_ID,
                aria: 'Save workspace (Ctrl+S)',
                tip: 'Save workspace (Ctrl+S)',
            });
            const unsavedDot = el('span', 'quant-unsaved-dot');
            saveTopbarBtn.append(unsavedDot);
            triggerBtn.after(saveTopbarBtn);

            const doSave = async (targetId?: string) => {
                if (!activeSource || !activeSource.saveActive) return;
                const idToSave = targetId || activeSource.activeId;
                const actName = activeSource.workspaces.find((w) => w.id === idToSave)?.name || 'Workspace';
                const ok = await activeSource.saveActive(targetId);
                if (ok) {
                    ctx.toast?.(`Saved "${actName}"`, 'info');
                    if (!targetId || targetId === activeSource.activeId) {
                        unsavedDot.removeAttribute('data-visible');
                        saveTopbarBtn.removeAttribute('data-dirty');
                    }
                } else {
                    ctx.toast?.(`Failed saving "${actName}"`, 'error');
                }
            };

            saveTopbarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                void doSave();
            });

            const handleKeydown = (e: KeyboardEvent) => {
                if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                    e.preventDefault();
                    e.stopPropagation();
                    void doSave();
                }
            };
            doc.defaultView?.addEventListener('keydown', handleKeydown, true);

            // Modal dialog root (.quant-wsp)
            const modalRoot = el('div', 'quant-wsp');
            const searchRow = el('div', 'quant-wsp-searchrow');
            const searchInput = el('input', 'quant-wsp-input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Search workspaces…';
            searchInput.setAttribute('spellcheck', 'false');
            searchInput.setAttribute('autocomplete', 'off');
            searchRow.append(iconEl(E, doc), searchInput);

            const wspList = el('div', 'quant-wsp-list');
            const wspFooter = el('div', 'quant-wsp-footer');
            const createLabel = el('span', undefined, createButtonLabel(''));
            const createBtn = makeBtn('quant-wsp-create', { icon: N });
            createBtn.append(createLabel);
            wspFooter.append(createBtn);

            // Sub-panels
            const sharePanel = el('div', 'quant-wsp-panel'); sharePanel.hidden = true;
            const deletePanel = el('div', 'quant-wsp-panel'); deletePanel.hidden = true;
            const newPanel = el('div', 'quant-wsp-panel'); newPanel.hidden = true;
            const renamePanel = el('div', 'quant-wsp-panel'); renamePanel.hidden = true;
            const duplicatePanel = el('div', 'quant-wsp-panel'); duplicatePanel.hidden = true;

            const listView = el('div', 'quant-wsp-listview');
            listView.append(searchRow, wspList, wspFooter);

            // Row kebab floating menu inside dialog
            const rowKebabMenu = el('div', 'quant-wsp-dd-kebab-menu');
            rowKebabMenu.hidden = true;
            rowKebabMenu.setAttribute('role', 'menu');
            const itemRename = makeBtn('quant-wsp-dd-kebab-item', { icon: q, label: 'Rename' });
            const itemDuplicate = makeBtn('quant-wsp-dd-kebab-item', { icon: U, label: 'Duplicate' });
            const itemShare = makeBtn('quant-wsp-dd-kebab-item', { icon: $, label: 'Share' });
            const itemDelete = makeBtn('quant-wsp-dd-kebab-item', { icon: H, label: 'Delete' });
            itemDelete.setAttribute('data-danger', '1');
            rowKebabMenu.append(itemRename, itemDuplicate, itemShare, itemDelete);
            listView.append(rowKebabMenu);

            modalRoot.append(listView, sharePanel, deletePanel, newPanel, renamePanel, duplicatePanel);

            const dialog = new Dialog({
                title: 'Workspaces',
                host: ctx.host,
                dimBackdrop: true,
                closeOnBackdrop: true,
            });
            dialog.body.append(modalRoot);

            // Local storage recents
            const storage = doc.defaultView?.localStorage ?? null;
            let recentIds = readRecentWorkspaceIds(storage);
            const markRecent = (id: string) => {
                recentIds = recordRecentWorkspaceId(id, recentIds);
                writeRecentWorkspaceIds(recentIds, storage);
            };

            // Dropdown Popover (.quant-wsp-dd)
            const ddRoot = el('div', 'quant-wsp-dd');
            const ddHeading = el('div', 'quant-wsp-dd-heading', 'Recent Workspaces');
            const ddList = el('div', 'quant-wsp-dd-list');
            const ddShowAll = makeBtn('quant-wsp-dd-all', { icon: M, label: 'Show all' });
            const ddNew = makeBtn('quant-wsp-dd-create', { icon: N, label: 'New workspace' });
            const ddFooter = el('div', 'quant-wsp-dd-footer');
            ddFooter.append(ddShowAll, ddNew);

            const ddKebabMenu = el('div', 'quant-wsp-dd-kebab-menu');
            ddKebabMenu.hidden = true;
            ddKebabMenu.setAttribute('role', 'menu');
            const ddKebabRename = makeBtn('quant-wsp-dd-kebab-item', { icon: q, label: 'Rename' });
            const ddKebabDuplicate = makeBtn('quant-wsp-dd-kebab-item', { icon: U, label: 'Duplicate' });
            const ddKebabShare = makeBtn('quant-wsp-dd-kebab-item', { icon: $, label: 'Share' });
            const ddKebabDelete = makeBtn('quant-wsp-dd-kebab-item', { icon: H, label: 'Delete' });
            ddKebabDelete.setAttribute('data-danger', '1');
            ddKebabMenu.append(ddKebabRename, ddKebabDuplicate, ddKebabShare, ddKebabDelete);
            ddRoot.append(ddHeading, ddList, ddFooter, ddKebabMenu);

            const popover = new Popover({
                trigger: triggerBtn,
                host: ctx.host,
                content: ddRoot,
                align: topbarRight ? 'end' : 'start',
                onClose: () => {
                    closeDdKebab();
                    triggerBtn.removeAttribute('data-open');
                    triggerBtn.setAttribute('aria-expanded', 'false');
                },
            });

            // Positioning helper for kebab popups
            const positionKebab = (menu: HTMLElement, anchor: HTMLElement, container: HTMLElement, boundary: HTMLElement) => {
                const cRect = container.getBoundingClientRect();
                const aRect = anchor.getBoundingClientRect();
                const bRect = boundary.getBoundingClientRect();
                const topMin = Math.max(0, bRect.top) + 6;
                const bottomMax = Math.min(doc.defaultView?.innerHeight ?? bRect.bottom, bRect.bottom) - 6;
                menu.style.maxHeight = `${Math.max(0, bottomMax - topMin)}px`;
                menu.style.overflowY = 'auto';
                const h = menu.offsetHeight;
                const down = aRect.bottom + 4;
                const chosen = down + h <= bottomMax ? down : aRect.top - h - 4;
                menu.style.top = `${Math.max(topMin, Math.min(chosen, bottomMax - h)) - cRect.top - container.clientTop + container.scrollTop}px`;
                menu.style.right = `${Math.max(0, cRect.right - aRect.right - container.clientLeft)}px`;
            };

            let activeDdKebabBtn: HTMLElement | null = null;
            let activeDdKebabWs: WorkspaceItem | null = null;
            const closeDdKebab = () => {
                ddKebabMenu.hidden = true;
                activeDdKebabBtn?.removeAttribute('data-open');
                activeDdKebabBtn?.setAttribute('aria-expanded', 'false');
                activeDdKebabBtn = null;
                activeDdKebabWs = null;
            };

            const openDdKebab = (btn: HTMLElement, ws: WorkspaceItem) => {
                if (activeDdKebabBtn === btn && !ddKebabMenu.hidden) {
                    closeDdKebab();
                    return;
                }
                activeDdKebabBtn?.removeAttribute('data-open');
                activeDdKebabBtn?.setAttribute('aria-expanded', 'false');
                activeDdKebabBtn = btn;
                activeDdKebabWs = ws;
                ddKebabDelete.hidden = (activeSource?.workspaces.length ?? 0) < 2;
                btn.setAttribute('data-open', '1');
                btn.setAttribute('aria-expanded', 'true');
                ddKebabMenu.hidden = false;
                positionKebab(ddKebabMenu, btn, ddRoot, ctx.host);
            };

            ddRoot.addEventListener('pointerdown', (e) => {
                if (ddKebabMenu.hidden) return;
                const target = e.target;
                if (!(target instanceof Node) || ddKebabMenu.contains(target) || (target instanceof Element && target.closest('.quant-wsp-dd-kebab'))) return;
                closeDdKebab();
            });

            let activeRowKebabBtn: HTMLElement | null = null;
            let activeRowKebabWs: WorkspaceItem | null = null;
            const closeRowKebab = () => {
                rowKebabMenu.hidden = true;
                activeRowKebabBtn?.removeAttribute('data-open');
                activeRowKebabBtn?.setAttribute('aria-expanded', 'false');
                activeRowKebabBtn = null;
                activeRowKebabWs = null;
            };

            listView.addEventListener('pointerdown', (e) => {
                if (rowKebabMenu.hidden) return;
                const target = e.target;
                if (!(target instanceof Node) || rowKebabMenu.contains(target) || (target instanceof Element && target.closest('.quant-wsp-row-kebab'))) return;
                closeRowKebab();
            });

            wspList.addEventListener('scroll', closeRowKebab);
            ddList.addEventListener('scroll', closeDdKebab);

            // Selection handler
            const selectWorkspace = (ws: WorkspaceItem) => {
                dialog.hide();
                popover.hide();
                markRecent(ws.id);
                if (ws.id !== activeSource?.activeId) {
                    activeSource?.apply(ws.id);
                    ctx.toast?.(`Loading ${ws.name}…`, 'info');
                }
            };

            // Panels switching
            let activeShareId: string | null = null;
            let activeDeleteId: string | null = null;
            let currentShareMode: 'chart' | 'widgets' | 'both' = 'both';

            const animatePanel = (target: HTMLElement) => {
                if (doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                target.animate(
                    [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }],
                    { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
                );
            };

            const allPanels = [listView, sharePanel, deletePanel, newPanel, renamePanel, duplicatePanel];
            const showPanel = (target: HTMLElement, animate = true) => {
                for (const p of allPanels) p.hidden = p !== target;
                if (animate) animatePanel(target);
            };

            const showListView = (animate = true) => {
                activeShareId = null;
                activeDeleteId = null;
                closeRowKebab();
                showPanel(listView, animate);
            };

            const makePanelHead = (sub: string | null, name: string, onBack = () => showListView()) => {
                const head = el('div', 'quant-wsp-head');
                const backBtn = makeBtn('quant-wsp-back', { icon: L, aria: 'Back to workspaces', tip: 'Back', onClick: onBack });
                const titles = el('div', 'quant-wsp-head-titles');
                if (sub) titles.append(el('span', 'quant-wsp-head-sub', sub));
                titles.append(el('span', 'quant-wsp-head-name', name));
                head.append(backBtn, titles);
                return head;
            };

            // RENAME PANEL
            let openedFromDialog = false;
            const exitRename = () => { if (openedFromDialog) dialog.hide(); else showListView(); };
            const openRename = (ws: WorkspaceItem) => {
                popover.hide();
                activeShareId = null;
                activeDeleteId = null;
                closeRowKebab();
                openedFromDialog = !dialog.open;
                renamePanel.replaceChildren();
                pruneTooltips();

                const row = el('div', 'quant-wsp-searchrow');
                const input = el('input', 'quant-wsp-input');
                input.type = 'text';
                input.value = ws.name;
                input.setAttribute('aria-label', `New name for ${ws.name}`);
                input.setAttribute('spellcheck', 'false');
                input.setAttribute('autocomplete', 'off');
                row.append(iconEl(q, doc), input);

                const save = () => {
                    const next = input.value.trim();
                    if (next && next !== ws.name) activeSource?.rename(ws.id, next);
                    exitRename();
                };

                input.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') save();
                    else if (e.key === 'Escape') exitRename();
                });

                const actions = el('div', 'quant-wsp-confirm-actions');
                actions.append(
                    makeBtn('quant-wsp-cancel', { label: 'Cancel', onClick: exitRename }),
                    makeBtn('quant-wsp-primary', { label: 'Save', onClick: save })
                );

                renamePanel.append(makePanelHead('Rename workspace', ws.name, exitRename), row, actions);
                showPanel(renamePanel, false);
                if (!dialog.open) dialog.show();
                animatePanel(renamePanel);
                setTimeout(() => { input.focus(); input.select(); }, 0);
            };

            // DUPLICATE PANEL
            let openedDupFromDialog = false;
            const exitDuplicate = () => { if (openedDupFromDialog) dialog.hide(); else showListView(); };
            const openDuplicate = (ws: WorkspaceItem) => {
                popover.hide();
                if (activeSource && !activeSource.ensureCanCreate()) {
                    if (dialog.open) dialog.hide();
                    return;
                }
                activeShareId = null;
                activeDeleteId = null;
                closeRowKebab();
                openedDupFromDialog = !dialog.open;
                duplicatePanel.replaceChildren();
                pruneTooltips();

                const row = el('div', 'quant-wsp-searchrow');
                const input = el('input', 'quant-wsp-input');
                input.type = 'text';
                input.value = duplicateWorkspaceName(ws.name, (activeSource?.workspaces ?? []).map((w) => w.name));
                input.setAttribute('aria-label', `Name for the copy of ${ws.name}`);
                input.setAttribute('spellcheck', 'false');
                input.setAttribute('autocomplete', 'off');
                row.append(iconEl(U, doc), input);

                const dupBtn = makeBtn('quant-wsp-primary', { label: 'Duplicate' });
                const doDuplicate = () => {
                    const fn = activeSource?.duplicate;
                    if (!fn) return;
                    const name = input.value.trim();
                    if (name) {
                        dupBtn.setAttribute('disabled', 'true');
                        dupBtn.textContent = 'Duplicating…';
                        fn(ws.id, name, (ok) => {
                            if (!ok) {
                                dupBtn.removeAttribute('disabled');
                                dupBtn.textContent = 'Duplicate';
                                ctx.toast?.("Couldn't duplicate the workspace.", 'error');
                                return;
                            }
                            exitDuplicate();
                            ctx.toast?.(`Duplicated as "${name}"`, 'success');
                        });
                    } else {
                        input.focus();
                    }
                };

                input.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') doDuplicate();
                    else if (e.key === 'Escape') exitDuplicate();
                });
                dupBtn.addEventListener('click', doDuplicate);

                const actions = el('div', 'quant-wsp-confirm-actions');
                actions.append(makeBtn('quant-wsp-cancel', { label: 'Cancel', onClick: exitDuplicate }), dupBtn);

                duplicatePanel.append(makePanelHead('Duplicate workspace', ws.name, exitDuplicate), row, actions);
                showPanel(duplicatePanel, false);
                if (!dialog.open) dialog.show();
                animatePanel(duplicatePanel);
                setTimeout(() => { input.focus(); input.select(); }, 0);
            };

            // CREATE NEW PANEL
            const newRow = el('div', 'quant-wsp-searchrow');
            const newNameInput = el('input', 'quant-wsp-input');
            newNameInput.type = 'text';
            newNameInput.placeholder = 'Workspace name…';
            newNameInput.setAttribute('aria-label', 'New workspace name');
            newNameInput.setAttribute('spellcheck', 'false');
            newNameInput.setAttribute('autocomplete', 'off');
            newRow.append(iconEl(S, doc), newNameInput);

            const submitCreate = () => {
                if (!activeSource) return;
                const name = newWorkspaceName(newNameInput.value);
                dialog.hide();
                popover.hide();
                activeSource.create(name);
                ctx.toast?.(`Creating "${name}"…`, 'info');
            };

            const newActions = el('div', 'quant-wsp-confirm-actions');
            newActions.append(
                makeBtn('quant-wsp-cancel', { label: 'Cancel', onClick: () => showListView() }),
                makeBtn('quant-wsp-primary', { label: 'Create', onClick: submitCreate })
            );
            newNameInput.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') submitCreate();
            });
            newPanel.append(makePanelHead(null, 'New workspace'), newRow, newActions);

            const openCreate = (initialName = '') => {
                popover.hide();
                if (activeSource && !activeSource.ensureCanCreate()) {
                    if (dialog.open) dialog.hide();
                    return;
                }
                activeShareId = null;
                activeDeleteId = null;
                closeRowKebab();
                showPanel(newPanel, false);
                newNameInput.value = initialName;
                if (!dialog.open) dialog.show();
                animatePanel(newPanel);
                setTimeout(() => { newNameInput.focus(); newNameInput.select(); }, 0);
            };

            // SHARE PANEL
            const renderSharePanel = () => {
                const ws = activeSource?.workspaces.find((w) => w.id === activeShareId);
                sharePanel.replaceChildren();
                pruneTooltips();
                if (!ws) return showListView();

                const status = el('div', 'quant-wsp-status', ws.shared ? 'Anyone with the link gets their own copy.' : 'Recipients get their own copy of what you pick. Chats and preferences stay private.');
                const currentMode = ws.shared ? shareModeFromSelection({ includeChart: !!ws.includeChart, includeWidgets: !!ws.includeWidgets }) : null;

                const choices = [
                    { mode: 'chart' as const, icon: B, title: 'Chart layout', hint: 'Chart grid, symbols and indicators.' },
                    { mode: 'widgets' as const, icon: j, title: 'Panels', hint: 'Panel setup only.' },
                    { mode: 'both' as const, icon: S, title: 'Chart + panels', hint: 'The full workspace layout.' },
                ];

                const choicesEl = el('div', 'quant-wsp-choices');
                for (const item of choices) {
                    const choiceBtn = makeBtn('quant-wsp-choice', {
                        onClick: () => {
                            currentShareMode = item.mode;
                            renderSharePanel();
                        },
                    });
                    if (item.mode === currentShareMode) choiceBtn.setAttribute('data-active', '1');
                    const iconWrap = el('span', 'quant-wsp-choice-icon');
                    iconWrap.append(iconEl(item.icon, doc));
                    const textWrap = el('span', 'quant-wsp-choice-text');
                    textWrap.append(el('span', 'quant-wsp-choice-title', item.title), el('span', 'quant-wsp-choice-hint', item.hint));
                    const checkIcon = iconEl(P, doc);
                    checkIcon.classList.add('quant-wsp-choice-check');
                    choiceBtn.append(iconWrap, textWrap, checkIcon);
                    choicesEl.append(choiceBtn);
                }

                sharePanel.append(makePanelHead('Share workspace', ws.name), status, choicesEl);

                const origin = doc.defaultView?.location.origin ?? '';
                const runShare = (btn: HTMLElement, pendingLabel: string, onSuccess: (token: string) => void) => {
                    const publisher = activeSource?.publishShare;
                    if (!publisher) return;
                    const origChildren = [...btn.childNodes];
                    btn.setAttribute('disabled', 'true');
                    btn.textContent = pendingLabel;
                    publisher(ws.id, shareSelectionFromMode(currentShareMode), (tok) => {
                        if (!tok) {
                            btn.removeAttribute('disabled');
                            btn.replaceChildren(...origChildren);
                            ctx.toast?.("Couldn't create the share link.", 'error');
                            return;
                        }
                        onSuccess(tok);
                    });
                };

                if (ws.shared && ws.shareToken) {
                    const linkUrl = `${origin.replace(/\/$/, '')}/w/${encodeURIComponent(ws.shareToken)}`;
                    const linkRow = el('div', 'quant-wsp-link');
                    linkRow.append(iconEl(Y, doc));
                    const urlSpan = el('span', 'quant-wsp-link-url', linkUrl.replace(/^https?:\/\//, ''));
                    urlSpan.title = linkUrl;
                    const copyBtn = makeBtn('quant-wsp-copybtn');
                    const setCopiedState = (copied: boolean) => {
                        copyBtn.replaceChildren(iconEl(copied ? P : U, doc));
                        copyBtn.append(el('span', undefined, copied ? 'Copied' : 'Copy'));
                    };
                    setCopiedState(false);
                    copyBtn.addEventListener('click', () => {
                        copyToClipboard(doc.defaultView, linkUrl).then((ok) => {
                            if (ok) {
                                copyBtn.setAttribute('data-copied', '1');
                                setCopiedState(true);
                                setTimeout(() => {
                                    copyBtn.removeAttribute('data-copied');
                                    setCopiedState(false);
                                }, 1600);
                            } else {
                                ctx.toast?.("Couldn't copy the link", 'error');
                            }
                        });
                    });
                    linkRow.append(urlSpan, copyBtn);
                    sharePanel.append(linkRow);

                    if (currentMode !== currentShareMode) {
                        const updateBtn = makeBtn('quant-wsp-primary', { label: 'Update link' });
                        updateBtn.addEventListener('click', () => runShare(updateBtn, 'Updating…', () => ctx.toast?.('Share updated', 'success')));
                        sharePanel.append(updateBtn);
                    }

                    sharePanel.append(
                        makeBtn('quant-wsp-stop', {
                            label: 'Stop sharing',
                            onClick: () => {
                                activeSource?.revokeShare?.(ws.id);
                                ctx.toast?.('Share link revoked', 'info');
                                showListView();
                            },
                        })
                    );
                } else {
                    const createShareBtn = makeBtn('quant-wsp-primary', { icon: $, label: 'Create share link' });
                    createShareBtn.addEventListener('click', () =>
                        runShare(createShareBtn, 'Creating…', (tok) => {
                            const url = `${origin.replace(/\/$/, '')}/w/${encodeURIComponent(tok)}`;
                            copyToClipboard(doc.defaultView, url).then((ok) => {
                                ctx.toast?.(ok ? 'Link copied to clipboard' : "Couldn't copy the link", ok ? 'success' : 'error');
                            });
                        })
                    );
                    sharePanel.append(createShareBtn);
                }
            };

            const openShare = (ws: WorkspaceItem) => {
                activeShareId = ws.id;
                activeDeleteId = null;
                closeRowKebab();
                currentShareMode = ws.shared ? shareModeFromSelection({ includeChart: !!ws.includeChart, includeWidgets: !!ws.includeWidgets }) : 'both';
                showPanel(sharePanel, false);
                renderSharePanel();
                animatePanel(sharePanel);
            };

            // DELETE PANEL
            let openedDelFromDialog = false;
            const exitDelete = () => { if (openedDelFromDialog) { activeDeleteId = null; dialog.hide(); } else showListView(); };
            const renderDeletePanel = () => {
                const ws = activeSource?.workspaces.find((w) => w.id === activeDeleteId);
                deletePanel.replaceChildren();
                pruneTooltips();
                if (!ws) return exitDelete();

                const status = el('div', 'quant-wsp-status', 'This permanently removes the saved layout. This can’t be undone.');
                const delBtn = makeBtn('quant-wsp-primary', { label: 'Delete' });
                delBtn.setAttribute('data-danger', '1');
                delBtn.addEventListener('click', () => {
                    const fn = activeSource?.remove;
                    if (fn) {
                        delBtn.setAttribute('disabled', 'true');
                        delBtn.textContent = 'Deleting…';
                        fn(ws.id, (ok) => {
                            if (!ok) {
                                delBtn.removeAttribute('disabled');
                                delBtn.textContent = 'Delete';
                                ctx.toast?.("Couldn't delete the workspace.", 'error');
                                return;
                            }
                            exitDelete();
                            ctx.toast?.(`Deleted ${ws.name}`, 'info');
                        });
                    }
                });

                const actions = el('div', 'quant-wsp-confirm-actions');
                actions.append(makeBtn('quant-wsp-cancel', { label: 'Cancel', onClick: exitDelete }), delBtn);
                deletePanel.append(makePanelHead('Delete workspace', ws.name, exitDelete), status, actions);
            };

            const openDelete = (ws: WorkspaceItem) => {
                activeDeleteId = ws.id;
                activeShareId = null;
                closeRowKebab();
                openedDelFromDialog = !dialog.open;
                showPanel(deletePanel, false);
                renderDeletePanel();
                if (!dialog.open) dialog.show();
                animatePanel(deletePanel);
            };

            // RENDER LIST
            let highlightedIndex = 0;
            const renderWorkspaceList = () => {
                closeRowKebab();
                wspList.replaceChildren();
                pruneTooltips();
                createLabel.textContent = createButtonLabel(searchInput.value);

                const all = activeSource ? activeSource.workspaces : [];
                const filtered = filterWorkspaces(all, searchInput.value);

                if (filtered.length === 0) {
                    highlightedIndex = 0;
                    const empty = el('div', 'quant-wsp-empty');
                    empty.append(
                        el('div', 'quant-wsp-empty-title', all.length === 0 ? 'No workspaces yet' : 'No matches'),
                        el('div', 'quant-wsp-empty-hint', all.length === 0 ? 'Create one to save this chart layout.' : `Try a different name, or create “${newWorkspaceName(searchInput.value)}”.`)
                    );
                    wspList.append(empty);
                    return;
                }

                if (highlightedIndex >= filtered.length) highlightedIndex = filtered.length - 1;
                if (highlightedIndex < 0) highlightedIndex = 0;

                filtered.forEach((ws, idx) => {
                    const row = el('div', 'quant-wsp-row');
                    row.setAttribute('role', 'button');
                    row.tabIndex = 0;

                    const isActive = !!activeSource && ws.id === activeSource.activeId;
                    if (isActive) row.setAttribute('data-active', '1');
                    if (idx === highlightedIndex) row.setAttribute('data-highlighted', '');

                    const avatar = el('span', 'quant-wsp-avatar', (ws.name.trim()[0] ?? '?').toUpperCase());
                    const main = el('span', 'quant-wsp-main');
                    const name = el('span', 'quant-wsp-name', ws.name);
                    main.append(name);

                    const metaItems = [isActive ? 'Current' : '', shareBadgeLabel(ws), formatWorkspaceUpdatedAt(ws.updatedAt)].filter(Boolean);
                    if (metaItems.length > 0) main.append(el('span', 'quant-wsp-meta', metaItems.join(' · ')));

                    row.append(avatar, main);

                    const actions = el('span', 'quant-wsp-actions');
                    actions.append(
                        makeBtn('quant-wsp-iconbtn', { icon: q, aria: `Rename ${ws.name}`, tip: 'Rename', onClick: (e) => { e.stopPropagation(); openRename(ws); } }),
                        makeBtn('quant-wsp-iconbtn', { icon: U, aria: `Duplicate ${ws.name}`, tip: 'Duplicate', onClick: (e) => { e.stopPropagation(); openDuplicate(ws); } })
                    );

                    const shareBtn = makeBtn('quant-wsp-iconbtn', { icon: $, aria: `Share ${ws.name}`, tip: ws.shared ? 'Share (link active)' : 'Share', onClick: (e) => { e.stopPropagation(); openShare(ws); } });
                    if (ws.shared) shareBtn.setAttribute('data-shared', '1');
                    actions.append(shareBtn);

                    if (all.length > 1) {
                        actions.append(makeBtn('quant-wsp-iconbtn quant-wsp-delete', { icon: H, aria: `Delete ${ws.name}`, tip: 'Delete', onClick: (e) => { e.stopPropagation(); openDelete(ws); } }));
                    }

                    const kebab = makeBtn('quant-wsp-iconbtn quant-wsp-row-kebab', {
                        icon: G,
                        aria: `Actions for ${ws.name}`,
                        tip: 'More actions',
                        onClick: (e) => {
                            e.stopPropagation();
                            if (activeRowKebabBtn === kebab && !rowKebabMenu.hidden) {
                                closeRowKebab();
                                return;
                            }
                            activeRowKebabBtn?.removeAttribute('data-open');
                            activeRowKebabBtn?.setAttribute('aria-expanded', 'false');
                            activeRowKebabBtn = kebab;
                            activeRowKebabWs = ws;
                            itemDelete.hidden = all.length < 2;
                            kebab.setAttribute('data-open', '1');
                            kebab.setAttribute('aria-expanded', 'true');
                            rowKebabMenu.hidden = false;
                            positionKebab(rowKebabMenu, kebab, listView, listView);
                        },
                    });
                    kebab.setAttribute('aria-haspopup', 'menu');
                    kebab.setAttribute('aria-expanded', 'false');
                    actions.append(kebab);

                    row.append(actions);

                    row.addEventListener('mouseenter', () => {
                        highlightedIndex = idx;
                        for (const child of wspList.children) child.removeAttribute('data-highlighted');
                        row.setAttribute('data-highlighted', '');
                    });
                    row.addEventListener('click', () => selectWorkspace(ws));
                    row.addEventListener('keydown', (e) => {
                        if (e.target === row && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            selectWorkspace(ws);
                        }
                    });

                    wspList.append(row);
                });
            };

            searchInput.addEventListener('input', () => {
                highlightedIndex = 0;
                renderWorkspaceList();
            });

            searchInput.addEventListener('keydown', (e) => {
                const list = filterWorkspaces(activeSource?.workspaces ?? [], searchInput.value);
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (list.length === 0) return;
                    highlightedIndex = (highlightedIndex + 1) % list.length;
                    renderWorkspaceList();
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (list.length === 0) return;
                    highlightedIndex = (highlightedIndex - 1 + list.length) % list.length;
                    renderWorkspaceList();
                    return;
                }
                if (e.key === 'Enter') {
                    const chosen = list[highlightedIndex] ?? list[0];
                    if (chosen) selectWorkspace(chosen);
                }
            });

            createBtn.addEventListener('click', () => openCreate(searchInput.value.trim()));

            const openFullDialog = () => {
                popover.hide();
                searchInput.value = '';
                showListView(false);
                renderWorkspaceList();
                dialog.show();
            };
            triggerInstances.set(ctx.host, openFullDialog);

            // RENDER RECENT DROPDOWN
            let lastDdKey = '';
            const renderDropdown = () => {
                const all = activeSource ? activeSource.workspaces : [];
                const recents = recentWorkspaces(all, recentIds);
                const key = recents.map((w) => `${w.id}\u0000${w.name}\u0000${+(w.id === activeSource?.activeId)}`).join('\x01');
                if (key === lastDdKey && ddList.childElementCount > 0) return;
                lastDdKey = key;

                const keepId = ddKebabMenu.hidden ? null : activeDdKebabWs?.id ?? null;
                closeDdKebab();
                ddList.replaceChildren();
                pruneTooltips();

                if (recents.length === 0) {
                    ddList.append(el('div', 'quant-wsp-dd-empty', all.length === 0 ? 'No workspaces yet' : 'No recent workspaces'));
                    return;
                }

                const map = new Map<string, { kebab: HTMLElement; ws: WorkspaceItem }>();
                for (const ws of recents) {
                    const isActive = !!activeSource && ws.id === activeSource.activeId;
                    const item = el('div', 'quant-wsp-dd-item');
                    if (isActive) item.setAttribute('data-active', '1');

                    const selectBtn = makeBtn('quant-wsp-dd-select', { onClick: () => selectWorkspace(ws) });
                    const check = iconEl(P, doc);
                    check.classList.add('quant-wsp-dd-check');
                    selectBtn.append(check, el('span', 'quant-wsp-dd-item-name', ws.name));
                    item.append(selectBtn);

                    const saveBtn = makeBtn('quant-wsp-dd-save', {
                        icon: CLOUD_SAVE_ID,
                        aria: `Save current layout to ${ws.name}`,
                        tip: `Save to ${ws.name}`,
                        onClick: (e) => {
                            e.stopPropagation();
                            void doSave(ws.id);
                        },
                    });
                    item.append(saveBtn);

                    const kebab = makeBtn('quant-wsp-dd-kebab', {
                        icon: G,
                        aria: `Actions for ${ws.name}`,
                        tip: 'More actions',
                        onClick: (e) => {
                            e.stopPropagation();
                            openDdKebab(kebab, ws);
                        },
                    });
                    kebab.setAttribute('aria-haspopup', 'menu');
                    kebab.setAttribute('aria-expanded', 'false');
                    item.append(kebab);

                    ddList.append(item);
                    map.set(ws.id, { kebab, ws });
                }

                if (keepId) {
                    const entry = map.get(keepId);
                    if (entry) openDdKebab(entry.kebab, entry.ws);
                }
            };

            // Trigger click
            triggerBtn.addEventListener('click', () => {
                if (popover.open) {
                    popover.hide();
                } else {
                    if (dialog.open) dialog.hide();
                    renderDropdown();
                    triggerBtn.setAttribute('data-open', '1');
                    triggerBtn.setAttribute('aria-expanded', 'true');
                    popover.show();
                }
            });

            ddShowAll.addEventListener('click', openFullDialog);
            ddNew.addEventListener('click', () => openCreate(''));

            ddKebabRename.addEventListener('click', () => { const w = activeDdKebabWs; closeDdKebab(); if (w) openRename(w); });
            ddKebabDuplicate.addEventListener('click', () => { const w = activeDdKebabWs; closeDdKebab(); if (w) openDuplicate(w); });
            ddKebabShare.addEventListener('click', () => { const w = activeDdKebabWs; if (w) { closeDdKebab(); popover.hide(); openShare(w); dialog.show(); } });
            ddKebabDelete.addEventListener('click', () => { const w = activeDdKebabWs; if (w) { closeDdKebab(); popover.hide(); openDelete(w); } });

            shareTopbarBtn.addEventListener('click', () => {
                const current = activeSource?.workspaces.find((w) => w.id === activeSource?.activeId);
                if (current) {
                    popover.hide();
                    openShare(current);
                    dialog.show();
                }
            });

            itemRename.addEventListener('click', () => { const w = activeRowKebabWs; closeRowKebab(); if (w) openRename(w); });
            itemDuplicate.addEventListener('click', () => { const w = activeRowKebabWs; closeRowKebab(); if (w) openDuplicate(w); });
            itemShare.addEventListener('click', () => { const w = activeRowKebabWs; closeRowKebab(); if (w) openShare(w); });
            itemDelete.addEventListener('click', () => { const w = activeRowKebabWs; closeRowKebab(); if (w) openDelete(w); });

            // Sync with source
            const syncUI = () => {
                const s = activeSource;
                const isPreview = !!s?.preview;
                triggerBtn.hidden = isPreview;

                const cur = s?.workspaces.find((w) => w.id === s.activeId);
                if (cur && recentIds[0] !== cur.id) markRecent(cur.id);

                labelSpan.textContent = cur ? cur.name : 'Workspaces';
                triggerBtn.setAttribute('aria-label', cur ? cur.name : 'Workspaces');
                shareTopbarBtn.hidden = !cur || isPreview;

                const isDirty = !!s?.isDirty;
                if (isDirty) {
                    unsavedDot.setAttribute('data-visible', '1');
                    saveTopbarBtn.setAttribute('data-dirty', '1');
                    saveTopbarBtn.setAttribute('aria-label', `Save ${cur?.name || 'workspace'} (Ctrl+S) - Unsaved changes`);
                } else {
                    unsavedDot.removeAttribute('data-visible');
                    saveTopbarBtn.removeAttribute('data-dirty');
                    saveTopbarBtn.setAttribute('aria-label', `Save ${cur?.name || 'workspace'} (Ctrl+S)`);
                }
                saveTopbarBtn.hidden = isPreview;

                renderWorkspaceList();
                if (activeShareId) renderSharePanel();
                if (activeDeleteId) renderDeletePanel();
                if (popover.open) {
                    renderDropdown();
                    popover.reposition?.();
                }
            };

            syncUI();
            sourceListeners.add(syncUI);

            return () => {
                sourceListeners.delete(syncUI);
                triggerInstances.delete(ctx.host);
                for (const t of tooltips) t.tooltip.destroy();
                tooltips.length = 0;
                popover.destroy();
                dialog.destroy();
                saveTopbarBtn.remove();
                doc.defaultView?.removeEventListener('keydown', handleKeydown, true);
                shareTopbarBtn.remove();
                triggerBtn.remove();
                for (const r of bbRangeButtons) r.style.display = '';
            };
        },
    });

    const unregAction = registerWidgetAction({
        id: 'quant:workspace-layouts.open',
        target: 'topbar',
        label: 'Workspaces',
        icon: S,
        order: 1000,
        when: (ctx) => 'mobile' === ctx.host.getAttribute('data-layout'),
        run: (ctx) => {
            const openFn = triggerInstances.get(ctx.host);
            if (openFn) queueMicrotask(openFn);
        },
    });

    return () => {
        unregAtt();
        unregAction();
    };
}

// ── Local Workspace Source Provider ─────────────────────────────────────────
const WORKSPACES_STORAGE_KEY = 'vela:workspaces-list';
const ACTIVE_WORKSPACE_ID_KEY = 'vela:active-workspace-id';

interface StoredWorkspace {
    id: string;
    name: string;
    updatedAt: string;
    shared?: boolean;
    shareToken?: string | null;
    includeChart?: boolean;
    includeWidgets?: boolean;
    document?: WorkspaceState;
}

export function createLocalWorkspaceSource(ws: VelaWorkspace): WorkspaceLayoutPickerSource {
    const loadStored = (): StoredWorkspace[] => {
        try {
            if (typeof window !== 'undefined') {
                const raw = window.localStorage.getItem(WORKSPACES_STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                }
            }
        } catch {}
        return [];
    };

    let isServerHydrated = true;
    let syncTimeout: any = null;
    let isDirty = false;
    let isHydratingOrBooting = false;
    let lastSavedDocStr = '';
    try {
        lastSavedDocStr = JSON.stringify(ws.getState());
    } catch (_) {}

    const pushToServer = (list: StoredWorkspace[], currentActiveId: string | null) => {
        if (typeof window === 'undefined') return;
        try {
            fetch('/api/workspaces', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activeId: currentActiveId, workspaces: list }),
            }).catch((err) => {
                console.warn('[Workspace] Remote sync error:', err);
            });
        } catch (_) {}
    };

    const saveStored = (list: StoredWorkspace[], syncRemote = false) => {
        try {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(list));
            }
        } catch {}
        if (syncRemote) {
            clearTimeout(syncTimeout);
            syncTimeout = setTimeout(() => {
                pushToServer(list, activeId);
            }, 300);
        }
    };

    const mergeWorkspaces = (local: StoredWorkspace[], remote: StoredWorkspace[]): StoredWorkspace[] => {
        const map = new Map<string, StoredWorkspace>();
        for (const rem of remote) {
            map.set(rem.id, rem);
        }
        let hasLocalWins = false;
        for (const loc of local) {
            const rem = map.get(loc.id);
            if (!rem) {
                map.set(loc.id, loc);
                hasLocalWins = true;
            } else {
                const locTime = Date.parse(loc.updatedAt) || 0;
                const remTime = Date.parse(rem.updatedAt) || 0;
                if (locTime >= remTime) {
                    map.set(loc.id, loc);
                    if (locTime > remTime) hasLocalWins = true;
                }
            }
        }
        const merged = Array.from(map.values());
        // Do not auto-push to server on merge; server updates must only be explicit (save button / ctrl+s)
        return merged;
    };

    let items = loadStored();
    let activeId: string | null = null;
    try {
        if (typeof window !== 'undefined') {
            activeId = window.localStorage.getItem(ACTIVE_WORKSPACE_ID_KEY);
        }
    } catch {}

    // Initialize initial workspace if none exist locally
    if (items.length === 0) {
        const initialDoc = ws.getState();
        const initialWs: StoredWorkspace = {
            id: 'default',
            name: 'Default Workspace',
            updatedAt: new Date().toISOString(),
            document: initialDoc,
        };
        items = [initialWs];
        activeId = 'default';
        saveStored(items, false);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(ACTIVE_WORKSPACE_ID_KEY, 'default');
        }
    } else if (!activeId || !items.some((w) => w.id === activeId)) {
        activeId = items[0]!.id;
    }

    let isHydrating = false;

    const syncFromServer = async (applyActiveDoc = false) => {
        if (isHydrating) return;
        isHydrating = true;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            const res = await fetch('/api/workspaces', { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.workspaces) && data.workspaces.length > 0) {
                    items = data.workspaces;
                    if (data.activeId && items.some((w: StoredWorkspace) => w.id === data.activeId)) {
                        activeId = data.activeId;
                    } else if (!activeId || !items.some((w: StoredWorkspace) => w.id === activeId)) {
                        activeId = items[0]!.id;
                    }

                    saveStored(items, false);
                    if (activeId && typeof window !== 'undefined') {
                        window.localStorage.setItem(ACTIVE_WORKSPACE_ID_KEY, activeId);
                    }

                    // On initial hydration or when explicitly requested, apply the active workspace document from server
                    const act = items.find((w: StoredWorkspace) => w.id === activeId);
                    if (act?.document && applyActiveDoc) {
                        try {
                            isHydratingOrBooting = true;
                            ws.applyState(act.document);
                            lastSavedDocStr = JSON.stringify(act.document);
                            setTimeout(() => { isHydratingOrBooting = false; }, 800);
                        } catch (err) {
                            console.warn('[Workspace] Failed applying initial state:', err);
                        }
                    } else if (act?.document) {
                        lastSavedDocStr = JSON.stringify(act.document);
                    }

                    isServerHydrated = true;
                    isHydrating = false;
                    isDirty = false;
                    setWorkspaceLayoutPickerSource(source);
                    return;
                }
            }
        } catch (e) {
            console.warn('[Workspace] Server hydration warning:', e);
        }
        isHydrating = false;
        isServerHydrated = true;
    };

    // Hydrate immediately from server in background
    void syncFromServer(false);

    if (typeof window !== 'undefined') {
        const handleSync = () => {
            if (document.visibilityState === 'visible' && !isDirty) {
                void syncFromServer(false);
            }
        };
        window.addEventListener('visibilitychange', handleSync);
    }

    const source: WorkspaceLayoutPickerSource = {
        get workspaces() {
            return items;
        },
        get activeId() {
            return activeId;
        },
        get isDirty() {
            return isDirty;
        },
        async saveActive(targetId?: string): Promise<boolean> {
            const idToSave = targetId || activeId;
            if (!idToSave) return false;
            const target = items.find((w) => w.id === idToSave);
            if (!target) return false;

            try {
                target.document = ws.getState();
                target.updatedAt = new Date().toISOString();
                saveStored(items, false);
                if (typeof window !== 'undefined') {
                    try {
                        window.localStorage.setItem('vela-play:vela-workspace', JSON.stringify(target.document));
                    } catch (_) {}
                }

                const res = await fetch('/api/workspaces', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activeId: idToSave, workspaces: items }),
                });

                fetch('/api/workspace/vela-workspace', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(target.document),
                }).catch(() => {});

                if (res.ok) {
                    if (!targetId || targetId === activeId) {
                        isDirty = false;
                        lastSavedDocStr = JSON.stringify(target.document);
                    }
                    setWorkspaceLayoutPickerSource(source);
                    return true;
                }
                return false;
            } catch (err) {
                console.error('[Workspace] Save error:', err);
                return false;
            }
        },
        ensureCanCreate() {
            return true;
        },
        apply(id: string) {
            const target = items.find((w) => w.id === id);
            if (!target) return;

            activeId = id;
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(ACTIVE_WORKSPACE_ID_KEY, id);
            }
            saveStored(items, false);

            if (target.document) {
                isHydratingOrBooting = true;
                ws.applyState(target.document);
                lastSavedDocStr = JSON.stringify(target.document);
                setTimeout(() => { isHydratingOrBooting = false; }, 800);
            }
            isDirty = false;
            setWorkspaceLayoutPickerSource(source);
        },
        create(name: string) {
            const id = 'ws_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const doc = ws.getState();
            const newWs: StoredWorkspace = {
                id,
                name: name.trim() || 'New workspace',
                updatedAt: new Date().toISOString(),
                document: doc,
            };
            items.unshift(newWs);
            activeId = id;
            saveStored(items, true);
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(ACTIVE_WORKSPACE_ID_KEY, id);
            }
            setWorkspaceLayoutPickerSource(source);
        },
        rename(id: string, name: string) {
            const target = items.find((w) => w.id === id);
            if (!target) return;
            target.name = name.trim() || target.name;
            target.updatedAt = new Date().toISOString();
            saveStored(items, true);
            setWorkspaceLayoutPickerSource(source);
        },
        duplicate(id: string, name: string, cb?: (res: boolean) => void) {
            const target = items.find((w) => w.id === id);
            if (!target) {
                cb?.(false);
                return;
            }
            const newId = 'ws_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const copyDoc = target.document ? JSON.parse(JSON.stringify(target.document)) : ws.getState();
            const copyWs: StoredWorkspace = {
                id: newId,
                name: name.trim() || duplicateWorkspaceName(target.name, items.map((w) => w.name)),
                updatedAt: new Date().toISOString(),
                document: copyDoc,
            };
            items.splice(items.indexOf(target) + 1, 0, copyWs);
            saveStored(items, true);
            setWorkspaceLayoutPickerSource(source);
            cb?.(true);
        },
        remove(id: string, cb?: (res: boolean) => void) {
            const idx = items.findIndex((w) => w.id === id);
            if (idx === -1) {
                cb?.(false);
                return;
            }
            // Explicit server deletion
            try {
                fetch(`/api/workspaces/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                }).catch(() => {});
            } catch (_) {}

            items.splice(idx, 1);
            if (activeId === id) {
                const next = items[idx] ?? items[idx - 1] ?? items[0];
                if (next) {
                    activeId = next.id;
                    if (next.document) ws.applyState(next.document);
                } else {
                    activeId = null;
                }
                if (typeof window !== 'undefined') {
                    if (activeId) window.localStorage.setItem(ACTIVE_WORKSPACE_ID_KEY, activeId);
                    else window.localStorage.removeItem(ACTIVE_WORKSPACE_ID_KEY);
                }
            }
            saveStored(items, false);
            setWorkspaceLayoutPickerSource(source);
            cb?.(true);
        },
        publishShare(id: string, mode: { includeChart: boolean; includeWidgets: boolean }, cb: (token: string | null) => void) {
            const target = items.find((w) => w.id === id);
            if (!target) return cb(null);
            const token = 'sh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            target.shared = true;
            target.shareToken = token;
            target.includeChart = mode.includeChart;
            target.includeWidgets = mode.includeWidgets;
            saveStored(items, true);
            setWorkspaceLayoutPickerSource(source);
            cb(token);
        },
        revokeShare(id: string) {
            const target = items.find((w) => w.id === id);
            if (!target) return;
            target.shared = false;
            target.shareToken = null;
            saveStored(items, true);
            setWorkspaceLayoutPickerSource(source);
        },
    };

    // Mark active workspace dirty on user changes without auto-clobbering server
    ws.on('state:changed', () => {
        if (!activeId || isHydratingOrBooting) return;
        const target = items.find((w) => w.id === activeId);
        if (target) {
            const currentDoc = ws.getState();
            target.document = currentDoc;
            const currentDocStr = JSON.stringify(currentDoc);
            try {
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem('vela-play:vela-workspace', currentDocStr);
                }
            } catch (_) {}

            const shouldBeDirty = !!lastSavedDocStr && currentDocStr !== lastSavedDocStr;
            if (isDirty !== shouldBeDirty) {
                isDirty = shouldBeDirty;
                setWorkspaceLayoutPickerSource(source);
            }
        }
    });

    setWorkspaceLayoutPickerSource(source);
    return source;
}
