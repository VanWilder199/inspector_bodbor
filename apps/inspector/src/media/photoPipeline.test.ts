import { describe, expect, it, vi } from 'vitest';
import { HeicUnavailableError, loadHeicConverter } from './heicConverter';
import type { PhotoCodec } from './photoCodec';
import { createPhotoInput, processPhotoFiles } from './photoPipeline';
import { PhotoProcessingError, type ProcessedPhoto } from './photoProcessing';

function jpegBlob(): Blob {
  return new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
}

/** Кодек, который раскодирует только то, что ему разрешили: так проверяется ветка «браузер сам умеет HEIC». */
function fakeCodec(canDecode: (file: Blob) => boolean, size = { width: 4032, height: 3024 }) {
  const decoded: Blob[] = [];
  const codec = {
    decode: vi.fn(async (file: Blob) => {
      if (!canDecode(file)) {
        throw new Error('браузер не умеет этот формат');
      }
      decoded.push(file);
      return { width: size.width, height: size.height, close: vi.fn() } as unknown as ImageBitmap;
    }),
    encode: vi.fn(async () => jpegBlob()),
    close: vi.fn(),
  } satisfies PhotoCodec;
  return { codec, decoded };
}

function image(name: string, type: string): File {
  return new File(['pixels'], name, { type });
}

function asPhoto(result: ProcessedPhoto | PhotoProcessingError): ProcessedPhoto {
  if (result instanceof PhotoProcessingError) {
    throw result;
  }
  return result;
}

describe('createPhotoInput', () => {
  it('камера: accept=image/*, capture=environment, multiple', () => {
    const input = createPhotoInput({ capture: 'environment' });

    expect(input.type).toBe('file');
    expect(input.accept).toBe('image/*');
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.multiple).toBe(true);
  });

  it('галерея: без capture', () => {
    const input = createPhotoInput();

    expect(input.hasAttribute('capture')).toBe(false);
    expect(input.accept).toBe('image/*');
    expect(input.multiple).toBe(true);
  });
});

describe('processPhotoFiles: HEIC', () => {
  it('браузер сам читает HEIC → конвертер не загружается', async () => {
    const { codec } = fakeCodec(() => true);
    const loadConverter = vi.fn(async () => async () => jpegBlob());

    const [result] = await processPhotoFiles([image('IMG_0001.heic', 'image/heic')], { codec, loadConverter });

    expect(asPhoto(result!).contentType).toBe('image/jpeg');
    expect(loadConverter).not.toHaveBeenCalled();
  });

  it('браузер не прочитал HEIC → heic2any конвертирует, обработка повторяется на JPEG', async () => {
    const { codec, decoded } = fakeCodec((file) => file.type !== 'image/heic');
    const converted = jpegBlob();
    const convert = vi.fn(async () => converted);
    const loadConverter = vi.fn(async () => convert);
    const heic = image('IMG_0001.heic', 'image/heic');

    const [result] = await processPhotoFiles([heic], { codec, loadConverter });

    expect(loadConverter).toHaveBeenCalledTimes(1);
    expect(convert).toHaveBeenCalledWith(heic);
    expect(decoded).toEqual([converted]);
    expect(asPhoto(result!).contentType).toBe('image/jpeg');
  });

  it('пакета heic2any нет → понятная ошибка heic-unsupported, а не падение', async () => {
    const { codec } = fakeCodec((file) => file.type !== 'image/heic');
    const loadConverter = vi.fn(async () => {
      throw new HeicUnavailableError();
    });

    const [result] = await processPhotoFiles([image('IMG_0001.heic', 'image/heic')], { codec, loadConverter });

    expect(result).toBeInstanceOf(PhotoProcessingError);
    expect((result as PhotoProcessingError).kind).toBe('heic-unsupported');
  });

  it('конвертер упал на файле → heic-unsupported', async () => {
    const { codec } = fakeCodec((file) => file.type !== 'image/heic');
    const loadConverter = vi.fn(async () => async () => {
      throw new Error('битый HEIC');
    });

    const [result] = await processPhotoFiles([image('IMG_0001.heic', 'image/heic')], { codec, loadConverter });

    expect((result as PhotoProcessingError).kind).toBe('heic-unsupported');
  });

  it('не-HEIC, который не открылся, конвертером не лечится: decode-failed', async () => {
    const { codec } = fakeCodec(() => false);
    const loadConverter = vi.fn(async () => async () => jpegBlob());

    const [result] = await processPhotoFiles([image('broken.jpg', 'image/jpeg')], { codec, loadConverter });

    expect((result as PhotoProcessingError).kind).toBe('decode-failed');
    expect(loadConverter).not.toHaveBeenCalled();
  });

  it('HEIC с пустым типом узнаётся по расширению', async () => {
    const { codec } = fakeCodec((file) => file.type !== '');
    const loadConverter = vi.fn(async () => async () => jpegBlob());

    const [result] = await processPhotoFiles([image('IMG_0002.HEIC', '')], { codec, loadConverter });

    expect(loadConverter).toHaveBeenCalledTimes(1);
    expect(asPhoto(result!).contentType).toBe('image/jpeg');
  });
});

describe('loadHeicConverter', () => {
  it('без установленного пакета бросает HeicUnavailableError, а не неразрешённый импорт', async () => {
    // В зависимостях проекта heic2any нет (ставит пользователь). Когда пакет появится, этот тест нужно заменить на проверку
    // реальной конвертации и перевести `import()` в heicConverter.ts на статический спецификатор.
    await expect(loadHeicConverter()).rejects.toBeInstanceOf(HeicUnavailableError);
  });
});

describe('processPhotoFiles: общее', () => {
  it('файл не-изображение отклоняется как not-image, остальные обрабатываются', async () => {
    const { codec } = fakeCodec(() => true);

    const results = await processPhotoFiles([image('doc.pdf', 'application/pdf'), image('a.jpg', 'image/jpeg')], { codec });

    expect((results[0] as PhotoProcessingError).kind).toBe('not-image');
    expect(asPhoto(results[1]!).contentType).toBe('image/jpeg');
  });

  it('файлы идут строго по одному и в исходном порядке', async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const codec = {
      decode: vi.fn(async (file: Blob) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        order.push((file as File).name);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { width: 100, height: 100, close: vi.fn() } as unknown as ImageBitmap;
      }),
      encode: vi.fn(async () => jpegBlob()),
      close: vi.fn(() => {
        active -= 1;
      }),
    } satisfies PhotoCodec;

    await processPhotoFiles(
      ['1.jpg', '2.jpg', '3.jpg', '4.jpg'].map((name) => image(name, 'image/jpeg')),
      { codec },
    );

    expect(maxActive).toBe(1);
    expect(order).toEqual(['1.jpg', '2.jpg', '3.jpg', '4.jpg']);
  });

  it('сообщает прогресс по каждому файлу, в том числе по неудачному', async () => {
    const { codec } = fakeCodec((file) => (file as File).name !== 'bad.jpg');
    const onProgress = vi.fn();

    await processPhotoFiles([image('a.jpg', 'image/jpeg'), image('bad.jpg', 'image/jpeg'), image('c.jpg', 'image/jpeg')], {
      codec,
      onProgress,
    });

    expect(onProgress.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('без worker и без подменённого кодека работает на главном потоке (preferWorker: false)', async () => {
    // В happy-dom нет createImageBitmap: настоящий кодек упадёт, и это даёт decode-failed, а не зависание
    const [result] = await processPhotoFiles([image('a.jpg', 'image/jpeg')], { preferWorker: false });

    expect(result).toBeInstanceOf(PhotoProcessingError);
    expect((result as PhotoProcessingError).kind).toBe('decode-failed');
  });
});
