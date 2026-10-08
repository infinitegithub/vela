import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { binanceApiPlugin } from './playground/vite-binance-plugin';
import { templateSyncPlugin } from './playground/vite-template-sync-plugin';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    Object.assign(process.env, env);

    return {
        root: 'playground',
        plugins: [
            binanceApiPlugin(),
            templateSyncPlugin(),
            VitePWA({
                registerType: 'prompt',
                injectRegister: false,
                devOptions: {
                    enabled: false,
                },
                workbox: {
                    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                    navigateFallback: '/workspace.html',
                    navigateFallbackDenylist: [/^\/api\//],
                    runtimeCaching: [
                        {
                            urlPattern: /^\/api\/.*/i,
                            handler: 'NetworkOnly',
                        },
                        {
                            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'google-fonts',
                                expiration: {
                                    maxEntries: 10,
                                    maxAgeSeconds: 60 * 60 * 24 * 365,
                                },
                            },
                        },
                    ],
                },
                manifest: {
                    name: 'Velo Trading Workstation',
                    short_name: 'Vela',
                    description: 'LuxAlgo Vela Multi-Pane Financial Charting Workstation',
                    theme_color: '#202126',
                    background_color: '#202126',
                    display: 'standalone',
                    orientation: 'any',
                    scope: '/',
                    start_url: '/workspace.html',
                    icons: [
                        {
                            src: '/icons/icon-192.png',
                            sizes: '192x192',
                            type: 'image/png',
                        },
                        {
                            src: '/icons/icon-512.png',
                            sizes: '512x512',
                            type: 'image/png',
                        },
                        {
                            src: '/icons/icon-512-maskable.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'maskable',
                        },
                    ],
                },
            }),
        ],
        server: {
            port: 3000,
            host: '0.0.0.0',
            allowedHosts: ['vela.viffey.com', '.viffey.com', 'localhost', '127.0.0.1'],
            watch: {
                ignored: ['**/data/**', '**/.git/**', '**/dist/**'],
            },
            hmr: {
                clientPort: 443,
                overlay: false,
            },
        },
        build: {
            rollupOptions: {
                input: {
                    main: 'index.html',
                    workspace: 'workspace.html',
                },
            },
        },
    };
});
