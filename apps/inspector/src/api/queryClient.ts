import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

const MAX_RETRIES = 2;

/**
 * Ответ 4xx окончателен: повтор ничего не изменит (401 уводит на `/session-expired`, 404 — штатный сигнал).
 * Повторяем только то, что может пройти со второго раза: обрыв сети, таймаут, 5xx.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.kind === 'http' && error.status < 500) {
    return false;
  }
  return failureCount < MAX_RETRIES;
}

/** Клиент запросов приложения. Мутации (POST/PUT) по умолчанию не повторяются: что повторять, решает вызывающий код. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        // Оффлайн-устойчивость (MINI-21): запросы на чтение отдают закешированный ответ, если он есть,
        // и не падают сразу при отсутствии сети (раздел 3.6)
        networkMode: 'offlineFirst',
      },
    },
  });
}