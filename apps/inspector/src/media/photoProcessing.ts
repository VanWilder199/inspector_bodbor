/*
 * Обработка одного фото перед загрузкой (MINI-12, PLAN_FRONTEND_MINIAPP.md, раздел 3.5).
 *
 * Любое фото уходит на сервер как JPEG: бэкенд принимает только `image/png | image/jpeg`, а HEIC с iPhone ему не нужен.
 * Перекодирование заодно уменьшает файл (3–8 МБ → около 1 МБ) и убирает метаданные: canvas не переносит EXIF,
 * включая GPS, поэтому ЛЮБОЕ фото проходит через `encode`, даже если оно уже маленький JPEG. Пропускать перекодирование
 * для «и так подходящих» файлов нельзя — вместе с ним пропадёт и очистка метаданных.
 *
 * Модуль не зависит от браузера: декодирование и рисование делает `PhotoCodec` (`photoCodec.ts`), в тестах его подменяют.
 * Загрузка в S3 и очередь — не здесь (`upload.ts`, MINI-11).
 */

import type { PhotoCodec } from './photoCodec';

/** Длинная сторона итогового фото. Для VIN-таблички и документов читаемости хватает с запасом. */
export const MAX_PHOTO_SIDE = 2560;
/** Длинная сторона миниатюры для очереди и превью на этом устройстве. */
export const THUMB_SIDE = 480;
export const JPEG_QUALITY = 0.82;
export const PHOTO_CONTENT_TYPE = 'image/jpeg' as const;

export interface Size {
  width: number;
  height: number;
}

export interface ProcessedImage extends Size {
  blob: Blob;
}

export interface ProcessedPhoto extends ProcessedImage {
  /** Всегда `image/jpeg`: бэкенд сверяет подпись presigned URL именно с этим значением. */
  contentType: typeof PHOTO_CONTENT_TYPE;
  /** Миниатюра остаётся на устройстве: загрузка второй копии зависит от бэкенд-фичи B-39 (её пока нет). */
  thumb: ProcessedImage;
}

// ---------- Ошибки ----------

export type PhotoErrorKind = 'not-image' | 'heic-unsupported' | 'decode-failed' | 'encode-failed';

export class PhotoProcessingError extends Error {
  constructor(public readonly kind: PhotoErrorKind) {
    super(`Обработка фото: ${kind}`);
    this.name = 'PhotoProcessingError';
  }
}

const PHOTO_ERROR_MESSAGES: Record<PhotoErrorKind, string> = {
  'not-image': 'Выберите изображение',
  'heic-unsupported':
    'Не удалось открыть фото в формате HEIC. В настройках камеры включите «Наиболее совместимый» формат или выберите другое фото',
  'decode-failed': 'Не удалось прочитать фото. Попробуйте выбрать другое',
  'encode-failed': 'Не удалось подготовить фото к загрузке. Попробуйте ещё раз',
};

export function getPhotoErrorMessage(kind: PhotoErrorKind): string {
  return PHOTO_ERROR_MESSAGES[kind];
}

// ---------- Определение формата ----------

const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;
const HEIC_EXTENSION = /\.(heic|heif)$/i;

function nameOf(file: Blob): string {
  return (file as Partial<File>).name ?? '';
}

/** Android и некоторые WebView отдают пустой `type` или `application/octet-stream`: тогда решает расширение. */
function hasUnreliableType(file: Blob): boolean {
  return file.type === '' || file.type === 'application/octet-stream';
}

export function isHeic(file: Blob): boolean {
  if (HEIC_TYPES.has(file.type.toLowerCase())) {
    return true;
  }
  return hasUnreliableType(file) && HEIC_EXTENSION.test(nameOf(file));
}

export function isImageFile(file: Blob): boolean {
  if (file.type.startsWith('image/')) {
    return true;
  }
  return hasUnreliableType(file) && IMAGE_EXTENSION.test(nameOf(file));
}

// ---------- Размеры ----------

/**
 * Вписывает размер в квадрат `maxSide` по длинной стороне. Меньшее изображение остаётся как есть:
 * увеличение только раздувает файл и не добавляет деталей.
 */
export function fitInto(source: Size, maxSide: number): Size {
  const longSide = Math.max(source.width, source.height);
  if (longSide <= maxSide) {
    return { width: source.width, height: source.height };
  }
  const scale = maxSide / longSide;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

// ---------- Обработка ----------

async function encodeChecked(codec: PhotoCodec, bitmap: ImageBitmap, size: Size): Promise<ProcessedImage> {
  let blob: Blob;
  try {
    blob = await codec.encode(bitmap, size, JPEG_QUALITY);
  } catch {
    throw new PhotoProcessingError('encode-failed');
  }
  if (blob.size === 0) {
    throw new PhotoProcessingError('encode-failed');
  }
  return { blob, width: size.width, height: size.height };
}

/**
 * Один файл: раскодировать (EXIF-поворот применяется к пикселям), уменьшить до `MAX_PHOTO_SIDE`, закодировать в JPEG
 * и сделать миниатюру. Файлы нужно обрабатывать строго по одному (`photoPipeline.ts`): несколько больших canvas подряд
 * валят WebView на iOS. После обработки bitmap закрывается всегда, в том числе при ошибке.
 *
 * HEIC, который браузер не умеет читать, здесь не обрабатывается: об этом знает `photoPipeline.ts`, он конвертирует файл
 * и вызывает эту функцию второй раз. Так тяжёлый `heic2any` не попадает в Web Worker.
 */
export async function processPhoto(codec: PhotoCodec, file: Blob): Promise<ProcessedPhoto> {
  let bitmap: ImageBitmap | undefined;
  try {
    try {
      bitmap = await codec.decode(file);
    } catch {
      throw new PhotoProcessingError('decode-failed');
    }
    const source: Size = { width: bitmap.width, height: bitmap.height };
    if (!(source.width > 0 && source.height > 0)) {
      throw new PhotoProcessingError('decode-failed');
    }

    const main = await encodeChecked(codec, bitmap, fitInto(source, MAX_PHOTO_SIDE));
    const thumb = await encodeChecked(codec, bitmap, fitInto(source, THUMB_SIDE));
    return { ...main, contentType: PHOTO_CONTENT_TYPE, thumb };
  } finally {
    codec.close(bitmap);
  }
}
