/*
 * Очередь загрузок в памяти (MVP, PLAN_FRONTEND_MINIAPP.md, раздел 3.4, задача MINI-11).
 *
 * Задачи лежат только в памяти (zustand без `persist`): закрыли Mini App — очередь пропала, файлы нужно выбрать
 * заново. IndexedDB, квота и восстановление после закрытия — второй этап, задача MINI-23. Правила параллельности,
 * backoff и разбора ошибок — чистые функции в `uploadQueueRules.ts`, здесь — стор и цикл воркера.
 *
 * Воркер — один шаг `kick()`: ставит в полёт всё, что можно сейчас. Пока `uploadMedia` выполняется, задача в
 * `presigning/uploading/confirming` и в `pickRunnable` не попадёт; после ответа воркер `kick()` снова, чтобы
 * подхватить следующую. Сбой или backoff одной задачи другие не блокируют.
 */

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { MediaTag } from '@/features/reports/draft';
import { getUploadErrorMessage, uploadMedia } from './upload';
import {
  backoffDelay,
  classifyFailure,
  hasPendingWork,
  nextWakeAt,
  pickRunnable,
  summarize,
  type UploadTask,
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
  enqueue: (input: EnqueueInput) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
  releaseBlob: (id: string) => void;
  clearForReport: (reportId: string) => void;
}

let batchCounter = 0;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let pending = false;

const patch = (id: string, update: Partial<UploadTask>) =>
  useUploadQueue.setState((state) => ({ tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...update } : task)) }));

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
    set((state) => ({ tasks: [...state.tasks, task] }));
    void kick();
  },

  retry: (id) => {
    patch(id, { state: 'queued', lastError: undefined, nextAttemptAt: undefined });
    void kick();
  },

  remove: (id) => set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) })),

  releaseBlob: (id) => patch(id, { blob: null }),

  clearForReport: (reportId) =>
    set((state) => ({
      // Загруженные остаются (они уже в БД), недогруженные убираем: закрыли отчёт, выбор повторится
      tasks: state.tasks.filter((task) => task.reportId !== reportId || task.state === 'done'),
    })),
}));

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