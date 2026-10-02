import crypto from 'node:crypto';

const PROD_URL = 'https://fapi.binance.com';
const TEST_URL = 'https://testnet.binancefuture.com';

const DEFAULT_API_KEY = (typeof process !== 'undefined' && process.env?.BINANCE_API_KEY) || 'nXaBUieS5JU1zRTnosAn756scXf1rpUvzj2sJOyZwVBfGVenWjWiYhomaHC8Dfgs';
const DEFAULT_SECRET_KEY = (typeof process !== 'undefined' && process.env?.BINANCE_SECRET_KEY) || 'MOSjJJT5wVZB7KntzS7afPM1ZxmnZ6UbpdsTSajcmxW6JnOFTSwrYsh7g5IjN8te';

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

async function request(baseUrl: string, endpoint: string, method: string = 'GET', data: Record<string, any> = {}, apiKey: string = DEFAULT_API_KEY, secretKey: string = DEFAULT_SECRET_KEY) {
    const url = `${baseUrl}${endpoint}`;
    const timestamp = Date.now();
    const payload = { ...data, timestamp };
    const signedQuery = signQuery(payload, secretKey);

    const headers: Record<string, string> = {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
    };

    let fetchUrl = url;
    let body: string | undefined = undefined;

    if (method === 'GET' || method === 'DELETE') {
        fetchUrl = `${url}?${signedQuery}`;
    } else {
        body = signedQuery;
    }

    const res = await fetch(fetchUrl, {
        method,
        headers,
        body
    });

    const json = await res.json();
    if (!res.ok) {
        throw new Error(json.msg || `Binance HTTP ${res.status}: ${JSON.stringify(json)}`);
    }
    return json;
}

export async function fetchDerivativesStats(symbol: string) {
    const canonical = symbol.replace(/\.P$/i, '').toUpperCase();
    try {
        const [premiumRes, oiRes, tickerRes] = await Promise.all([
            fetch(`${PROD_URL}/fapi/v1/premiumIndex?symbol=${canonical}`).then(r => r.json()),
            fetch(`${PROD_URL}/fapi/v1/openInterest?symbol=${canonical}`).then(r => r.json()),
            fetch(`${PROD_URL}/fapi/v1/ticker/24hr?symbol=${canonical}`).then(r => r.json())
        ]);

        return {
            symbol: canonical,
            markPrice: parseFloat(premiumRes.markPrice || '0'),
            lastPrice: parseFloat(tickerRes.lastPrice || '0'),
            priceChangePercent: parseFloat(tickerRes.priceChangePercent || '0'),
            volume24h: parseFloat(tickerRes.quoteVolume || '0'),
            openInterest: parseFloat(oiRes.openInterest || '0'),
            openInterestValue: parseFloat(oiRes.openInterest || '0') * parseFloat(premiumRes.markPrice || '0'),
            fundingRate: parseFloat(premiumRes.lastFundingRate || '0'),
            nextFundingTime: parseInt(premiumRes.nextFundingTime || '0')
        };
    } catch (e: any) {
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
            error: e.message
        };
    }
}

export async function getAccountInfo(isTestnet: boolean, apiKey?: string, secretKey?: string) {
    const baseUrl = getBaseUrl(isTestnet);
    const key = apiKey || DEFAULT_API_KEY;
    const sec = secretKey || DEFAULT_SECRET_KEY;

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
