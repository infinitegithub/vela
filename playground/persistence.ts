import type { WidgetStorage } from '../src/widget';

const PREFIX = 'vela-play:';

/**
 * Intelligent hybrid remote/local storage adapter:
 * - Saves to localStorage immediately (synchronous backup)
 * - Automatically synchronizes to LXC 115 backend (/api/workspace/:key)
 * - Restores from LXC 115 backend on any machine or browser, falling back to localStorage
 */
export function playgroundStorage(): WidgetStorage {
    return {
        get: async (key: string): Promise<string | null> => {
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
                console.warn('[VelaStorage] Remote sync endpoint unavailable, using local cache:', e);
            }
            return window.localStorage.getItem(PREFIX + key);
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
