import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { setUnauthorizedHandler } from '@/api/client';
import { setApiSession } from '@/api/session';
import { resetMocks } from '@/mocks/state';
import { server } from './server';

// Запрос мимо хендлеров — ошибка теста, а не тихий поход в сеть.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  // Мок-бэкенд, как и настоящий, без заголовка `X-Telegram-Data` отвечает 401: по умолчанию тесты «внутри Telegram»
  setApiSession({ rawInitData: 'query_id=mock&auth_date=1700000000&hash=mock' });
});

afterEach(() => {
  // RTL сам подписывается на afterEach только при vitest `globals: true`, поэтому чистим вручную
  cleanup();
  // Локальный индекс отчётов и другие записи приложения не должны утекать из теста в тест
  window.localStorage.clear();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetMocks();
  setApiSession({});
  setUnauthorizedHandler(undefined);
});

afterAll(() => server.close());

// happy-dom не отдаёт `style.transform`, а vaul (Drawer из @podbor/ui) делает по нему `.match(...)` при отпускании указателя.
const nativeGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
  const style = nativeGetComputedStyle(element, pseudo);
  if (!style.transform) {
    try {
      Object.defineProperty(style, 'transform', { value: 'none', configurable: true });
    } catch {
      // объект стилей запечатан — оставляем как есть
    }
  }
  return style;
}) as typeof window.getComputedStyle;
