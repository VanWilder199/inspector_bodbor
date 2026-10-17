/*
 * Временный справочник пунктов чеклиста на клиенте (PLAN_FRONTEND_MINIAPP.md, разделы 2.6 и MINI-09).
 *
 * На бэкенде `itemKey` — свободная строка, и списка пунктов там нет ни в одном виде: эндпоинт справочника
 * (BE-5 / B-25, фича MINI-22) ещё не сделан. Пока раскладка «секция → пункты» и инструкции живут здесь,
 * а подписи берутся из `ITEM_LABELS` (`@podbor/ui`) — того же справочника, которым подписывается превью отчёта.
 * После BE-5 этот файл удаляется: его место занимает ответ `GET /inspector/catalog/checklist`,
 * форма которого уже описана типом `ChecklistCatalog` в `api/types.ts`.
 *
 * Порядок пунктов задаётся здесь, а не ответом сервера: `ReportDto` порядок `items` не гарантирует (раздел 2.5),
 * а `order_no` пишется по порядку массива из запроса — значит порядок должен быть стабильным на клиенте.
 */

import { itemLabel } from '@podbor/ui';
import { SECTION_KEYS, type ItemStatus, type SectionKey } from '@/api/types';
import type { SectionItemDraft } from '@/features/reports/draft';

interface SectionLayout {
  /** Что осмотреть на этом шаге. */
  instruction: string;
  /** Ключи пунктов в порядке показа (тот же порядок уходит в `PUT`). */
  itemKeys: readonly string[];
}

const LAYOUT: Record<SectionKey, SectionLayout> = {
  EXTERIOR: {
    instruction: 'Осмотрите кузов при дневном свете: сначала целиком с четырёх сторон, потом каждый элемент. Отмечайте перекрасы, вмятины и ржавчину.',
    itemKeys: ['geometry', 'dents', 'rust', 'sills', 'underbody', 'gaps', 'glass', 'seals'],
  },
  PAINT: {
    instruction: 'Осмотрите ЛКП и отметьте перекрасы, шпаклёвку и сколы. Толщину по панелям измеряйте на шаге «Замеры ЛКП».',
    itemKeys: ['repaint', 'putty', 'chips', 'polish'],
  },
  INTERIOR: {
    instruction: 'Осмотрите салон: износ, следы затопления, запахи. Отдельно проверьте ремни, потолок и пластик.',
    itemKeys: ['seats', 'steering_wheel', 'plastic', 'smell', 'headliner', 'flood_traces'],
  },
  ENGINE: {
    instruction: 'Осмотрите подкапотное пространство, заведите двигатель, послушайте работу на холодную и на горячую, проверьте уровни и подтёки.',
    itemKeys: ['oil', 'leaks', 'timing', 'coolant', 'battery', 'engine_noise'],
  },
  SUSPENSION: {
    instruction: 'Проедьте по неровностям и послушайте стуки, затем осмотрите шины, тормоза и рычаги.',
    itemKeys: ['shock_absorbers', 'brakes', 'tires', 'control_arms', 'tie_rods', 'cv_joints', 'gearbox_leaks'],
  },
  ELECTRICS: {
    instruction: 'Проверьте весь свет, стеклоподъёмники, кондиционер и приборную панель. Считайте ошибки сканером.',
    itemKeys: ['obd', 'lights', 'dashboard', 'ac', 'windows'],
  },
  DOCUMENTS: {
    instruction: 'Сверьте VIN, техпаспорт, число владельцев, растаможку и отметки в базе ГАИ.',
    itemKeys: ['vin', 'tech_passport', 'owners', 'customs', 'gai', 'service_book'],
  },
};

export interface ChecklistItemView {
  itemKey: string;
  label: string;
}

export function sectionInstruction(sectionKey: SectionKey): string {
  return LAYOUT[sectionKey].instruction;
}

/** Пункты секции к показу: сначала справочник, затем незнакомые ключи из черновика. */
export function orderedSectionItems(sectionKey: SectionKey, items: Record<string, SectionItemDraft>): ChecklistItemView[] {
  const known = LAYOUT[sectionKey].itemKeys.map((itemKey) => ({ itemKey, label: itemLabel(itemKey) }));
  const knownKeys = new Set(LAYOUT[sectionKey].itemKeys);
  // Незнакомые ключи могли прийти с сервера (другая версия справочника): их нельзя терять, иначе сохранение их удалит
  const unknown = Object.keys(items)
    .filter((itemKey) => !knownKeys.has(itemKey))
    .map((itemKey) => ({ itemKey, label: itemLabel(itemKey) }));
  return [...known, ...unknown];
}

/** Проверка ключа секции из адреса: `/reports/:id/section/<что угодно>` должен давать понятный отказ, а не падение. */
export function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

/** Пункту нужен комментарий: на `WARN` и `BAD` подборщик объясняет замечание (требование MINI-09, бэкенд этого не требует). */
export function needsComment(status: ItemStatus | undefined): boolean {
  return status === 'WARN' || status === 'BAD';
}
