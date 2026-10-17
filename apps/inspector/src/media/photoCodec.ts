/*
 * Примитивы декодирования и перекодирования изображений (MINI-12, план 3.5).
 *
 * Всё, что зависит от браузера, спрятано за интерфейсом `PhotoCodec`: логика обработки (`photoProcessing.ts`)
 * от него не зависит и проверяется тестами с подменённым кодеком (в happy-dom нет ни canvas, ни `createImageBitmap`).
 *
 * `PhotoCodec` обязан быть доступен и на главном потоке, и внутри Web Worker (`photoWorker.ts`) — поэтому здесь нет
 * обращений к `document` вне ветки без `OffscreenCanvas`.
 */

import type { Size } from './photoProcessing';

export interface PhotoCodec {
  /** Раскодировать изображение, применив EXIF-поворот к пикселям. */
  decode(file: Blob): Promise<ImageBitmap>;
  /** Перекодировать в JPEG заданного размера. Сам освобождает память canvas. */
  encode(source: ImageBitmap, size: Size, quality: number): Promise<Blob>;
  /** Отпустить ресурсы раскодированного изображения. */
  close(bitmap: ImageBitmap | undefined): void;
}

/**
 * `from-image` — EXIF-поворот применяется к пикселям, поэтому дальше рисование идёт без дополнительных преобразований.
 * Без этого вертикальные фото с iPhone уезжали бы на бок.
 */
const DECODE_OPTIONS: ImageBitmapOptions = { imageOrientation: 'from-image' };

export function createCanvasPhotoCodec(): PhotoCodec {
  return {
    decode: (file) => createImageBitmap(file, DECODE_OPTIONS),
    encode: encodeAsJpeg,
    close: (bitmap) => {
      bitmap?.close();
    },
  };
}

async function encodeAsJpeg(source: ImageBitmap, size: Size, quality: number): Promise<Blob> {
  // OffscreenCanvas есть и на главном потоке, и в worker — начинаем с него
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(size.width, size.height);
    try {
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('OffscreenCanvas не вернул контекст 2d');
      }
      context.drawImage(source, 0, 0, size.width, size.height);
      return await canvas.convertToBlob({ type: 'image/jpeg', quality });
    } finally {
      // Закрыть canvas нельзя, но сброс размеров возвращает память: iOS WebView падает на нескольких больших подряд
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('canvas не вернул контекст 2d');
    }
    context.drawImage(source, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('canvas.toBlob вернул null'));
          }
        },
        'image/jpeg',
        quality,
      );
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Есть ли в окружении всё для Web Worker с OffscreenCanvas (иначе обработка идёт на главном потоке). */
export function canUseImageWorker(): boolean {
  return typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function';
}
