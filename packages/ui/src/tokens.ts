/*
 * Те же значения, что в theme.css (Tailwind читает CSS, MUI-тема админки — JS).
 * Меняете цвет — меняйте в обоих файлах.
 */
export const tokens = {
  ink: '#111418',
  inkMuted: '#70757f',
  surface: '#ffffff',
  canvas: '#f6f7f8',
  line: '#e6e8eb',
  brand: '#3b6cf6',
  ok: '#15803d',
  okSoft: '#dcfce7',
  warn: '#b45309',
  warnSoft: '#fef3c7',
  bad: '#b91c1c',
  badSoft: '#fee2e2',
  fontSans: '"Onest Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
} as const;
