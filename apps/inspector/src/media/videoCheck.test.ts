import { describe, expect, it } from 'vitest';
import { checkVideoFile, VIDEO_MAX_BYTES, VIDEO_WARN_BYTES } from './videoCheck';

/** Файл заданного размера без выделения памяти: размер подменяется, содержимое не нужно. */
function video(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const MB = 1024 * 1024;

describe('checkVideoFile', () => {
  it('обычный MP4 проходит без предупреждения', () => {
    const result = checkVideoFile(video('walkaround.mp4', 'video/mp4', 120 * MB));

    expect(result).toEqual({ ok: true, contentType: 'video/mp4', sizeBytes: 120 * MB });
  });

  it('от 300 МБ — предупреждение, но загрузка разрешена', () => {
    const result = checkVideoFile(video('walkaround.mp4', 'video/mp4', VIDEO_WARN_BYTES));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warning).toContain('300');
    }
  });

  it('от 1 ГБ — отказ с подсказкой про 3 минуты', () => {
    const result = checkVideoFile(video('walkaround.mp4', 'video/mp4', VIDEO_MAX_BYTES));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem).toBe('too-large');
      expect(result.message).toContain('3 минут');
    }
  });

  it('чуть меньше лимитов не срабатывает', () => {
    const justUnderWarn = checkVideoFile(video('a.mp4', 'video/mp4', VIDEO_WARN_BYTES - 1));
    const justUnderMax = checkVideoFile(video('a.mp4', 'video/mp4', VIDEO_MAX_BYTES - 1));

    expect(justUnderWarn.ok && justUnderWarn.warning).toBeFalsy();
    expect(justUnderMax.ok).toBe(true);
  });

  it('MOV с iPhone отклоняется сразу, с подсказкой про совместимый формат', () => {
    const byType = checkVideoFile(video('IMG_0001.MOV', 'video/quicktime', 50 * MB));
    const byExtension = checkVideoFile(video('IMG_0001.MOV', '', 50 * MB));

    for (const result of [byType, byExtension]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.problem).toBe('unsupported-format');
        expect(result.message).toContain('Наиболее совместимый');
      }
    }
  });

  it('пустой тип у MP4 с Android: решает расширение', () => {
    expect(checkVideoFile(video('VID_0001.mp4', '', 10 * MB)).ok).toBe(true);
    expect(checkVideoFile(video('VID_0001.mp4', 'application/octet-stream', 10 * MB)).ok).toBe(true);
  });

  it('не видео и пустой файл отклоняются', () => {
    const image = checkVideoFile(video('photo.jpg', 'image/jpeg', 1 * MB));
    const webm = checkVideoFile(video('clip.webm', 'video/webm', 1 * MB));
    const empty = checkVideoFile(video('empty.mp4', 'video/mp4', 0));

    expect(image).toMatchObject({ ok: false, problem: 'unsupported-format' });
    expect(webm).toMatchObject({ ok: false, problem: 'unsupported-format' });
    expect(empty).toMatchObject({ ok: false, problem: 'empty' });
  });
});
