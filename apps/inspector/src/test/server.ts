import { setupServer } from 'msw/node';
import { handlers } from '@/mocks/handlers';

/** Общий MSW-сервер для тестов: `server.use(...)` — переопределить хендлер на один тест. */
export const server = setupServer(...handlers);
