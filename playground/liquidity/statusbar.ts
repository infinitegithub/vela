export class StatusBarController {
    private root: HTMLElement;
    private connEl!: HTMLElement;
    private venuesEl!: HTMLElement;
    private markEl!: HTMLElement;
    private latencyEl!: HTMLElement;
    private sourceEl!: HTMLElement;
    private themeBadgeEl!: HTMLElement;

    private markPrice: number = 0;
    private activeTheme: string = "Darker";
    private liveVenues: number = 8;
    private totalVenues: number = 9;

    constructor(container: HTMLElement) {
        this.root = container;
        this.buildUI();
    }

    private buildUI(): void {
        this.root.className = "statusbar";
        this.root.style.cssText = `
            display: flex;
            align-items: center;
            gap: 16px;
            min-height: 24px;
            padding: 2px 14px;
            border-top: 1px solid var(--line, #252b2c);
            background: var(--panel, #111315);
            font-size: 11px;
            color: var(--muted, #7d8785);
            user-select: none;
            z-index: 10;
        `;

        this.connEl = document.createElement("span");
        this.connEl.className = "status-item status-conn";
        this.connEl.dataset.state = "live";
        this.connEl.textContent = "Live Stream";

        this.venuesEl = document.createElement("span");
        this.venuesEl.className = "status-item status-venues";
        this.venuesEl.textContent = `${this.liveVenues}/${this.totalVenues} Venues Connected`;

        this.markEl = document.createElement("span");
        this.markEl.className = "status-item status-mark";
        this.markEl.style.fontWeight = "600";
        this.markEl.style.color = "var(--text, #d9e2df)";
        this.markEl.textContent = "Mark: —";

        this.latencyEl = document.createElement("span");
        this.latencyEl.className = "status-item";
        this.latencyEl.textContent = "Ping: 14ms";

        const spacer = document.createElement("div");
        spacer.className = "spacer";
        spacer.style.flex = "1";

        this.sourceEl = document.createElement("span");
        this.sourceEl.className = "status-item";
        this.sourceEl.textContent = "Backend: Server (Port 8787)";

        this.themeBadgeEl = document.createElement("span");
        this.themeBadgeEl.className = "status-item";
        this.themeBadgeEl.style.color = "var(--ui, #5b9bff)";
        this.themeBadgeEl.textContent = `Theme: ${this.activeTheme}`;

        this.root.replaceChildren(
            this.connEl,
            this.venuesEl,
            this.markEl,
            this.latencyEl,
            spacer,
            this.sourceEl,
            this.themeBadgeEl
        );
    }

    updateMark(price: number): void {
        if (!price) return;
        this.markPrice = price;
        this.markEl.textContent = `Mark: $${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    updateVenues(live: number, total: number): void {
        this.liveVenues = live;
        this.totalVenues = total;
        this.venuesEl.textContent = `${live}/${total} Venues Live`;
        this.venuesEl.dataset.state = live === 0 ? "none" : live < total ? "some" : "live";
    }

    updateTheme(themeName: string): void {
        this.activeTheme = themeName;
        this.themeBadgeEl.textContent = `Theme: ${themeName}`;
    }

    updateLatency(ms: number): void {
        this.latencyEl.textContent = `Ping: ${ms}ms`;
    }
}
