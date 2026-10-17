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
    // Заготовка под туннель (MINI-04): сюда добавится '.trycloudflare.com' — без него Vite 6 отвечает 403 на чужой Host.
    // Рядом же появится `hmr: { clientPort: 443 }`; сейчас его нет, иначе HMR сломается при локальном http.
    allowedHosts: [],
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
