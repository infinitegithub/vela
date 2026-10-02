import { defineConfig } from 'vite';
import { binanceApiPlugin } from './playground/vite-binance-plugin';
import { templateSyncPlugin } from './playground/vite-template-sync-plugin';

export default defineConfig({
    root: 'playground',
    plugins: [binanceApiPlugin(), templateSyncPlugin()],
    server: { port: 3000, host: '0.0.0.0' },
});
