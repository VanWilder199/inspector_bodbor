/*
 * Персистенция кеша TanStack Query (MINI-21, раздел 3.6): профиль и открытые отчёты переживают закрытие Mini App.
 *
 * Хранилище — `localStorage`: кеш запросов на чтение — это простые сериализуемые данные, IndexedDB не нужна.
 * Ограничение по размеру (~5 МБ) приемлемо: кешируем только профиль и открытые отчёты, а не все списки.
 *
 * Персистим только ключи, которые безопасно держать между сессиями. Всё, что может протухнуть (список отчётов,
 * справочники), — не трогаем: их и так подтянет сеть. Делаем подмножество, чтобы кеш не разрастался.
 */

import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { Query, QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';

/** Ключи, чей кеш персистим. Профиль инспектора и открытый отчёт (`['report', <id>]`). */
const PERSIST_PREFIX = 'inspector';

const shouldPersist = (query: Query) => {
  const [head] = query.queryKey;
  if (head === 'inspector') return true;
  if (head === 'report') return true;
  return false;
};

export function setupQueryPersist(queryClient: QueryClient): void {
  const persister = createSyncStoragePersister({ storage: window.localStorage, key: `${PERSIST_PREFIX}:query-cache` });

  void persistQueryClient({
    queryClient,
    persister,
    maxAge: 1000 * 60 * 60 * 24, // 1 сутки: профиль может устареть, но не критично
    dehydrateOptions: {
      shouldDehydrateQuery: shouldPersist,
    },
  });
}