/// <reference types="vite/client" />

// Переменные мок-окружения Telegram, только для dev (см. src/telegram/mock.ts)
interface ImportMetaEnv {
  /** Сырая подписанная строка initData (получить через `npm run sign-init-data`). */
  readonly VITE_MOCK_INIT_DATA?: string;
  /** Параметр `startapp`, например `report_<uuid>`. */
  readonly VITE_MOCK_START_PARAM?: string;
  /** `dark` — тёмная тема мок-окружения. */
  readonly VITE_MOCK_THEME?: 'light' | 'dark';
  /** `1` — запросы к API перехватывает MSW (`npm run dev:mocks`, только dev). */
  readonly VITE_API_MOCKS?: string;
}
