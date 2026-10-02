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
    changeLeverage
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.end(JSON.stringify(data));
}

export function binanceApiPlugin(): Plugin {
    return {
        name: 'binance-api-plugin',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const url = new URL(req.url || '/', 'http://localhost');
                if (!url.pathname.startsWith('/api/binance/')) {
                    return next();
                }

                if (req.method === 'OPTIONS') {
                    res.statusCode = 204;
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Headers', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                    return res.end();
                }

                const testnet = url.searchParams.get('testnet') !== 'false';
                const symbol = url.searchParams.get('symbol') || 'BTCUSDT';

                try {
                    if (url.pathname === '/api/binance/stats') {
                        const stats = await fetchDerivativesStats(symbol);
                        return sendJson(res, stats);
                    }

                    if (url.pathname === '/api/binance/account') {
                        const account = await getAccountInfo(testnet);
                        return sendJson(res, account);
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
