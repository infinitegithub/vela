import type { WidgetStorage } from '../src/widget';

const PREFIX = 'vela-play:';

/**
 * Intelligent hybrid remote/local storage adapter:
 * - Reads synchronously from localStorage to guarantee ZERO layout flicker on boot/reload.
 * - If localStorage is empty (first load / new device), fetches asynchronously from LXC 115 backend.
 * - Saves to localStorage immediately AND synchronizes to LXC 115 backend (/api/workspace/:key).
 */
export function playgroundStorage(): WidgetStorage {
    return {
        get: (key: string): string | null | Promise<string | null> => {
            let cached: string | null = null;
            try {
                if (typeof window !== 'undefined') {
                    cached = window.localStorage.getItem(PREFIX + key);
                }
            } catch {}

            // If we have local state, return it synchronously so VelaWorkspace restores on frame 0
            if (cached && cached.trim().length > 0 && cached !== '{}') {
                // Silently verify with remote backend in background to keep LXC 115 in sync
                void (async () => {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 2000);
                        const res = await fetch(`/api/workspace/${encodeURIComponent(key)}`, { signal: controller.signal });
                        clearTimeout(timeoutId);
                        if (res.ok) {
                            const text = await res.text();
                            if (text && text.trim().length > 0 && text !== '{}' && text !== cached) {
                                window.localStorage.setItem(PREFIX + key, text);
                            }
                        }
                    } catch {}
                })();
                return cached;
            }

            // Fresh device/browser: asynchronously retrieve remote state from LXC 115
            return (async () => {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 2500);
                    const res = await fetch(`/api/workspace/${encodeURIComponent(key)}`, { signal: controller.signal });
                    clearTimeout(timeoutId);

                    if (res.ok) {
                        const text = await res.text();
                        if (text && text.trim().length > 0 && text !== '{}') {
                            try {
                                window.localStorage.setItem(PREFIX + key, text);
                            } catch {}
                            return text;
                        }
                    }
                } catch (e) {
                    console.warn('[VelaStorage] Remote sync endpoint unavailable:', e);
                }
                return null;
            })();
        },

        set: (key: string, value: string): void => {
            try {
                window.localStorage.setItem(PREFIX + key, value);
            } catch {}

            try {
                fetch(`/api/workspace/${encodeURIComponent(key)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: value,
                    keepalive: true,
                }).catch((err) => {
                    console.warn('[VelaStorage] Remote persist error:', err);
                });
            } catch (e) {
                // Best effort
            }
        },

        remove: (key: string): void => {
            try {
                window.localStorage.removeItem(PREFIX + key);
            } catch {}

            try {
                fetch(`/api/workspace/${encodeURIComponent(key)}`, {
                    method: 'DELETE',
                    keepalive: true,
                }).catch(() => {});
            } catch (e) {
                // Best effort
            }
        },
    };
}
