import path from 'path';
import { defineConfig } from 'vitest/config';

// Отдельный конфиг для тестов: Tailwind и React-плагин им не нужны.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    // threads, а не forks: в песочнице нельзя убивать дочерние процессы (kill EPERM), и воркеры остались бы висеть
    pool: 'threads',
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'http://localhost:5175' } },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
