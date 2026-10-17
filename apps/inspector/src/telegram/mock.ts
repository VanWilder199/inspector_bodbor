/*
 * Мок-окружение Telegram для разработки в обычном браузере. ТОЛЬКО dev: main.tsx подключает этот файл динамическим
 * импортом под `import.meta.env.DEV`, поэтому в prod-сборку он не попадает (проверяется grep'ом по dist, MINI-02).
 *
 * Токена бота здесь нет и быть не должно. Чтобы бэкенд принял запросы, нужен initData, подписанный токеном
 * из `telegram.bot-token` в `src/main/resources/application-local.yml` бэкенда:
 *
 *   1. TELEGRAM_BOT_TOKEN=<токен из application-local.yml> npm run sign-init-data -w @podbor/inspector
 *   2. вывод (одна строка) положить в `apps/inspector/.env.local` как VITE_MOCK_INIT_DATA=<строка>
 *   3. перезапустить `npm run dev:inspector`
 *
 * Подпись действует 24 часа (telegram.max-age): по истечении шаги 1–3 повторяются.
 * Без VITE_MOCK_INIT_DATA initData не подписан: интерфейс работает, а реальный бэкенд ответит 401
 * (для работы без бэкенда есть MSW-моки, MINI-03).
 *
 * Необязательные переменные: VITE_MOCK_START_PARAM (например, `report_<uuid>`) и VITE_MOCK_THEME=dark.
 */
import { emitEvent, mockTelegramEnv } from '@telegram-apps/sdk-react';

const LIGHT_THEME = {
  accent_text_color: '#168acd',
  bg_color: '#ffffff',
  bottom_bar_bg_color: '#ffffff',
  button_color: '#40a7e3',
  button_text_color: '#ffffff',
  destructive_text_color: '#e53935',
  header_bg_color: '#ffffff',
  hint_color: '#707579',
  link_color: '#168acd',
  secondary_bg_color: '#f4f4f5',
  section_bg_color: '#ffffff',
  section_header_text_color: '#168acd',
  section_separator_color: '#e7e8ec',
  subtitle_text_color: '#707579',
  text_color: '#000000',
} as const;

const DARK_THEME = {
  accent_text_color: '#6ab3f3',
  bg_color: '#17212b',
  bottom_bar_bg_color: '#17212b',
  button_color: '#5288c1',
  button_text_color: '#ffffff',
  destructive_text_color: '#ec3942',
  header_bg_color: '#17212b',
  hint_color: '#708499',
  link_color: '#6ab3f3',
  secondary_bg_color: '#232e3c',
  section_bg_color: '#17212b',
  section_header_text_color: '#6ab3f3',
  section_separator_color: '#0d1620',
  subtitle_text_color: '#708499',
  text_color: '#f5f5f5',
} as const;

const NO_INSETS = { left: 0, top: 0, right: 0, bottom: 0 };

/** initData без подписи: годится только для вёрстки и MSW-моков. */
function buildUnsignedInitData(): string {
  return new URLSearchParams([
    ['user', JSON.stringify({ id: 1, first_name: 'Тест', last_name: 'Подборщик', username: 'test_inspector', language_code: 'ru' })],
    ['auth_date', String(Math.floor(Date.now() / 1000))],
    ['hash', 'unsigned'],
  ]).toString();
}

export function installMockTelegramEnv(): void {
  const theme = import.meta.env.VITE_MOCK_THEME === 'dark' ? DARK_THEME : LIGHT_THEME;
  const initData = import.meta.env.VITE_MOCK_INIT_DATA || buildUnsignedInitData();
  if (!import.meta.env.VITE_MOCK_INIT_DATA) {
    console.warn('[mock Telegram] VITE_MOCK_INIT_DATA не задан: initData не подписан, реальный бэкенд ответит 401');
  }

  const launchParams = new URLSearchParams([
    ['tgWebAppThemeParams', JSON.stringify(theme)],
    ['tgWebAppData', initData],
    ['tgWebAppVersion', '8.4'],
    ['tgWebAppPlatform', 'tdesktop'],
  ]);
  if (import.meta.env.VITE_MOCK_START_PARAM) {
    launchParams.set('tgWebAppStartParam', import.meta.env.VITE_MOCK_START_PARAM);
  }

  // Настоящего клиента Telegram рядом нет, поэтому на запросы SDK отвечаем сами. Остальные вызовы глотаем.
  mockTelegramEnv({
    launchParams,
    onEvent(event) {
      switch (event[0]) {
        case 'web_app_request_theme':
          emitEvent('theme_changed', { theme_params: theme });
          break;
        case 'web_app_request_viewport':
          emitEvent('viewport_changed', {
            height: window.innerHeight,
            width: window.innerWidth,
            is_expanded: true,
            is_state_stable: true,
          });
          break;
        case 'web_app_request_safe_area':
          emitEvent('safe_area_changed', NO_INSETS);
          break;
        case 'web_app_request_content_safe_area':
          emitEvent('content_safe_area_changed', NO_INSETS);
          break;
      }
    },
  });
}
