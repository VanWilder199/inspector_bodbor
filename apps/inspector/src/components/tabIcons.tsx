import type { SVGProps } from 'react';

/*
 * Иконки таб-бара 28×28 (размер, который ждёт `Tabbar.Item`). В главном экспорте telegram-ui иконок нет,
 * а подходящих по смыслу в его наборе тоже нет, поэтому три простых контурных значка нарисованы здесь.
 * Цвет — `currentColor`: таб-бар сам красит выбранную и невыбранную вкладку.
 */

const base: SVGProps<SVGSVGElement> = {
  width: 28,
  height: 28,
  viewBox: '0 0 28 28',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

/** Отчёты: лист с текстом. */
export function ReportsTabIcon() {
  return (
    <svg {...base}>
      <path d="M8 4h9l5 5v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M17 4v5h5M10.5 14h7M10.5 18h7" />
    </svg>
  );
}

/** Спрос: столбики диаграммы. */
export function DemandTabIcon() {
  return (
    <svg {...base}>
      <path d="M6 23V14M14 23V6M22 23v-10" />
    </svg>
  );
}

/** Профиль: человек. */
export function ProfileTabIcon() {
  return (
    <svg {...base}>
      <circle cx="14" cy="9.5" r="4.5" />
      <path d="M5.5 24c.8-4.6 4.2-7 8.5-7s7.7 2.4 8.5 7" />
    </svg>
  );
}
