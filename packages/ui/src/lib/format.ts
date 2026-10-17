/*
 * Форматы из PLAN_FRONTEND_DESIGN.md, раздел 6.
 * Все суммы с бэкенда приходят в копейках.
 */

const bynWhole = new Intl.NumberFormat('ru-BY', { maximumFractionDigits: 0 });
const bynFraction = new Intl.NumberFormat('ru-BY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 150000 → «1 500 BYN», 4550 → «45,50 BYN». Копейки только если они не нулевые. */
export function formatByn(kopecks: number): string {
  const formatter = kopecks % 100 === 0 ? bynWhole : bynFraction;
  return `${formatter.format(kopecks / 100)} BYN`;
}

const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

/** «12 сент», год только если не текущий: «12 сент 2025». */
export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const formatter = date.getFullYear() === new Date().getFullYear() ? dayMonth : dayMonthYear;
  return formatter.format(date).replace(/\./g, '').replace(/\s?г$/, '');
}

/** «+375291234567» → «+375 29 123-45-67». Всё, что не похоже на белорусский номер, возвращается как есть. */
export function formatPhone(phone: string): string {
  const match = /^\+375(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return match ? `+375 ${match[1]} ${match[2]}-${match[3]}-${match[4]}` : phone;
}
