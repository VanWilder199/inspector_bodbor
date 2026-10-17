/*
 * Персистентность очереди загрузок в IndexedDB (MINI-23, раздел 3.4, задача MINI-23).
 *
 * Задачи из MINI-11 (в памяти) зеркалятся в IndexedDB, чтобы загрузки переживали закрытие Mini App. zustand-стор
 * остаётся источником истины для UI (реактивный, быстрый); здесь — только хранение и восстановление.
 *
 * Храним весь массив задач под одним ключом (пакетное обновление атомарно в рамках одной структурированной записи,
 * idb-keyval клонирует Blob структурно). Мин, кого хранить:
 *   - `blob` — сами файлы (Blob хранится в IndexedDB как есть);
 *   - `thumb` — миниатюры.
 *
 * В средах без IndexedDB (happy-dom в тестах) `indexedDB` отсутствует — модуль деградирует в no-op, очередь живёт
 * только в памяти, как в MINI-11. Это осознанно: тесты не таскают за собой реальное хранилище.
 */

import { del, get, set } from 'idb-keyval';
import type { UploadTask } from './uploadQueueRules';

/** Храним задачи по одному ключу: одна структурированная запись атомарнее множества мелких и клонируется за раз. */
const STORE_KEY = 'podbor:uploads:tasks';

/** Доступен ли IndexedDB. В happy-dom (тесты) — нет, тогда персистентность выключена. */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function saveTasks(tasks: UploadTask[]): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  await set(STORE_KEY, tasks);
}

export async function loadTasks(): Promise<UploadTask[]> {
  if (!isIndexedDBAvailable()) return [];
  return (await get(STORE_KEY)) ?? [];
}

export async function clearTasks(): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  await del(STORE_KEY);
}