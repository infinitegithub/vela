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
        transform(code, id) {
            if (id.includes('client.mjs') || id.includes('@vite/client')) {
                return code.replace(
                    /await waitForSuccessfulPing\(url\.href\);\s*location\.reload\(\);/g,
                    'await waitForSuccessfulPing(url.href); console.log("[vite] server connection restored (reload suppressed to protect active charts).");'
                );
            }
        },
        configureServer(server) {
            const dataDir = path.resolve(process.cwd(), 'data');
            const templatesDir = path.resolve(dataDir, 'templates');
            const workspacesDir = path.resolve(dataDir, 'workspaces');
            const indicatorsDir = path.resolve(dataDir, 'indicators');
            const pineCacheDir = path.resolve(dataDir, 'pine_cache');
            const luxCatalogFile = path.resolve(dataDir, 'luxalgo_catalog.json');
            const workspacesListFile = path.resolve(dataDir, 'workspaces.json');
            const indicatorTemplatesFile = path.resolve(dataDir, 'indicator_templates.json');
            const watchlistFile = path.resolve(dataDir, 'watchlist.json');
            const indicatorFavoritesFile = path.resolve(dataDir, 'indicator_favorites.json');
            const alertsFile = path.resolve(dataDir, 'alerts.json');

            fs.mkdirSync(templatesDir, { recursive: true });
            fs.mkdirSync(workspacesDir, { recursive: true });
            fs.mkdirSync(indicatorsDir, { recursive: true });
            fs.mkdirSync(pineCacheDir, { recursive: true });

            // Seed default starter templates if empty
            seedDefaultTemplates(templatesDir);
            seedDefaultIndicators(indicatorsDir);
            seedDefaultIndicatorTemplates(indicatorTemplatesFile);
            seedDefaultWatchlist(watchlistFile, workspacesDir);

            server.middlewares.use(async (req, res, next) => {
                const url = new URL(req.url || '/', 'http://localhost');

                // Handle CORS preflight
                if (req.method === 'OPTIONS') {
                    if (
                        url.pathname.startsWith('/api/templates') ||
                        url.pathname.startsWith('/api/workspace') ||
                        url.pathname.startsWith('/api/workspaces') ||
                        url.pathname.startsWith('/api/indicators') ||
                        url.pathname.startsWith('/api/indicator-templates') ||
                        url.pathname.startsWith('/api/indicator-favorites') ||
                        url.pathname.startsWith('/api/quant/indicator-favorites') ||
                        url.pathname.startsWith('/api/watchlist') ||
                        url.pathname.startsWith('/api/alerts') ||
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
                    // ── Heartbeat endpoint (/api/ping) ──────────────────────────────────
                    if (url.pathname === '/api/ping') {
                        res.statusCode = 204;
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.setHeader('Cache-Control', 'no-cache, no-store');
                        return res.end();
                    }

                    // ── Multi-Workspace Profiles Endpoints (/api/workspaces) ───────────
                    if (url.pathname === '/api/workspaces' || url.pathname === '/api/workspaces/') {
                        if (req.method === 'GET') {
                            if (fs.existsSync(workspacesListFile)) {
                                try {
                                    const data = JSON.parse(fs.readFileSync(workspacesListFile, 'utf-8'));
                                    return sendJson(res, data);
                                } catch (e) {
                                    console.error('Failed to read workspaces.json:', e);
                                }
                            }
                            // Seed default from vela-workspace.json if available
                            const velaWsPath = path.join(workspacesDir, 'vela-workspace.json');
                            let defaultDoc: any = null;
                            if (fs.existsSync(velaWsPath)) {
                                try { defaultDoc = JSON.parse(fs.readFileSync(velaWsPath, 'utf-8')); } catch (_) {}
                            }
                            const initial = {
                                activeId: 'default',
                                updatedAt: Date.now(),
                                workspaces: [
                                    {
                                        id: 'default',
                                        name: 'Default Workspace',
                                        updatedAt: new Date().toISOString(),
                                        document: defaultDoc,
                                    }
                                ]
                            };
                            try {
                                fs.writeFileSync(workspacesListFile, JSON.stringify(initial, null, 2), 'utf-8');
                            } catch (_) {}
                            return sendJson(res, initial);
                        }

                        if (req.method === 'PUT' || req.method === 'POST') {
                            const body = await readJsonBody(req);
                            const incomingWorkspaces: any[] = Array.isArray(body) ? body : (Array.isArray(body?.workspaces) ? body.workspaces : []);
                            const incomingActiveId = body?.activeId !== undefined ? body.activeId : null;

                            let existing: any = null;
                            if (fs.existsSync(workspacesListFile)) {
                                try {
                                    existing = JSON.parse(fs.readFileSync(workspacesListFile, 'utf-8'));
                                } catch (_) {}
                            }

                            let finalWorkspaces: any[] = [];
                            if (existing && Array.isArray(existing.workspaces) && existing.workspaces.length > 0) {
                                const map = new Map<string, any>();
                                for (const w of existing.workspaces) {
                                    if (w && w.id) map.set(w.id, w);
                                }

                                for (const inc of incomingWorkspaces) {
                                    if (inc && inc.id) {
                                        const prev = map.get(inc.id);
                                        if (prev) {
                                            map.set(inc.id, {
                                                ...prev,
                                                ...inc,
                                                document: inc.document || prev.document,
                                                updatedAt: inc.updatedAt || new Date().toISOString(),
                                            });
                                        } else {
                                            map.set(inc.id, inc);
                                        }
                                    }
                                }
                                finalWorkspaces = Array.from(map.values());
                            } else {
                                finalWorkspaces = incomingWorkspaces;
                            }

                            if (finalWorkspaces.length === 0) {
                                finalWorkspaces = [
                                    {
                                        id: 'default',
                                        name: 'Default Workspace',
                                        updatedAt: new Date().toISOString(),
                                        document: null,
                                    }
                                ];
                            }

                            const activeId = incomingActiveId && finalWorkspaces.some((w: any) => w.id === incomingActiveId)
                                ? incomingActiveId
                                : (existing?.activeId && finalWorkspaces.some((w: any) => w.id === existing.activeId)
                                    ? existing.activeId
                                    : finalWorkspaces[0]?.id || 'default');

                            const record = {
                                activeId,
                                workspaces: finalWorkspaces,
                                updatedAt: Date.now()
                            };

                            const tempPath = path.join(dataDir, `.workspaces.tmp.${Date.now()}`);
                            try {
                                fs.writeFileSync(tempPath, JSON.stringify(record, null, 2), 'utf-8');
                                fs.renameSync(tempPath, workspacesListFile);
                            } catch (e) {
                                fs.writeFileSync(workspacesListFile, JSON.stringify(record, null, 2), 'utf-8');
                            }

                            // Keep active document synced with workspaces/vela-workspace.json
                            if (activeId) {
                                const activeWs = finalWorkspaces.find((w: any) => w.id === activeId);
                                if (activeWs && activeWs.document) {
                                    try {
                                        fs.writeFileSync(path.join(workspacesDir, 'vela-workspace.json'), JSON.stringify(activeWs.document, null, 2), 'utf-8');
                                    } catch (_) {}
                                }
                            }

                            return sendJson(res, { success: true, count: finalWorkspaces.length, activeId, updatedAt: record.updatedAt });
                        }
                    }

                    if (url.pathname.startsWith('/api/workspaces/')) {
                        const id = decodeURIComponent(url.pathname.replace('/api/workspaces/', ''));
                        if (req.method === 'DELETE') {
                            if (fs.existsSync(workspacesListFile)) {
                                try {
                                    const current = JSON.parse(fs.readFileSync(workspacesListFile, 'utf-8'));
                                    if (current && Array.isArray(current.workspaces)) {
                                        current.workspaces = current.workspaces.filter((w: any) => w.id !== id);
                                        if (current.activeId === id) {
                                            current.activeId = current.workspaces[0]?.id || 'default';
                                        }
                                        current.updatedAt = Date.now();
                                        const tempPath = path.join(dataDir, `.workspaces.tmp.${Date.now()}`);
                                        try {
                                            fs.writeFileSync(tempPath, JSON.stringify(current, null, 2), 'utf-8');
                                            fs.renameSync(tempPath, workspacesListFile);
                                        } catch (_) {
                                            fs.writeFileSync(workspacesListFile, JSON.stringify(current, null, 2), 'utf-8');
                                        }
                                        return sendJson(res, { success: true, deletedId: id, count: current.workspaces.length });
                                    }
                                } catch (e: any) {
                                    return sendJson(res, { error: e.message }, 500);
                                }
                            }
                            return sendJson(res, { success: true, deletedId: id });
                        }
                    }

                    // ── Indicator Templates Endpoints (/api/indicator-templates) ──────────
                    if (url.pathname === '/api/indicator-templates' || url.pathname === '/api/indicator-templates/') {
                        if (req.method === 'GET') {
                            const list = seedDefaultIndicatorTemplates(indicatorTemplatesFile);
                            return sendJson(res, list);
                        }

                        if (req.method === 'PUT' || req.method === 'POST') {
                            const body = await readJsonBody(req);
                            const incomingTemplates: any[] = Array.isArray(body)
                                ? body
                                : (Array.isArray(body?.templates) ? body.templates : []);

                            let existing: any[] = [];
                            if (fs.existsSync(indicatorTemplatesFile)) {
                                try {
                                    const parsed = JSON.parse(fs.readFileSync(indicatorTemplatesFile, 'utf-8'));
                                    if (Array.isArray(parsed)) existing = parsed;
                                } catch (_) {}
                            }

                            let finalTemplates: any[] = [];
                            if (existing.length > 0) {
                                const map = new Map<string, any>();
                                for (const t of existing) {
                                    if (t && t.id) map.set(t.id, t);
                                }
                                for (const inc of incomingTemplates) {
                                    if (inc && inc.id) {
                                        const prev = map.get(inc.id);
                                        map.set(inc.id, { ...(prev || {}), ...inc, updatedAt: inc.updatedAt || Date.now() });
                                    }
                                }
                                finalTemplates = Array.from(map.values());
                            } else {
                                finalTemplates = incomingTemplates;
                            }

                            if (body && body.name && !Array.isArray(body) && !body.templates) {
                                const id = body.id || `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                                const idx = finalTemplates.findIndex((t: any) => t.id === id);
                                const entry = { ...body, id, updatedAt: Date.now(), createdAt: body.createdAt || Date.now() };
                                if (idx >= 0) finalTemplates[idx] = entry;
                                else finalTemplates.unshift(entry);
                            }

                            const tempPath = path.join(dataDir, `.indicator_templates.tmp.${Date.now()}`);
                            try {
                                fs.writeFileSync(tempPath, JSON.stringify(finalTemplates, null, 2), 'utf-8');
                                fs.renameSync(tempPath, indicatorTemplatesFile);
                            } catch (e) {
                                fs.writeFileSync(indicatorTemplatesFile, JSON.stringify(finalTemplates, null, 2), 'utf-8');
                            }
                            return sendJson(res, { success: true, count: finalTemplates.length, updatedAt: Date.now() });
                        }
                    }

                    if (url.pathname.startsWith('/api/indicator-templates/')) {
                        const id = decodeURIComponent(url.pathname.replace('/api/indicator-templates/', ''));
                        if (req.method === 'DELETE') {
                            let existing: any[] = [];
                            if (fs.existsSync(indicatorTemplatesFile)) {
                                try { existing = JSON.parse(fs.readFileSync(indicatorTemplatesFile, 'utf-8')); } catch (_) {}
                            }
                            const filtered = existing.filter((t: any) => t.id !== id);
                            fs.writeFileSync(indicatorTemplatesFile, JSON.stringify(filtered, null, 2), 'utf-8');
                            return sendJson(res, { success: true, id, count: filtered.length });
                        }
                        if (req.method === 'GET') {
                            let existing: any[] = [];
                            if (fs.existsSync(indicatorTemplatesFile)) {
                                try { existing = JSON.parse(fs.readFileSync(indicatorTemplatesFile, 'utf-8')); } catch (_) {}
                            }
                            const found = existing.find((t: any) => t.id === id);
                            if (found) return sendJson(res, found);
                            return sendJson(res, { error: 'Indicator template not found', id }, 404);
                        }
                    }

                    // ── Watchlist Endpoints (/api/watchlist) ─────────────────────────────
                    if (url.pathname === '/api/watchlist' || url.pathname === '/api/watchlist/') {
                        if (req.method === 'GET') {
                            const list = seedDefaultWatchlist(watchlistFile, workspacesDir);
                            return sendJson(res, list);
                        }

                        if (req.method === 'PUT' || req.method === 'POST') {
                            const body = await readJsonBody(req);
                            const list = Array.isArray(body) ? body : (Array.isArray(body?.watchlist) ? body.watchlist : (Array.isArray(body?.items) ? body.items : []));
                            const tempPath = path.join(dataDir, `.watchlist.tmp.${Date.now()}`);
                            try {
                                fs.writeFileSync(tempPath, JSON.stringify(list, null, 2), 'utf-8');
                                fs.renameSync(tempPath, watchlistFile);
                            } catch (e) {
                                fs.writeFileSync(watchlistFile, JSON.stringify(list, null, 2), 'utf-8');
                            }
                            return sendJson(res, { success: true, count: list.length, updatedAt: Date.now() });
                        }
                    }

                    // ── Indicator Favorites / Wishlist Endpoints ─────────────────────────
                    if (
                        url.pathname === '/api/indicator-favorites' ||
                        url.pathname === '/api/indicator-favorites/' ||
                        url.pathname === '/api/quant/indicator-favorites' ||
                        url.pathname === '/api/quant/indicator-favorites/'
                    ) {
                        if (req.method === 'GET') {
                            if (fs.existsSync(indicatorFavoritesFile)) {
                                try {
                                    const data = JSON.parse(fs.readFileSync(indicatorFavoritesFile, 'utf-8'));
                                    return sendJson(res, data);
                                } catch (e) {}
                            }
                            return sendJson(res, { favorites: [] });
                        }

                        if (req.method === 'PUT' || req.method === 'POST') {
                            const body = await readJsonBody(req);
                            let favList: string[] = [];
                            if (Array.isArray(body)) {
                                favList = body;
                            } else if (Array.isArray(body?.favorites)) {
                                favList = body.favorites;
                            } else if (body?.body && Array.isArray(body.body.favorites)) {
                                favList = body.body.favorites;
                            }
                            const record = {
                                favorites: Array.from(new Set(favList)),
                                updatedAt: Date.now()
                            };
                            const tempPath = path.join(dataDir, `.indicator_favorites.tmp.${Date.now()}`);
                            try {
                                fs.writeFileSync(tempPath, JSON.stringify(record, null, 2), 'utf-8');
                                fs.renameSync(tempPath, indicatorFavoritesFile);
                            } catch (e) {
                                fs.writeFileSync(indicatorFavoritesFile, JSON.stringify(record, null, 2), 'utf-8');
                            }
                            return sendJson(res, { success: true, count: record.favorites.length, updatedAt: record.updatedAt });
                        }
                    }

                    // ── Alerts Sync Endpoints (/api/alerts) ─────────────────────────
                    if (url.pathname === '/api/alerts' || url.pathname === '/api/alerts/') {
                        if (req.method === 'GET') {
                            if (fs.existsSync(alertsFile)) {
                                try {
                                    const data = JSON.parse(fs.readFileSync(alertsFile, 'utf-8'));
                                    return sendJson(res, data);
                                } catch (_) {}
                            }
                            return sendJson(res, { alerts: [], logs: [] });
                        }

                        if (req.method === 'PUT' || req.method === 'POST') {
                            const body = await readJsonBody(req);
                            const record = {
                                alerts: Array.isArray(body?.alerts) ? body.alerts : (Array.isArray(body) ? body : []),
                                logs: Array.isArray(body?.logs) ? body.logs : [],
                                updatedAt: Date.now()
                            };
                            const tempPath = path.join(dataDir, `.alerts.tmp.${Date.now()}`);
                            try {
                                fs.writeFileSync(tempPath, JSON.stringify(record, null, 2), 'utf-8');
                                fs.renameSync(tempPath, alertsFile);
                            } catch (e) {
                                fs.writeFileSync(alertsFile, JSON.stringify(record, null, 2), 'utf-8');
                            }
                            return sendJson(res, { success: true, count: record.alerts.length, updatedAt: record.updatedAt });
                        }
                    }

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
                                if (safeKey === 'vela-workspace') {
                                    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
                                    for (const f of files) {
                                        try {
                                            const tpl = JSON.parse(fs.readFileSync(path.join(templatesDir, f), 'utf-8'));
                                            if (tpl.isDefault && tpl.state) {
                                                res.statusCode = 200;
                                                res.setHeader('Content-Type', 'application/json');
                                                res.setHeader('Access-Control-Allow-Origin', '*');
                                                return res.end(JSON.stringify(tpl.state));
                                            }
                                        } catch (_) {}
                                    }
                                }
                                return sendJson(res, { error: 'No saved workspace found', key }, 404);
                            }
                        }

                        if (req.method === 'PUT' || req.method === 'POST') {
                            let body = '';
                            req.on('data', (chunk: any) => { body += chunk; });
                            req.on('end', () => {
                                try {
                                    // Validate JSON
                                    const parsedBody = JSON.parse(body);
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

                    // Set Default Template: POST /api/templates/set-default
                    if (url.pathname === '/api/templates/set-default' && req.method === 'POST') {
                        const body = await readJsonBody(req);
                        const targetId = slugify(body.id || '');
                        if (!targetId) {
                            return sendJson(res, { error: 'Template ID required' }, 400);
                        }
                        const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
                        let found = false;
                        for (const file of files) {
                            const filePath = path.join(templatesDir, file);
                            try {
                                const raw = fs.readFileSync(filePath, 'utf-8');
                                const data = JSON.parse(raw);
                                const isMatch = (data.id === targetId || file.replace('.json', '') === targetId);
                                if (isMatch) found = true;
                                data.isDefault = isMatch;
                                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
                            } catch (_) {}
                        }
                        if (!found) {
                            return sendJson(res, { error: 'Template not found', id: targetId }, 404);
                        }
                        return sendJson(res, { success: true, defaultId: targetId });
                    }

                    // Restore Starter Templates: POST /api/templates/restore-defaults
                    if (url.pathname === '/api/templates/restore-defaults' && req.method === 'POST') {
                        seedDefaultTemplates(templatesDir, true);
                        return sendJson(res, { success: true });
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
                                let wasDefault = false;
                                try {
                                    const current = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                                    wasDefault = current.isDefault === true;
                                } catch (_) {}
                                fs.unlinkSync(filePath);
                                if (wasDefault) {
                                    const remaining = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
                                    if (remaining.length > 0) {
                                        try {
                                            const firstPath = path.join(templatesDir, remaining[0]);
                                            const firstData = JSON.parse(fs.readFileSync(firstPath, 'utf-8'));
                                            firstData.isDefault = true;
                                            fs.writeFileSync(firstPath, JSON.stringify(firstData, null, 2), 'utf-8');
                                        } catch (_) {}
                                    }
                                }
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

function seedDefaultTemplates(templatesDir: string, force: boolean = false) {
    const sentinelFile = path.join(templatesDir, '.templates_seeded');
    if (!force && fs.existsSync(sentinelFile)) {
        return;
    }

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
            isDefault: false,
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
            isDefault: false,
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
            isDefault: false,
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
        const filePath = path.join(templatesDir, tpl.id + ".json");
        if (force || !fs.existsSync(filePath)) {
            try {
                fs.writeFileSync(filePath, JSON.stringify(tpl, null, 2), 'utf-8');
            } catch (e) {
                console.error('Failed to write default template:', tpl.id, e);
            }
        }
    }

    try {
        fs.writeFileSync(sentinelFile, new Date().toISOString(), 'utf-8');
    } catch (_) {}
}


function seedDefaultIndicatorTemplates(filePath: string) {
    if (fs.existsSync(filePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (Array.isArray(data)) {
                return data;
            }
        } catch (_) {}
    }
    const empty: any[] = [];
    try {
        fs.writeFileSync(filePath, JSON.stringify(empty, null, 2), 'utf-8');
    } catch (_) {}
    return empty;
}

function seedDefaultWatchlist(filePath: string, workspacesDir: string) {
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (_) {}
    }
    const velaWorkspacePath = path.join(workspacesDir, 'vela-workspace.json');
    if (fs.existsSync(velaWorkspacePath)) {
        try {
            const doc = JSON.parse(fs.readFileSync(velaWorkspacePath, 'utf-8'));
            const lists = doc?.ext?.['vela.watchlist']?.lists;
            const activeListName = doc?.ext?.['vela.watchlist']?.activeList;
            if (lists && activeListName && Array.isArray(lists[activeListName])) {
                const items = lists[activeListName].map((item: any) => ({
                    symbol: item.symbol || item.canonicalSymbol || 'BTCUSDT',
                    name: item.name || item.symbol || 'Asset',
                    category: 'Crypto',
                    binanceSymbol: item.binanceSymbol || item.symbol?.replace(/[^A-Z0-9]/g, '') || 'BTCUSDT',
                    isFutures: item.isFutures === true,
                    price: 0,
                    change: 0,
                    changePercent: 0,
                    high: 0,
                    low: 0,
                    open: 0,
                    volume: 0,
                }));
                fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8');
                return items;
            }
        } catch (_) {}
    }

    const defaultList = [
        { symbol: 'BTCUSDT', name: 'Bitcoin', category: 'Crypto', binanceSymbol: 'BTCUSDT', isFutures: false, price: 81870.01, change: -1298.99, changePercent: -1.56, high: 84146.72, low: 81514.28, open: 83169.01, volume: 16200 },
        { symbol: 'ETHUSDT', name: 'Ethereum', category: 'Crypto', binanceSymbol: 'ETHUSDT', isFutures: false, price: 2431.33, change: -66.62, changePercent: -2.67, high: 2510.50, low: 2415.00, open: 2497.95, volume: 84000 },
        { symbol: 'SOLUSDT', name: 'Solana', category: 'Crypto', binanceSymbol: 'SOLUSDT', isFutures: false, price: 104.21, change: -2.62, changePercent: -2.45, high: 107.80, low: 103.50, open: 106.83, volume: 92000 },
        { symbol: 'BNBUSDT', name: 'Binance Coin', category: 'Crypto', binanceSymbol: 'BNBUSDT', isFutures: false, price: 729.46, change: -12.26, changePercent: -1.65, high: 745.00, low: 722.00, open: 741.72, volume: 45000 },
        { symbol: 'DOGEUSDT', name: 'Dogecoin', category: 'Crypto', binanceSymbol: 'DOGEUSDT', isFutures: false, price: 0.08208, change: -0.00231, changePercent: -2.74, high: 0.0855, low: 0.0812, open: 0.08439, volume: 15400000 },
        { symbol: 'NVDA', name: 'NVIDIA', category: 'Stocks', binanceSymbol: '', isFutures: false, price: 221.30, change: -7.22, changePercent: -3.16, high: 226.00, low: 219.64, open: 228.52, volume: 117714200 },
        { symbol: 'AAPL', name: 'Apple', category: 'Stocks', binanceSymbol: '', isFutures: false, price: 342.96, change: 1.69, changePercent: 0.50, high: 347.07, low: 341.72, open: 341.27, volume: 49888500 },
        { symbol: 'TSLA', name: 'Tesla', category: 'Stocks', binanceSymbol: '', isFutures: false, price: 367.16, change: -8.07, changePercent: -2.15, high: 371.39, low: 363.82, open: 375.23, volume: 30862900 },
        { symbol: 'EURUSD', name: 'Euro / U.S. Dollar', category: 'Forex', binanceSymbol: '', isFutures: false, price: 1.1167, change: -0.0036, changePercent: -0.32, high: 1.1168, low: 1.1157, open: 1.1203, volume: 258400 },
        { symbol: 'XAUUSD', name: 'Gold / U.S. Dollar', category: 'Commodities', binanceSymbol: '', isFutures: false, price: 4128.10, change: 20.20, changePercent: 0.49, high: 4129.80, low: 4122.70, open: 4107.90, volume: 57200 },
    ];
    try {
        fs.writeFileSync(filePath, JSON.stringify(defaultList, null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed to write default watchlist:', e);
    }
    return defaultList;
}
