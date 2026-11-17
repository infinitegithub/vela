// Shortcuts help — a dialog listing every registered keymap binding, grouped by
// category, with platform-formatted chords and interactive key recording. Driven entirely by `KeymapManager.bindings()`
// (plugin-registered bindings appear automatically).
import { eventToChord, type KeymapManager, type ResolvedBinding } from '../ui/keymap';
import { Dialog } from '../ui/components/dialog';
import { injectStyles } from '../ui/styles';

const STYLE_ID = 'vela-widget-shortcuts';
const CSS = `
.vela-sh-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    color: var(--vela-fg);
    overflow-x: hidden;
}
.vela-sh-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--vela-surface);
    padding-bottom: 6px;
    width: 100%;
    box-sizing: border-box;
}
.vela-sh-search {
    flex: 1;
    min-width: 0;
    background: var(--vela-surface-sunken);
    border: 1px solid var(--vela-border);
    border-radius: var(--vela-radius-sm);
    color: var(--vela-fg);
    font-size: 13px;
    padding: 8px 14px;
    outline: none;
    transition: border-color var(--vela-dur-fast) ease;
}
.vela-sh-search:focus {
    border-color: var(--vela-accent);
}
.vela-sh-btn-reset-all {
    background: transparent;
    border: 1px solid var(--vela-border);
    border-radius: var(--vela-radius-sm);
    color: var(--vela-fg-muted);
    font-size: 12px;
    padding: 7px 14px;
    cursor: pointer;
    white-space: nowrap;
    transition: all var(--vela-dur-fast) ease;
    flex: none;
}
.vela-sh-btn-reset-all:hover {
    color: var(--vela-fg);
    background: var(--vela-hover);
    border-color: var(--vela-fg-muted);
}
.vela-sh-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    box-sizing: border-box;
}
.vela-sh-cat {
    color: var(--vela-fg-muted);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 12px 0 6px;
    border-bottom: 1px solid var(--vela-border-soft);
    margin-bottom: 4px;
    width: 100%;
}
.vela-sh-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 6px 8px;
    border-radius: 4px;
    transition: background var(--vela-dur-fast) ease;
    width: 100%;
    box-sizing: border-box;
}
.vela-sh-row:hover {
    background: var(--vela-hover);
}
.vela-sh-row.is-recording {
    background: var(--vela-active);
    box-shadow: inset 0 0 0 1px var(--vela-accent);
}
.vela-sh-label-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
}
.vela-sh-label {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.vela-sh-custom-badge {
    background: var(--vela-active);
    color: var(--vela-accent-bright);
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex: none;
}
.vela-sh-rec-badge {
    background: var(--vela-active);
    color: var(--vela-danger);
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex: none;
}
.vela-sh-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
}
.vela-sh-keys {
    display: flex;
    gap: 4px;
    align-items: center;
}
.vela-sh-key {
    background: var(--vela-surface-overlay);
    border: 1px solid var(--vela-border-soft);
    border-radius: 3px;
    padding: 3px 8px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    color: var(--vela-fg);
    box-shadow: 0 1px 2px var(--vela-focus-soft);
    white-space: nowrap;
}
.vela-sh-btn-rec {
    background: var(--vela-surface-elev);
    border: 1px solid var(--vela-border);
    border-radius: var(--vela-radius-sm);
    color: var(--vela-fg-muted);
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    min-width: 58px;
    text-align: center;
}
.vela-sh-btn-rec:hover {
    color: var(--vela-fg);
    background: var(--vela-hover);
    border-color: var(--vela-border-hover, var(--vela-fg-muted));
}
.vela-sh-rec-live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--vela-surface-sunken);
    border: 1px solid var(--vela-accent);
    border-radius: var(--vela-radius-sm);
    padding: 3px 10px;
    min-width: 130px;
    box-shadow: 0 0 8px var(--vela-focus-soft);
}
.vela-sh-rec-pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--vela-danger);
    flex: none;
}
.vela-sh-rec-display {
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: var(--vela-accent-bright);
    font-weight: 600;
}
.vela-sh-rec-chips {
    display: flex;
    gap: 4px;
    align-items: center;
}
.vela-sh-chip-mod {
    background: var(--vela-surface-elev);
    border: 1px solid var(--vela-border);
    border-radius: 3px;
    color: var(--vela-fg-muted);
    font-size: 11px;
    padding: 3px 7px;
    cursor: pointer;
    transition: all 0.15s ease;
}
.vela-sh-chip-mod:hover {
    background: var(--vela-hover);
    color: var(--vela-fg);
}
.vela-sh-chip-mod.active {
    background: var(--vela-active);
    border-color: var(--vela-accent);
    color: var(--vela-accent-bright);
    font-weight: 600;
}
.vela-sh-btn-cancel {
    background: transparent;
    border: 1px solid var(--vela-border);
    border-radius: var(--vela-radius-sm);
    color: var(--vela-fg-muted);
    font-size: 11px;
    padding: 4px 8px;
    cursor: pointer;
    white-space: nowrap;
}
.vela-sh-btn-cancel:hover {
    color: var(--vela-fg);
    border-color: var(--vela-fg-muted);
}
.vela-sh-btn-reset {
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--vela-radius-sm);
    color: var(--vela-fg-muted);
    font-size: 13px;
    padding: 2px 6px;
    cursor: pointer;
    line-height: 1;
    transition: all 0.15s ease;
}
.vela-sh-btn-reset:hover {
    color: var(--vela-fg);
    background: var(--vela-hover);
    border-color: var(--vela-border);
}
.vela-sh-static {
    color: var(--vela-fg-muted);
    font-size: 12px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--vela-border-soft);
}
`;

export class ShortcutsHelp {
    private readonly dialog: Dialog;
    private readonly container: HTMLElement;
    private readonly searchInput: HTMLInputElement;
    private readonly list: HTMLElement;
    private readonly keymap: KeymapManager;
    private searchQuery = '';
    private activeRecordingId: string | null = null;
    private heldModifiers = { ctrl: false, alt: false, shift: false, meta: false };
    private recordingCleanup: (() => void) | null = null;

    constructor(keymap: KeymapManager, host?: HTMLElement, onOpenChange?: (open: boolean) => void) {
        this.keymap = keymap;
        const doc = (host ?? document.body).ownerDocument;
        injectStyles(STYLE_ID, CSS, doc);

        this.container = doc.createElement('div');
        this.container.className = 'vela-sh-container';

        const toolbar = doc.createElement('div');
        toolbar.className = 'vela-sh-toolbar';

        this.searchInput = doc.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.className = 'vela-sh-search';
        this.searchInput.placeholder = 'Search shortcuts (e.g. cell, grid, zoom, log)...';
        this.searchInput.addEventListener('input', () => {
            this.searchQuery = this.searchInput.value;
            this.renderList();
        });

        const resetAllBtn = doc.createElement('button');
        resetAllBtn.className = 'vela-sh-btn-reset-all';
        resetAllBtn.textContent = 'Reset All';
        resetAllBtn.title = 'Reset all custom shortcuts to defaults';
        resetAllBtn.addEventListener('click', () => {
            this.stopRecording();
            this.keymap.resetAll();
            this.refresh();
        });

        toolbar.append(this.searchInput, resetAllBtn);

        this.list = doc.createElement('div');
        this.list.className = 'vela-sh-list';

        this.container.append(toolbar, this.list);

        this.dialog = new Dialog({
            title: 'Keyboard Shortcuts & Settings',
            className: 'vela-dialog--shortcuts',
            host,
            closeOnInteractOutside: true,
            content: (body) => body.appendChild(this.container),
            onOpenChange: (open) => {
                if (open) {
                    this.stopRecording();
                    this.refresh();
                    setTimeout(() => this.searchInput.focus(), 50);
                } else {
                    this.stopRecording();
                }
                onOpenChange?.(open);
            },
        });
    }

    open(): void {
        this.stopRecording();
        this.refresh();
        this.dialog.show();
    }

    close(): void {
        this.stopRecording();
        this.dialog.hide();
    }

    destroy(): void {
        this.stopRecording();
        this.dialog.destroy();
    }

    private startRecording(bindingId: string): void {
        if (this.activeRecordingId === bindingId) {
            this.stopRecording();
            this.refresh();
            return;
        }

        this.stopRecording();
        this.activeRecordingId = bindingId;
        this.heldModifiers = { ctrl: false, alt: false, shift: false, meta: false };
        this.renderList();

        const onKeyDown = (ev: KeyboardEvent) => {
            ev.preventDefault();
            ev.stopPropagation();

            if (ev.key === 'Escape') {
                this.stopRecording();
                this.refresh();
                return;
            }

            // Track modifier states
            const keyLower = (ev.key || '').toLowerCase();
            if (ev.ctrlKey || keyLower === 'control') this.heldModifiers.ctrl = true;
            if (ev.altKey || keyLower === 'alt') this.heldModifiers.alt = true;
            if (ev.shiftKey || keyLower === 'shift') this.heldModifiers.shift = true;
            if (ev.metaKey || keyLower === 'meta') this.heldModifiers.meta = true;

            // Bare modifier press: update the live screen display
            if (['control', 'shift', 'alt', 'meta'].includes(keyLower)) {
                this.updateLiveRecordingDisplay();
                return;
            }

            // Primary non-modifier key pressed: compute full chord
            let chord = eventToChord(ev, this.keymap.isMac);
            if (chord) {
                // If user toggled modifier chips on screen, ensure they are merged
                const parts = chord.split('+');
                const primaryKey = parts[parts.length - 1];
                const finalMods: string[] = [];
                const mac = this.keymap.isMac;
                const isCtrl = ev.ctrlKey || this.heldModifiers.ctrl;
                const isAlt = ev.altKey || this.heldModifiers.alt;
                const isShift = ev.shiftKey || this.heldModifiers.shift;
                const isMeta = ev.metaKey || this.heldModifiers.meta;

                if (mac) {
                    if (isCtrl) finalMods.push('ctrl');
                    if (isAlt) finalMods.push('alt');
                    if (isShift) finalMods.push('shift');
                    if (isMeta) finalMods.push('mod');
                } else {
                    if (isCtrl) finalMods.push('mod');
                    if (isAlt) finalMods.push('alt');
                    if (isShift) finalMods.push('shift');
                    if (isMeta) finalMods.push('meta');
                }
                finalMods.push(primaryKey!);
                chord = finalMods.join('+');

                this.keymap.rebind(bindingId, chord);
                this.stopRecording();
                this.refresh();
            }
        };

        const onKeyUp = (ev: KeyboardEvent) => {
            const keyLower = (ev.key || '').toLowerCase();
            if (keyLower === 'control') this.heldModifiers.ctrl = false;
            if (keyLower === 'alt') this.heldModifiers.alt = false;
            if (keyLower === 'shift') this.heldModifiers.shift = false;
            if (keyLower === 'meta') this.heldModifiers.meta = false;
            this.updateLiveRecordingDisplay();
        };

        this.recordingCleanup = () => {
            window.removeEventListener('keydown', onKeyDown, { capture: true });
            window.removeEventListener('keyup', onKeyUp, { capture: true });
        };
        window.addEventListener('keydown', onKeyDown, { capture: true });
        window.addEventListener('keyup', onKeyUp, { capture: true });
    }

    private updateLiveRecordingDisplay(): void {
        const el = this.list.querySelector('#vela-sh-rec-display');
        if (!el) return;
        const mac = this.keymap.isMac;
        const mods: string[] = [];
        if (this.heldModifiers.ctrl) mods.push(mac ? '⌃' : 'Ctrl');
        if (this.heldModifiers.alt) mods.push(mac ? '⌥' : 'Alt');
        if (this.heldModifiers.shift) mods.push(mac ? '⇧' : 'Shift');
        if (this.heldModifiers.meta) mods.push(mac ? '⌘' : 'Win');

        if (mods.length === 0) {
            el.textContent = 'Press keys...';
        } else {
            el.textContent = mods.join(mac ? '' : '+') + (mac ? '' : '+') + '...';
        }

        // Update modifier chip active states
        const chips = this.list.querySelectorAll<HTMLButtonElement>('.vela-sh-chip-mod');
        for (const chip of chips) {
            const mod = chip.dataset.mod;
            if (mod === 'ctrl') chip.classList.toggle('active', this.heldModifiers.ctrl);
            if (mod === 'alt') chip.classList.toggle('active', this.heldModifiers.alt);
            if (mod === 'shift') chip.classList.toggle('active', this.heldModifiers.shift);
        }
    }

    private stopRecording(): void {
        if (this.recordingCleanup) {
            this.recordingCleanup();
            this.recordingCleanup = null;
        }
        this.activeRecordingId = null;
        this.heldModifiers = { ctrl: false, alt: false, shift: false, meta: false };
    }

    refresh(): void {
        this.renderList();
    }

    private renderList(): void {
        const doc = this.list.ownerDocument;
        this.list.replaceChildren();

        const addCategory = (text: string): void => {
            const cat = doc.createElement('div');
            cat.className = 'vela-sh-cat';
            cat.textContent = text;
            this.list.appendChild(cat);
        };

        const addRow = (b: ResolvedBinding): void => {
            const row = doc.createElement('div');
            row.className = 'vela-sh-row';

            const isRecordingThis = this.activeRecordingId === b.id;
            if (isRecordingThis) {
                row.classList.add('is-recording');
            }

            const labelWrap = doc.createElement('div');
            labelWrap.className = 'vela-sh-label-wrap';

            const l = doc.createElement('span');
            l.className = 'vela-sh-label';
            l.textContent = b.label;
            labelWrap.appendChild(l);

            if (isRecordingThis) {
                const recBadge = doc.createElement('span');
                recBadge.className = 'vela-sh-rec-badge';
                recBadge.textContent = 'Recording';
                labelWrap.appendChild(recBadge);
            } else if (b.isCustom) {
                const badge = doc.createElement('span');
                badge.className = 'vela-sh-custom-badge';
                badge.textContent = 'Custom';
                labelWrap.appendChild(badge);
            }

            const right = doc.createElement('div');
            right.className = 'vela-sh-right';

            if (isRecordingThis) {
                // Interactive Live Recording UI
                const liveBox = doc.createElement('div');
                liveBox.className = 'vela-sh-rec-live';

                const dot = doc.createElement('span');
                dot.className = 'vela-sh-rec-pulse';

                const display = doc.createElement('span');
                display.className = 'vela-sh-rec-display';
                display.id = 'vela-sh-rec-display';
                display.textContent = 'Press keys...';

                liveBox.append(dot, display);

                // Clickable modifier chips
                const chipsWrap = doc.createElement('div');
                chipsWrap.className = 'vela-sh-rec-chips';

                const addChip = (modName: 'ctrl' | 'alt' | 'shift', label: string) => {
                    const chip = doc.createElement('button');
                    chip.className = 'vela-sh-chip-mod';
                    chip.dataset.mod = modName;
                    chip.textContent = label;
                    if (this.heldModifiers[modName]) chip.classList.add('active');
                    chip.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.heldModifiers[modName] = !this.heldModifiers[modName];
                        this.updateLiveRecordingDisplay();
                    });
                    chipsWrap.appendChild(chip);
                };

                addChip('ctrl', 'Ctrl');
                addChip('alt', 'Alt');
                addChip('shift', 'Shift');

                const cancelBtn = doc.createElement('button');
                cancelBtn.className = 'vela-sh-btn-cancel';
                cancelBtn.textContent = 'Cancel';
                cancelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.stopRecording();
                    this.refresh();
                });

                right.append(liveBox, chipsWrap, cancelBtn);
            } else {
                // Normal view with badges, Record button, and Reset button
                const ks = doc.createElement('span');
                ks.className = 'vela-sh-keys';
                for (const key of b.display) {
                    const k = doc.createElement('span');
                    k.className = 'vela-sh-key';
                    k.textContent = key;
                    ks.appendChild(k);
                }

                const recBtn = doc.createElement('button');
                recBtn.className = 'vela-sh-btn-rec';
                recBtn.textContent = 'Record';
                recBtn.title = 'Click to record new shortcut keys';
                recBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.startRecording(b.id);
                });

                right.append(ks, recBtn);

                if (b.isCustom) {
                    const resetBtn = doc.createElement('button');
                    resetBtn.className = 'vela-sh-btn-reset';
                    resetBtn.innerHTML = '&#x21BA;';
                    resetBtn.title = 'Reset to default shortcut';
                    resetBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.stopRecording();
                        this.keymap.rebind(b.id, null);
                        this.refresh();
                    });
                    right.appendChild(resetBtn);
                }
            }

            row.append(labelWrap, right);
            this.list.appendChild(row);
        };

        const addStaticRow = (label: string, keys: readonly string[]): void => {
            const row = doc.createElement('div');
            row.className = 'vela-sh-row';

            const labelWrap = doc.createElement('div');
            labelWrap.className = 'vela-sh-label-wrap';
            const l = doc.createElement('span');
            l.className = 'vela-sh-label';
            l.textContent = label;
            labelWrap.appendChild(l);

            const right = doc.createElement('div');
            right.className = 'vela-sh-right';
            const ks = doc.createElement('span');
            ks.className = 'vela-sh-keys';
            for (const key of keys) {
                const k = doc.createElement('span');
                k.className = 'vela-sh-key';
                k.textContent = key;
                ks.appendChild(k);
            }
            right.appendChild(ks);
            row.append(labelWrap, right);
            this.list.appendChild(row);
        };

        const q = this.searchQuery.toLowerCase().trim();
        const byCategory = new Map<string, ResolvedBinding[]>();

        for (const b of this.keymap.bindings()) {
            const matches =
                !q ||
                b.label.toLowerCase().includes(q) ||
                b.category.toLowerCase().includes(q) ||
                b.keys.some((k) => k.toLowerCase().includes(q)) ||
                b.display.some((d) => d.toLowerCase().includes(q));

            if (!matches) continue;

            const bucket = byCategory.get(b.category) ?? [];
            bucket.push(b);
            byCategory.set(b.category, bucket);
        }

        for (const [category, bindings] of byCategory) {
            addCategory(category);
            for (const b of bindings) addRow(b);
        }

        // Pointer gestures live outside the keymap — list them like bindings so the
        // panel stays the one complete reference.
        if (!q || 'mouse scroll gesture click'.includes(q)) {
            addCategory('Mouse');
            addStaticRow('Scroll through history', ['Shift+Scroll']);
            addStaticRow('Measure from the press point', ['Shift+Click']);
            addStaticRow('Delete the drawing under the cursor', ['Middle-click']);
        }

        // The two type-to-act routes live outside the keymap (any-printable routing).
        if (!q || 'typing search timeframe symbol'.includes(q)) {
            const s = doc.createElement('div');
            s.className = 'vela-sh-static';
            s.textContent =
                'Typing a letter or 0 opens the symbol search; typing a digit from 1 to 9 opens the timeframe entry.';
            this.list.appendChild(s);
        }
    }
}
