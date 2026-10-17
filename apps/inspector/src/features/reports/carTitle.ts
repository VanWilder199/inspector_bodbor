const FALLBACK_TITLE = 'Автомобиль';

/** `volkswagen` → `Volkswagen`, `land-rover` → `Land rover`. */
function humanize(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // битая %-последовательность: показываем сегмент как есть
  }
  const text = decoded.replace(/-/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Подпись машины по ссылке av.by вида `https://cars.av.by/volkswagen/passat/112233445`: марка и модель — первые два
 * сегмента пути. Данных машины в `ReportDto` пока нет (BE-8), поэтому подпись берётся из ссылки; заменить после BE-8.
 * Ничего не получилось распознать — «Автомобиль».
 */
export function carTitleFromAvbyUrl(avbyUrl: string): string {
  let segments: string[];
  try {
    segments = new URL(avbyUrl).pathname.split('/').filter(Boolean);
  } catch {
    return FALLBACK_TITLE;
  }
  // Последний числовой сегмент — id объявления, а не марка или модель
  const words = segments.filter((segment) => !/^\d+$/.test(segment)).slice(0, 2);
  return words.length > 0 ? words.map(humanize).join(' ') : FALLBACK_TITLE;
}
