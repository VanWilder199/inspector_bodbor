/*
 * Чек-лист готовности отчёта к отправке (PLAN_FRONTEND_MINIAPP.md, раздел 2.8, задача MINI-17).
 *
 * Клиент обязан точно повторять правила `submit` с бэкенда: `409 REPORT_INCOMPLETE` приходит БЕЗ уточнения, что именно
 * не так (BE-13), поэтому фронт сам должен показать «готово» ровно тогда, когда `POST .../submit` не упадёт.
 *
 * Правила (проверяются по порядку, первая неудача даёт 409):
 *  1. отчёт свой, не удалён, статус `draft`/`revision_required`;
 *  2. у каждой из 7 секций `summary != ""` И хотя бы один пункт (хватает одного, полноту по справочнику бэк не проверяет);
 *  3. есть ГЛОБАЛЬНОЕ видео (`sectionId == null`, `kind=VIDEO`, `status IN ('pending','ready')`);
 *  4. `conclusionText` не пуст, `priceByn IS NOT NULL`.
 *
 * Не проверяется бэкендом (предупреждения, не блокеры): фото, замеры ЛКП, полнота справочника, диапазон цены.
 */

import type { ReportDto } from '@/api/types';
import { SECTION_KEYS } from '@/api/types';

export interface ReviewChecklistItem {
  key: string;
  label: string;
  /** `true` — блокирует отправку (совпадает с серверным правилом). */
  blocking: boolean;
  done: boolean;
  detail?: string;
}

/** Правило 3: глобальное видео, которое засчитывает submit. */
function hasGlobalVideo(report: ReportDto): boolean {
  return report.globalMedia.some((media) => media.kind === 'VIDEO' && (media.status === 'pending' || media.status === 'ready'));
}

/** Правило 4: заключение и цена. */
function hasConclusion(report: ReportDto): boolean {
  return report.conclusionText !== null && report.conclusionText.trim() !== '' && report.priceByn !== null;
}

export interface ReviewChecklist {
  items: ReviewChecklistItem[];
  /** `true` — все блокирующие пункты выполнены, отправка доступна. */
  ready: boolean;
  warnings: ReviewChecklistItem[];
}

/** Чек-лист по серверным данным после flush — подборщик видит ровно то, что уйдёт на модерацию. */
export function buildReviewChecklist(report: ReportDto): ReviewChecklist {
  const items: ReviewChecklistItem[] = [];

  for (const key of SECTION_KEYS) {
    const section = report.sections.find((candidate) => candidate.sectionKey === key);
    const summary = section?.summary ?? '';
    const hasItems = (section?.items.length ?? 0) > 0;
    items.push({ key: `section:${key}`, label: `Секция «${key}»: итог`, blocking: true, done: summary.trim() !== '' });
    items.push({ key: `section-items:${key}`, label: `Секция «${key}»: оценки`, blocking: true, done: hasItems });
  }

  const video = hasGlobalVideo(report);
  items.push({ key: 'video', label: 'Видео обхода', blocking: true, done: video, detail: video ? undefined : 'Глобальное видео ещё не загружено' });

  const conclusion = hasConclusion(report);
  items.push({ key: 'conclusion', label: 'Заключение', blocking: true, done: conclusion });
  items.push({
    key: 'price',
    label: 'Цена',
    blocking: true,
    done: report.priceByn !== null && report.priceByn >= 100,
    detail: report.priceByn !== null && report.priceByn < 100 ? 'Минимум 1 BYN' : undefined,
  });

  // Предупреждения: не блокируют отправку, но стоит показать
  const warnings: ReviewChecklistItem[] = [
    { key: 'mandatory-photos', label: 'Обязательные фото', blocking: false, done: true, detail: 'Проверяются только локально (до BE-11)' },
    { key: 'paint', label: 'Замеры ЛКП', blocking: false, done: report.paintMeasurements.length > 0, detail: report.paintMeasurements.length === 0 ? 'Нет замеров ЛКП' : undefined },
  ];

  return { items, ready: items.every((item) => item.done), warnings: warnings.filter((w) => !w.done) };
}