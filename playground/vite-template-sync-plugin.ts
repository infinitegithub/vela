import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

function readJsonBody(req: any): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: any) => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                // If body is raw string, wrap it
                resolve(body ? { raw: body } : {});
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.end(JSON.stringify(data));
}

function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');
}

let cachedCatalog: any = null;

async function fetchLuxSourceCode(slug: string): Promise<{ name?: string; source: string } | null> {
    const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'library_get_source_code',
            arguments: {
                slug,
                context: 'Vela Workstation live indicator runtime compilation'
            }
        }
    };
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch('https://mcp.luxalgo.com/mcp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!resp.ok) return null;
        const text = await resp.text();
        for (const line of text.split('\n')) {
            if (line.startsWith('data: ')) {
                const parsed = JSON.parse(line.slice(6));
                const resText = parsed?.result?.content?.[0]?.text;
                if (resText) {
                    try {
                        const data = JSON.parse(resText);
                        const source = data.source || data.source_code;
                        if (source) {
                            return { name: data.name, source };
                        }
                    } catch {
                        return { source: resText };
                    }
                }
            }
        }
    } catch (e) {
        console.warn(`[lux-mcp] Error fetching source for ${slug}:`, e);
    }
    return null;
}

export function templateSyncPlugin(): Plugin {
    return {
        name: 'template-sync-plugin',
        configureServer(server) {
            const dataDir = path.resolve(process.cwd(), 'data');
            const templatesDir = path.resolve(dataDir, 'templates');
            const workspacesDir = path.resolve(dataDir, 'workspaces');
            const indicatorsDir = path.resolve(dataDir, 'indicators');
            const pineCacheDir = path.resolve(dataDir, 'pine_cache');
            const luxCatalogFile = path.resolve(dataDir, 'luxalgo_catalog.json');

            fs.mkdirSync(templatesDir, { recursive: true });
            fs.mkdirSync(workspacesDir, { recursive: true });
            fs.mkdirSync(indicatorsDir, { recursive: true });
            fs.mkdirSync(pineCacheDir, { recursive: true });

            // Seed default starter templates if empty
            seedDefaultTemplates(templatesDir);
            seedDefaultIndicators(indicatorsDir);

            server.middlewares.use(async (req, res, next) => {
                const url = new URL(req.url || '/', 'http://localhost');

                // Handle CORS preflight
                if (req.method === 'OPTIONS') {
                    if (
                        url.pathname.startsWith('/api/templates') ||
                        url.pathname.startsWith('/api/workspace') ||
                        url.pathname.startsWith('/api/indicators') ||
                        url.pathname.startsWith('/api/lux')
                    ) {
                        res.statusCode = 204;
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.setHeader('Access-Control-Allow-Headers', '*');
                        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                        return res.end();
                    }
                }

                try {
                    // ── Workspace State Endpoints (/api/workspace/:key) ──────────────────
                    if (url.pathname.startsWith('/api/workspace/')) {
                        const key = decodeURIComponent(url.pathname.replace('/api/workspace/', ''));
                        const safeKey = slugify(key) || 'default';
                        const filePath = path.join(workspacesDir, `${safeKey}.json`);

                        if (req.method === 'GET') {
                            if (fs.existsSync(filePath)) {
                                const content = fs.readFileSync(filePath, 'utf-8');
                                res.statusCode = 200;
                                res.setHeader('Content-Type', 'application/json');
                                res.setHeader('Access-Control-Allow-Origin', '*');
                                return res.end(content);
                            } else {
                                return sendJson(res, { error: 'No saved workspace found', key }, 404);
                            }
                        }

                        if (req.method === 'PUT' || req.method === 'POST') {
                            let body = '';
                            req.on('data', (chunk: any) => { body += chunk; });
                            req.on('end', () => {
                                try {
                                    // Validate JSON
                                    JSON.parse(body);
                                    fs.writeFileSync(filePath, body, 'utf-8');
                                    return sendJson(res, { success: true, key, updatedAt: Date.now() });
                                } catch (e: any) {
                                    return sendJson(res, { error: 'Invalid JSON payload: ' + e.message }, 400);
                                }
                            });
                            return;
                        }

                        if (req.method === 'DELETE') {
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                            }
                            return sendJson(res, { success: true, key });
                        }
                    }

                    // ── Indicators Endpoints (/api/indicators) ───────────────────────────
                    if (url.pathname === '/api/indicators' || url.pathname === '/api/indicators/') {
                        if (req.method === 'GET') {
                            const files = fs.readdirSync(indicatorsDir).filter(f => f.endsWith('.json'));
                            const list = files.map(file => {
                                try {
                                    const raw = fs.readFileSync(path.join(indicatorsDir, file), 'utf-8');
                                    const data = JSON.parse(raw);
                                    return {
                                        id: data.id || file.replace('.json', ''),
                                        name: data.name || file.replace('.json', ''),
                                        description: data.description || '',
                                        script: data.script || '',
                                        language: data.language || 'pine',
                                        category: data.category || 'Custom Indicators',
                                        enabled: false,
                                        updatedAt: data.updatedAt || fs.statSync(path.join(indicatorsDir, file)).mtimeMs
                                    };
                                } catch (e) {
                                    return null;
                                }
                            }).filter(Boolean);

                            list.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
                            return sendJson(res, list);
                        }

                        if (req.method === 'POST') {
                            const body = await readJsonBody(req);
                            if (!body.name || !body.script) {
                                return sendJson(res, { error: 'Indicator name and script are required' }, 400);
                            }

                            const safeId = slugify(body.id || body.name);
                            const record = {
                                id: safeId,
                                name: body.name.trim(),
                                description: body.description || '',
                                script: body.script,
                                language: body.language || 'pine',
                                category: body.category || 'Custom Indicators',
                                enabled: false,
                                updatedAt: Date.now()
                            };

                            const filePath = path.join(indicatorsDir, `${safeId}.json`);
                            fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
                            return sendJson(res, { success: true, indicator: record });
                        }
                    }

                    // Single Indicator Endpoint: /api/indicators/:id
                    if (url.pathname.startsWith('/api/indicators/')) {
                        const id = decodeURIComponent(url.pathname.replace('/api/indicators/', ''));
                        const safeId = slugify(id);
                        const filePath = path.join(indicatorsDir, `${safeId}.json`);

                        if (req.method === 'GET') {
                            if (fs.existsSync(filePath)) {
                                const content = fs.readFileSync(filePath, 'utf-8');
                                res.statusCode = 200;
                                res.setHeader('Content-Type', 'application/json');
                                res.setHeader('Access-Control-Allow-Origin', '*');
                                return res.end(content);
                            } else {
                                return sendJson(res, { error: 'Indicator not found', id }, 404);
                            }
                        }

                        if (req.method === 'DELETE') {
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                                return sendJson(res, { success: true, id });
                            } else {
                                return sendJson(res, { error: 'Indicator not found', id }, 404);
                            }
                        }
                    }

                    // ── LuxAlgo Library Endpoints (/api/lux/*) ───────────────────────────
                    if (url.pathname === '/api/lux/catalog' || url.pathname === '/api/lux/catalog/') {
                        if (req.method === 'GET') {
                            if (!cachedCatalog && fs.existsSync(luxCatalogFile)) {
                                try {
                                    cachedCatalog = JSON.parse(fs.readFileSync(luxCatalogFile, 'utf-8'));
                                } catch (e) {
                                    console.warn('[lux-api] Error reading luxalgo_catalog.json:', e);
                                }
                            }
                            return sendJson(res, cachedCatalog || { total: 0, indicators: [] });
                        }
                    }

                    if (url.pathname.startsWith('/api/lux/source/')) {
                        const slug = decodeURIComponent(url.pathname.replace('/api/lux/source/', '')).trim();
                        if (!slug) return sendJson(res, { error: 'Slug required' }, 400);

                        // 1. Check local saved indicators first
                        const savedPath = path.join(indicatorsDir, `${slugify(slug)}.json`);
                        if (fs.existsSync(savedPath)) {
                            try {
                                const savedData = JSON.parse(fs.readFileSync(savedPath, 'utf-8'));
                                if (savedData.script) {
                                    return sendJson(res, {
                                        slug,
                                        name: savedData.name || slug,
                                        source: savedData.script,
                                        language: savedData.language || 'pine',
                                        fromCache: true
                                    });
                                }
                            } catch (_) {}
                        }

                        // 2. Check pine cache directory
                        const cachePath = path.join(pineCacheDir, `${slugify(slug)}.pine`);
                        if (fs.existsSync(cachePath)) {
                            const cachedSource = fs.readFileSync(cachePath, 'utf-8');
                            return sendJson(res, {
                                slug,
                                source: cachedSource,
                                language: 'pine',
                                fromCache: true
                            });
                        }

                        // 3. Query LuxAlgo Library MCP
                        const result = await fetchLuxSourceCode(slug);
                        if (result && result.source) {
                            try {
                                fs.writeFileSync(cachePath, result.source, 'utf-8');
                            } catch (_) {}
                            return sendJson(res, {
                                slug,
                                name: result.name || slug,
                                source: result.source,
                                language: 'pine',
                                fromCache: false
                            });
                        }

                        return sendJson(res, { error: `Source code for "${slug}" not found in LuxAlgo Library` }, 404);
                    }

                    if (url.pathname === '/api/lux/favorite' || url.pathname === '/api/lux/favorite/') {
                        if (req.method === 'POST') {
                            const body = await readJsonBody(req);
                            if (!body.slug || !body.source) {
                                return sendJson(res, { error: 'Slug and source code required' }, 400);
                            }
                            const safeId = slugify(body.slug);
                            const record = {
                                id: safeId,
                                name: body.name || safeId,
                                description: body.description || '',
                                script: body.source,
                                language: body.language || 'pine',
                                category: body.family || 'LuxAlgo Library',
                                enabled: false,
                                updatedAt: Date.now()
                            };
                            const filePath = path.join(indicatorsDir, `${safeId}.json`);
                            fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
                            return sendJson(res, { success: true, indicator: record });
                        }
                    }

                    if (url.pathname.startsWith('/api/lux/favorite/')) {
                        if (req.method === 'DELETE') {
                            const slug = decodeURIComponent(url.pathname.replace('/api/lux/favorite/', '')).trim();
                            const safeId = slugify(slug);
                            const filePath = path.join(indicatorsDir, `${safeId}.json`);
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                                return sendJson(res, { success: true, id: safeId });
                            }
                            return sendJson(res, { error: 'Indicator not found', id: safeId }, 404);
                        }
                    }

                    // ── Templates Endpoints (/api/templates) ─────────────────────────────
                    if (url.pathname === '/api/templates' || url.pathname === '/api/templates/') {
                        if (req.method === 'GET') {
                            const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
                            const list = files.map(file => {
                                try {
                                    const raw = fs.readFileSync(path.join(templatesDir, file), 'utf-8');
                                    const data = JSON.parse(raw);
                                    return {
                                        id: data.id || file.replace('.json', ''),
                                        name: data.name || file.replace('.json', ''),
                                        description: data.description || '',
                                        layout: data.state?.layout || '4',
                                        cellCount: Array.isArray(data.state?.charts) ? data.state.charts.length : 1,
                                        symbols: Array.isArray(data.state?.charts)
                                            ? data.state.charts.map((c: any) => c.symbol).filter(Boolean).slice(0, 4)
                                            : ['BTCUSDT'],
                                        indicators: Array.isArray(data.state?.charts)
                                            ? Array.from(new Set(data.state.charts.flatMap((c: any) => [
                                                ...(Array.isArray(c.indicators?.natives) ? c.indicators.natives.map((n: any) => typeof n === 'string' ? n : n?.type) : []),
                                                ...(Array.isArray(c.indicators?.manifest) ? c.indicators.manifest.map((m: any) => typeof m === 'string' ? m : m?.name) : [])
                                            ]).filter(Boolean))).slice(0, 6)
                                            : [],
                                        updatedAt: data.updatedAt || fs.statSync(path.join(templatesDir, file)).mtimeMs,
                                        isDefault: data.isDefault === true
                                    };
                                } catch (e) {
                                    return null;
                                }
                            }).filter(Boolean);

                            list.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
                            return sendJson(res, list);
                        }

                        if (req.method === 'POST') {
                            const body = await readJsonBody(req);
                            if (!body.name || !body.state) {
                                return sendJson(res, { error: 'Template name and state are required' }, 400);
                            }

                            const id = body.id ? slugify(body.id) : `${slugify(body.name)}-${Date.now().toString(36)}`;
                            const record = {
                                id,
                                name: body.name.trim(),
                                description: body.description || '',
                                state: body.state,
                                updatedAt: Date.now(),
                                isDefault: body.isDefault === true
                            };

                            const filePath = path.join(templatesDir, `${slugify(id)}.json`);
                            const tempPath = path.join(templatesDir, `.${slugify(id)}.tmp.${Date.now()}`);
                            try {
                                fs.writeFileSync(tempPath, JSON.stringify(record, null, 2), 'utf-8');
                                fs.renameSync(tempPath, filePath);
                            } catch (e) {
                                fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
                            }
                            return sendJson(res, { success: true, id, name: record.name, updatedAt: record.updatedAt });
                        }
                    }

                    // Single Template Endpoint: /api/templates/:id
                    if (url.pathname.startsWith('/api/templates/')) {
                        const id = decodeURIComponent(url.pathname.replace('/api/templates/', ''));
                        const safeId = slugify(id);
                        const filePath = path.join(templatesDir, `${safeId}.json`);

                        if (req.method === 'GET') {
                            if (fs.existsSync(filePath)) {
                                const content = fs.readFileSync(filePath, 'utf-8');
                                res.statusCode = 200;
                                res.setHeader('Content-Type', 'application/json');
                                res.setHeader('Access-Control-Allow-Origin', '*');
                                return res.end(content);
                            } else {
                                return sendJson(res, { error: 'Template not found', id }, 404);
                            }
                        }

                        if (req.method === 'DELETE') {
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                                return sendJson(res, { success: true, id });
                            } else {
                                return sendJson(res, { error: 'Template not found', id }, 404);
                            }
                        }
                    }

                    next();
                } catch (err: any) {
                    console.error('[template-sync error]', err);
                    return sendJson(res, { error: err.message || 'Internal error' }, 500);
                }
            });
        }
    };
}

function seedDefaultIndicators(indicatorsDir: string) {
    const defaultIndicator = {
        id: 'ema-ribbon-cloud',
        name: 'EMA Ribbon & Trend Cloud',
        description: 'Multi-period EMA ribbon with dynamic cloud fill',
        script: `//@version=5
indicator("EMA Ribbon & Trend Cloud", overlay=true)

fast = ta.ema(close, 9)
med = ta.ema(close, 21)
slow = ta.ema(close, 55)

plot(fast, "EMA 9", color=#00e676, linewidth=2)
plot(med, "EMA 21", color=#ffeb3b, linewidth=2)
plot(slow, "EMA 55", color=#ff5252, linewidth=2)

fill(plot(fast), plot(med), color=fast > med ? color.new(#00e676, 80) : color.new(#ff5252, 80))
`,
        language: 'pine',
        category: 'Custom Indicators',
        enabled: false,
        updatedAt: Date.now()
    };
    const filePath = path.join(indicatorsDir, `${defaultIndicator.id}.json`);
    if (!fs.existsSync(filePath)) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(defaultIndicator, null, 2), 'utf-8');
        } catch (e) {
            console.error('Failed to write default indicator:', e);
        }
    }
}

function seedDefaultTemplates(templatesDir: string) {
    const defaults = [
        {
            id: 'velo-4cell-trading',
            name: 'Velo 4-Cell Trading (Default)',
            description: '4-chart multi-timeframe grid: BTC 1m, ETH 15m, SOL 1H, BNB 1D with synced crosshairs and volume profiles.',
            isDefault: true,
            updatedAt: Date.now(),
            state: {
                version: 1,
                layout: '4',
                activeCellId: 'btc',
                timezone: 'Etc/UTC',
                sync: { viewport: true, crosshair: true, drawings: true, style: true },
                favorites: ['trendline', 'hline', 'box', 'position', 'anchoredvwap', 'fixedrangevp'],
                timeframeFavorites: ['1', '5', '15', '60', '240', 'D'],
                panels: { open: 'watchlist.panel' },
                charts: [
                    { id: 'btc', symbol: 'BTCUSDT', timeframe: '1', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume'] } },
                    { id: 'eth', symbol: 'ETHUSDT', timeframe: '15', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume', 'rsi'] } },
                    { id: 'sol', symbol: 'SOLUSDT', timeframe: '60', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume', 'ema'] } },
                    { id: 'bnb', symbol: 'BNBUSDT', timeframe: 'D', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume', 'bollinger'] } }
                ]
            }
        },
        {
            id: 'single-chart-deep-dive',
            name: 'Single Chart Deep Dive',
            description: 'Full-screen single chart setup with maximum viewport space for detailed analysis.',
            isDefault: true,
            updatedAt: Date.now() - 1000,
            state: {
                version: 1,
                layout: '1',
                activeCellId: 'c1',
                timezone: 'Etc/UTC',
                favorites: ['trendline', 'hline', 'box', 'position', 'anchoredvwap', 'fixedrangevp'],
                timeframeFavorites: ['1', '5', '15', '60', '240', 'D'],
                panels: {},
                charts: [
                    { id: 'c1', symbol: 'BTCUSDT', timeframe: '1', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume'] } }
                ]
            }
        },
        {
            id: 'dual-split-btc-eth',
            name: 'Dual Split (BTC / ETH)',
            description: '2 side-by-side charts comparing Bitcoin and Ethereum market structures in real time.',
            isDefault: true,
            updatedAt: Date.now() - 2000,
            state: {
                version: 1,
                layout: '2h',
                activeCellId: 'btc',
                timezone: 'Etc/UTC',
                sync: { viewport: true, crosshair: true, drawings: true, style: true },
                favorites: ['trendline', 'hline', 'box', 'position', 'anchoredvwap'],
                timeframeFavorites: ['1', '5', '15', '60', '240', 'D'],
                panels: { open: 'watchlist.panel' },
                charts: [
                    { id: 'btc', symbol: 'BTCUSDT', timeframe: '15', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume', 'ema'] } },
                    { id: 'eth', symbol: 'ETHUSDT', timeframe: '15', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume', 'ema'] } }
                ]
            }
        },
        {
            id: '8-cell-market-overview',
            name: '8-Cell Market Overview',
            description: '8 synchronized charts monitoring the top crypto market leaders simultaneously.',
            isDefault: true,
            updatedAt: Date.now() - 3000,
            state: {
                version: 1,
                layout: '8',
                activeCellId: 'c1',
                timezone: 'Etc/UTC',
                sync: { crosshair: true, timeframe: true },
                favorites: ['trendline', 'hline', 'box'],
                timeframeFavorites: ['1', '5', '15', '60', '240', 'D'],
                panels: { open: 'watchlist.panel' },
                charts: [
                    { id: 'c1', symbol: 'BTCUSDT', timeframe: '15', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume'] } },
                    { id: 'c2', symbol: 'ETHUSDT', timeframe: '15', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume'] } },
                    { id: 'c3', symbol: 'SOLUSDT', timeframe: '15', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume'] } },
                    { id: 'c4', symbol: 'BNBUSDT', timeframe: '15', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume'] } },
                    { id: 'c5', symbol: 'XRPUSDT', timeframe: '15', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume'] } },
                    { id: 'c6', symbol: 'DOGEUSDT', timeframe: '15', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume'] } },
                    { id: 'c7', symbol: 'ADAUSDT', timeframe: '15', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume'] } },
                    { id: 'c8', symbol: 'AVAXUSDT', timeframe: '15', priceStyle: 'candles', indicators: { manifest: [], natives: ['volume'] } }
                ]
            }
        }
    ];

    for (const tpl of defaults) {
        const filePath = path.join(templatesDir, `${tpl.id}.json`);
        if (!fs.existsSync(filePath)) {
            try {
                fs.writeFileSync(filePath, JSON.stringify(tpl, null, 2), 'utf-8');
            } catch (e) {
                console.error('Failed to write default template:', tpl.id, e);
            }
        }
    }
}
