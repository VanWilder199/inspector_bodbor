/*
 * Ленивая загрузка конвертера HEIC → JPEG (MINI-12, PLAN_FRONTEND_MINIAPP.md, раздел 3.5).
 *
 * `heic2any` — libheif на wasm, около 1 МБ. Нужен только если браузер сам не прочитал HEIC (Safari 17+ и iOS WebView
 * читают его сами), поэтому грузится по требованию и в основной бандл не входит. В Web Worker этот модуль не попадает:
 * конвертацию делает главный поток (`photoPipeline.ts`), а в worker уходит уже готовый JPEG.
 *
 * ПОКА ПАКЕТ НЕ УСТАНОВЛЕН (`npm install heic2any` — делает пользователь) спецификатор собран в переменную с
 * `@vite-ignore`: так сборка и тесты не падают на неразрешённом импорте, а отсутствие пакета превращается в
 * `HeicUnavailableError` → «формат HEIC не поддержан».
 *
 * ПОСЛЕ УСТАНОВКИ пакета нужна одна правка: заменить `import(/* @vite-ignore *\/ specifier)` на обычный
 * `import('heic2any')`. С переменной бандлер не упакует пакет, и в продакшн-сборке голый спецификатор в браузере
 * не разрешится. Пакет попадёт в отдельный ленивый чанк; проверить по отчёту `npm run build`, что в основной
 * `index-*.js` он не вошёл (критерий приёмки MINI-12).
 */

/** Конвертер HEIC → JPEG. `heic2any` отдаёт один Blob или массив, интерфейс скрывает эту разницу. */
export type HeicConverter = (file: Blob) => Promise<Blob>;

/** Конвертер HEIC недоступен: пакет не установлен или не загрузился. */
export class HeicUnavailableError extends Error {
  constructor() {
    super('heic2any недоступен');
    this.name = 'HeicUnavailableError';
  }
}

interface Heic2AnyModule {
  default?: unknown;
}

type Heic2AnyFunction = (options: { blob: Blob; toType: string }) => Promise<Blob | Blob[]>;

export async function loadHeicConverter(): Promise<HeicConverter> {
  const specifier = 'heic2any';
  let loaded: unknown;
  try {
    loaded = await import(/* @vite-ignore */ specifier);
  } catch {
    throw new HeicUnavailableError();
  }
  const candidate = (loaded as Heic2AnyModule).default ?? loaded;
  if (typeof candidate !== 'function') {
    throw new HeicUnavailableError();
  }
  const convert = candidate as Heic2AnyFunction;
  return async (file: Blob) => {
    const result = await convert({ blob: file, toType: 'image/jpeg' });
    const first = Array.isArray(result) ? result[0] : result;
    if (!first) {
      throw new Error('heic2any не вернул изображение');
    }
    return first;
  };
}
