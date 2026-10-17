/*
 * Выбор и загрузка фото (MINI-13, PLAN_FRONTEND_MINIAPP.md, раздел 3.4–3.5).
 *
 * Сквозной путь одного фото: выбрать файл → обработать (HEIC→JPEG, ресайз, миниатюра) → показать превью с
 * подтверждением → поставить в очередь загрузок (MINI-11). Локальный тег обязательного фото ставит экран, когда
 * загрузка дошла до `done` и у задачи появился `s3Key` (тег живёт в `localMediaTags`, ключ — `s3Key`).
 *
 * Подтверждение перед загрузкой — единственная защита: удалить медиа нельзя (BE-12 не реализован), поэтому ошибочное
 * фото навсегда останется в отчёте. Как только появится BE-12, подтверждение можно заменить кнопкой «Удалить».
 *
 * Обязательные фото — только локальный тег: на бэкенде до BE-11 они обычные глобальные фото, сервер их не отличает.
 * Миниатюра может не совпадать с полным фото (S-22/B-97) — принятый риск, не чинить.
 */

import { useCallback, useRef, useState } from 'react';
import type { MediaKind } from '@/api/types';
import type { MediaTag } from '@/features/reports/draft';
import { useUploadQueue } from '@/media/uploadQueue';
import { createPhotoInput, processPhotoFiles } from '@/media/photoPipeline';
import { getPhotoErrorMessage, type ProcessedPhoto } from '@/media/photoProcessing';

export interface PickPhotoOptions {
  reportId: string;
  sectionId: string | null;
  kind: MediaKind;
  /** Тег обязательного фото: уходит в задачу очереди, экран пишет его в `localMediaTags` по `s3Key` после `done`. */
  tag?: MediaTag;
}

/** Превью до постановки в очередь: файл ещё не грузится, подборщик подтверждает загрузку. */
export interface PendingPhoto {
  file: File;
  photo: ProcessedPhoto;
  /** Тег, с которым фото было выбрано: подтверждение ставит его в очередь и запоминает для экрана. */
  tag?: MediaTag;
}

export function usePhotoUpload() {
  const enqueue = useUploadQueue((state) => state.enqueue);

  const [pending, setPending] = useState<PendingPhoto | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  /** Открыть выбор фото (камера или галерея). `capture` — съёмка, без него — галерея. */
  const openPicker = useCallback((options: PickPhotoOptions, capture?: 'environment') => {
    setError(null);
    const input = createPhotoInput({ capture, multiple: false });
    inputRef.current = input;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setProcessing(true);
      void processPhotoFiles([file], { preferWorker: false })
        .then(([result]) => {
          if (!result) return;
          if (result instanceof Error) {
            setError(getPhotoErrorMessage((result as { kind: Parameters<typeof getPhotoErrorMessage>[0] }).kind));
            return;
          }
          setPending({ file, photo: result, tag: options.tag });
        })
        .catch(() => setError('Не удалось подготовить фото'))
        .finally(() => setProcessing(false));
    };
    input.click();
  }, []);

  /** Подтвердить загрузку: поставить в очередь. Возвращает `null`, если нечего грузить. */
  const confirm = useCallback(
    (options: PickPhotoOptions) => {
      if (!pending) return null;
      const { reportId, sectionId, kind, tag } = options;
      enqueue({
        reportId,
        sectionId,
        kind,
        contentType: pending.photo.contentType,
        ...(tag ? { tag } : {}),
        blob: pending.photo.blob,
        thumb: pending.photo.thumb.blob,
      });
      setPending(null);
      return true;
    },
    [pending, enqueue],
  );

  const cancel = useCallback(() => setPending(null), []);

  return { pending, processing, error, openPicker, confirm, cancel };
}