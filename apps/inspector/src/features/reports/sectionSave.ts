/*
 * Что именно уходит в `PUT .../sections/{sectionId}` (PLAN_FRONTEND_MINIAPP.md, раздел 2.6).
 *
 * Три ограничения бэкенда, из-за которых нельзя сохранять «как набрано»:
 *  1. `summary` обязателен (`@NotBlank`) — до ввода итога секцию сохранить нечем;
 *  2. у каждого пункта в запросе обязан быть `status` — неоценённые пункты просто не отправляются;
 *  3. пустой `items: []` даёт на бэкенде `500` (BE-14) — такой запрос не формируется никогда.
 *
 * Плюс требование самой задачи MINI-09: на `WARN` и `BAD` подборщик обязан написать комментарий.
 * Пока хотя бы один такой пункт без комментария, секция не уходит на сервер целиком: запрос — полная замена,
 * и отправить половину значило бы стереть на сервере то, что подборщик видит на экране.
 *
 * Здесь нет ни React, ни сети: решения о том, можно ли отправлять, и сборка тела запроса.
 */

import type { ItemStatus, UpdateSectionRequest } from '@/api/types';
import type { SectionDraft } from '@/features/reports/draft';
import { needsComment } from '@/catalog/checklist';

/** Почему секция пока не может уйти на сервер. Пустой объект — можно. */
export interface SectionBlockers {
  /** Нет итога секции (бэкенд требует его в каждом запросе). */
  needsSummary: boolean;
  /** Ни один пункт не оценён: пустой список отправлять нельзя. */
  noRatedItems: boolean;
  /** Ключи пунктов `WARN`/`BAD` без комментария. */
  missingComment: string[];
}

export interface SectionSavePayload {
  /** Тело запроса или `null`, если отправлять пока нечего. */
  request: UpdateSectionRequest | null;
  blockers: SectionBlockers;
}

/**
 * Тело `PUT` из черновика секции. Порядок пунктов задаёт `orderedKeys` (справочник клиента), а не порядок полей
 * в объекте: `order_no` на бэкенде пишется по порядку массива, и он должен быть стабильным между сохранениями.
 * Незнакомые ключи (пришли с сервера, справочник другой версии) добавляются в конец, чтобы не потеряться.
 */
export function buildSectionRequest(section: SectionDraft, orderedKeys: readonly string[]): SectionSavePayload {
  const rated = orderedKeys.flatMap((itemKey) => {
    const item = section.items[itemKey];
    return item?.status ? [{ itemKey, item }] : [];
  });
  const extraRated = Object.entries(section.items)
    .filter(([itemKey, item]) => item.status && !orderedKeys.includes(itemKey))
    .map(([itemKey, item]) => ({ itemKey, item }));

  const all = [...rated, ...extraRated];
  const blockers: SectionBlockers = {
    needsSummary: section.summary.trim() === '',
    noRatedItems: all.length === 0,
    missingComment: all.filter(({ item }) => needsComment(item.status) && (item.comment ?? '').trim() === '').map(({ itemKey }) => itemKey),
  };

  const blocked = blockers.needsSummary || blockers.noRatedItems || blockers.missingComment.length > 0;
  if (blocked) {
    return { request: null, blockers };
  }

  return {
    request: {
      summary: section.summary,
      items: all.map(({ itemKey, item }) => ({
        itemKey,
        status: item.status as ItemStatus,
        comment: item.comment?.trim() ? item.comment : null,
      })),
    },
    blockers,
  };
}

/**
 * Отпечаток того, что реально уходит на сервер: `summary` и оценённые пункты. По нему сохранение понимает,
 * успело ли что-то измениться, пока запрос был в полёте, — и нужно ли отправлять ещё раз (last write wins).
 * Флаги `dirty` и время сохранения сюда не входят: они меняются от самого факта записи и сравнение бы сломали.
 */
export function sectionFingerprint(section: SectionDraft): string {
  const items = Object.keys(section.items)
    .filter((itemKey) => section.items[itemKey]?.status)
    .sort()
    .map((itemKey) => {
      const item = section.items[itemKey]!;
      return [itemKey, item.status, item.comment ?? ''] as const;
    });
  return JSON.stringify([section.summary, items]);
}
