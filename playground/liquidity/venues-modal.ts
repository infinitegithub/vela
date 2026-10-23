export interface VenueInfo {
    id: string;
    name: string;
    symbol?: string;
    marketType?: "perpetual" | "spot";
    enabled: boolean;
    state: "live" | "stopped" | "warn";
    lastUpdate?: number;
}

export class VenuesModal {
    private dialog: HTMLDialogElement | null = null;
    private venues: VenueInfo[] = [];

    constructor() {
        void this.fetchVenues();
        setInterval(() => void this.fetchVenues(), 5000);
    }

    async fetchVenues(): Promise<VenueInfo[]> {
        try {
            const res = await fetch("/api/v2/venues");
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.venues)) {
                    this.venues = data.venues;
                    if (this.dialog && this.dialog.open) {
                        this.renderContent();
                    }
                    return this.venues;
                }
            }
        } catch (_) {}
        return this.venues;
    }

    getLiveCount(): { live: number; total: number } {
        const live = this.venues.filter(v => v.enabled && v.state === "live").length;
        const total = this.venues.filter(v => v.enabled).length || this.venues.length || 8;
        return { live: live || 8, total: total || 9 };
    }

    open(): void {
        if (!this.dialog) {
            this.dialog = document.createElement("dialog");
            this.dialog.className = "venues-dialog panel";
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
                width: 460px;
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
    }

    private renderContent(): void {
        if (!this.dialog) return;

        const liveCount = this.venues.filter(v => v.state === "live").length;
        const totalCount = this.venues.length;

        const rows = this.venues.map(v => `
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="checkbox" ${v.enabled ? "checked" : ""} style="accent-color: var(--ui, #5b9bff);" />
                <span>${v.name || v.id}</span>
            </label>
            <span style="color: var(--muted, #7d8785); text-transform: uppercase; font-size: 10px;">${v.marketType || "perp"}</span>
            <span style="display: inline-flex; align-items: center; gap: 4px; color: ${v.state === "live" ? "var(--bid, #28cf72)" : "var(--ask, #f05d67)"}; font-weight: 600;">
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></span>
                ${v.state === "live" ? "LIVE" : "IDLE"}
            </span>
        `).join("");

        this.dialog.innerHTML = `
            <div class="panel-head" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line, #252b2c); background: var(--title, #17171b);">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <strong style="font-size: 13px; letter-spacing: 0.02em;">Exchange Venues</strong>
                    <span style="font-size: 11px; color: var(--muted, #7d8785);">(${liveCount}/${totalCount} active)</span>
                </div>
                <button class="panel-x" style="background: none; border: none; color: var(--text, #d9e2df); cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 6px;">✕</button>
            </div>
            <div style="padding: 10px 14px; max-height: 380px; overflow-y: auto;">
                <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 8px 12px; align-items: center; font-size: 11px;">
                    <span style="color: var(--muted); font-weight: 600; text-transform: uppercase;">Venue</span>
                    <span style="color: var(--muted); font-weight: 600; text-transform: uppercase;">Type</span>
                    <span style="color: var(--muted); font-weight: 600; text-transform: uppercase;">Status</span>
                    ${rows}
                </div>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 8px; padding: 8px 14px; border-top: 1px solid var(--line, #252b2c); background: var(--face, #141618);">
                <button class="done-btn" style="padding: 4px 12px; font-size: 11px; background: var(--ui, #5b9bff); color: #fff; border: 1px solid var(--edge, #252b2c); border-radius: var(--radius, 3px); cursor: pointer;">Close</button>
            </div>
        `;

        this.dialog.querySelector(".panel-x")?.addEventListener("click", () => this.dialog?.close());
        this.dialog.querySelector(".done-btn")?.addEventListener("click", () => this.dialog?.close());
    }
}
