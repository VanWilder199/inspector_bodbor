/*
 * Web Worker обработки изображений (MINI-12). Отдельный модуль, потому что Vite поднимает его по `new URL(..., import.meta.url)`.
 *
 * Внутри только декодирование и рисование: `heic2any` сюда не попадает (это около 1 МБ wasm на каждого, кто открыл
 * приложение). HEIC, который worker не смог раскодировать, конвертирует главный поток (`photoPipeline.ts`) и присылает сюда уже JPEG.
 *
 * Ответ несёт тип ошибки, а не объект: классы из разных realm не сравниваются `instanceof`, поэтому клиент
 * восстанавливает `PhotoProcessingError` на своей стороне.
 */

import { createCanvasPhotoCodec } from './photoCodec';
import { processPhoto } from './photoProcessing';

interface WorkerRequest {
  id: number;
  file: Blob;
}

const codec = createCanvasPhotoCodec();

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, file } = event.data;
  try {
    const photo = await processPhoto(codec, file);
    self.postMessage({ id, ok: true, photo });
  } catch (error) {
    const kind = error instanceof Error && error.name === 'PhotoProcessingError' ? (error as { kind?: string }).kind : undefined;
    self.postMessage({ id, ok: false, kind: kind ?? 'decode-failed' });
  }
};
