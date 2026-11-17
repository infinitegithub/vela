import { Dialog, injectStyles } from '../src/ui';
import { registerWidgetAction } from '../src/widget';
import type { WidgetContext } from '../src/widget/WidgetContext';
import { refreshWorkspaceIndicators, getWorkspaceInstance } from './trade-suite';

// ── Default Pine Script Template ─────────────────────────────────────────────
const DEFAULT_PINE_TEMPLATE = `//@version=5
indicator("EMA Ribbon & Trend Cloud", overlay=true)

// Inputs
fastLen = input.int(9, "Fast EMA Length", minval=1)
medLen  = input.int(21, "Medium EMA Length", minval=1)
slowLen = input.int(55, "Slow EMA Length", minval=1)

// Calculations
fast = ta.ema(close, fastLen)
med  = ta.ema(close, medLen)
slow = ta.ema(close, slowLen)

// Plots
plot(fast, "Fast EMA", color=#00e676, linewidth=2)
plot(med, "Medium EMA", color=#ffeb3b, linewidth=2)
plot(slow, "Slow EMA", color=#ff5252, linewidth=2)

// Trend Cloud Fill
fill(plot(fast), plot(med), color=fast > med ? color.new(#00e676, 80) : color.new(#ff5252, 80))
`;

// ── CSS Styles for Pine Script Studio ─────────────────────────────────────────
const PINE_STUDIO_STYLE_ID = 'vela-pine-studio-v5-styles';

const PINE_STUDIO_CSS = `
.vela-dialog.vela-dialog--pine-studio {
    width: 960px;
    max-width: 96vw;
    height: 720px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    background: #14161a;
    border: 1px solid #282a32;
    border-radius: 12px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65), 0 4px 16px rgba(0, 0, 0, 0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #e6edf3;
    overflow: hidden;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.vela-dialog.vela-dialog--pine-studio[data-fullscreen='true'] {
    width: 99vw !important;
    max-width: 99vw !important;
    height: 96vh !important;
    max-height: 96vh !important;
    border-radius: 6px;
}

.pine-studio-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #14161a;
}

/* Header & Sub-toolbar */
.pine-studio-subbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: #181a20;
    border-bottom: 1px solid #262832;
    gap: 12px;
    flex-shrink: 0;
}

.pine-studio-subbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
}

.pine-badge-v5 {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(0, 230, 118, 0.12);
    color: #00e676;
    border: 1px solid rgba(0, 230, 118, 0.3);
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    flex-shrink: 0;
}

.pine-badge-type {
    display: inline-flex;
    align-items: center;
    background: rgba(59, 130, 246, 0.12);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.25);
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
}

.pine-title-input {
    flex: 1;
    max-width: 320px;
    background: #1e2129;
    border: 1px solid #2c303c;
    border-radius: 6px;
    color: #f0f3f6;
    font-size: 12px;
    font-weight: 500;
    padding: 5px 10px;
    outline: none;
    transition: all 0.15s ease;
}

.pine-title-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    background: #232732;
}

.pine-studio-subbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.pine-select-saved {
    background: #1e2129;
    border: 1px solid #2c303c;
    border-radius: 6px;
    color: #e6edf3;
    font-size: 12px;
    padding: 5px 8px;
    outline: none;
    cursor: pointer;
    min-width: 190px;
    max-width: 260px;
}

.pine-btn-sub {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 5px 10px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 5px;
    border: 1px solid #2e3342;
    background: #1f232e;
    color: #c9d1d9;
    transition: all 0.15s ease;
}

.pine-btn-sub:hover {
    background: #282d3b;
    color: #ffffff;
    border-color: #444c60;
}

.pine-btn-icon-sub {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 5px;
    border: 1px solid #2e3342;
    background: #1f232e;
    color: #8b949e;
    transition: all 0.15s ease;
}

.pine-btn-icon-sub:hover {
    background: #282d3b;
    color: #ffffff;
    border-color: #444c60;
}

/* Editor Main Body */
.pine-editor-main {
    flex: 1;
    position: relative;
    display: flex;
    overflow: hidden;
    background: #0f1013;
}

/* Line Numbers Gutter */
.pine-gutter {
    width: 52px;
    flex-shrink: 0;
    background: #14161b;
    border-right: 1px solid #22252e;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
    font-size: 13px;
    line-height: 22px;
    padding: 14px 10px 14px 0;
    text-align: right;
    color: #484f58;
    user-select: none;
    overflow: hidden;
    box-sizing: border-box;
}

/* Code Stage (Syntax & Interactive Layers) */
.pine-code-stage {
    position: relative;
    flex: 1;
    height: 100%;
    overflow: hidden;
}

.pine-highlight-layer {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 14px 18px;
    box-sizing: border-box;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
    font-size: 13px;
    line-height: 22px;
    white-space: pre;
    word-wrap: normal;
    overflow: hidden;
    pointer-events: none;
    color: #e6edf3;
    z-index: 1;
}

.pine-code-input {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 14px 18px;
    box-sizing: border-box;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
    font-size: 13px;
    line-height: 22px;
    white-space: pre;
    word-wrap: normal;
    overflow: auto;
    resize: none;
    background: transparent;
    color: transparent;
    caret-color: #00e676;
    border: none;
    outline: none;
    z-index: 2;
    tab-size: 4;
    -moz-tab-size: 4;
}

/* Custom Scrollbars */
.pine-code-input::-webkit-scrollbar {
    width: 10px;
    height: 10px;
}
.pine-code-input::-webkit-scrollbar-track {
    background: #111317;
}
.pine-code-input::-webkit-scrollbar-thumb {
    background: #252833;
    border-radius: 5px;
    border: 2px solid #111317;
}
.pine-code-input::-webkit-scrollbar-thumb:hover {
    background: #373c4d;
}

/* Status Bar & Footer */
.pine-studio-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 16px;
    background: #181a20;
    border-top: 1px solid #262832;
    gap: 12px;
    flex-shrink: 0;
}

.pine-footer-left {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 11px;
    color: #8b949e;
}

.pine-stat-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: 'JetBrains Mono', Consolas, monospace;
}

.pine-footer-center {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
    padding: 0 10px;
}

.pine-footer-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.pine-btn-compile {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #00e676;
    color: #0c1a12;
    font-weight: 700;
    font-size: 12px;
    padding: 7px 16px;
    border-radius: 6px;
    transition: all 0.15s ease;
    box-shadow: 0 2px 8px rgba(0, 230, 118, 0.25);
}

.pine-btn-compile:hover {
    background: #1eff8a;
    box-shadow: 0 4px 12px rgba(0, 230, 118, 0.4);
    transform: translateY(-1px);
}

.pine-btn-save {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #2563eb;
    color: #ffffff;
    font-weight: 600;
    font-size: 12px;
    padding: 7px 14px;
    border-radius: 6px;
    transition: all 0.15s ease;
}

.pine-btn-save:hover {
    background: #3b82f6;
    transform: translateY(-1px);
}
`;

// ── Real-Time Pine Script v5 Syntax Highlighter ──────────────────────────────
function highlightPineCode(code: string): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return code.split('\n').map((line) => {
        const commentIdx = line.indexOf('//');
        const codePart = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
        const commentPart = commentIdx >= 0 ? line.slice(commentIdx) : '';

        let html = esc(codePart);

        // Strings
        html = html.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '<span style="color:#7ee787;">$&</span>');

        // Pine Built-in Namespaces (ta.*, math.*, color.*, input.*, etc.)
        html = html.replace(/\b(ta|math|color|input|str|array|matrix|map|request|timeframe|syminfo|barstate)\.([a-zA-Z0-9_]+)\b/g, '<span style="color:#79c0ff; font-weight:500;">$1.$2</span>');

        // Keywords & Declarations
        html = html.replace(/\b(indicator|strategy|library|plot|plotshape|plotchar|plotcandle|plotbar|plotarrow|fill|hline|barcolor|bgcolor|alertcondition|var|varip|if|else|for|to|by|while|break|continue|return|switch|type|method|import|export)\b/g, '<span style="color:#ff7b72; font-weight:600;">$1</span>');

        // Built-in Variables & Constants
        html = html.replace(/\b(close|open|high|low|volume|time|hl2|hlc3|ohlc4|na|true|false)\b/g, '<span style="color:#ffa657; font-weight:500;">$1</span>');

        // Hex Colors
        html = html.replace(/(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{8})\b/g, '<span style="color:#e5c07b; text-decoration: underline dotted;">$1</span>');

        // Numbers (integers, floats)
        html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#d2a8ff;">$1</span>');

        if (commentPart) {
            html += `<span style="color:#8b949e; font-style:italic;">${esc(commentPart)}</span>`;
        }

        return html;
    }).join('\n');
}

// ── State Variables ──────────────────────────────────────────────────────────
let pineStudioDialog: Dialog | null = null;
let savedIndicatorsList: Array<{ id: string; name: string; script: string }> = [];
let currentOpenId: string | null = null;

export function openPineStudio(ctx: WidgetContext) {
    const doc = ctx.host.ownerDocument;
    injectStyles(PINE_STUDIO_STYLE_ID, PINE_STUDIO_CSS, doc);

    if (pineStudioDialog) {
        pineStudioDialog.show();
        return;
    }

    const root = doc.createElement('div');
    root.className = 'pine-studio-root';

    // 1. Subbar (Top Controls)
    const subbar = doc.createElement('div');
    subbar.className = 'pine-studio-subbar';

    const subbarLeft = doc.createElement('div');
    subbarLeft.className = 'pine-studio-subbar-left';

    const v5Badge = doc.createElement('span');
    v5Badge.className = 'pine-badge-v5';
    v5Badge.innerHTML = '● PINE v5';

    const typeBadge = doc.createElement('span');
    typeBadge.className = 'pine-badge-type';
    typeBadge.textContent = 'INDICATOR';

    const nameInput = doc.createElement('input');
    nameInput.className = 'pine-title-input';
    nameInput.placeholder = 'Indicator Title (e.g. EMA Ribbon)';
    nameInput.value = 'EMA Ribbon & Trend Cloud';

    subbarLeft.append(v5Badge, typeBadge, nameInput);

    const subbarRight = doc.createElement('div');
    subbarRight.className = 'pine-studio-subbar-right';

    const savedSelect = doc.createElement('select');
    savedSelect.className = 'pine-select-saved';

    const newBtn = doc.createElement('button');
    newBtn.className = 'pine-btn-sub';
    newBtn.textContent = '+ New Script';
    newBtn.title = 'Reset to clean Pine v5 template';

    const deleteBtn = doc.createElement('button');
    deleteBtn.className = 'pine-btn-icon-sub';
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Delete saved indicator';
    deleteBtn.style.display = 'none';

    const fullscreenBtn = doc.createElement('button');
    fullscreenBtn.className = 'pine-btn-icon-sub';
    fullscreenBtn.innerHTML = '⛶';
    fullscreenBtn.title = 'Toggle Fullscreen Studio Canvas';

    subbarRight.append(savedSelect, deleteBtn, newBtn, fullscreenBtn);
    subbar.append(subbarLeft, subbarRight);

    // 2. Editor Main Body (Gutter + Code Layers)
    const editorMain = doc.createElement('div');
    editorMain.className = 'pine-editor-main';

    const gutter = doc.createElement('div');
    gutter.className = 'pine-gutter';

    const stage = doc.createElement('div');
    stage.className = 'pine-code-stage';

    const highlightLayer = doc.createElement('pre');
    highlightLayer.className = 'pine-highlight-layer';
    const highlightCode = doc.createElement('code');
    highlightLayer.appendChild(highlightCode);

    const textarea = doc.createElement('textarea');
    textarea.className = 'pine-code-input';
    textarea.spellcheck = false;
    textarea.wrap = 'off';
    textarea.value = DEFAULT_PINE_TEMPLATE;

    stage.append(highlightLayer, textarea);
    editorMain.append(gutter, stage);

    // 3. Footer Bar (Status, Cursors, Actions)
    const footer = doc.createElement('div');
    footer.className = 'pine-studio-footer';

    const footerLeft = doc.createElement('div');
    footerLeft.className = 'pine-footer-left';

    const posStat = doc.createElement('span');
    posStat.className = 'pine-stat-pill';
    posStat.textContent = 'Ln 1, Col 1';

    const lineStat = doc.createElement('span');
    lineStat.className = 'pine-stat-pill';
    lineStat.textContent = '19 lines';

    const workerStat = doc.createElement('span');
    workerStat.className = 'pine-stat-pill';
    workerStat.style.color = '#79c0ff';
    workerStat.textContent = '⚡ WebWorker Runtime';

    footerLeft.append(posStat, lineStat, workerStat);

    const footerCenter = doc.createElement('div');
    footerCenter.className = 'pine-footer-center';
    footerCenter.style.color = '#8b949e';
    footerCenter.textContent = 'Ready';

    const footerRight = doc.createElement('div');
    footerRight.className = 'pine-footer-right';

    const copyBtn = doc.createElement('button');
    copyBtn.className = 'pine-btn-sub';
    copyBtn.textContent = 'Copy';
    copyBtn.title = 'Copy Pine source code to clipboard';

    const saveBtn = doc.createElement('button');
    saveBtn.className = 'pine-btn-save';
    saveBtn.innerHTML = '★ Save Indicator';
    saveBtn.title = 'Save to custom indicators catalog';

    const compileBtn = doc.createElement('button');
    compileBtn.className = 'pine-btn-compile';
    compileBtn.innerHTML = '▶ Add to Chart';
    compileBtn.title = 'Compile and run on active chart (Ctrl+Enter)';

    footerRight.append(copyBtn, saveBtn, compileBtn);
    footer.append(footerLeft, footerCenter, footerRight);

    root.append(subbar, editorMain, footer);

    // ── Helper Functions ─────────────────────────────────────────────────────────
    const syncEditor = () => {
        const val = textarea.value;
        highlightCode.innerHTML = highlightPineCode(val);

        const lines = val.split('\n');
        lineStat.textContent = `${lines.length} lines · ${val.length} chars`;

        // Update gutter numbers
        gutter.innerHTML = lines.map((_, i) => i + 1).join('<br/>');

        // Detect type
        if (/\bstrategy\s*\(/i.test(val)) {
            typeBadge.textContent = 'STRATEGY';
            typeBadge.style.color = '#f59e0b';
            typeBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            typeBadge.style.background = 'rgba(245, 158, 11, 0.12)';
        } else {
            typeBadge.textContent = 'INDICATOR';
            typeBadge.style.color = '#60a5fa';
            typeBadge.style.borderColor = 'rgba(59, 130, 246, 0.25)';
            typeBadge.style.background = 'rgba(59, 130, 246, 0.12)';
        }
    };

    const updateCursorPos = () => {
        const selStart = textarea.selectionStart;
        const textUpToCursor = textarea.value.substring(0, selStart);
        const lines = textUpToCursor.split('\n');
        const lineNum = lines.length;
        const colNum = lines[lines.length - 1].length + 1;
        posStat.textContent = `Ln ${lineNum}, Col ${colNum}`;
    };

    // Scroll sync
    textarea.addEventListener('scroll', () => {
        highlightLayer.scrollTop = textarea.scrollTop;
        highlightLayer.scrollLeft = textarea.scrollLeft;
        gutter.scrollTop = textarea.scrollTop;
    });

    textarea.addEventListener('input', () => {
        syncEditor();
        updateCursorPos();
    });

    textarea.addEventListener('keyup', updateCursorPos);
    textarea.addEventListener('click', updateCursorPos);

    // Tab key & Keyboard Shortcuts
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 4;
            syncEditor();
            updateCursorPos();
            return;
        }

        // Ctrl+Enter or Cmd+Enter to Run
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            compileBtn.click();
            return;
        }

        // Ctrl+S or Cmd+S to Save
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            saveBtn.click();
            return;
        }
    });

    // Populate Saved Dropdown
    const refreshDropdown = async () => {
        try {
            const res = await fetch('/api/indicators');
            if (res.ok) {
                savedIndicatorsList = await res.json();
            }
        } catch (_) {}

        savedSelect.replaceChildren();
        const defaultOpt = doc.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = `-- Load Saved Indicator (${savedIndicatorsList.length}) --`;
        savedSelect.appendChild(defaultOpt);

        for (const item of savedIndicatorsList) {
            const opt = doc.createElement('option');
            opt.value = item.id;
            opt.textContent = item.name;
            savedSelect.appendChild(opt);
        }

        if (currentOpenId) {
            savedSelect.value = currentOpenId;
            deleteBtn.style.display = 'inline-flex';
        } else {
            deleteBtn.style.display = 'none';
        }
    };

    savedSelect.addEventListener('change', () => {
        const id = savedSelect.value;
        if (!id) {
            deleteBtn.style.display = 'none';
            return;
        }
        const item = savedIndicatorsList.find((x) => x.id === id);
        if (item) {
            currentOpenId = item.id;
            nameInput.value = item.name;
            textarea.value = item.script;
            syncEditor();
            deleteBtn.style.display = 'inline-flex';
            footerCenter.style.color = '#8b949e';
            footerCenter.textContent = `Loaded "${item.name}"`;
        }
    });

    // Delete saved indicator
    deleteBtn.addEventListener('click', async () => {
        if (!currentOpenId) return;
        const item = savedIndicatorsList.find((x) => x.id === currentOpenId);
        if (!confirm(`Delete "${item?.name || currentOpenId}" from indicators library?`)) return;

        try {
            const res = await fetch(`/api/indicators/${encodeURIComponent(currentOpenId)}`, { method: 'DELETE' });
            if (res.ok) {
                footerCenter.style.color = '#00e676';
                footerCenter.textContent = `✓ Deleted indicator`;
                currentOpenId = null;
                nameInput.value = 'Custom Pine Indicator';
                textarea.value = DEFAULT_PINE_TEMPLATE;
                syncEditor();
                await refreshDropdown();
                await refreshWorkspaceIndicators(getWorkspaceInstance());
            } else {
                footerCenter.style.color = '#ff7b72';
                footerCenter.textContent = '✗ Failed to delete indicator';
            }
        } catch (e: any) {
            footerCenter.style.color = '#ff7b72';
            footerCenter.textContent = `✗ ${e.message}`;
        }
    });

    // New Script template
    newBtn.addEventListener('click', () => {
        currentOpenId = null;
        savedSelect.value = '';
        deleteBtn.style.display = 'none';
        nameInput.value = 'Custom Indicator';
        textarea.value = DEFAULT_PINE_TEMPLATE;
        syncEditor();
        updateCursorPos();
        footerCenter.style.color = '#8b949e';
        footerCenter.textContent = 'Loaded default template';
    });

    // Fullscreen toggle
    let isFullscreen = false;
    fullscreenBtn.addEventListener('click', () => {
        isFullscreen = !isFullscreen;
        const panel = pineStudioDialog?.panel;
        if (panel) {
            if (isFullscreen) {
                panel.setAttribute('data-fullscreen', 'true');
                fullscreenBtn.innerHTML = '🗗';
                fullscreenBtn.title = 'Restore Window Size';
            } else {
                panel.removeAttribute('data-fullscreen');
                fullscreenBtn.innerHTML = '⛶';
                fullscreenBtn.title = 'Maximize Fullscreen';
            }
        }
    });

    // Copy action
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(textarea.value).then(() => {
            copyBtn.textContent = '✓ Copied!';
            setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
        });
    });

    // Compile & Run on Chart
    compileBtn.addEventListener('click', async () => {
        const script = textarea.value.trim();
        if (!script) {
            footerCenter.style.color = '#ff7b72';
            footerCenter.textContent = '✗ Script cannot be empty';
            return;
        }

        footerCenter.style.color = '#79c0ff';
        footerCenter.textContent = '⟳ Compiling in PineWorkerEngine...';

        try {
            const res = await ctx.chart.runIndicator(script);
            if (res.ok) {
                footerCenter.style.color = '#00e676';
                footerCenter.textContent = `✓ ${res.handle?.title || 'Indicator'} active on chart!`;
            } else {
                footerCenter.style.color = '#ff7b72';
                footerCenter.textContent = `✗ ${res.error?.message || 'Execution error'}`;
            }
        } catch (err: any) {
            footerCenter.style.color = '#ff7b72';
            footerCenter.textContent = `✗ ${err.message}`;
        }
    });

    // Save Indicator to Library
    saveBtn.addEventListener('click', async () => {
        const script = textarea.value.trim();
        if (!script) {
            footerCenter.style.color = '#ff7b72';
            footerCenter.textContent = '✗ Script cannot be empty';
            return;
        }

        const match = script.match(/(?:indicator|strategy)\s*\(\s*["']([^"']+)["']/);
        let name = nameInput.value.trim() || (match ? match[1] : 'Custom Pine Indicator');

        footerCenter.style.color = '#79c0ff';
        footerCenter.textContent = 'Saving to indicators catalog...';

        try {
            const res = await fetch('/api/indicators', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: currentOpenId || undefined,
                    name,
                    script,
                    language: 'pine',
                    category: 'Custom Indicators',
                }),
            });

            if (res.ok) {
                const data = await res.json();
                footerCenter.style.color = '#00e676';
                footerCenter.textContent = `✓ Saved "${name}" to Indicators catalog!`;
                if (data.indicator?.id) {
                    currentOpenId = data.indicator.id;
                }
                await refreshDropdown();
                await refreshWorkspaceIndicators(getWorkspaceInstance());
            } else {
                footerCenter.style.color = '#ff7b72';
                footerCenter.textContent = '✗ Save failed';
            }
        } catch (e: any) {
            footerCenter.style.color = '#ff7b72';
            footerCenter.textContent = `✗ ${e.message}`;
        }
    });

    // Create the Dialog
    pineStudioDialog = new Dialog({
        title: 'Pine Script® Studio (v5)',
        host: ctx.host,
        draggable: true,
        dimBackdrop: true,
        align: 'center',
        flush: true,
        className: 'vela-dialog--pine-studio',
        closeOnInteractOutside: false,
        content: (body) => body.append(root),
    });

    syncEditor();
    void refreshDropdown();
    pineStudioDialog.show();
    setTimeout(() => textarea.focus(), 60);
}

// ── Register Pine Editor Action ───────────────────────────────────────────────
export function registerPineEditor() {
    registerWidgetAction({
        id: 'pine.editor',
        target: 'topbar',
        align: 'right',
        order: 3,
        label: 'Pine Script',
        icon: 'code',
        iconOnly: true,
        run: (ctx) => {
            openPineStudio(ctx);
        },
    });
}
