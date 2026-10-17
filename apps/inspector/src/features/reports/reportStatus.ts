import type { MyReportStatus } from '@/api/types';

export const REPORT_STATUS_LABELS: Record<MyReportStatus, string> = {
  draft: 'Черновик',
  pending_review: 'На модерации',
  revision_required: 'На доработке',
  published: 'Опубликован',
  deleted: 'Удалён',
};

/** Фильтры списка отчётов (сценарий I плана, 1.1). «Удалённые» показываются только в «Все»: отдельного фильтра для них нет. */
export type ReportFilter = 'all' | 'draft' | 'pending_review' | 'revision_required' | 'published';

export const REPORT_FILTERS: ReadonlyArray<{ key: ReportFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'draft', label: 'Черновики' },
  { key: 'pending_review', label: 'На модерации' },
  { key: 'revision_required', label: 'На доработке' },
  { key: 'published', label: 'Опубликованные' },
];
