/*
 * Клиент Web Worker обработки изображений (MINI-12). Поднимает `photoWorker.ts` и превращает его в обычную функцию.
 *
 * Один экземпляр живёт на одну пачку файлов (`photoPipeline.ts`) и закрывается через `dispose()`: лишний поток
 * после выбора фото не нужен. Ответы различаются по `id`.
 *
 * Модульные воркеры (`new Worker(url, { type: 'module' })`) поддерживаются не везде. Если воркер не поднялся
 * (исключение при создании, ошибка загрузки скрипта), клиент бросает `PhotoWorkerUnavailableError`, а не
 * `PhotoProcessingError`: по ней пайплайн переходит на главный поток и обрабатывает тот же файл заново,
 * а не показывает пользователю «не удалось прочитать фото».
 */

import { PhotoProcessingError, type PhotoErrorKind, type ProcessedPhoto } from './photoProcessing';

/** Воркер не запустился или упал сам, а не отказался от файла. */
export class PhotoWorkerUnavailableError extends Error {
  constructor() {
    super('Web Worker обработки фото недоступен');
    this.name = 'PhotoWorkerUnavailableError';
  }
}

export interface PhotoRunner {
  run(file: Blob): Promise<ProcessedPhoto>;
  /** Закрыть воркер. Незавершённые задачи получают `PhotoWorkerUnavailableError`. */
  dispose(): void;
}

interface WorkerReply {
  id: number;
  ok: boolean;
  photo?: ProcessedPhoto;
  kind?: string;
}

interface Pending {
  resolve: (photo: ProcessedPhoto) => void;
  reject: (error: unknown) => void;
}

export function createPhotoWorkerRunner(): PhotoRunner {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./photoWorker.ts', import.meta.url), { type: 'module', name: 'photo-processing' });
  } catch {
    throw new PhotoWorkerUnavailableError();
  }

  const pending = new Map<number, Pending>();
  let nextId = 0;
  let disposed = false;

  const failAll = () => {
    for (const { reject } of pending.values()) {
      reject(new PhotoWorkerUnavailableError());
    }
    pending.clear();
  };

  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    const task = pending.get(reply.id);
    if (!task) {
      return;
    }
    pending.delete(reply.id);
    if (reply.ok && reply.photo) {
      task.resolve(reply.photo);
    } else {
      task.reject(new PhotoProcessingError((reply.kind as PhotoErrorKind | undefined) ?? 'decode-failed'));
    }
  };
  worker.onerror = failAll;
  worker.onmessageerror = failAll;

  return {
    run: (file) =>
      new Promise<ProcessedPhoto>((resolve, reject) => {
        if (disposed) {
          reject(new PhotoWorkerUnavailableError());
          return;
        }
        const id = nextId;
        nextId += 1;
        pending.set(id, { resolve, reject });
        try {
          worker.postMessage({ id, file });
        } catch {
          pending.delete(id);
          reject(new PhotoWorkerUnavailableError());
        }
      }),
    dispose: () => {
      disposed = true;
      failAll();
      worker.terminate();
    },
  };
}
