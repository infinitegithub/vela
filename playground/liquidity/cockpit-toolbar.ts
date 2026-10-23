import { VenuesModal } from "./venues-modal";
import { CoinModal } from "./coin-modal";
import { applyTheme, THEME_ORDER, PALETTES } from "./theme";

export interface CockpitToolbarOptions {
    activeCoin?: string;
    activeTimeframe?: string;
    activePriceStyle?: string;
    onCoinChange?: (coin: string) => void;
    onTimeframeChange?: (tf: string) => void;
    onPriceStyleChange?: (style: string) => void;
    onToggleBook?: (show: boolean) => void;
    onToggleFlow?: (show: boolean) => void;
    onToggleStats?: (show: boolean) => void;
    onRecenter?: () => void;
    onLayoutChange?: (layout: string) => void;
    onThemeChange?: (theme: string) => void;
}

export class CockpitToolbar {
    private root: HTMLElement;
    private opts: CockpitToolbarOptions;
    private venuesModal = new VenuesModal();
    private coinModal = new CoinModal();

    private coinBtn!: HTMLButtonElement;
    private venuesBtn!: HTMLButtonElement;
    private venuesCountEl!: HTMLElement;
    private tfButtons = new Map<string, HTMLButtonElement>();
    private footprintBtn!: HTMLElement;
    private footprintLed!: HTMLButtonElement;
    private bookToggleBtn!: HTMLButtonElement;
    private flowToggleBtn!: HTMLButtonElement;
    private statsToggleBtn!: HTMLButtonElement;
    private themeSelect!: HTMLSelectElement;

    private isBookOpen = true;
    private isFlowOpen = false;
    private isStatsOpen = false;
    private currentCoin = "BTC";
    private currentTimeframe = "1h";
    private currentPriceStyle = "candles";

    constructor(container: HTMLElement, opts: CockpitToolbarOptions = {}) {
        this.root = container;
        this.opts = opts;
        this.currentCoin = opts.activeCoin || "BTC";
        this.currentTimeframe = opts.activeTimeframe || "1h";
        this.currentPriceStyle = opts.activePriceStyle || "candles";
        this.buildUI();
        this.startVenuesPoll();
    }

    private buildUI(): void {
        this.root.className = "toolbar cockpit";
        this.root.innerHTML = "";

        // 1. Deck Market
        const deckMarket = document.createElement("fieldset");
        deckMarket.className = "deck deck-market";
        deckMarket.innerHTML = `<legend>Market</legend>`;

        const rowMarket1 = document.createElement("div");
        rowMarket1.className = "deck-row";
        this.coinBtn = document.createElement("button");
        this.coinBtn.type = "button";
        this.coinBtn.className = "coin-btn";
        this.coinBtn.style.fontWeight = "700";
        this.coinBtn.textContent = this.currentCoin;
        this.coinBtn.title = "Click to search & switch coin";
        this.coinBtn.addEventListener("click", () => {
            this.coinModal.open((coin) => {
                this.setCoin(coin);
                this.opts.onCoinChange?.(coin);
            });
        });

        const marketSelect = document.createElement("select");
        marketSelect.className = "market";
        marketSelect.innerHTML = `
            <option value="hyperliquid:BTC-PERP">Hyperliquid Perp</option>
            <option value="binance:BTCUSDT">Binance Perp</option>
            <option value="bybit:BTCUSDT">Bybit Linear</option>
            <option value="okx:BTC-USDT-SWAP">OKX Swap</option>
            <option value="binancespot:BTCUSDT">Binance Spot</option>
            <option value="coinbase:BTC-USD">Coinbase Spot</option>
        `;
        rowMarket1.append(this.coinBtn, marketSelect);

        const rowMarket2 = document.createElement("div");
        rowMarket2.className = "deck-row";
        const scopeSeg = document.createElement("div");
        scopeSeg.className = "seg scope";
        scopeSeg.innerHTML = `
            <button type="button" class="on">Perp</button>
            <button type="button">Spot</button>
            <button type="button">Both</button>
        `;
        scopeSeg.querySelectorAll("button").forEach(b => {
            b.addEventListener("click", () => {
                scopeSeg.querySelectorAll("button").forEach(x => x.classList.remove("on"));
                b.classList.add("on");
            });
        });

        this.venuesBtn = document.createElement("button");
        this.venuesBtn.type = "button";
        this.venuesBtn.className = "venues-btn";
        this.venuesBtn.title = "Manage & view exchange venues";
        this.venuesBtn.innerHTML = `Venues <span class="count">8/9 live ●</span>`;
        this.venuesCountEl = this.venuesBtn.querySelector(".count") as HTMLElement;
        this.venuesBtn.addEventListener("click", () => {
            this.venuesModal.open();
        });

        rowMarket2.append(scopeSeg, this.venuesBtn);
        deckMarket.append(rowMarket1, rowMarket2);

        // 2. Deck Time
        const deckTime = document.createElement("fieldset");
        deckTime.className = "deck deck-time";
        deckTime.innerHTML = `<legend>Time</legend>`;

        const rowTime1 = document.createElement("div");
        rowTime1.className = "deck-row";
        const tfSeg = document.createElement("div");
        tfSeg.className = "seg";

        const tfs = ["1s", "5s", "15s", "1m", "5m", "15m", "1h", "4h", "1d"];
        for (const tf of tfs) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = tf;
            if (tf === this.currentTimeframe) btn.classList.add("on");
            btn.addEventListener("click", () => {
                this.setTimeframe(tf);
                this.opts.onTimeframeChange?.(tf);
            });
            this.tfButtons.set(tf, btn);
            tfSeg.appendChild(btn);
        }
        rowTime1.appendChild(tfSeg);

        const rowTime2 = document.createElement("div");
        rowTime2.className = "deck-row";
        const recenterBtn = document.createElement("button");
        recenterBtn.type = "button";
        recenterBtn.textContent = "Recenter";
        recenterBtn.title = "Recenter chart to live edge";
        recenterBtn.addEventListener("click", () => {
            this.opts.onRecenter?.();
        });
        rowTime2.appendChild(recenterBtn);
        deckTime.append(rowTime1, rowTime2);

        // 3. Deck Heatmap
        const deckHeat = document.createElement("fieldset");
        deckHeat.className = "deck deck-heat";
        deckHeat.innerHTML = `<legend>Heatmap</legend>`;

        const rowHeat1 = document.createElement("div");
        rowHeat1.className = "deck-row";
        const heatSource = document.createElement("select");
        heatSource.className = "heat-source";
        heatSource.innerHTML = `
            <option value="agg">Aggregated</option>
            <option value="binance">Binance</option>
            <option value="bybit">Bybit</option>
            <option value="okx">OKX</option>
            <option value="hyperliquid">Hyperliquid</option>
        `;

        const heatStyle = document.createElement("select");
        heatStyle.innerHTML = `
            <option value="magma">Magma</option>
            <option value="inferno">Inferno</option>
            <option value="viridis">Viridis</option>
            <option value="cyberpunk">Cyberpunk</option>
            <option value="copper">Copper</option>
            <option value="ice">Ice</option>
        `;
        rowHeat1.append(heatSource, heatStyle);

        const rowHeat2 = document.createElement("div");
        rowHeat2.className = "deck-row";
        const scaleRange = document.createElement("input");
        scaleRange.type = "range";
        scaleRange.className = "scale";
        scaleRange.min = "1";
        scaleRange.max = "20";
        scaleRange.value = "10";
        scaleRange.title = "Heatmap contrast intensity";
        const autoBtn = document.createElement("button");
        autoBtn.type = "button";
        autoBtn.textContent = "Auto";
        rowHeat2.append(scaleRange, autoBtn);
        deckHeat.append(rowHeat1, rowHeat2);

        // 4. Deck Panels
        const deckPanels = document.createElement("fieldset");
        deckPanels.className = "deck deck-panels";
        deckPanels.innerHTML = `<legend>Panels</legend>`;

        const rowPanels = document.createElement("div");
        rowPanels.className = "deck-row";
        const panelSeg = document.createElement("div");
        panelSeg.className = "seg toggles";

        this.flowToggleBtn = document.createElement("button");
        this.flowToggleBtn.type = "button";
        this.flowToggleBtn.textContent = "Flow";
        this.flowToggleBtn.addEventListener("click", () => {
            this.isFlowOpen = !this.isFlowOpen;
            this.flowToggleBtn.classList.toggle("on", this.isFlowOpen);
            this.opts.onToggleFlow?.(this.isFlowOpen);
        });

        this.bookToggleBtn = document.createElement("button");
        this.bookToggleBtn.type = "button";
        this.bookToggleBtn.textContent = "Book";
        this.bookToggleBtn.classList.add("on");
        this.bookToggleBtn.addEventListener("click", () => {
            this.isBookOpen = !this.isBookOpen;
            this.bookToggleBtn.classList.toggle("on", this.isBookOpen);
            this.opts.onToggleBook?.(this.isBookOpen);
        });

        this.statsToggleBtn = document.createElement("button");
        this.statsToggleBtn.type = "button";
        this.statsToggleBtn.textContent = "Stats";
        this.statsToggleBtn.addEventListener("click", () => {
            this.isStatsOpen = !this.isStatsOpen;
            this.statsToggleBtn.classList.toggle("on", this.isStatsOpen);
            this.opts.onToggleStats?.(this.isStatsOpen);
        });

        const depthBtn = document.createElement("button");
        depthBtn.type = "button";
        depthBtn.textContent = "Depth";

        const oiBtn = document.createElement("button");
        oiBtn.type = "button";
        oiBtn.textContent = "OI";

        const deltaBtn = document.createElement("button");
        deltaBtn.type = "button";
        deltaBtn.textContent = "Delta";

        panelSeg.append(this.flowToggleBtn, this.bookToggleBtn, this.statsToggleBtn, depthBtn, oiBtn, deltaBtn);
        rowPanels.appendChild(panelSeg);
        deckPanels.appendChild(rowPanels);

        // 5. Deck Chart Features (Footprint, Profile, etc.)
        const deckChart = document.createElement("fieldset");
        deckChart.className = "deck deck-chart";
        deckChart.innerHTML = `<legend>Chart</legend>`;

        const rowChart1 = document.createElement("div");
        rowChart1.className = "deck-row";

        // Footprint Split Button
        this.footprintBtn = document.createElement("span");
        this.footprintBtn.className = "split";

        this.footprintLed = document.createElement("button");
        this.footprintLed.type = "button";
        this.footprintLed.className = "led-btn";
        this.footprintLed.dataset.state = this.currentPriceStyle === "footprint" ? "on" : "off";
        this.footprintLed.textContent = "Footprint";
        this.footprintLed.title = "Toggle Footprint Order Flow Cluster View";

        const footprintCfg = document.createElement("button");
        footprintCfg.type = "button";
        footprintCfg.className = "split-cfg";
        footprintCfg.title = "Footprint Settings";

        this.footprintLed.addEventListener("click", () => {
            const next = this.currentPriceStyle === "footprint" ? "candles" : "footprint";
            this.setPriceStyle(next);
            this.opts.onPriceStyleChange?.(next);
        });

        this.footprintBtn.append(this.footprintLed, footprintCfg);

        // Trades / Bubbles
        const tradesBtn = this.createLedButton("Trades", false);
        const liqsBtn = this.createLedButton("Liqs", false);
        const absorpBtn = this.createLedButton("Absorption", false);

        rowChart1.append(this.footprintBtn, tradesBtn, liqsBtn, absorpBtn);

        const rowChart2 = document.createElement("div");
        rowChart2.className = "deck-row";
        const vrvpBtn = this.createLedButton("Profile", true);
        const levelsBtn = this.createLedButton("Levels", false);
        const vwapBtn = this.createLedButton("VWAP", true);

        rowChart2.append(vrvpBtn, levelsBtn, vwapBtn);
        deckChart.append(rowChart1, rowChart2);

        // 6. Deck Tools (Theme, Layouts, Replay)
        const deckTools = document.createElement("fieldset");
        deckTools.className = "deck deck-tools";
        deckTools.innerHTML = `<legend>LiquidityMapper & Vela</legend>`;

        const rowTools1 = document.createElement("div");
        rowTools1.className = "deck-row";

        const layoutBtn = document.createElement("button");
        layoutBtn.type = "button";
        layoutBtn.textContent = "Layouts";
        layoutBtn.addEventListener("click", () => {
            this.opts.onLayoutChange?.("grid");
        });

        const replayBtn = document.createElement("button");
        replayBtn.type = "button";
        replayBtn.textContent = "Replay";

        rowTools1.append(layoutBtn, replayBtn);

        const rowTools2 = document.createElement("div");
        rowTools2.className = "deck-row";

        this.themeSelect = document.createElement("select");
        this.themeSelect.className = "theme-select";
        this.themeSelect.title = "Select authentic palette theme";
        const themes = [
            { id: "darker", label: "Darker" },
            { id: "dark", label: "Dark" },
            { id: "classic", label: "Classic 95" },
            { id: "midnight", label: "Midnight" },
            { id: "terminal", label: "Terminal" },
            { id: "mocha", label: "Mocha" },
            { id: "latte", label: "Latte" },
            { id: "colorblind", label: "Colorblind Safe" }
        ];
        this.themeSelect.innerHTML = themes.map(t => `<option value="${t.id}">${t.label}</option>`).join("");
        this.themeSelect.value = "darker";
        this.themeSelect.addEventListener("change", () => {
            const chosen = this.themeSelect.value;
            applyTheme(chosen);
            this.opts.onThemeChange?.(chosen);
        });

        const fsBtn = document.createElement("button");
        fsBtn.type = "button";
        fsBtn.textContent = "FS";
        fsBtn.title = "Toggle Fullscreen";
        fsBtn.addEventListener("click", () => {
            if (!document.fullscreenElement) {
                void document.documentElement.requestFullscreen();
            } else {
                void document.exitFullscreen();
            }
        });

        rowTools2.append(this.themeSelect, fsBtn);
        deckTools.append(rowTools1, rowTools2);

        // Mount all decks into the Cockpit Toolbar
        this.root.replaceChildren(
            deckMarket,
            deckTime,
            deckHeat,
            deckPanels,
            deckChart,
            deckTools
        );
    }

    private createLedButton(text: string, defaultOn: boolean): HTMLElement {
        const span = document.createElement("span");
        span.className = "split";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "led-btn";
        btn.dataset.state = defaultOn ? "on" : "off";
        btn.textContent = text;
        btn.addEventListener("click", () => {
            btn.dataset.state = btn.dataset.state === "on" ? "off" : "on";
        });
        const cfg = document.createElement("button");
        cfg.type = "button";
        cfg.className = "split-cfg";
        span.append(btn, cfg);
        return span;
    }

    setCoin(coin: string): void {
        this.currentCoin = coin;
        if (this.coinBtn) this.coinBtn.textContent = coin;
    }

    setTimeframe(tf: string): void {
        this.currentTimeframe = tf;
        this.tfButtons.forEach((btn, key) => {
            btn.classList.toggle("on", key === tf);
        });
    }

    setPriceStyle(style: string): void {
        this.currentPriceStyle = style;
        if (this.footprintLed) {
            this.footprintLed.dataset.state = style === "footprint" ? "on" : "off";
        }
    }

    private startVenuesPoll(): void {
        const update = async () => {
            const counts = this.venuesModal.getLiveCount();
            if (this.venuesCountEl) {
                this.venuesCountEl.textContent = `${counts.live}/${counts.total} live ●`;
                this.venuesBtn.dataset.state = counts.live === 0 ? "warn" : "live";
            }
        };
        void update();
        setInterval(update, 5000);
    }
}
