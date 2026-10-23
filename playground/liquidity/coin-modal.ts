export interface CoinItem {
    coin: string;
    name?: string;
    price?: number;
    tier?: number;
}

export class CoinModal {
    private dialog: HTMLDialogElement | null = null;
    private coins: CoinItem[] = [
        { coin: "BTC", name: "Bitcoin" },
        { coin: "ETH", name: "Ethereum" },
        { coin: "SOL", name: "Solana" },
        { coin: "DOGE", name: "Dogecoin" },
        { coin: "XRP", name: "Ripple" },
        { coin: "BNB", name: "BNB" },
        { coin: "ADA", name: "Cardano" },
        { coin: "AVAX", name: "Avalanche" },
        { coin: "LINK", name: "Chainlink" },
        { coin: "SUI", name: "Sui" },
        { coin: "PEPE", name: "Pepe" },
        { coin: "NEAR", name: "NEAR Protocol" },
        { coin: "APT", name: "Aptos" },
        { coin: "ARB", name: "Arbitrum" },
        { coin: "OP", name: "Optimism" },
    ];
    private onSelect: ((coin: string) => void) | null = null;

    constructor() {
        void this.loadCoinsCatalogue();
    }

    async loadCoinsCatalogue(): Promise<void> {
        try {
            const res = await fetch("/coins.json");
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.coins)) {
                    this.coins = data.coins;
                }
            }
        } catch (_) {}
    }

    open(onSelect: (coin: string) => void): void {
        this.onSelect = onSelect;
        if (!this.dialog) {
            this.dialog = document.createElement("dialog");
            this.dialog.className = "coin-dialog panel";
            this.dialog.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: var(--panel, #111315);
                color: var(--text, #d9e2df);
                border: 1px solid var(--edge, #252b2c);
                border-radius: var(--radius, 3px);
                box-shadow: 4px 4px 0 var(--shadow, rgba(0,0,0,0.4));
                padding: 0;
                width: 420px;
                max-width: 90vw;
                z-index: 10000;
            `;
            document.body.appendChild(this.dialog);

            this.dialog.addEventListener("click", (e) => {
                if (e.target === this.dialog) this.dialog?.close();
            });
        }

        this.renderContent();
        this.dialog.showModal();
        const searchInput = this.dialog.querySelector<HTMLInputElement>(".coin-search-input");
        searchInput?.focus();
    }

    private renderContent(filter: string = ""): void {
        if (!this.dialog) return;

        const q = filter.trim().toLowerCase();
        const popular = ["BTC", "ETH", "SOL", "DOGE", "XRP", "BNB", "AVAX", "LINK", "SUI", "PEPE"];
        const filtered = q
            ? this.coins.filter(c => c.coin.toLowerCase().includes(q) || (c.name && c.name.toLowerCase().includes(q)))
            : this.coins;

        const popularChips = popular.map(c => `
            <button class="chip popular-chip" data-coin="${c}" style="padding: 3px 8px; border: 1px solid var(--line, #252b2c); border-radius: var(--radius, 3px); background: var(--face, #141618); color: var(--text, #d9e2df); cursor: pointer; font-size: 11px; font-weight: 600;">
                ${c}
            </button>
        `).join("");

        const coinRows = filtered.slice(0, 50).map(c => `
            <div class="coin-row" data-coin="${c.coin}" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-radius: var(--radius, 3px); cursor: pointer; transition: background 0.1s;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <strong style="font-size: 12px; color: var(--text, #d9e2df);">${c.coin}</strong>
                    <span style="font-size: 11px; color: var(--muted, #7d8785);">${c.name || ""}</span>
                </div>
                ${c.price ? `<span style="font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text, #d9e2df);">$${c.price.toLocaleString()}</span>` : ""}
            </div>
        `).join("");

        this.dialog.innerHTML = `
            <div class="panel-head" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line, #252b2c); background: var(--title, #17171b);">
                <strong style="font-size: 13px; letter-spacing: 0.02em;">Select Coin</strong>
                <button class="panel-x" style="background: none; border: none; color: var(--text, #d9e2df); cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 6px;">✕</button>
            </div>
            <div style="padding: 10px 14px 6px;">
                <input type="text" class="coin-search-input" value="${filter}" placeholder="Search 150+ coins (BTC, ETH, SOL...)" style="width: 100%; box-sizing: border-box; padding: 6px 10px; background: var(--bg, #0c0c0e); color: var(--text, #d9e2df); border: 1px solid var(--line, #252b2c); border-radius: var(--radius, 3px); font-size: 12px; outline: none;" />
            </div>
            <div style="padding: 4px 14px 8px; display: flex; flex-wrap: wrap; gap: 4px;">
                ${popularChips}
            </div>
            <div class="coin-list" style="padding: 4px 10px 10px; max-height: 280px; overflow-y: auto;">
                ${coinRows || `<div style="text-align: center; padding: 20px; color: var(--muted);">No matching coins</div>`}
            </div>
        `;

        this.dialog.querySelector(".panel-x")?.addEventListener("click", () => this.dialog?.close());

        const input = this.dialog.querySelector<HTMLInputElement>(".coin-search-input");
        input?.addEventListener("input", () => {
            this.renderContent(input.value);
            const newInput = this.dialog?.querySelector<HTMLInputElement>(".coin-search-input");
            newInput?.focus();
            if (newInput) newInput.selectionStart = newInput.selectionEnd = newInput.value.length;
        });

        this.dialog.querySelectorAll<HTMLElement>(".popular-chip, .coin-row").forEach(el => {
            el.addEventListener("click", () => {
                const coin = el.dataset.coin;
                if (coin && this.onSelect) {
                    this.onSelect(coin);
                    this.dialog?.close();
                }
            });
            el.addEventListener("mouseenter", () => {
                el.style.background = "var(--face, rgba(255,255,255,0.06))";
            });
            el.addEventListener("mouseleave", () => {
                el.style.background = el.classList.contains("popular-chip") ? "var(--face, #141618)" : "none";
            });
        });
    }
}
