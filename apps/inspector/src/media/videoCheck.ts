/*
 * Проверка видео перед загрузкой (MINI-12, PLAN_FRONTEND_MINIAPP.md, раздел 3.5).
 *
 * Видео в браузере НЕ перекодируется: ffmpeg.wasm на телефоне занимает десятки секунд на минуту ролика и сотни МБ памяти.
 * Здесь только проверка типа и размера. Видео обхода на 2–3 минуты в 1080p весит 200–600 МБ, а один presigned PUT на такой
 * объём — самое хрупкое место (после разрыва загрузка идёт заново, multipart — BE-20), поэтому предупреждаем заранее.
 */

import type { MediaContentType } from '@/api/types';

export const VIDEO_WARN_BYTES = 300 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024;

/** Подсказка под кнопкой выбора видео. */
export const VIDEO_LENGTH_HINT = 'Снимайте видео обхода не длиннее 3 минут';

const MP4_EXTENSION = /\.mp4$/i;
const MOV_EXTENSION = /\.mov$/i;

export type VideoProblem = 'empty' | 'unsupported-format' | 'too-large';

export type VideoCheck =
  | {
      ok: true;
      contentType: Extract<MediaContentType, 'video/mp4'>;
      sizeBytes: number;
      /** Файл большой, но проходит: загрузка будет долгой, приложение нельзя закрывать. */
      warning?: string;
    }
  | { ok: false; problem: VideoProblem; message: string };

const MOV_HINT =
  'Видео в формате MOV пока не принимается. В настройках камеры iPhone выберите «Форматы» → «Наиболее совместимый» и снимите заново';

function fail(problem: VideoProblem, message: string): VideoCheck {
  return { ok: false, problem, message };
}

function formatMegabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/**
 * Принимает только `video/mp4`: так сейчас написано на бэкенде (`MediaServiceImpl.java:30-34`). `video/quicktime`
 * (.MOV с iPhone) он отклонит с `NOT_ALLOWDED_MEDIA_TYPE`, поэтому отказываем сразу с подсказкой, а не после долгой загрузки.
 * Когда бэкенд разрешит `video/quicktime` (BE-10 / B-02), тип добавляется здесь и в `MediaContentType`.
 *
 * У файлов с Android `type` бывает пустым — тогда смотрим на расширение.
 */
export function checkVideoFile(file: Blob): VideoCheck {
  const name = (file as Partial<File>).name ?? '';
  const type = file.type.toLowerCase();
  const typeUnknown = type === '' || type === 'application/octet-stream';

  if (type === 'video/quicktime' || (typeUnknown && MOV_EXTENSION.test(name))) {
    return fail('unsupported-format', MOV_HINT);
  }
  if (type !== 'video/mp4' && !(typeUnknown && MP4_EXTENSION.test(name))) {
    return fail('unsupported-format', 'Выберите видео в формате MP4');
  }
  if (file.size === 0) {
    return fail('empty', 'Файл пустой. Выберите другое видео');
  }
  if (file.size >= VIDEO_MAX_BYTES) {
    return fail(
      'too-large',
      `Видео слишком большое (${formatMegabytes(file.size)} МБ, максимум 1 ГБ). Снимите короткий ролик, до 3 минут`,
    );
  }
  if (file.size >= VIDEO_WARN_BYTES) {
    return {
      ok: true,
      contentType: 'video/mp4',
      sizeBytes: file.size,
      warning: `Большое видео (${formatMegabytes(file.size)} МБ): загрузка займёт много времени. Не закрывайте приложение, пока она идёт`,
    };
  }
  return { ok: true, contentType: 'video/mp4', sizeBytes: file.size };
}
