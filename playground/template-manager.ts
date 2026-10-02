import { registerWidgetAction, registerIcon } from '../src/plugin';
import type { VelaWorkspace } from '../src/workspace';
import type { WorkspaceState } from '../src/state/document';

// Register Templates Icon (layout/window grid icon)
registerIcon(
    'templates-icon',
    `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M6 6v8"/></svg>`
);

let wsInstance: VelaWorkspace | null = null;
let activeTemplateId: string = 'velo-4cell-trading';
let activeTemplateName: string = 'Velo 4-Cell Trading (Default)';
let modalContainer: HTMLElement | null = null;

interface TemplateRecord {
    id: string;
    name: string;
    description?: string;
    layout: string;
    cellCount: number;
    symbols?: string[];
    updatedAt: number;
    isDefault?: boolean;
    state?: WorkspaceState;
}

export function setTemplateWorkspaceInstance(ws: VelaWorkspace) {
    wsInstance = ws;
}

export function registerTemplateManager() {
    registerWidgetAction({
        id: 'templates.toggle',
        target: 'topbar',
        label: 'Templates',
        icon: 'templates-icon',
        align: 'left',
        order: 3, // Pinned right beside layout picker in topbar.left
        run: () => {
            openTemplateModal();
        },
    });
}

function showToast(message: string, isError: boolean = false) {
    const existing = document.getElementById('vela-template-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'vela-template-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: ${isError ? '#ef5350' : '#26a69a'};
        color: #fff;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: opacity 0.3s ease;
    `;
    toast.innerHTML = `<span>${isError ? '✗' : '✓'}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

export async function fetchTemplatesList(): Promise<TemplateRecord[]> {
    try {
        const res = await fetch('/api/templates');
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.warn('[Templates] Failed to fetch remote templates list, using fallback:', e);
    }
    return [];
}

export async function fetchTemplateDetail(id: string): Promise<TemplateRecord | null> {
    try {
        const res = await fetch(`/api/templates/${encodeURIComponent(id)}`);
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.warn('[Templates] Failed to fetch template detail:', e);
    }
    return null;
}

export async function saveTemplate(name: string, description: string = ''): Promise<boolean> {
    if (!wsInstance) return false;
    const state = wsInstance.getState();

    try {
        const res = await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                description,
                state,
            }),
        });

        if (res.ok) {
            const data = await res.json();
            activeTemplateId = data.id;
            activeTemplateName = data.name;
            showToast(`Template "${name}" saved to LXC 115!`);
            return true;
        }
    } catch (e: any) {
        showToast(`Failed to save template: ${e.message}`, true);
    }
    return false;
}

export async function applyTemplateById(id: string): Promise<boolean> {
    if (!wsInstance) return false;

    const record = await fetchTemplateDetail(id);
    if (!record || !record.state) {
        showToast('Failed to load template state from server', true);
        return false;
    }

    try {
        wsInstance.applyState(record.state);
        activeTemplateId = record.id;
        activeTemplateName = record.name;
        showToast(`Loaded template "${record.name}" across all charts!`);
        return true;
    } catch (e: any) {
        showToast(`Failed to apply template: ${e.message}`, true);
        return false;
    }
}

export function openTemplateModal() {
    if (modalContainer) {
        modalContainer.remove();
        modalContainer = null;
    }

    modalContainer = document.createElement('div');
    modalContainer.id = 'vela-template-modal-overlay';
    modalContainer.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(3px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: #181a20;
        border: 1px solid #2b313a;
        border-radius: 8px;
        width: 680px;
        max-width: 90vw;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
        overflow: hidden;
        color: #f0f3fa;
    `;

    // ── Header ───────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #2a2e39;
        background: #14151a;
    `;
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="color: #2962ff; display: flex; align-items: center;">
                <svg viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M6 6v8"/></svg>
            </div>
            <div>
                <div style="font-weight: 700; font-size: 15px;">Workspace Templates & Synchronization</div>
                <div style="font-size: 11px; color: #868a96;">Multi-device layout, indicators, watchlists, drawings & sync settings</div>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #26a69a; background: rgba(38, 166, 154, 0.1); padding: 3px 8px; border-radius: 12px; font-weight: 600;">
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #26a69a;"></span>
                <span>LXC 115 Synced</span>
            </div>
            <button id="modal-close-btn" style="background: transparent; border: none; color: #868a96; cursor: pointer; font-size: 18px; padding: 4px; line-height: 1;">✕</button>
        </div>
    `;

    // ── Body ─────────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.style.cssText = `
        padding: 20px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 20px;
    `;

    // 1. Current Active Template & Quick Save Bar
    const activeBar = document.createElement('div');
    activeBar.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #1e222d;
        border: 1px solid #2a2e39;
        border-radius: 6px;
        padding: 12px 16px;
    `;
    activeBar.innerHTML = `
        <div>
            <div style="font-size: 11px; color: #868a96; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Active Template</div>
            <div id="tpl-active-title" style="font-weight: 700; font-size: 14px; color: #f0f3fa; margin-top: 2px;">${activeTemplateName}</div>
        </div>
        <div style="display: flex; gap: 8px;">
            <button id="tpl-quick-save-btn" style="background: #2962ff; border: none; color: #fff; padding: 6px 14px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <span>💾</span>
                <span>Update Active</span>
            </button>
        </div>
    `;

    // 2. Save As New Template Form
    const saveNewBox = document.createElement('div');
    saveNewBox.style.cssText = `
        background: #16181f;
        border: 1px dashed #363c4e;
        border-radius: 6px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;
    saveNewBox.innerHTML = `
        <div style="font-size: 12px; font-weight: 700; color: #f0f3fa;">Save Current Workspace as New Template</div>
        <div style="display: flex; gap: 8px;">
            <input id="tpl-new-name-input" placeholder="Template name (e.g. Scalping 1m/5m, BTC+Alts 4-Grid)..." style="flex: 1; background: #131722; border: 1px solid #363c4e; color: #fff; padding: 8px 12px; font-size: 12px; border-radius: 4px; outline: none;" />
            <button id="tpl-save-new-btn" style="background: #26a69a; border: none; color: #fff; padding: 8px 16px; border-radius: 4px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap;">Save Template</button>
        </div>
    `;

    // 3. Saved Templates List Section
    const listSection = document.createElement('div');
    listSection.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;
    listSection.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #868a96; letter-spacing: 0.5px;">Saved Templates on Server</div>
            <div id="tpl-count-badge" style="font-size: 11px; color: #868a96;">Loading...</div>
        </div>
        <div id="tpl-cards-container" style="display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto; padding-right: 4px;"></div>
    `;

    // 4. Import / Export Bar
    const footerTools = document.createElement('div');
    footerTools.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 10px;
        border-top: 1px solid #2a2e39;
        font-size: 12px;
    `;
    footerTools.innerHTML = `
        <div style="color: #868a96; font-size: 11px;">State includes layouts, indicators, drawings, watchlists & sync links.</div>
        <div style="display: flex; gap: 8px;">
            <button id="tpl-export-json-btn" style="background: #2a2e39; border: 1px solid #363c4e; color: #f0f3fa; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Export JSON</button>
            <button id="tpl-import-json-btn" style="background: #2a2e39; border: 1px solid #363c4e; color: #f0f3fa; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Import JSON</button>
            <input type="file" id="tpl-file-input" accept=".json" style="display: none;" />
        </div>
    `;

    body.append(activeBar, saveNewBox, listSection, footerTools);
    dialog.append(header, body);
    modalContainer.appendChild(dialog);
    document.body.appendChild(modalContainer);

    // ── Wire Interactions ─────────────────────────────────────────────────────
    const closeBtn = header.querySelector('#modal-close-btn')!;
    const closeModal = () => {
        modalContainer?.remove();
        modalContainer = null;
    };
    closeBtn.addEventListener('click', closeModal);
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) closeModal();
    });

    // Populate Templates List
    const cardsContainer = body.querySelector('#tpl-cards-container') as HTMLElement;
    const countBadge = body.querySelector('#tpl-count-badge') as HTMLElement;

    const renderTemplatesList = async () => {
        cardsContainer.innerHTML = '<div style="color: #868a96; font-size: 12px; padding: 12px;">Loading templates...</div>';
        const templates = await fetchTemplatesList();
        cardsContainer.innerHTML = '';
        countBadge.textContent = `${templates.length} templates`;

        if (templates.length === 0) {
            cardsContainer.innerHTML = '<div style="color: #868a96; font-size: 12px; padding: 12px;">No templates found on server. Save one above!</div>';
            return;
        }

        for (const tpl of templates) {
            const isCurrent = tpl.id === activeTemplateId;
            const card = document.createElement('div');
            card.style.cssText = `
                background: ${isCurrent ? '#1e2433' : '#1e222d'};
                border: 1px solid ${isCurrent ? '#2962ff' : '#2a2e39'};
                border-radius: 6px;
                padding: 12px 14px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                transition: border 0.15s ease, background 0.15s ease;
            `;

            const layoutLabel = tpl.layout === '1' ? 'Single' : tpl.layout === '4' ? '4-Grid' : tpl.layout === '2h' ? '2-Split' : tpl.layout === '8' ? '8-Grid' : `${tpl.layout} Layout`;
            const symbolsSummary = tpl.symbols && tpl.symbols.length > 0 ? tpl.symbols.join(' · ') : 'Charts';
            const updatedTime = new Date(tpl.updatedAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            card.innerHTML = `
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="font-weight: 700; font-size: 13px; color: #f0f3fa;">${tpl.name}</span>
                        <span style="background: #2a2e39; color: #2962ff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">${layoutLabel}</span>
                        ${tpl.isDefault ? '<span style="background: rgba(38,166,154,0.15); color: #26a69a; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Default</span>' : ''}
                        ${isCurrent ? '<span style="background: #2962ff; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px;">ACTIVE</span>' : ''}
                    </div>
                    <div style="font-size: 11px; color: #868a96; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${symbolsSummary} · Updated ${updatedTime}
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                    <button class="tpl-load-btn" style="background: ${isCurrent ? '#2a2e39' : '#2962ff'}; border: none; color: #fff; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer;">
                        ${isCurrent ? 'Reload' : 'Load'}
                    </button>
                    ${!tpl.isDefault ? `<button class="tpl-del-btn" title="Delete template" style="background: transparent; border: none; color: #868a96; cursor: pointer; padding: 4px 6px; border-radius: 4px; font-size: 12px;">🗑️</button>` : ''}
                </div>
            `;

            // Load Action
            const loadBtn = card.querySelector('.tpl-load-btn')!;
            loadBtn.addEventListener('click', async () => {
                const ok = await applyTemplateById(tpl.id);
                if (ok) {
                    (activeBar.querySelector('#tpl-active-title') as HTMLElement).textContent = activeTemplateName;
                    closeModal();
                }
            });

            // Delete Action
            const delBtn = card.querySelector('.tpl-del-btn');
            if (delBtn) {
                delBtn.addEventListener('click', async () => {
                    if (confirm(`Delete template "${tpl.name}" from server?`)) {
                        try {
                            const res = await fetch(`/api/templates/${encodeURIComponent(tpl.id)}`, { method: 'DELETE' });
                            if (res.ok) {
                                showToast(`Deleted template "${tpl.name}"`);
                                void renderTemplatesList();
                            }
                        } catch (e: any) {
                            showToast(`Failed to delete template: ${e.message}`, true);
                        }
                    }
                });
            }

            cardsContainer.appendChild(card);
        }
    };

    void renderTemplatesList();

    // Quick Save button
    const quickSaveBtn = activeBar.querySelector('#tpl-quick-save-btn')!;
    quickSaveBtn.addEventListener('click', async () => {
        if (!wsInstance) return;
        const ok = await saveTemplate(activeTemplateName, 'User updated template');
        if (ok) {
            void renderTemplatesList();
        }
    });

    // Save As New Template
    const saveNewBtn = saveNewBox.querySelector('#tpl-save-new-btn')!;
    const nameInput = saveNewBox.querySelector('#tpl-new-name-input') as HTMLInputElement;
    saveNewBtn.addEventListener('click', async () => {
        const val = nameInput.value.trim();
        if (!val) {
            showToast('Please enter a template name', true);
            nameInput.focus();
            return;
        }
        const ok = await saveTemplate(val);
        if (ok) {
            nameInput.value = '';
            (activeBar.querySelector('#tpl-active-title') as HTMLElement).textContent = activeTemplateName;
            void renderTemplatesList();
        }
    });

    // Export JSON
    const exportBtn = footerTools.querySelector('#tpl-export-json-btn')!;
    exportBtn.addEventListener('click', () => {
        if (!wsInstance) return;
        const state = wsInstance.getState();
        const jsonStr = JSON.stringify(state, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vela-workspace-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Exported template JSON file');
    });

    // Import JSON
    const importBtn = footerTools.querySelector('#tpl-import-json-btn')!;
    const fileInput = footerTools.querySelector('#tpl-file-input') as HTMLInputElement;
    importBtn.addEventListener('click', () => {
        fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file || !wsInstance) return;
        try {
            const text = await file.text();
            const state = JSON.parse(text);
            wsInstance.applyState(state);
            showToast(`Imported and applied "${file.name}"!`);
            closeModal();
        } catch (e: any) {
            showToast(`Failed to parse template JSON: ${e.message}`, true);
        }
        fileInput.value = '';
    });
}
