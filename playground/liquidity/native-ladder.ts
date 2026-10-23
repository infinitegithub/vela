import { Store, initialState } from '../hlm/app/store.ts';
import { forCoin, currentCoin } from '../hlm/app/coin.ts';
import { loadKernels } from '../hlm/app/kernels.ts';
import { ServerSource } from '../hlm/app/server-source.ts';
import { Hub } from '../hlm/app/hub.ts';
import { LadderPane } from '../hlm/app/panes/ladder-pane.ts';
import { PALETTES } from '../hlm/app/theme.ts';

export class AuthenticLiquidityLadder {
    private host: HTMLElement;
    private store: Store;
    private kernels: any;
    private source: ServerSource;
    private hub: Hub;
    private ladder: LadderPane | null = null;
    private onTickCallback: ((price: number) => void) | null = null;

    constructor(container: HTMLElement, onTick?: (price: number) => void) {
        this.host = container;
        this.host.innerHTML = '';
        this.onTickCallback = onTick || null;

        const initial = forCoin(initialState(), currentCoin().coin);
        // Default to exact settings from user screenshot:
        initial.ladderMode = 'compact';
        initial.ladderShow = 'both'; // Levels + cum
        initial.ladderCurves = 5;    // top 5 venue lines
        initial.pullStack = 0;       // off
        initial.grouping = 0;        // Auto
        initial.show.book = true;

        this.store = new Store(initial);
        this.source = new ServerSource();
        this.hub = new Hub(this.store, this.source);

        void this.boot();
    }

    private async boot() {
        try {
            this.kernels = await loadKernels();
            this.ladder = new LadderPane(this.host, this.store, this.kernels, this.hub);

            // Connect store watching to ladder updates matching LiquidityMapper main.ts
            this.store.watch((state, changed) => {
                if (!this.ladder) return;
                if (changed.has('mark')) {
                    if (state.show.book) this.ladder.markMoved();
                    if (this.onTickCallback && state.mark?.price) {
                        this.onTickCallback(state.mark.price);
                    }
                }
                if (changed.has('levels')) {
                    if (state.show.book) this.ladder.levelsArrived();
                    this.ladder.invalidate();
                    this.ladder.syncVenues();
                }
                if (changed.has('grouping') || changed.has('ladderMode') || changed.has('ladderShow') || 
                    changed.has('ladderCurves') || changed.has('cvd') || changed.has('pullStack') || 
                    changed.has('ladderVenue') || changed.has('ladderVenues') || 
                    changed.has('disabledVenues') || changed.has('scope')) {
                    this.ladder.invalidate();
                    this.ladder.syncControls();
                }
                if (changed.has('theme')) {
                    this.ladder.setPalette(state.theme);
                }
            });

            await this.hub.start();
            this.ladder.syncControls();
            this.ladder.invalidate();
        } catch (e) {
            console.error('[AuthenticLiquidityLadder] Boot error:', e);
        }
    }

    recenter() {
        this.ladder?.recenter();
    }

    setSymbol(sym: string) {
        // When symbol switches in chart
        const base = sym.replace(/USDT$|USD$|-PERP$/, '');
        // In LiquidityMapper, changing coin triggers choice reload
    }

    setTheme(themeName: string) {
        this.store.set({ theme: themeName });
        this.ladder?.setPalette(themeName);
    }
}
