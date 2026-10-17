import type { ItemStatus, PaintMeasurement, SectionItem } from './types';

const STATUS_WEIGHT: Record<ItemStatus, number> = { OK: 0, WARN: 1, BAD: 2 };

export function worstStatus(items: SectionItem[]): ItemStatus | null {
  if (items.length === 0) return null;
  return items.reduce<ItemStatus>(
    (worst, item) => (STATUS_WEIGHT[item.status] > STATUS_WEIGHT[worst] ? item.status : worst),
    'OK',
  );
}

export function countByStatus(items: SectionItem[]): Record<ItemStatus, number> {
  const counts: Record<ItemStatus, number> = { OK: 0, WARN: 0, BAD: 0 };
  for (const item of items) counts[item.status]++;
  return counts;
}

/** Сначала проблемы, потом замечания, потом норма. */
export function sortBySeverity(items: SectionItem[]): SectionItem[] {
  return [...items].sort((a, b) => STATUS_WEIGHT[b.status] - STATUS_WEIGHT[a.status]);
}

export type PaintLevel = 'factory' | 'repaint' | 'putty' | 'none';

/*
 * Пороги толщины ЛКП в микронах. Ориентировочные — согласовать с подборщиками
 * и при необходимости вынести в конфиг.
 */
export const PAINT_THRESHOLDS = { factoryMax: 170, repaintMax: 300 } as const;

export function paintLevel(thicknessUm: number | undefined): PaintLevel {
  if (thicknessUm === undefined) return 'none';
  if (thicknessUm <= PAINT_THRESHOLDS.factoryMax) return 'factory';
  if (thicknessUm <= PAINT_THRESHOLDS.repaintMax) return 'repaint';
  return 'putty';
}

export const PAINT_LEVEL_LABELS: Record<PaintLevel, string> = {
  factory: `Заводское (до ${PAINT_THRESHOLDS.factoryMax} мкм)`,
  repaint: `Перекрас (${PAINT_THRESHOLDS.factoryMax + 1}–${PAINT_THRESHOLDS.repaintMax} мкм)`,
  putty: `Шпаклёвка (более ${PAINT_THRESHOLDS.repaintMax} мкм)`,
  none: 'Нет замера',
};

/** На одной панели может быть несколько замеров (`spot`) — для схемы берём максимальный. */
export function maxThicknessByPanel(measurements: PaintMeasurement[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const m of measurements) {
    const current = result.get(m.panelCode);
    if (current === undefined || m.thicknessUm > current) result.set(m.panelCode, m.thicknessUm);
  }
  return result;
}

export function formatPrice(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} BYN`;
}
