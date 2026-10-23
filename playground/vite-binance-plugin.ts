import type { Plugin } from 'vite';
import {
    fetchDerivativesStats,
    getAccountInfo,
    getOpenOrders,
    getOrderHistory,
    getUserTrades,
    placeOrder,
    cancelOrder,
    cancelAllOrders,
    closePositionMarket,
    changeLeverage,
    changeMarginType,
    replaceBracketOrder
} from './binance-service';

function readJsonBody(req: any): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: any) => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res: any, data: any, status: number = 200) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.end(JSON.stringify(data));
}

// ── Live Market Quotes Service (Yahoo Finance) ──────────────────────────────
async function fetchMarketQuotes(symbolList: string[]): Promise<Record<string, any>> {
    const symbolMap: Record<string, string> = {
        'EURUSD': 'EURUSD=X',
        'XAUUSD': 'GC=F',
        'SPY': 'SPY',
        'QQQ': 'QQQ',
    };
    const results: Record<string, any> = {};

    await Promise.all(
        symbolList.map(async (rawSym) => {
            const sym = rawSym.trim().toUpperCase();
            const querySym = symbolMap[sym] || sym;
            try {
                const resp = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(querySym)}?interval=1d&range=1d`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                    signal: AbortSignal.timeout(6000),
                });
                if (resp.ok) {
                    const json = await resp.json();
                    const meta = json?.chart?.result?.[0]?.meta;
                    if (meta) {
                        const price = meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0;
                        const prev = meta.chartPreviousClose ?? price;
                        const change = price - prev;
                        const changePercent = prev ? (change / prev) * 100 : 0;
                        results[sym] = {
                            symbol: sym,
                            price: parseFloat(price.toFixed(sym === 'EURUSD' ? 4 : 2)),
                            change: parseFloat(change.toFixed(sym === 'EURUSD' ? 4 : 2)),
                            changePercent: parseFloat(changePercent.toFixed(2)),
                            high: parseFloat((meta.regularMarketDayHigh ?? price).toFixed(sym === 'EURUSD' ? 4 : 2)),
                            low: parseFloat((meta.regularMarketDayLow ?? price).toFixed(sym === 'EURUSD' ? 4 : 2)),
                            open: parseFloat((meta.regularMarketDayLow ?? prev).toFixed(sym === 'EURUSD' ? 4 : 2)),
                            volume: meta.regularMarketVolume ?? 0,
                            prevClose: prev,
                        };
                    }
                }
            } catch (e) {
                // Silently handle offline/timeouts
            }
        })
    );

    return results;
}

// ── Live Market News Service ────────────────────────────────────────────────
async function fetchMarketNews(symbol: string): Promise<any[]> {
    const cleanSym = symbol.replace(/USDT(\.P)?$/, '').replace(/-USD$/, '').replace(/\.P$/, '').trim().toUpperCase();
    let category = 'crypto';
    if (['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META'].includes(cleanSym)) category = 'stock';
    else if (['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD'].includes(cleanSym)) category = 'forex';
    else if (['XAUUSD', 'XAGUSD', 'WTI'].includes(cleanSym)) category = 'commodity';

    const tickerParam = `${cleanSym === 'BTC' ? 'BTCUSD' : cleanSym === 'ETH' ? 'ETHUSD' : cleanSym === 'SOL' ? 'SOLUSD' : cleanSym}:${category}`;
    try {
        const resp = await fetch(`https://vela.luxalgo.com/api/markets/public-get-ticker-news?symbols=${encodeURIComponent(tickerParam)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(6000),
        });
        if (resp.ok) {
            const data = await resp.json();
            return data?.data?.articles || [];
        }
    } catch (e) {
        // Fallback
    }
    return [];
}

// ── Symbol Search Service ───────────────────────────────────────────────────
async function searchMarketSymbols(query: string): Promise<any[]> {
    if (!query || query.length < 2) return [];
    try {
        const resp = await fetch(`https://vela.luxalgo.com/api/markets/public-get-market-list?query=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(6000),
        });
        if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data)) return data;
        }
    } catch (e) {
        // Fallback
    }
    return [];
}

export function binanceApiPlugin(): Plugin {
    return {
        name: 'binance-api-plugin',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const url = new URL(req.url || '/', 'http://localhost');
                if (!url.pathname.startsWith('/api/binance/') && !url.pathname.startsWith('/api/markets/')) {
                    return next();
                }

                if (req.method === 'OPTIONS') {
                    res.statusCode = 204;
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Headers', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                    return res.end();
                }

                // ── Public Markets Endpoints ─────────────────────────────────────────
                if (url.pathname === '/api/markets/quotes') {
                    const symbolsParam = url.searchParams.get('symbols') || 'NVDA,AAPL,TSLA,EURUSD,XAUUSD';
                    const list = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);
                    const quotes = await fetchMarketQuotes(list);
                    return sendJson(res, quotes);
                }

                if (url.pathname === '/api/markets/news') {
                    const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
                    const articles = await fetchMarketNews(symbol);
                    return sendJson(res, { articles });
                }

                if (url.pathname === '/api/markets/search') {
                    const query = url.searchParams.get('query') || url.searchParams.get('q') || '';
                    const results = await searchMarketSymbols(query);
                    return sendJson(res, results);
                }

                // Defense-in-depth: If request arrives via Cloudflare Zero Trust, verify authorized email
                const cfEmail = req.headers['cf-access-authenticated-user-email'];
                if (cfEmail && cfEmail !== 'es@viffey.com') {
                    console.warn(`[binance-api] Blocked unauthorized CF Access operator: ${cfEmail}`);
                    return sendJson(res, { error: 'Unauthorized operator' }, 403);
                }

                const testnet = url.searchParams.get('testnet') !== 'false';
                const symbol = url.searchParams.get('symbol') || undefined;

                try {
                    if (url.pathname === '/api/binance/stats') {
                        const stats = await fetchDerivativesStats(symbol);
                        return sendJson(res, stats);
                    }

                    if (url.pathname === '/api/binance/account') {
                        try {
                            const account = await getAccountInfo(testnet);
                            return sendJson(res, account);
                        } catch {
                            return sendJson(res, { balances: [], totalWalletBalance: '0', availableBalance: '0' });
                        }
                    }

                    if (url.pathname === '/api/binance/orders') {
                        const orders = await getOpenOrders(symbol, testnet);
                        return sendJson(res, orders);
                    }

                    if (url.pathname === '/api/binance/order-history') {
                        const history = await getOrderHistory(symbol, testnet);
                        return sendJson(res, history);
                    }

                    if (url.pathname === '/api/binance/trade-history') {
                        const trades = await getUserTrades(symbol, testnet);
                        return sendJson(res, trades);
                    }

                    if (url.pathname === '/api/binance/order/replace-bracket' && req.method === 'POST') {
                        const body = await readJsonBody(req);
                        const result = await replaceBracketOrder({
                            symbol: body.symbol,
                            side: body.side,
                            orderType: body.orderType,
                            oldOrderId: body.oldOrderId,
                            oldPrice: body.oldPrice,
                            newPrice: body.newPrice,
                            isTestnet: body.testnet !== false
                        });
                        return sendJson(res, result);
                    }

                    if (url.pathname === '/api/binance/order' && req.method === 'POST') {
                        const body = await readJsonBody(req);
                        const result = await placeOrder(body, body.testnet !== false);
                        return sendJson(res, result);
                    }

                    if (url.pathname === '/api/binance/order/cancel' && req.method === 'POST') {
                        const body = await readJsonBody(req);
                        const result = await cancelOrder(body.symbol, body.orderId, body.testnet !== false);
                        return sendJson(res, result);
                    }

                    if (url.pathname === '/api/binance/order/cancel-all' && req.method === 'POST') {
                        const body = await readJsonBody(req);
                        const result = await cancelAllOrders(body.symbol, body.testnet !== false);
                        return sendJson(res, result);
                    }

                    if (url.pathname === '/api/binance/position/close' && req.method === 'POST') {
                        const body = await readJsonBody(req);
                        const result = await closePositionMarket(body.symbol, body.side, body.quantity, body.testnet !== false);
                        return sendJson(res, result);
                    }

                    if (url.pathname === '/api/binance/margin-type' && req.method === 'POST') {
                        const body = await readJsonBody(req);
                        const result = await changeMarginType(body.symbol, body.marginType, body.testnet !== false);
                        return sendJson(res, result);
                    }

                    if (url.pathname === '/api/binance/leverage' && req.method === 'POST') {
                        const body = await readJsonBody(req);
                        const result = await changeLeverage(body.symbol, body.leverage, body.testnet !== false);
                        return sendJson(res, result);
                    }

                    return sendJson(res, { error: 'Endpoint not found' }, 404);
                } catch (err: any) {
                    console.error('[binance-api error]', err);
                    return sendJson(res, { error: err.message || 'Internal error' }, 500);
                }
            });
        }
    };
}
