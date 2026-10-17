/*
 * Очередь загрузок (PLAN_FRONTEND_MINIAPP.md, раздел 3.4, задачи MINI-11 и MINI-23).
 *
 * zustand-стор — источник истины для UI (реактивный, быстрый); задачи зеркалятся в IndexedDB (MINI-23), чтобы загрузки
 * переживали закрытие Mini App. Правила параллельности, backoff и разбора ошибок — чистые функции в
 * `uploadQueueRules.ts`, хранение — в `uploadQueuePersistence.ts`, здесь — стор, цикл воркера и гидратация.
 *
 * Воркер — один шаг `kick()`: ставит в полёт всё, что можно сейчас. Пока `uploadMedia` выполняется, задача в
 * `presigning/uploading/confirming` и в `pickRunnable` не попадёт; после ответа воркер `kick()` снова, чтобы
 * подхватить следующую. Сбой или backoff одной задачи другие не блокируют.
 *
 * В средах без IndexedDB (happy-dom в тестах) персистентность выключается сама, очередь живёт только в памяти.
 */

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { MediaTag } from '@/features/reports/draft';
import { loadTasks, saveTasks } from './uploadQueuePersistence';
import { getUploadErrorMessage, uploadMedia } from './upload';
import {
  backoffDelay,
  classifyFailure,
  hasPendingWork,
  isActive,
  nextWakeAt,
  pickRunnable,
  summarize,
  type UploadTask,
  type UploadTaskState,
} from './uploadQueueRules';

export interface EnqueueInput {
  reportId: string;
  /** `null` — глобальное медиа (обязательные фото, видео обхода). */
  sectionId: string | null;
  kind: UploadTask['kind'];
  contentType: UploadTask['contentType'];
  /** Тег обязательного фото (только глобальные фото, раздел 3.3). */
  tag?: MediaTag;
  blob: Blob | null;
  thumb?: Blob;
}

export interface UploadQueueApi {
  tasks: UploadTask[];
  /** Ошибка квоты IndexedDB: новые файлы не принимаются, пока очередь не разгрузится. */
  quotaError: string | null;
  enqueue: (input: EnqueueInput) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
  releaseBlob: (id: string) => void;
  clearForReport: (reportId: string) => void;
}

let batchCounter = 0;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let pending = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const patch = (id: string, update: Partial<UploadTask>) => {
  useUploadQueue.setState((state) => ({ tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...update } : task)) }));
  schedulePersist();
};

/** Дебаунс-сохранение полного массива задач в IndexedDB (MINI-23). Изменения стору во время тика воркера частые. */
function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void saveTasks(useUploadQueue.getState().tasks).catch(() => {
      // Неудачная запись (квота/недоступность IDB) не роняет воркер; квота показывается в enqueue
    });
  }, 300);
}

async function runTask(id: string) {
  const task = useUploadQueue.getState().tasks.find((candidate) => candidate.id === id);
  if (!task || task.state === 'done' || task.state === 'failed' || task.blob === null) {
    return;
  }

  patch(id, { state: 'presigning', attempts: task.attempts + 1 });
  try {
    const result = await uploadMedia({
      reportId: task.reportId,
      sectionId: task.sectionId,
      blob: task.blob,
      contentType: task.contentType,
      onProgress: (fraction) => patch(id, { progress: fraction }),
      onStage: (stage) => patch(id, { state: stage === 'put' ? 'uploading' : stage === 'confirm' ? 'confirming' : 'presigning' }),
      resume: task.resume,
    });
    patch(id, { state: 'done', s3Key: result.s3Key, progress: 1, lastError: undefined });
  } catch (error) {
    const action = classifyFailure(error);
    if (action.action === 'cancelled') {
      useUploadQueue.getState().remove(id);
      return;
    }
    if (action.action === 'auth') {
      patch(id, { state: 'failed', lastError: 'Сессия истекла. Войдите заново' });
      return;
    }
    if (action.action === 'retry') {
      const resume = error instanceof Error && 'state' in error ? (error as unknown as { state: UploadTask['resume'] }).state : undefined;
      const attempts = task.attempts + 1;
      patch(id, { state: 'queued', lastError: getUploadErrorMessage(error), resume, attempts, nextAttemptAt: Date.now() + backoffDelay(attempts) });
    } else {
      patch(id, { state: 'failed', lastError: getUploadErrorMessage(error) });
    }
  }
}

/** Один шаг воркера: запускает всё, что можно, и планирует следующий по ближайшему backoff. Идемпотентен. */
async function kick() {
  if (pending) {
    return;
  }
  pending = true;
  try {
    const { tasks } = useUploadQueue.getState();
    const runnable = pickRunnable(tasks, Date.now());
    for (const task of runnable) {
      void runTask(task.id);
    }
    const wakeAt = nextWakeAt(tasks);
    if (wakeAt !== undefined) {
      if (wakeTimer) clearTimeout(wakeTimer);
      wakeTimer = setTimeout(() => void kick(), Math.max(wakeAt - Date.now(), 0));
    }
  } finally {
    pending = false;
  }
}

export const useUploadQueue = create<UploadQueueApi>((set) => ({
  tasks: [],
  quotaError: null,

  enqueue: (input) => {
    batchCounter += 1;
    const task: UploadTask = {
      id: crypto.randomUUID(),
      reportId: input.reportId,
      sectionId: input.sectionId,
      kind: input.kind,
      contentType: input.contentType,
      ...(input.tag ? { tag: input.tag } : {}),
      blob: input.blob,
      ...(input.thumb ? { thumb: input.thumb } : {}),
      state: 'queued',
      progress: 0,
      attempts: 0,
      createdAt: Date.now(),
      batch: batchCounter,
    };
    set((state) => ({ tasks: [...state.tasks, task], quotaError: null }));
    void kick();
    schedulePersist();
  },

  retry: (id) => {
    patch(id, { state: 'queued', lastError: undefined, nextAttemptAt: undefined });
    void kick();
  },

  remove: (id) => {
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));
    schedulePersist();
  },

  releaseBlob: (id) => patch(id, { blob: null }),

  clearForReport: (reportId) => {
    set((state) => ({
      // Загруженные остаются (они уже в БД), недогруженные убираем: закрыли отчёт, выбор повторится
      tasks: state.tasks.filter((task) => task.reportId !== reportId || task.state === 'done'),
    }));
    schedulePersist();
  },
}));

/**
 * Проверка квоты IndexedDB перед постановкой файла (MINI-23). На iOS WebView квота может быть маленькой.
 * Возвращает текст ошибки, если хранилище переполнено (новые файлы не принимаем), или `null`.
 */
export async function checkUploadQuota(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !('storage' in navigator) || !navigator.storage?.estimate) {
    return null;
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (quota > 0 && usage / quota > 0.95) {
      return 'Хранилище переполнено. Удалите загруженные файлы и попробуйте снова';
    }
    return null;
  } catch {
    return null;
  }
}

/** Запросить постоянное хранилище (если API доступно) — иначе браузер может вычистить IndexedDB. Не критично, молчим. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    // недоступно — игнорируем
  }
}

/**
 * Гидратация очереди при старте (MINI-23): восстановить задачи из IndexedDB и продолжить докачку.
 * Задачи в `presigning/uploading/confirming` на момент закрытия Mini App возвращаются в `queued` (в S3 они не ушли
 * целиком или confirm под вопросом), кроме `confirming` с известным `s3Key` — для неё сначала проверка через `GET`
 * (правило MINI-10) делается внутри `uploadMedia` при повторе. Вызывается один раз после старта приложения.
 */
export async function hydrateUploadQueue(): Promise<void> {
  const stored = await loadTasks();
  if (stored.length === 0) return;
  const recovered = stored.map((task) =>
    isActive(task) ? { ...task, state: 'queued' as UploadTaskState, resume: undefined, progress: 0, nextAttemptAt: undefined } : task,
  );
  useUploadQueue.setState({ tasks: recovered, quotaError: null });
  await requestPersistentStorage();
  void kick();
}

/** Возобновление загрузки при появлении сети и возврате в приложение. `kick` идемпотентен, лишние вызовы безопасны. */
export function useUploadQueueResume() {
  const enabledRef = useRef(true);
  useEffect(() => {
    enabledRef.current = true;
    const resumeIfWork = () => {
      if (enabledRef.current && hasPendingWork(useUploadQueue.getState().tasks)) {
        void kick();
      }
    };
    const onOnline = () => resumeIfWork();
    const onVisible = () => {
      if (document.visibilityState === 'visible') resumeIfWork();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      enabledRef.current = false;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

/** Сводка для индикатора в шапке мастера: «Загружается N из M». */
export function useUploadQueueSummary() {
  // Считаем снаружи: возвращать новый объект из селектора зацикливает рендер (zustand сравнивает по ссылке)
  const tasks = useUploadQueue((state) => state.tasks);
  return summarize(tasks);
}

/** Есть ли незавершённые задачи — для подтверждения закрытия приложения и баннера «Не закрывайте». */
export function useHasPendingUploads() {
  const tasks = useUploadQueue((state) => state.tasks);
  return hasPendingWork(tasks);
}

// Открываем внутренние функции для тестов, не загрязняя публичное API.
export const __queueInternals = { kick, runTask };