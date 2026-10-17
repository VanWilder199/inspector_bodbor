import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Mini App живёт на отдельном поддомене app.site.by, поэтому SPA в корне, а не на подпути
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    // 5173 — web, 5174 — admin
    port: 5175,
    // Туннель (MINI-04): при `VITE_TUNNEL=1` (`npm run tunnel`) разрешаем trycloudflare-хосты и включаем HMR через
    // 443 — иначе Vite 6 отвечает 403 на чужой Host, а HMR по http-туннелю не проходит. Локально без флага HMR
    // работает по http, поэтому `clientPort` тут не задаём.
    allowedHosts: process.env.VITE_TUNNEL ? ['.trycloudflare.com', '.ngrok-free.app'] : [],
    hmr: process.env.VITE_TUNNEL ? { clientPort: 443 } : undefined,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
