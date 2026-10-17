/*
 * Системный стор состояния сети (PLAN_FRONTEND_MINIAPP.md, раздел 3.6, задача MINI-21, второй этап).
 *
 * Три состояния:
 *   - `online`   — есть интерфейс И последний запрос не падал с сетевой ошибкой;
 *   - `offline`  — `navigator.onLine === false` (нет интерфейса);
 *   - `degraded` — интерфейс есть, но реальный запрос упал с `TypeError`/таймаутом (сервер недоступен) —
 *     `navigator.onLine` лишь подсказка, настоящий признак — сетевая ошибка от `fetch` (useOnline.ts).
 *
 * `offline` и `degraded` внешне ведут себя одинаково (кнопки гаснут), но различаются в диагностике баннера:
 * «Нет соединения» vs «Сервер недоступен, правки копятся локально». Из `degraded` возврат в `online` — только
 * после успешного запроса (шумные ошибки не переключают состояние туда-сюда).
 */

import { create } from 'zustand';

export type NetworkState = 'online' | 'offline' | 'degraded';

interface NetworkStore {
  state: NetworkState;
  /** Признак сбоя от `navigator.onLine === false`. */
  setInterfaceOffline: () => void;
  /** Признак сбоя от реального запроса (сетевая ошибка/таймаут). */
  setDegraded: () => void;
  /** Успешный запрос или `online`-событие: возврат в online. */
  setOnline: () => void;
}

export const useNetworkState = create<NetworkStore>((set) => ({
  state: navigator.onLine ? 'online' : 'offline',
  setInterfaceOffline: () => set({ state: 'offline' }),
  setDegraded: () =>
    set((current) => {
      // Не ухудшаем «offline» (нет интерфейса) до «degraded»; из online переходим в degraded
      if (current.state === 'online') return { state: 'degraded' };
      return {};
    }),
  setOnline: () =>
    set((current) => {
      // No-op, если уже online: не дёргаем подписчиков (OfflineBanner, CreateReportPage) на каждом успешном запросе
      if (current.state === 'online') return {};
      return { state: 'online' };
    }),
}));

/** Удобный булев флаг для блокировки действий: offline или degraded — «нет сети». */
export function useOffline() {
  return useNetworkState((state) => state.state !== 'online');
}