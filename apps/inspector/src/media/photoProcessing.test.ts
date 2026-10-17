import { describe, expect, it, vi } from 'vitest';
import type { PhotoCodec } from './photoCodec';
import {
  fitInto,
  getPhotoErrorMessage,
  isHeic,
  isImageFile,
  JPEG_QUALITY,
  MAX_PHOTO_SIDE,
  PhotoProcessingError,
  processPhoto,
  THUMB_SIDE,
} from './photoProcessing';

/** Кодек без браузера: «изображение» — это только размеры, «JPEG» — маленький Blob с типом image/jpeg. */
function fakeCodec(source: { width: number; height: number }, overrides: Partial<PhotoCodec> = {}) {
  const bitmap = { width: source.width, height: source.height, close: vi.fn() } as unknown as ImageBitmap;
  const codec = {
    decode: vi.fn(async () => bitmap),
    encode: vi.fn(async () => new Blob(['jpeg-bytes'], { type: 'image/jpeg' })),
    close: vi.fn((target: ImageBitmap | undefined) => target?.close()),
    ...overrides,
  } as PhotoCodec & { decode: ReturnType<typeof vi.fn>; encode: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  return { codec, bitmap };
}

function file(name: string, type: string): File {
  return new File(['pixels'], name, { type });
}

describe('isHeic', () => {
  it('узнаёт HEIC по типу файла', () => {
    expect(isHeic(file('IMG_0001.heic', 'image/heic'))).toBe(true);
    expect(isHeic(file('IMG_0001.heif', 'image/heif'))).toBe(true);
    expect(isHeic(file('a', 'IMAGE/HEIC'))).toBe(true);
  });

  it('при пустом типе смотрит на расширение', () => {
    expect(isHeic(file('IMG_0001.HEIC', ''))).toBe(true);
    expect(isHeic(file('IMG_0001.heif', 'application/octet-stream'))).toBe(true);
  });

  it('обычный JPEG и PNG — не HEIC', () => {
    expect(isHeic(file('IMG_0001.jpg', 'image/jpeg'))).toBe(false);
    expect(isHeic(file('IMG_0001.png', 'image/png'))).toBe(false);
    expect(isHeic(file('IMG_0001.jpg', ''))).toBe(false);
  });

  it('расширение не перебивает известный тип', () => {
    expect(isHeic(file('photo.heic', 'image/jpeg'))).toBe(false);
  });
});

describe('isImageFile', () => {
  it('принимает image/* и файлы с пустым типом по расширению', () => {
    expect(isImageFile(file('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isImageFile(file('a.HEIC', ''))).toBe(true);
    expect(isImageFile(file('a.jpeg', 'application/octet-stream'))).toBe(true);
  });

  it('отклоняет не изображения', () => {
    expect(isImageFile(file('a.pdf', 'application/pdf'))).toBe(false);
    expect(isImageFile(file('a.mp4', 'video/mp4'))).toBe(false);
    expect(isImageFile(file('notes', ''))).toBe(false);
  });
});

describe('fitInto', () => {
  it('уменьшает по длинной стороне и сохраняет пропорции', () => {
    expect(fitInto({ width: 4032, height: 3024 }, MAX_PHOTO_SIDE)).toEqual({ width: 2560, height: 1920 });
    expect(fitInto({ width: 3024, height: 4032 }, MAX_PHOTO_SIDE)).toEqual({ width: 1920, height: 2560 });
  });

  it('не увеличивает меньшие изображения', () => {
    expect(fitInto({ width: 800, height: 600 }, MAX_PHOTO_SIDE)).toEqual({ width: 800, height: 600 });
    expect(fitInto({ width: 2560, height: 100 }, MAX_PHOTO_SIDE)).toEqual({ width: 2560, height: 100 });
  });

  it('не даёт стороне схлопнуться в ноль на очень узкой картинке', () => {
    expect(fitInto({ width: 10000, height: 1 }, THUMB_SIDE).height).toBe(1);
  });
});

describe('processPhoto', () => {
  it('большое фото уменьшается до 2560 по длинной стороне, миниатюра — до 480', async () => {
    const { codec } = fakeCodec({ width: 4032, height: 3024 });

    const result = await processPhoto(codec, file('IMG_0001.jpg', 'image/jpeg'));

    expect(result.width).toBe(2560);
    expect(result.height).toBe(1920);
    expect(result.thumb.width).toBe(480);
    expect(result.thumb.height).toBe(360);
  });

  it('маленькое фото не увеличивается', async () => {
    const { codec } = fakeCodec({ width: 640, height: 480 });

    const result = await processPhoto(codec, file('small.jpg', 'image/jpeg'));

    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
    expect(result.thumb.width).toBe(480);
    expect(result.thumb.height).toBe(360);
  });

  it('кодирует в JPEG с качеством 0.82 и всегда отдаёт contentType image/jpeg', async () => {
    const { codec } = fakeCodec({ width: 4032, height: 3024 });

    const result = await processPhoto(codec, file('IMG_0001.heic', 'image/heic'));

    expect(result.contentType).toBe('image/jpeg');
    expect(result.blob.type).toBe('image/jpeg');
    expect(codec.encode).toHaveBeenCalledTimes(2);
    for (const call of codec.encode.mock.calls) {
      expect(call[2]).toBe(JPEG_QUALITY);
    }
    expect(JPEG_QUALITY).toBe(0.82);
  });

  it('даже маленький JPEG проходит через перекодирование: так из него уходят EXIF и GPS', async () => {
    const original = file('with-gps.jpg', 'image/jpeg');
    const { codec } = fakeCodec({ width: 320, height: 240 });

    const result = await processPhoto(codec, original);

    expect(codec.encode).toHaveBeenCalled();
    // На выходе не исходный файл, а то, что нарисовал canvas
    expect(result.blob).not.toBe(original);
    expect(await result.blob.text()).toBe('jpeg-bytes');
  });

  it('освобождает изображение после успеха и при ошибке кодирования', async () => {
    const ok = fakeCodec({ width: 100, height: 100 });
    await processPhoto(ok.codec, file('a.jpg', 'image/jpeg'));
    expect(ok.bitmap.close).toHaveBeenCalledTimes(1);

    const broken = fakeCodec(
      { width: 100, height: 100 },
      {
        encode: vi.fn(async () => {
          throw new Error('canvas упал');
        }),
      },
    );
    await expect(processPhoto(broken.codec, file('a.jpg', 'image/jpeg'))).rejects.toMatchObject({ kind: 'encode-failed' });
    expect(broken.bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('браузер не смог раскодировать файл → decode-failed, закрывать нечего', async () => {
    const { codec } = fakeCodec(
      { width: 100, height: 100 },
      {
        decode: vi.fn(async () => {
          throw new Error('нельзя декодировать');
        }),
      },
    );

    await expect(processPhoto(codec, file('a.heic', 'image/heic'))).rejects.toMatchObject({ kind: 'decode-failed' });
    expect(codec.close).toHaveBeenCalledWith(undefined);
  });

  it('пустой результат кодирования и нулевой размер считаются ошибкой', async () => {
    const empty = fakeCodec({ width: 100, height: 100 }, { encode: vi.fn(async () => new Blob([], { type: 'image/jpeg' })) });
    await expect(processPhoto(empty.codec, file('a.jpg', 'image/jpeg'))).rejects.toMatchObject({ kind: 'encode-failed' });

    const zero = fakeCodec({ width: 0, height: 0 });
    await expect(processPhoto(zero.codec, file('a.jpg', 'image/jpeg'))).rejects.toMatchObject({ kind: 'decode-failed' });
    expect(zero.bitmap.close).toHaveBeenCalledTimes(1);
  });
});

describe('getPhotoErrorMessage', () => {
  it('для каждой причины есть понятный текст', () => {
    for (const kind of ['not-image', 'heic-unsupported', 'decode-failed', 'encode-failed'] as const) {
      expect(getPhotoErrorMessage(kind)).not.toBe('');
    }
    expect(new PhotoProcessingError('heic-unsupported').kind).toBe('heic-unsupported');
  });
});
