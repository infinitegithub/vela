import { registerWidgetAction, registerIcon } from "../src/plugin";
import type { VelaWorkspace } from "../src/workspace";
import type { WorkspaceState } from "../src/state/document";

// Register Templates Icon (layout/window grid icon)
registerIcon(
    "templates-icon",
    `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M6 6v8"/></svg>`
);

const ACTIVE_TPL_ID_KEY = "vela-play:active-template-id";
const ACTIVE_TPL_NAME_KEY = "vela-play:active-template-name";
const TPL_CACHE_KEY = "vela-play:templates-cache";

function getInitialActiveTemplate(): { id: string; name: string } {
    try {
        if (typeof window !== "undefined") {
            const id = window.localStorage.getItem(ACTIVE_TPL_ID_KEY);
            const name = window.localStorage.getItem(ACTIVE_TPL_NAME_KEY);
            if (id && name) return { id, name };

            const tplCache = window.localStorage.getItem(TPL_CACHE_KEY);
            if (tplCache) {
                const list = JSON.parse(tplCache);
                if (Array.isArray(list)) {
                    const def = list.find((t: any) => t.isDefault);
                    if (def?.id && def?.name) return { id: def.id, name: def.name };
                    if (list[0]?.id && list[0]?.name) return { id: list[0].id, name: list[0].name };
                }
            }
        }
    } catch {}
    return {
        id: "velo-4cell-trading",
        name: "Velo 4-Cell Trading (Default)",
    };
}

let wsInstance: VelaWorkspace | null = null;
const initial = getInitialActiveTemplate();
let activeTemplateId: string = initial.id;
let activeTemplateName: string = initial.name;
let modalContainer: HTMLElement | null = null;

function persistActiveTemplate(id: string, name: string) {
    activeTemplateId = id;
    activeTemplateName = name;
    try {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(ACTIVE_TPL_ID_KEY, id);
            window.localStorage.setItem(ACTIVE_TPL_NAME_KEY, name);
        }
    } catch {}
}

export interface TemplateRecord {
    id: string;
    name: string;
    description?: string;
    layout: string;
    cellCount: number;
    symbols?: string[];
    indicators?: string[];
    updatedAt: number;
    isDefault?: boolean;
    state?: WorkspaceState;
}

export function setTemplateWorkspaceInstance(ws: VelaWorkspace) {
    wsInstance = ws;
}

export function registerTemplateManager() {
    registerWidgetAction({
        id: "templates.toggle",
        target: "topbar",
        label: "Templates",
        icon: "templates-icon",
        iconOnly: true,
        align: "right",
        order: 5,
        run: () => {
            openTemplateModal();
        },
    });
}

function showToast(message: string, isError: boolean = false) {
    const existing = document.getElementById("vela-template-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "vela-template-toast";
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: ${isError ? "var(--vela-down, #af6870)" : "var(--vela-up, #a7be94)"};
        color: ${isError ? "var(--vela-text-primary, #eeeef1)" : "var(--vela-bg-panel, #121215)"};
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: opacity 0.3s ease;
    `;
    toast.innerHTML = `<span>${isError ? "✗" : "✓"}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

export async function fetchTemplatesList(): Promise<TemplateRecord[]> {
    try {
        const res = await fetch("/api/templates");
        if (res.ok) {
            const list: TemplateRecord[] = await res.json();
            try {
                if (typeof window !== "undefined") {
                    window.localStorage.setItem(TPL_CACHE_KEY, JSON.stringify(list));
                }
            } catch {}
            return list;
        }
    } catch (e) {
        console.warn("[Templates] Failed to fetch remote templates list, checking cache:", e);
    }

    try {
        if (typeof window !== "undefined") {
            const cached = window.localStorage.getItem(TPL_CACHE_KEY);
            if (cached) return JSON.parse(cached);
        }
    } catch {}

    return [];
}

export async function fetchTemplateDetail(id: string): Promise<TemplateRecord | null> {
    try {
        const res = await fetch(`/api/templates/${encodeURIComponent(id)}`);
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.warn("[Templates] Failed to fetch template detail:", e);
    }
    return null;
}

export async function saveTemplate(
    name: string,
    description: string = "",
    id?: string,
    customState?: WorkspaceState
): Promise<boolean> {
    if (!wsInstance) return false;
    const state = customState || wsInstance.getState();

    try {
        const res = await fetch("/api/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id,
                name,
                description,
                state,
            }),
        });

        if (res.ok) {
            const data = await res.json();
            persistActiveTemplate(data.id, data.name);
            showToast(`Template "${name}" saved to LXC 115!`);
            return true;
        }
    } catch (e: any) {
        showToast(`Failed to save template: ${e.message}`, true);
    }
    return false;
}

export async function applyTemplateById(id: string, preserveLiveWatchlist: boolean = true): Promise<boolean> {
    if (!wsInstance) return false;

    const record = await fetchTemplateDetail(id);
    if (!record || !record.state) {
        showToast("Failed to load template state from server", true);
        return false;
    }

    try {
        const stateToApply = JSON.parse(JSON.stringify(record.state));

        // Preserve current active watchlist so switching layouts doesn't wipe recent watchlist edits
        if (preserveLiveWatchlist) {
            try {
                const liveState = wsInstance.getState();
                const liveWatchlist = liveState.ext?.["vela.watchlist"];
                if (liveWatchlist) {
                    if (!stateToApply.ext) stateToApply.ext = {};
                    stateToApply.ext["vela.watchlist"] = liveWatchlist;
                }
            } catch {}
        }

        wsInstance.applyState(stateToApply);
        persistActiveTemplate(record.id, record.name);
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

    modalContainer = document.createElement("div");
    modalContainer.id = "vela-template-modal-overlay";
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

    const dialog = document.createElement("div");
    dialog.style.cssText = `
        background: var(--vela-bg-card, #232429);
        border: 1px solid var(--vela-border, #262629);
        border-radius: 8px;
        width: 720px;
        max-width: 92vw;
        max-height: 88vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
        overflow: hidden;
        color: var(--vela-text-primary, #eeeef1);
    `;

    // ── Header ───────────────────────────────────────────────────────────────
    const header = document.createElement("div");
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--vela-border, #262629);
        background: var(--vela-bg-panel, #121215);
    `;
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="color: var(--vela-text-primary, #eeeef1); display: flex; align-items: center;">
                <svg viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M6 6v8"/></svg>
            </div>
            <div>
                <div style="font-weight: 700; font-size: 15px;">Workspace Templates & Synchronization</div>
                <div style="font-size: 11px; color: var(--vela-text-secondary, #757882);">Multi-device layout, indicators, drawings, sync links & server storage</div>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--vela-up, #a7be94); background: rgba(167, 190, 148, 0.12); padding: 3px 8px; border-radius: 12px; font-weight: 600;">
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--vela-up, #a7be94);"></span>
                <span>LXC 115 Synced</span>
            </div>
            <button id="modal-close-btn" style="background: transparent; border: none; color: var(--vela-text-secondary, #757882); cursor: pointer; font-size: 18px; padding: 4px; line-height: 1;">✕</button>
        </div>
    `;

    // ── Body ─────────────────────────────────────────────────────────────────
    const body = document.createElement("div");
    body.style.cssText = `
        padding: 20px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
    `;

    // 1. Current Active Template & Quick Save Bar
    const activeBar = document.createElement("div");
    activeBar.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--vela-bg-main, #202126);
        border: 1px solid var(--vela-border, #262629);
        border-radius: 6px;
        padding: 12px 16px;
    `;
    activeBar.innerHTML = `
        <div>
            <div style="font-size: 11px; color: var(--vela-text-secondary, #757882); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Active Template</div>
            <div id="tpl-active-title" style="font-weight: 700; font-size: 14px; color: var(--vela-text-primary, #eeeef1); margin-top: 2px;">${activeTemplateName}</div>
        </div>
        <div style="display: flex; gap: 8px;">
            <button id="tpl-quick-save-btn" style="background: var(--vela-bg-chip, #292a2f); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); padding: 6px 14px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <span>💾</span>
                <span>Update Active</span>
            </button>
        </div>
    `;

    // 2. Save As New Template Form
    const saveNewBox = document.createElement("div");
    saveNewBox.style.cssText = `
        background: var(--vela-bg-main, #202126);
        border: 1px dashed var(--vela-border, #262629);
        border-radius: 6px;
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;
    saveNewBox.innerHTML = `
        <div style="font-size: 12px; font-weight: 700; color: var(--vela-text-primary, #eeeef1);">Save Current Workspace as New Template</div>
        <div style="display: flex; gap: 8px;">
            <input id="tpl-new-name-input" placeholder="Template name (e.g. Scalping 1m/5m, BTC+Alts 4-Grid)..." style="flex: 1; background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); padding: 8px 12px; font-size: 12px; border-radius: 4px; outline: none;" />
            <button id="tpl-save-new-btn" style="background: var(--vela-up, #a7be94); border: none; color: var(--vela-bg-panel, #121215); padding: 8px 16px; border-radius: 4px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap;">Save Template</button>
        </div>
    `;

    // 3. Saved Templates List Section + Search & Watchlist Filter
    const listSection = document.createElement("div");
    listSection.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;
    listSection.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--vela-text-secondary, #757882); letter-spacing: 0.5px;">Saved Templates on Server</div>
                <div id="tpl-count-badge" style="font-size: 11px; color: var(--vela-text-secondary, #757882);">Loading...</div>
            </div>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--vela-text-secondary, #757882); cursor: pointer; user-select: none;">
                <input type="checkbox" id="tpl-preserve-watchlist-cb" checked style="cursor: pointer; accent-color: var(--vela-up, #a7be94);" />
                <span>Keep Current Watchlist on load</span>
            </label>
        </div>
        <div>
            <input id="tpl-search-input" placeholder="🔍 Filter templates by name, ticker, or indicator..." style="width: 100%; box-sizing: border-box; background: var(--vela-bg-main, #202126); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); padding: 7px 12px; font-size: 12px; border-radius: 4px; outline: none;" />
        </div>
        <div id="tpl-cards-container" style="display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto; padding-right: 4px;"></div>
    `;

    // 4. Import / Export Bar
    const footerTools = document.createElement("div");
    footerTools.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 10px;
        border-top: 1px solid var(--vela-border, #262629);
        font-size: 12px;
        flex-wrap: wrap;
        gap: 8px;
    `;
    footerTools.innerHTML = `
        <div style="color: var(--vela-text-secondary, #757882); font-size: 11px;">State captures multi-grid layout, charts, timeframes, indicators & drawing links.</div>
        <div style="display: flex; gap: 8px;">
            <button id="tpl-restore-starters-btn" style="background: transparent; border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;" title="Restore original starter templates if deleted">↺ Restore Starters</button>
            <button id="tpl-export-json-btn" style="background: var(--vela-bg-main, #202126); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Export JSON</button>
            <button id="tpl-import-json-btn" style="background: var(--vela-bg-main, #202126); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-primary, #eeeef1); padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Import JSON</button>
            <input type="file" id="tpl-file-input" accept=".json" style="display: none;" />
        </div>
    `;

    body.append(activeBar, saveNewBox, listSection, footerTools);
    dialog.append(header, body);
    modalContainer.appendChild(dialog);
    document.body.appendChild(modalContainer);

    const closeModal = () => {
        if (modalContainer) {
            modalContainer.remove();
            modalContainer = null;
        }
    };

    const closeBtn = header.querySelector("#modal-close-btn")!;
    closeBtn.addEventListener("click", closeModal);
    modalContainer.addEventListener("click", (e) => {
        if (e.target === modalContainer) closeModal();
    });

    // Populate Templates List
    const cardsContainer = body.querySelector("#tpl-cards-container") as HTMLElement;
    const countBadge = body.querySelector("#tpl-count-badge") as HTMLElement;
    const searchInput = body.querySelector("#tpl-search-input") as HTMLInputElement;
    const preserveWatchlistCb = body.querySelector("#tpl-preserve-watchlist-cb") as HTMLInputElement;

    let allTemplates: TemplateRecord[] = [];

    const renderTemplates = (templates: TemplateRecord[]) => {
        cardsContainer.innerHTML = "";
        countBadge.textContent = `${templates.length} template${templates.length === 1 ? "" : "s"}`;

        if (templates.length === 0) {
            cardsContainer.innerHTML = '<div style="color: var(--vela-text-secondary, #757882); font-size: 12px; padding: 16px; text-align: center;">No matching templates found.</div>';
            return;
        }

        for (const tpl of templates) {
            const isCurrent = tpl.id === activeTemplateId;
            const card = document.createElement("div");
            card.style.cssText = `
                background: ${isCurrent ? "var(--vela-bg-chip, #292a2f)" : "var(--vela-bg-main, #202126)"};
                border: 1px solid ${isCurrent ? "var(--vela-border-strong, #3a3b40)" : "var(--vela-border, #262629)"};
                border-radius: 6px;
                padding: 12px 14px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                transition: border 0.15s ease, background 0.15s ease;
            `;

            const layoutLabel = tpl.layout === "1" ? "Single" : tpl.layout === "4" ? "4-Grid" : tpl.layout === "2h" ? "2-Split" : tpl.layout === "8" ? "8-Grid" : `${tpl.layout} Layout`;
            const symbolsSummary = tpl.symbols && tpl.symbols.length > 0 ? tpl.symbols.join(" · ") : "Charts";
            const updatedTime = new Date(tpl.updatedAt || Date.now()).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

            // Generate indicator badges
            const indChips = Array.isArray(tpl.indicators) && tpl.indicators.length > 0
                ? tpl.indicators.map(ind => `<span style="background: rgba(74, 123, 176, 0.18); color: #7cb5ec; font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 3px;">${ind}</span>`).join(" ")
                : "";

            card.innerHTML = `
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="font-weight: 700; font-size: 13px; color: var(--vela-text-primary, #eeeef1);">${tpl.name}</span>
                        <span style="background: var(--vela-bg-card, #232429); color: var(--vela-text-secondary, #757882); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">${layoutLabel}</span>
                        ${tpl.isDefault ? '<span style="background: rgba(167,190,148,0.18); color: var(--vela-up, #a7be94); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">★ Default</span>' : ""}
                        ${isCurrent ? '<span style="background: var(--vela-up-selected-bg, #363a38); color: var(--vela-up, #a7be94); font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px;">ACTIVE</span>' : ""}
                    </div>
                    <div style="font-size: 11px; color: var(--vela-text-secondary, #757882); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${symbolsSummary} · Updated ${updatedTime}
                    </div>
                    ${indChips ? `<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 5px;">${indChips}</div>` : ""}
                </div>
                <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                    <button class="tpl-load-btn" style="background: ${isCurrent ? "var(--vela-bg-card, #232429)" : "var(--vela-button-light-bg, #eeeef1)"}; border: 1px solid var(--vela-border, #262629); color: ${isCurrent ? "var(--vela-text-secondary, #757882)" : "var(--vela-button-light-text, #121215)"}; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer;">
                        ${isCurrent ? "Reload" : "Load"}
                    </button>
                    ${!tpl.isDefault ? `<button class="tpl-set-def-btn" title="Set this template as default" style="background: var(--vela-bg-card, #232429); border: 1px solid var(--vela-border, #262629); color: var(--vela-text-secondary, #757882); padding: 6px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">★ Set Default</button>` : ""}
                    <button class="tpl-del-btn" title="Delete template from server" style="background: transparent; border: none; color: var(--vela-text-secondary, #757882); cursor: pointer; padding: 4px 6px; border-radius: 4px; font-size: 12px;">🗑️</button>
                </div>
            `;

            // Load Action
            const loadBtn = card.querySelector(".tpl-load-btn")!;
            loadBtn.addEventListener("click", async () => {
                const keepWatchlist = preserveWatchlistCb ? preserveWatchlistCb.checked : true;
                const ok = await applyTemplateById(tpl.id, keepWatchlist);
                if (ok) {
                    (activeBar.querySelector("#tpl-active-title") as HTMLElement).textContent = activeTemplateName;
                    closeModal();
                }
            });

            // Set Default Action
            const setDefBtn = card.querySelector(".tpl-set-def-btn");
            if (setDefBtn) {
                setDefBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    try {
                        const res = await fetch("/api/templates/set-default", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: tpl.id }),
                        });
                        if (res.ok) {
                            showToast(`"${tpl.name}" is now the default template!`);
                            void loadAndRender();
                        } else {
                            showToast("Failed to set default template", true);
                        }
                    } catch (err: any) {
                        showToast(`Failed to set default template: ${err.message}`, true);
                    }
                });
            }

            // Delete Action
            const delBtn = card.querySelector(".tpl-del-btn");
            if (delBtn) {
                delBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete template "${tpl.name}" from server?`)) {
                        try {
                            const res = await fetch(`/api/templates/${encodeURIComponent(tpl.id)}`, { method: "DELETE" });
                            if (res.ok) {
                                showToast(`Deleted template "${tpl.name}"`);
                                if (tpl.id === activeTemplateId) {
                                    const remaining = allTemplates.filter(t => t.id !== tpl.id);
                                    const fallback = remaining.find(t => t.isDefault) || remaining[0];
                                    if (fallback) {
                                        persistActiveTemplate(fallback.id, fallback.name);
                                    } else {
                                        persistActiveTemplate("custom", "Custom Layout");
                                    }
                                    (activeBar.querySelector("#tpl-active-title") as HTMLElement).textContent = activeTemplateName;
                                }
                                void loadAndRender();
                            } else {
                                showToast("Failed to delete template", true);
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

    const loadAndRender = async () => {
        cardsContainer.innerHTML = '<div style="color: var(--vela-text-secondary, #757882); font-size: 12px; padding: 12px;">Loading templates...</div>';
        allTemplates = await fetchTemplatesList();
        filterTemplates();
    };

    const filterTemplates = () => {
        const query = searchInput.value.trim().toLowerCase();
        if (!query) {
            renderTemplates(allTemplates);
            return;
        }
        const filtered = allTemplates.filter(t => {
            const matchName = t.name.toLowerCase().includes(query);
            const matchSymbols = t.symbols?.some(s => s.toLowerCase().includes(query));
            const matchIndicators = t.indicators?.some(i => i.toLowerCase().includes(query));
            const matchLayout = t.layout.toLowerCase().includes(query);
            return matchName || matchSymbols || matchIndicators || matchLayout;
        });
        renderTemplates(filtered);
    };

    searchInput.addEventListener("input", filterTemplates);
    void loadAndRender();

    // Quick Save (Update Active) button: passes activeTemplateId so server updates existing file
    const quickSaveBtn = activeBar.querySelector("#tpl-quick-save-btn")!;
    quickSaveBtn.addEventListener("click", async () => {
        if (!wsInstance) return;
        const ok = await saveTemplate(activeTemplateName, "User updated template", activeTemplateId);
        if (ok) {
            void loadAndRender();
        }
    });

    // Save As New Template
    const saveNewBtn = saveNewBox.querySelector("#tpl-save-new-btn")!;
    const nameInput = saveNewBox.querySelector("#tpl-new-name-input") as HTMLInputElement;
    saveNewBtn.addEventListener("click", async () => {
        const val = nameInput.value.trim();
        if (!val) {
            showToast("Please enter a template name", true);
            nameInput.focus();
            return;
        }
        const ok = await saveTemplate(val);
        if (ok) {
            nameInput.value = "";
            (activeBar.querySelector("#tpl-active-title") as HTMLElement).textContent = activeTemplateName;
            void loadAndRender();
        }
    });

    // Restore Starter Templates
    const restoreStartersBtn = footerTools.querySelector("#tpl-restore-starters-btn");
    if (restoreStartersBtn) {
        restoreStartersBtn.addEventListener("click", async () => {
            if (confirm("Restore the 4 original starter templates? (Any custom templates you created will NOT be deleted)")) {
                try {
                    const res = await fetch("/api/templates/restore-defaults", { method: "POST" });
                    if (res.ok) {
                        showToast("Starter templates restored!");
                        void loadAndRender();
                    } else {
                        showToast("Failed to restore starter templates", true);
                    }
                } catch (err: any) {
                    showToast(`Failed to restore templates: ${err.message}`, true);
                }
            }
        });
    }

    // Export JSON: downloads full TemplateRecord
    const exportBtn = footerTools.querySelector("#tpl-export-json-btn")!;
    exportBtn.addEventListener("click", () => {
        if (!wsInstance) return;
        const state = wsInstance.getState();
        const exportRecord = {
            id: activeTemplateId,
            name: activeTemplateName,
            description: "Exported Vela template",
            layout: state.layout || "4",
            cellCount: Array.isArray(state.charts) ? state.charts.length : 1,
            exportedAt: Date.now(),
            state,
        };
        const jsonStr = JSON.stringify(exportRecord, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `vela-template-${activeTemplateId}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Exported "${activeTemplateName}" template JSON`);
    });

    // Import JSON: accepts both TemplateRecord and raw WorkspaceState, applies and saves to server
    const importBtn = footerTools.querySelector("#tpl-import-json-btn")!;
    const fileInput = footerTools.querySelector("#tpl-file-input") as HTMLInputElement;
    importBtn.addEventListener("click", () => {
        fileInput.click();
    });
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file || !wsInstance) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const stateToApply = parsed.state || parsed;
            const importedName = parsed.name || file.name.replace(/\.[^/.]+$/, "");

            wsInstance.applyState(stateToApply);
            // Save as a template on server so it persists on LXC 115
            await saveTemplate(importedName, parsed.description || "Imported template JSON", undefined, stateToApply);
            showToast(`Imported and applied "${importedName}"!`);
            closeModal();
        } catch (e: any) {
            showToast(`Failed to parse template JSON: ${e.message}`, true);
        }
        fileInput.value = "";
    });
}
