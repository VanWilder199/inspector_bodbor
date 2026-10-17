/*
 * Черновик → данные для общего `ReportView` (PLAN_FRONTEND_MINIAPP.md, раздел 3.7).
 *
 * Предательски сложное место — медиа: в `ReportDto` есть только `s3Key`, URL нет (бакет приватный, BE-8 не сделан).
 * Поэтому превью показывает заглушки, а не картинки: `url` пустой, а признак «это медиа» и его состояние несёт
 * `status`. Когда появится BE-8 (presigned GET) и очередь загрузок (MINI-11), сюда придёт настоящий `url` для своих
 * свежих фото — менять придётся только эту функцию.
 */

import type { ReportDto, SectionKey } from '@/api/types';
import { SECTION_KEYS } from '@/api/types';
import { carTitleFromAvbyUrl } from './carTitle';
import type { ReportDraft } from './draft';
import type { ReportHeader, ReportMedia, ReportSection, ReportViewData } from '@podbor/ui';

/** Медиа отчёта без URL: сервер отдаёт только `s3Key`. Заглушка помечена `status`, чтобы превью честно врало. */
function toPlaceholderMedia(media: ReportDto['globalMedia'], sectionKey: SectionKey): ReportMedia[] {
  return media
    .slice()
    .sort((a, b) => a.orderNo - b.orderNo)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      url: '',
      // Суффикс секции нужен лайтбоксу `@podbor/ui`: он группирует фото по секциям, а по пустому `url` их не различить
      status: `placeholder:${sectionKey}:${item.status}`,
      orderNo: item.orderNo,
    }));
}

/**
 * Данные для `ReportView` из серверного отчёта и черновика. Секции идут в порядке `SECTION_KEYS` (бэкенд порядок
 * `items`/`media` не гарантирует — сортируем сами, раздел 2.5).
 *
 * Живые правки берём из черновика, чтобы превью совпадало с тем, что подборщик видит на шагах, а статусы и id —
 * с сервера. Медиа до BE-8 идут заглушками.
 */
export function toReportViewData(report: ReportDto, draft: ReportDraft | null): ReportViewData {
  const sections: ReportSection[] = SECTION_KEYS.flatMap((key) => {
    const section = report.sections.find((candidate) => candidate.sectionKey === key);
    if (!section) {
      return [];
    }
    const sectionDraft = draft?.sections[key];
    const items = sectionDraft
      ? Object.entries(sectionDraft.items)
          .filter(([, item]) => item.status)
          .map(([itemKey, item]) => ({ itemKey, status: item.status!, comment: item.comment ?? null }))
      : section.items;
    return [
      {
        id: section.id,
        sectionKey: key,
        orderNo: section.orderNo,
        summary: sectionDraft?.summary ?? section.summary,
        items,
        media: toPlaceholderMedia(section.media, key),
      },
    ];
  });

  const draftConclusion = draft?.conclusion;
  return {
    id: report.id,
    carId: report.carId,
    priceByn: draftConclusion?.priceByn ?? report.priceByn,
    conclusionText: draftConclusion?.conclusionText || report.conclusionText,
    stopFactors: report.stopFactors,
    sections,
    paintMeasurements: report.paintMeasurements,
    globalMedia: toPlaceholderMedia(report.globalMedia, 'DOCUMENTS'),
  };
}

/** Шапка превью: данных машины в ответе нет (BE-8), подпись — из ссылки av.by из локального индекса. */
export function toReportHeader(avbyUrl: string | undefined, inspectorName: string | undefined): ReportHeader {
  return {
    carTitle: avbyUrl ? carTitleFromAvbyUrl(avbyUrl) : 'Автомобиль',
    ...(inspectorName ? { inspectorName } : {}),
  };
}
