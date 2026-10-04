import crypto from 'node:crypto';
import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';

const PROD_URL = 'https://fapi.binance.com';
const TEST_URL = 'https://testnet.binancefuture.com';

const TEST_API_KEY = (typeof process !== 'undefined' && (process.env?.BINANCE_TESTNET_API_KEY || process.env?.BINANCE_TESTNET_KEY)) || 'nXaBUieS5JU1zRTnosAn756scXf1rpUvzj2sJOyZwVBfGVenWjWiYhomaHC8Dfgs';
const TEST_SECRET_KEY = (typeof process !== 'undefined' && (process.env?.BINANCE_TESTNET_API_SECRET || process.env?.BINANCE_TESTNET_SECRET)) || 'MOSjJJT5wVZB7KntzS7afPM1ZxmnZ6UbpdsTSajcmxW6JnOFTSwrYsh7g5IjN8te';

const PROD_API_KEY = (typeof process !== 'undefined' && (process.env?.BINANCE_PRODUCTION_API_KEY || process.env?.BINANCE_PROD_API_KEY)) || '';
const PROD_SECRET_KEY = (typeof process !== 'undefined' && (process.env?.BINANCE_PRODUCTION_API_SECRET || process.env?.BINANCE_PROD_API_SECRET)) || '';

const OCI_PROXY_URL = (typeof process !== 'undefined' && (process.env?.BINANCE_OCI_PROXY || process.env?.BINANCE_PROXY || process.env?.BINANCE_PROD_PROXY_URL)) || '';
const ociAgent = OCI_PROXY_URL ? new HttpsProxyAgent(OCI_PROXY_URL) : undefined;

function getBaseUrl(isTestnet: boolean): string {
    return isTestnet ? TEST_URL : PROD_URL;
}

function signQuery(queryObj: Record<string, any>, secret: string): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(queryObj)) {
        if (v !== undefined && v !== null && v !== '') {
            params.append(k, String(v));
        }
    }
    const qs = params.toString();
    const signature = crypto.createHmac('sha256', secret).update(qs).digest('hex');
    return `${qs}&signature=${signature}`;
}

async function request(baseUrl: string, endpoint: string, method: string = 'GET', data: Record<string, any> = {}, apiKey?: string, secretKey?: string) {
    const isTestnet = baseUrl.includes('testnet');
    const key = apiKey || (isTestnet ? TEST_API_KEY : PROD_API_KEY);
    const sec = secretKey || (isTestnet ? TEST_SECRET_KEY : PROD_SECRET_KEY);

    if (!isTestnet && (!key || !sec)) {
        throw new Error('Binance production API credentials are not configured. Please set BINANCE_PRODUCTION_API_KEY and BINANCE_PRODUCTION_API_SECRET in your .env file.');
    }

    const timestamp = Date.now();
    const payload = { ...data, timestamp };
    const signedQuery = signQuery(payload, sec);

    const url = new URL(`${baseUrl}${endpoint}`);
    let path = url.pathname;
    let body: string | undefined = undefined;

    if (method === 'GET' || method === 'DELETE') {
        path = `${url.pathname}?${signedQuery}`;
    } else {
        body = signedQuery;
    }

    const headers: Record<string, string> = {
        'X-MBX-APIKEY': key,
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (body) {
        headers['Content-Length'] = String(Buffer.byteLength(body));
    }

    return new Promise((resolve, reject) => {
        const req = https.request({
            host: url.hostname,
            path,
            method,
            headers,
            agent: isTestnet ? undefined : ociAgent
        }, (res) => {
            let resBody = '';
            res.on('data', chunk => resBody += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(resBody);
                    if (res.statusCode && res.statusCode >= 400 || (json.code && json.code < 0)) {
                        return reject(new Error(json.msg || `Binance HTTP ${res.statusCode}: ${resBody}`));
                    }
                    resolve(json);
                } catch (e) {
                    if (res.statusCode && res.statusCode >= 400) {
                        return reject(new Error(`Binance HTTP ${res.statusCode}: ${resBody}`));
                    }
                    resolve(resBody);
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}


export interface SymbolConstraints {
    stepSize: number;
    precision: number;
    minQty: number;
    minNotional: number;
    tickSize: number;
    pricePrecision: number;
}

let exchangeInfoCache: Record<string, SymbolConstraints> = {};
let lastExchangeInfoTime = 0;

export async function getSymbolConstraints(symbol: string): Promise<SymbolConstraints> {
    const canonical = symbol.replace(/\.P$/i, '').toUpperCase();
    const now = Date.now();
    if (Object.keys(exchangeInfoCache).length === 0 || now - lastExchangeInfoTime > 3600000) {
        try {
            const data = await fetch(`${PROD_URL}/fapi/v1/exchangeInfo`).then(r => r.json());
            if (data?.symbols) {
                const map: Record<string, SymbolConstraints> = {};
                for (const s of data.symbols) {
                    const lotFilter = s.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
                    const priceFilter = s.filters?.find((f: any) => f.filterType === 'PRICE_FILTER');
                    const notionalFilter = s.filters?.find((f: any) => f.filterType === 'MIN_NOTIONAL');
                    const stepSize = parseFloat(lotFilter?.stepSize || '0.001');
                    const stepDecimals = lotFilter?.stepSize ? (lotFilter.stepSize.split('.')[1] || '').replace(/0+$/, '').length : 3;
                    const tickSize = parseFloat(priceFilter?.tickSize || '0.1');
                    const priceDecimals = priceFilter?.tickSize ? (priceFilter.tickSize.split('.')[1] || '').replace(/0+$/, '').length : 2;
                    map[s.symbol] = {
                        stepSize,
                        precision: s.quantityPrecision ?? stepDecimals,
                        minQty: parseFloat(lotFilter?.minQty || '0.001'),
                        minNotional: parseFloat(notionalFilter?.notional || '5'),
                        tickSize,
                        pricePrecision: s.pricePrecision ?? priceDecimals
                    };
                }
                exchangeInfoCache = map;
                lastExchangeInfoTime = now;
            }
        } catch (e) {
            console.warn('[binance-service] Failed to fetch exchangeInfo:', e);
        }
    }
    return exchangeInfoCache[canonical] || {
        stepSize: 0.001,
        precision: 3,
        minQty: 0.001,
        minNotional: 5,
        tickSize: 0.1,
        pricePrecision: 2
    };
}

export async function fetchDerivativesStats(symbol: string) {
    const canonical = symbol.replace(/\.P$/i, '').toUpperCase();
    try {
        const [premiumRes, oiRes, tickerRes] = await Promise.all([
            fetch(`${PROD_URL}/fapi/v1/premiumIndex?symbol=${canonical}`).then(r => r.json()),
            fetch(`${PROD_URL}/fapi/v1/openInterest?symbol=${canonical}`).then(r => r.json()),
            fetch(`${PROD_URL}/fapi/v1/ticker/24hr?symbol=${canonical}`).then(r => r.json())
        ]);

        const constraints = await getSymbolConstraints(canonical);
        return {
            symbol: canonical,
            markPrice: parseFloat(premiumRes.markPrice || '0'),
            lastPrice: parseFloat(tickerRes.lastPrice || '0'),
            priceChangePercent: parseFloat(tickerRes.priceChangePercent || '0'),
            volume24h: parseFloat(tickerRes.quoteVolume || '0'),
            openInterest: parseFloat(oiRes.openInterest || '0'),
            openInterestValue: parseFloat(oiRes.openInterest || '0') * parseFloat(premiumRes.markPrice || '0'),
            fundingRate: parseFloat(premiumRes.lastFundingRate || '0'),
            nextFundingTime: parseInt(premiumRes.nextFundingTime || '0'),
            constraints
        };
    } catch (e: any) {
        const constraints = await getSymbolConstraints(canonical);
        return {
            symbol: canonical,
            markPrice: 0,
            lastPrice: 0,
            priceChangePercent: 0,
            volume24h: 0,
            openInterest: 0,
            openInterestValue: 0,
            fundingRate: 0,
            nextFundingTime: 0,
            constraints,
            error: e.message
        };
    }
}

export async function getAccountInfo(isTestnet: boolean, apiKey?: string, secretKey?: string) {
    const baseUrl = getBaseUrl(isTestnet);
    const key = apiKey || (isTestnet ? TEST_API_KEY : PROD_API_KEY);
    const sec = secretKey || (isTestnet ? TEST_SECRET_KEY : PROD_SECRET_KEY);

    const [account, positionsRisk] = await Promise.all([
        request(baseUrl, '/fapi/v2/account', 'GET', {}, key, sec),
        request(baseUrl, '/fapi/v2/positionRisk', 'GET', {}, key, sec)
    ]);

    const activePositions = (positionsRisk || [])
        .filter((p: any) => Math.abs(parseFloat(p.positionAmt || '0')) > 0)
        .map((p: any) => {
            const amt = parseFloat(p.positionAmt);
            const entry = parseFloat(p.entryPrice);
            const mark = parseFloat(p.markPrice);
            const pnl = parseFloat(p.unRealizedProfit);
            const margin = parseFloat(p.initialMargin || '0');
            const roe = margin > 0 ? (pnl / margin) * 100 : 0;
            return {
                symbol: p.symbol,
                side: amt > 0 ? 'LONG' : 'SHORT',
                size: Math.abs(amt),
                entryPrice: entry,
                markPrice: mark,
                liqPrice: parseFloat(p.liquidationPrice || '0'),
                margin,
                pnl,
                roe,
                leverage: parseInt(p.leverage || '20'),
                marginType: p.marginType
            };
        });

    return {
        isTestnet,
        totalWalletBalance: parseFloat(account.totalWalletBalance || '0'),
        totalMarginBalance: parseFloat(account.totalMarginBalance || '0'),
        totalUnrealizedProfit: parseFloat(account.totalUnrealizedProfit || '0'),
        availableBalance: parseFloat(account.availableBalance || '0'),
        positions: activePositions
    };
}

export async function getOpenOrders(symbol?: string, isTestnet: boolean = true, apiKey?: string, secretKey?: string) {
    const baseUrl = getBaseUrl(isTestnet);
    const query: Record<string, any> = {};
    if (symbol) query.symbol = symbol.replace(/\.P$/i, '').toUpperCase();
    return request(baseUrl, '/fapi/v1/openOrders', 'GET', query, apiKey, secretKey);
}

export async function placeOrder(order: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET' | 'STOP_MARKET';
    quantity: number;
    price?: number;
    stopPrice?: number;
    reduceOnly?: boolean;
    takeProfitPrice?: number;
    stopLossPrice?: number;
}, isTestnet: boolean = true, apiKey?: string, secretKey?: string) {
    const baseUrl = getBaseUrl(isTestnet);
    const canonical = order.symbol.replace(/\.P$/i, '').toUpperCase();

    const params: Record<string, any> = {
        symbol: canonical,
        side: order.side,
        type: order.type,
        quantity: order.quantity
    };

    if (order.type === 'LIMIT') {
        params.price = order.price;
        params.timeInForce = 'GTC';
    } else if (order.type === 'STOP_MARKET') {
        params.stopPrice = order.stopPrice;
    }

    if (order.reduceOnly) {
        params.reduceOnly = 'true';
    }

    const mainOrder = await request(baseUrl, '/fapi/v1/order', 'POST', params, apiKey, secretKey);

    const bracketResults: any = { main: mainOrder };

    const oppSide = order.side === 'BUY' ? 'SELL' : 'BUY';
    if (order.takeProfitPrice && order.takeProfitPrice > 0) {
        try {
            bracketResults.tp = await request(baseUrl, '/fapi/v1/order', 'POST', {
                symbol: canonical,
                side: oppSide,
                type: 'TAKE_PROFIT_MARKET',
                stopPrice: order.takeProfitPrice,
                closePosition: 'true'
            }, apiKey, secretKey);
        } catch (e: any) {
            bracketResults.tpError = e.message;
        }
    }

    if (order.stopLossPrice && order.stopLossPrice > 0) {
        try {
            bracketResults.sl = await request(baseUrl, '/fapi/v1/order', 'POST', {
                symbol: canonical,
                side: oppSide,
                type: 'STOP_MARKET',
                stopPrice: order.stopLossPrice,
                closePosition: 'true'
            }, apiKey, secretKey);
        } catch (e: any) {
            bracketResults.slError = e.message;
        }
    }

    return bracketResults;
}

export async function cancelOrder(symbol: string, orderId: number | string, isTestnet: boolean = true, apiKey?: string, secretKey?: string) {
    const baseUrl = getBaseUrl(isTestnet);
    return request(baseUrl, '/fapi/v1/order', 'DELETE', {
        symbol: symbol.replace(/\.P$/i, '').toUpperCase(),
        orderId
    }, apiKey, secretKey);
}

export async function cancelAllOrders(symbol: string, isTestnet: boolean = true, apiKey?: string, secretKey?: string) {
    const baseUrl = getBaseUrl(isTestnet);
    return request(baseUrl, '/fapi/v1/allOpenOrders', 'DELETE', {
        symbol: symbol.replace(/\.P$/i, '').toUpperCase()
    }, apiKey, secretKey);
}

export async function closePositionMarket(symbol: string, side: 'LONG' | 'SHORT', quantity: number, isTestnet: boolean = true, apiKey?: string, secretKey?: string) {
    const baseUrl = getBaseUrl(isTestnet);
    const oppSide = side === 'LONG' ? 'SELL' : 'BUY';
    return request(baseUrl, '/fapi/v1/order', 'POST', {
        symbol: symbol.replace(/\.P$/i, '').toUpperCase(),
        side: oppSide,
        type: 'MARKET',
        quantity,
        reduceOnly: 'true'
    }, apiKey, secretKey);
}

export async function changeLeverage(symbol: string, leverage: number, isTestnet: boolean = true, apiKey?: string, secretKey?: string) {
    const baseUrl = getBaseUrl(isTestnet);
    return request(baseUrl, '/fapi/v1/leverage', 'POST', {
        symbol: symbol.replace(/\.P$/i, '').toUpperCase(),
        leverage
    }, apiKey, secretKey);
}

export async function getOrderHistory(symbol?: string, isTestnet: boolean = true, apiKey?: string, secretKey?: string, limit: number = 50) {
    const baseUrl = getBaseUrl(isTestnet);
    const query: Record<string, any> = { limit };
    if (symbol) query.symbol = symbol.replace(/\.P$/i, "").toUpperCase();
    return request(baseUrl, "/fapi/v1/allOrders", "GET", query, apiKey, secretKey);
}

export async function getUserTrades(symbol?: string, isTestnet: boolean = true, apiKey?: string, secretKey?: string, limit: number = 50) {
    const baseUrl = getBaseUrl(isTestnet);
    const query: Record<string, any> = { limit };
    if (symbol) query.symbol = symbol.replace(/\.P$/i, "").toUpperCase();
    return request(baseUrl, "/fapi/v1/userTrades", "GET", query, apiKey, secretKey);
}


export async function changeMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED', isTestnet: boolean = true, apiKey?: string, secretKey?: string) {
    const baseUrl = getBaseUrl(isTestnet);
    try {
        return await request(baseUrl, '/fapi/v1/marginType', 'POST', {
            symbol: symbol.replace(/\.P$/i, '').toUpperCase(),
            marginType
        }, apiKey, secretKey);
    } catch (err: any) {
        if (err.message && (err.message.includes('-4046') || err.message.includes('No need to change'))) {
            return { code: 200, msg: `Margin type is already ${marginType}` };
        }
        throw err;
    }
}
