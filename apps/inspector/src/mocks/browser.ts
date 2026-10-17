import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { mockConfig, mockControl, resetMocks } from './state';

export const worker = setupWorker(...handlers);

/** Правдоподобная задержка сети, чтобы в UI были видны состояния загрузки. */
mockConfig.latencyMs = 300;

/**
 * Управление моками из консоли браузера (только в режиме `npm run dev:mocks`), например:
 *   __mocks.control.setInspector(null)        // не зарегистрирован: проверить регистрацию
 *   __mocks.control.setInspector('pending')   // ожидание верификации; 'banned' — блокировка
 *   __mocks.control.failOnce('POST /inspector/reports', { kind: 'app', status: 502, errorCode: 'PARSER_ERROR' })
 *   __mocks.control.failOnce('GET /inspector/reports/:reportId', { kind: 'security', status: 401 })
 *   __mocks.reset()
 */
declare global {
  interface Window {
    __mocks?: { control: typeof mockControl; config: typeof mockConfig; reset: () => void };
  }
}

window.__mocks = { control: mockControl, config: mockConfig, reset: resetMocks };
