/*
 * Конвертация цены между BYN (для ввода/показа) и копейками (контракт API, PLAN_FRONTEND_MINIAPP.md, раздел 2.8).
 *
 * Один источник правил округления, чтобы «49,90» → 4990 и обратно не разъезжались из-за floating point. Ввод — строка:
 * поле не может держать число, пока пользователь печатает «49,». Все вычисления — в целых копейках.
 */

/** «49,90» → 4990. Пустая строка и мусор → `null`. Дробная часть — строго две цифры (50 → 5000, 49,9 → 4990). */
export function bynToKopecks(input: string): number | null {
  const trimmed = input.trim().replace(',', '.');
  if (trimmed === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [rubles, fraction] = trimmed.split('.');
  const rub = Number(rubles ?? 0);
  const kopecks = Number((fraction ?? '').padEnd(2, '0'));
  const value = rub * 100 + kopecks;
  return Number.isFinite(value) ? value : null;
}

/** 4990 → «49,90». Для показа в поле ввода. */
export function kopecksToByn(kopecks: number): string {
  const rubles = Math.trunc(kopecks / 100);
  const fraction = String(Math.abs(kopecks % 100)).padStart(2, '0');
  return `${rubles},${fraction}`;
}

/** 4990 → «49,90 BYN». Для подписей вне поля ввода. */
export function formatPriceByn(kopecks: number | null): string {
  if (kopecks === null) return '—';
  return `${kopecksToByn(kopecks)} BYN`;
}

/** Минимум и максимум, которые держит только фронт (бэкенд знак и диапазон не проверяет). */
export const PRICE_MIN_BYN = 1;
export const PRICE_MAX_BYN = 1_000_000;

/** Проверка введённой строки на допустимый диапазон. `null` — не число (не показываем ошибку). */
export function priceError(input: string): 'min' | 'max' | null {
  const kopecks = bynToKopecks(input);
  if (kopecks === null) return null;
  if (kopecks < PRICE_MIN_BYN * 100) return 'min';
  if (kopecks > PRICE_MAX_BYN * 100) return 'max';
  return null;
}