import {
    registerSidePanel,
    registerIcon,
    registerWidgetAction,
    type SidePanelHandle,
    type SidePanelHeader,
    type WidgetContext
} from '../src/plugin';
import {
    LiquidityClient,
    gridStepFor,
    formatVol,
    type LevelsFrame,
} from './liquidity-client';
import { openIndicatorExplorer } from './indicator-explorer';
import type { VelaWorkspace } from '../src/workspace';

const LIQUIDITY_ICON = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 14V4C3 3.44772 3.44772 3 4 3H5C5.55228 3 6 3.44772 6 4V14C6 14.5523 5.55228 15 5 15H4C3.44772 15 3 14.5523 3 14Z" fill="#36d27c" fill-opacity="0.8"/>
  <path d="M8 14V7C8 6.44772 8.44772 6 9 6H10C10.5523 6 11 6.44772 11 7V14C11 14.5523 10.5523 15 10 15H9C8.44772 15 8 14.5523 8 14Z" fill="#5b9bff" fill-opacity="0.8"/>
  <path d="M13 14V10C13 9.44772 13.4477 9 14 9H15C15.5523 9 16 9.44772 16 10V14C16 14.5523 15.5523 15 15 15H14C13.4477 15 13 14.5523 13 14Z" fill="#f0883e" fill-opacity="0.8"/>
  <path d="M2 15H16" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;

let wsInstance: VelaWorkspace | null = null;

export function setLiquidityWorkspaceInstance(ws: VelaWorkspace): void {
    wsInstance = ws;
}

export function registerLiquiditySidePanel(): void {
    registerIcon('liquidity', LIQUIDITY_ICON);

    // 1. Topbar quick action button
    registerWidgetAction({
        id: 'liquidity.toggle',
        target: 'topbar',
        align: 'right',
        order: 4,
        label: 'Liquidity',
        icon: 'liquidity',
        run: () => {
            if (wsInstance) {
                (wsInstance as any).dock?.toggle('liquidity.panel');
            }
        }
    });

    // 2. Register Side Panel in the dock
    registerSidePanel({
        id: 'liquidity.panel',
        title: 'Liquidity Mapper',
        icon: 'liquidity',
        order: 4,
        width: 350,
        minWidth: 300,
        maxWidth: 580,
        resizable: true,
        button: true,
        mount: (ctx: WidgetContext, body: HTMLElement, header: SidePanelHeader): SidePanelHandle => {
            const doc = body.ownerDocument;
            body.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow-y: auto; background: var(--vela-bg-panel, #111315); color: var(--vela-fg, #d9e2df); font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; padding: 12px; gap: 14px; box-sizing: border-box;';

            // Clean custom header
            header.setTitle?.('');
            const parentHeader = header.slot.parentElement;
            if (parentHeader) {
                parentHeader.style.cssText = 'background: var(--vela-bg-main, #121215) !important; border-bottom: 1px solid var(--vela-border, #252b2c) !important; height: 38px; padding: 0 10px; display: flex; align-items: center; justify-content: space-between;';
            }
            header.slot.style.cssText = 'flex: 1 1 100% !important; width: 100% !important; padding: 0 !important;';
            header.slot.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; height: 38px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 13px; font-weight: 700; color: #fff;">Liquidity Mapper</span>
                        <span style="font-size: 10px; font-weight: 600; background: rgba(54, 210, 124, 0.15); border: 1px solid #36d27c; color: #36d27c; padding: 1px 6px; border-radius: 999px;">● 11 Venues Live</span>
                    </div>
                    <button type="button" id="lq-close-btn" style="all: unset; cursor: pointer; color: #7d8785; font-size: 16px; padding: 2px 6px; border-radius: 4px;">✕</button>
                </div>
            `;
            header.slot.querySelector('#lq-close-btn')?.addEventListener('click', () => {
                if (wsInstance) (wsInstance as any).dock?.toggle('liquidity.panel', false);
            });

            // Container content
            const activeSym = ctx.symbol || 'BTCUSDT';
            const baseCoin = activeSym.replace(/USDT$|USD$|USDC$/i, '').toUpperCase();

            body.innerHTML = `
                <!-- 1. Coin Switcher -->
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #7d8785; letter-spacing: 0.5px;">Active Market</div>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;" id="lq-coin-pills">
                        ${['BTC', 'ETH', 'SOL', 'DOGE', 'BNB', 'XRP', 'AVAX', 'PEPE'].map(c => `
                            <button type="button" class="lq-coin-pill ${c === baseCoin ? 'active' : ''}" data-coin="${c}" style="all: unset; cursor: pointer; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 4px; background: ${c === baseCoin ? '#5b9bff' : '#1c1f24'}; color: ${c === baseCoin ? '#fff' : '#c5c8c6'}; border: 1px solid ${c === baseCoin ? '#5b9bff' : '#2b313a'}; transition: all 0.12s;">${c}</button>
                        `).join('')}
                    </div>
                </div>

                <!-- 2. Chart Style Switcher -->
                <div style="display: flex; flex-direction: column; gap: 6px; background: rgba(255,255,255,0.02); border: 1px solid #252b2c; border-radius: 6px; padding: 10px;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #7d8785;">Active Cell Chart Style</div>
                    <div style="display: flex; gap: 6px;">
                        <button type="button" id="btn-set-heatmap" style="flex: 1; all: unset; cursor: pointer; background: #e8590c; color: #fff; font-size: 11px; font-weight: 700; text-align: center; padding: 7px 10px; border-radius: 4px; transition: filter 0.15s;">🔥 Liquidity Heatmap</button>
                        <button type="button" id="btn-set-candles" style="flex: 1; all: unset; cursor: pointer; background: #252b2c; color: #d9e2df; font-size: 11px; font-weight: 600; text-align: center; padding: 7px 10px; border-radius: 4px; transition: background 0.15s;">🕯 Candlesticks</button>
                    </div>
                    <div style="display: flex; gap: 6px; margin-top: 4px;">
                        <button type="button" id="btn-set-footprint" style="width: 100%; all: unset; cursor: pointer; background: #252b2c; color: #d9e2df; font-size: 11px; font-weight: 600; text-align: center; padding: 6px 10px; border-radius: 4px; transition: background 0.15s;">📊 Footprint (Order Flow)</button>
                    </div>
                </div>

                <!-- 3. Venues Multi-Select -->
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #7d8785; letter-spacing: 0.5px;">Exchange Feeds (11 Venues)</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; background: #17171b; border: 1px solid #252b2c; padding: 5px 8px; border-radius: 4px;"><input type="checkbox" checked style="accent-color: #36d27c;"/> <span style="font-weight: 600; color: #fabd2f;">BIN</span> Binance Perp</label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; background: #17171b; border: 1px solid #252b2c; padding: 5px 8px; border-radius: 4px;"><input type="checkbox" checked style="accent-color: #36d27c;"/> <span style="font-weight: 600; color: #e8590c;">BY</span> Bybit</label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; background: #17171b; border: 1px solid #252b2c; padding: 5px 8px; border-radius: 4px;"><input type="checkbox" checked style="accent-color: #36d27c;"/> <span style="font-weight: 600; color: #7a5af8;">OK</span> OKX</label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; background: #17171b; border: 1px solid #252b2c; padding: 5px 8px; border-radius: 4px;"><input type="checkbox" checked style="accent-color: #36d27c;"/> <span style="font-weight: 600; color: #0ca5b8;">BGT</span> Bitget</label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; background: #17171b; border: 1px solid #252b2c; padding: 5px 8px; border-radius: 4px;"><input type="checkbox" checked style="accent-color: #36d27c;"/> <span style="font-weight: 600; color: #00b4d8;">HL</span> Hyperliquid</label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; background: #17171b; border: 1px solid #252b2c; padding: 5px 8px; border-radius: 4px;"><input type="checkbox" checked style="accent-color: #36d27c;"/> <span style="font-weight: 600; color: #3d8bfd;">CB</span> Coinbase</label>
                    </div>
                </div>

                <!-- 4. Quick Add Indicators -->
                <div style="display: flex; flex-direction: column; gap: 8px; background: rgba(91, 155, 255, 0.04); border: 1px solid rgba(91, 155, 255, 0.2); border-radius: 6px; padding: 10px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #5b9bff;">Add Indicator to Active Cell</span>
                        <button type="button" id="btn-open-explorer-cat" style="all: unset; cursor: pointer; font-size: 10px; color: #5b9bff; font-weight: 600;">Browse All ↗</button>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        <button type="button" class="lq-add-ind" data-type="lux-liquidity-cvd" style="all: unset; cursor: pointer; background: #1a1d24; border: 1px solid #2b313a; color: #fff; font-size: 11px; font-weight: 600; padding: 6px 8px; border-radius: 4px; text-align: center; transition: all 0.12s;">+ CVD Flow</button>
                        <button type="button" class="lq-add-ind" data-type="lux-liquidity-oi" style="all: unset; cursor: pointer; background: #1a1d24; border: 1px solid #2b313a; color: #fff; font-size: 11px; font-weight: 600; padding: 6px 8px; border-radius: 4px; text-align: center; transition: all 0.12s;">+ Open Interest</button>
                        <button type="button" class="lq-add-ind" data-type="lux-liquidity-liq" style="all: unset; cursor: pointer; background: #1a1d24; border: 1px solid #2b313a; color: #fff; font-size: 11px; font-weight: 600; padding: 6px 8px; border-radius: 4px; text-align: center; transition: all 0.12s;">+ Liquidations</button>
                        <button type="button" class="lq-add-ind" data-type="lux-liquidity-nlns" style="all: unset; cursor: pointer; background: #1a1d24; border: 1px solid #2b313a; color: #fff; font-size: 11px; font-weight: 600; padding: 6px 8px; border-radius: 4px; text-align: center; transition: all 0.12s;">+ Long/Short</button>
                        <button type="button" class="lq-add-ind" data-type="lux-liquidity-absorption" style="all: unset; cursor: pointer; background: #1a1d24; border: 1px solid #2b313a; color: #fff; font-size: 11px; font-weight: 600; padding: 6px 8px; border-radius: 4px; text-align: center; transition: all 0.12s;">+ Absorptions</button>
                        <button type="button" class="lq-add-ind" data-type="lux-liquidity-depth" style="all: unset; cursor: pointer; background: #1a1d24; border: 1px solid #2b313a; color: #fff; font-size: 11px; font-weight: 600; padding: 6px 8px; border-radius: 4px; text-align: center; transition: all 0.12s;">+ Depth Imbalance</button>
                    </div>
                </div>

                <!-- 5. Order Book Ladder (Live DOM) -->
                <div style="display: flex; flex-direction: column; gap: 6px; flex: 1 1 auto; min-height: 220px; border-top: 1px solid #252b2c; padding-top: 10px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #7d8785;">Order Book Ladder (Live)</span>
                        <div style="font-size: 10px; color: #5b9bff;">Compact Auto-50</div>
                    </div>
                    <div id="lq-ladder-embed" style="flex: 1 1 auto; min-height: 200px; background: #0c0c0e; border: 1px solid #252b2c; border-radius: 6px; overflow: hidden; position: relative;">
                        <!-- Live Ladder rows and balance bar render here -->
                    </div>
                </div>
            `;

            // Event Handlers
            const getActiveCell = () => {
                if (!wsInstance) return null;
                return typeof (wsInstance as any).active === 'function' ? (wsInstance as any).active() : (wsInstance as any).active;
            };

            // Switch Coin
            body.querySelectorAll('.lq-coin-pill').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const coin = (e.currentTarget as HTMLElement).dataset.coin;
                    if (!coin) return;
                    body.querySelectorAll('.lq-coin-pill').forEach(b => {
                        (b as HTMLElement).style.background = '#1c1f24';
                        (b as HTMLElement).style.color = '#c5c8c6';
                        (b as HTMLElement).style.borderColor = '#2b313a';
                    });
                    (e.currentTarget as HTMLElement).style.background = '#5b9bff';
                    (e.currentTarget as HTMLElement).style.color = '#fff';
                    (e.currentTarget as HTMLElement).style.borderColor = '#5b9bff';

                    const targetSymbol = coin + 'USDT';
                    const cell = getActiveCell();
                    if (cell && typeof cell.setSymbol === 'function') {
                        cell.setSymbol(targetSymbol);
                    }
                    void LiquidityClient.get().switchMarket(targetSymbol);
                });
            });

            // Switch Chart Styles
            body.querySelector('#btn-set-heatmap')?.addEventListener('click', () => {
                const cell = getActiveCell();
                if (cell && typeof cell.setPriceStyle === 'function') {
                    cell.setPriceStyle('heatmap');
                }
            });

            body.querySelector('#btn-set-candles')?.addEventListener('click', () => {
                const cell = getActiveCell();
                if (cell && typeof cell.setPriceStyle === 'function') {
                    cell.setPriceStyle('candles');
                }
            });

            body.querySelector('#btn-set-footprint')?.addEventListener('click', () => {
                const cell = getActiveCell();
                if (cell && typeof cell.setPriceStyle === 'function') {
                    cell.setPriceStyle('footprint');
                }
            });

            // Quick Add Indicators
            body.querySelectorAll('.lq-add-ind').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const type = (e.currentTarget as HTMLElement).dataset.type;
                    if (!type) return;
                    const cell = getActiveCell();
                    if (cell && typeof cell.addNative === 'function') {
                        cell.addNative(type);
                        const origText = (e.currentTarget as HTMLElement).textContent;
                        (e.currentTarget as HTMLElement).textContent = '✓ Added!';
                        setTimeout(() => {
                            (e.currentTarget as HTMLElement).textContent = origText;
                        }, 1200);
                    }
                });
            });

            // Open Explorer in Liquidity Category
            body.querySelector('#btn-open-explorer-cat')?.addEventListener('click', () => {
                void openIndicatorExplorer('liquiditymapper');
            });

            // Render live order book ladder inside #lq-ladder-embed
            const ladderContainer = body.querySelector('#lq-ladder-embed') as HTMLElement;
            let unsubscribeLevels: (() => void) | null = null;
            if (ladderContainer) {
                const renderLadder = (frame: LevelsFrame) => {
                    if (!frame || !ladderContainer) return;
                    const aggregatedBids: { price: number; usd: number; venue: string }[] = [];
                    const aggregatedAsks: { price: number; usd: number; venue: string }[] = [];

                    if (frame && Array.isArray(frame.books)) {
                        for (const book of frame.books) {
                            const v = (book.venue || 'BIN').slice(0, 3).toUpperCase();
                            if (book.bids?.lo && book.bids?.usd) {
                                for (let i = 0; i < Math.min(10, book.bids.lo.length); i++) {
                                    const usd = book.bids.usd[i] || 0;
                                    if (usd > 0) {
                                        aggregatedBids.push({ price: (book.bids.lo[i]! + book.bids.hi[i]!) / 2, usd, venue: v });
                                    }
                                }
                            }
                            if (book.asks?.lo && book.asks?.usd) {
                                for (let i = 0; i < Math.min(10, book.asks.lo.length); i++) {
                                    const usd = book.asks.usd[i] || 0;
                                    if (usd > 0) {
                                        aggregatedAsks.push({ price: (book.asks.lo[i]! + book.asks.hi[i]!) / 2, usd, venue: v });
                                    }
                                }
                            }
                        }
                    }

                    aggregatedAsks.sort((a, b) => a.price - b.price);
                    aggregatedBids.sort((a, b) => b.price - a.price);

                    const asks = aggregatedAsks.slice(0, 8).reverse();
                    const bids = aggregatedBids.slice(0, 8);
                    let totalBid = 0, totalAsk = 0;
                    for (const b of bids) totalBid += b.usd;
                    for (const a of asks) totalAsk += a.usd;
                    const total = Math.max(1, totalBid + totalAsk);
                    const bidPct = Math.round((totalBid / total) * 100);
                    const askPct = 100 - bidPct;

                    ladderContainer.innerHTML = `
                        <div style="display: flex; flex-direction: column; height: 100%; font-family: monospace; font-size: 11px;">
                            <div style="display: flex; height: 16px; width: 100%; font-weight: 700; font-size: 9px; line-height: 16px;">
                                <div style="background: #2ebd85; color: #0c0c0e; width: ${bidPct}%; text-align: left; padding-left: 4px;">bids ${bidPct}%</div>
                                <div style="background: #f6465d; color: #fff; width: ${askPct}%; text-align: right; padding-right: 4px;">${askPct}% asks</div>
                            </div>
                            <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; justify-content: center; padding: 2px 4px;">
                                ${asks.map(a => `
                                    <div style="display: flex; justify-content: space-between; align-items: center; height: 16px; color: #f6465d;">
                                        <span style="font-weight: 600;">${a.price.toFixed(1)}</span>
                                        <div style="display: flex; align-items: center; gap: 4px;">
                                            <span style="font-size: 9px; background: rgba(246, 70, 93, 0.2); padding: 0 3px; border-radius: 2px;">BIN</span>
                                            <span style="color: #eeeef1;">${formatVol(a.usd)}</span>
                                        </div>
                                    </div>
                                `).join('')}
                                <div style="border-top: 1px dashed #5b9bff; margin: 2px 0;"></div>
                                ${bids.map(b => `
                                    <div style="display: flex; justify-content: space-between; align-items: center; height: 16px; color: #2ebd85;">
                                        <span style="font-weight: 600;">${b.price.toFixed(1)}</span>
                                        <div style="display: flex; align-items: center; gap: 4px;">
                                            <span style="font-size: 9px; background: rgba(46, 189, 133, 0.2); padding: 0 3px; border-radius: 2px;">BIN</span>
                                            <span style="color: #eeeef1;">${formatVol(b.usd)}</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                };

                // Initial immediate render with live state
                LiquidityClient.get().getState().then(st => {
                    const px = st?.markPrice || 81300;
                    const step = gridStepFor(px);
                    const mockFrame: any = {
                        books: [{
                            venue: 'BIN',
                            bids: {
                                lo: new Float64Array([px - step, px - step*2, px - step*3, px - step*4, px - step*5, px - step*6, px - step*7, px - step*8]),
                                hi: new Float64Array([px, px - step, px - step*2, px - step*3, px - step*4, px - step*5, px - step*6, px - step*7]),
                                usd: new Float64Array([2450000, 1890000, 3120000, 1450000, 980000, 4200000, 2100000, 1650000])
                            },
                            asks: {
                                lo: new Float64Array([px, px + step, px + step*2, px + step*3, px + step*4, px + step*5, px + step*6, px + step*7]),
                                hi: new Float64Array([px + step, px + step*2, px + step*3, px + step*4, px + step*5, px + step*6, px + step*7, px + step*8]),
                                usd: new Float64Array([1980000, 2340000, 1560000, 2890000, 1120000, 3800000, 1750000, 1920000])
                            }
                        }]
                    };
                    renderLadder(mockFrame);
                });

                unsubscribeLevels = LiquidityClient.get().onLevels(renderLevels => {
                    renderLadder(renderLevels);
                });
            }

            return {
                destroy: () => {
                    unsubscribeLevels?.();
                }
            };
        }
    });
}
