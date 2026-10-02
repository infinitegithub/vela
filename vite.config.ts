import { defineConfig } from 'vite';
import { binanceApiPlugin } from './playground/vite-binance-plugin';

export default defineConfig({
    root: 'playground',
    plugins: [binanceApiPlugin()],
    server: { port: 3000, host: '0.0.0.0' },
});
