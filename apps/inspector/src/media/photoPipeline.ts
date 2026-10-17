/*
 * Постановка выбранных файлов в обработку (MINI-12, PLAN_FRONTEND_MINIAPP.md, раздел 3.5).
 *
 * Здесь три обязанности:
 *  1. выбрать дорогу — Web Worker с `OffscreenCanvas`, если окружение умеет, иначе главный поток;
 *  2. обработать файлы СТРОГО по одному: несколько больших canvas подряд валят WebView на iOS;
 *  3. вернуть HEIC, который браузер не прочитал, через `heic2any`.
 *
 * HEIC отдельной веткой не идёт: сначала файл отдаётся как есть (Safari 17+ и iOS WebView читают HEIC сами).
 * Если браузер не смог, файл конвертируется через `heic2any` и обрабатывается второй раз. Так тяжёлый конвертер
 * остаётся на главном потоке и в worker не попадает.
 */

import { canUseImageWorker, createCanvasPhotoCodec, type PhotoCodec } from './photoCodec';
import { loadHeicConverter, type HeicConverter } from './heicConverter';
import { isHeic, isImageFile, PhotoProcessingError, processPhoto, type ProcessedPhoto } from './photoProcessing';
import { createPhotoWorkerRunner, PhotoWorkerUnavailableError, type PhotoRunner } from './photoWorkerClient';

export interface PhotoInputOptions {
  /** `environment` — съёмка на камеру; без значения открывается галерея (план 3.5, п. 1). */
  capture?: 'environment' | 'user';
  multiple?: boolean;
}

/**
 * Скрытый `<input type="file">` для выбора фото. `accept="image/*"` и `capture` вместе дают камеру на телефоне.
 * Элемент не вставляется в документ: `click()` работает и так.
 */
export function createPhotoInput({ capture, multiple = true }: PhotoInputOptions = {}): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = multiple;
  if (capture) {
    input.setAttribute('capture', capture);
  }
  return input;
}

export interface ProcessPhotoFilesOptions {
  /** Кодек для подмены в тестах: с ним worker не используется. */
  codec?: PhotoCodec;
  /** Конвертер HEIC для подмены в тестах; по умолчанию — ленивая загрузка `heic2any`. */
  loadConverter?: () => Promise<HeicConverter>;
  /** По умолчанию — `canUseImageWorker()`. Тесты отключают worker, чтобы работать на подменённом кодеке. */
  preferWorker?: boolean;
  /** Сколько файлов уже обработано (для индикатора «Обработка 3 из 7»). */
  onProgress?: (done: number, total: number) => void;
}

/** Дорога обработки: worker, пока он жив, и главный поток, когда worker недоступен. */
interface Runner {
  run(file: Blob): Promise<ProcessedPhoto>;
  dispose(): void;
}

function createRunner(options: ProcessPhotoFilesOptions): Runner {
  const mainThreadCodec = options.codec ?? createCanvasPhotoCodec();
  const runOnMainThread = (file: Blob) => processPhoto(mainThreadCodec, file);

  const workerWanted = options.codec === undefined && (options.preferWorker ?? canUseImageWorker());
  let worker: PhotoRunner | undefined;
  if (workerWanted) {
    try {
      worker = createPhotoWorkerRunner();
    } catch {
      // worker недоступен (старый WebView, отключённые модульные воркеры) — работаем на главном потоке
    }
  }

  return {
    run: async (file) => {
      if (!worker) {
        return runOnMainThread(file);
      }
      try {
        return await worker.run(file);
      } catch (error) {
        if (!(error instanceof PhotoWorkerUnavailableError)) {
          throw error;
        }
        // worker упал сам, файл он не отвергал: больше его не используем и повторяем файл на главном потоке
        worker.dispose();
        worker = undefined;
        return runOnMainThread(file);
      }
    },
    dispose: () => worker?.dispose(),
  };
}

/** Браузер не прочитал HEIC: конвертируем файл в JPEG. Нет конвертера или он упал — понятная ошибка. */
async function convertHeic(file: Blob, loadConverter: () => Promise<HeicConverter>): Promise<Blob> {
  try {
    const converter = await loadConverter();
    return await converter(file);
  } catch {
    throw new PhotoProcessingError('heic-unsupported');
  }
}

async function processFile(file: Blob, runner: Runner, loadConverter: () => Promise<HeicConverter>): Promise<ProcessedPhoto> {
  if (!isImageFile(file)) {
    throw new PhotoProcessingError('not-image');
  }
  try {
    return await runner.run(file);
  } catch (error) {
    const decodeFailed = error instanceof PhotoProcessingError && error.kind === 'decode-failed';
    if (!decodeFailed || !isHeic(file)) {
      throw error;
    }
  }
  return runner.run(await convertHeic(file, loadConverter));
}

/**
 * Обработать выбранные файлы по одному. Порядок сохраняется, ошибка одного файла не отменяет остальные:
 * результат по каждому месту — либо фото, либо причина отказа (её текст показывает вызывающий экран).
 */
export async function processPhotoFiles(
  files: Iterable<Blob>,
  options: ProcessPhotoFilesOptions = {},
): Promise<Array<ProcessedPhoto | PhotoProcessingError>> {
  const list = [...files];
  const loadConverter = options.loadConverter ?? loadHeicConverter;
  const runner = createRunner(options);
  const results: Array<ProcessedPhoto | PhotoProcessingError> = [];
  try {
    for (const [index, file] of list.entries()) {
      try {
        results.push(await processFile(file, runner, loadConverter));
      } catch (error) {
        results.push(error instanceof PhotoProcessingError ? error : new PhotoProcessingError('decode-failed'));
      }
      options.onProgress?.(index + 1, list.length);
    }
  } finally {
    runner.dispose();
  }
  return results;
}
