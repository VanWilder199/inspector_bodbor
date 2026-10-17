/*
 * Отчёт подборщика для хаба и шагов мастера (PLAN_FRONTEND_MINIAPP.md, разделы 2.5 и 3.3).
 *
 * Серверное состояние живёт в TanStack Query (`['report', id]`), локальный черновик — в zustand-сторе. Хук связывает
 * их: при загрузке отчёта пересобирает черновик (сливая с локальным) и отдаёт экрану. `404 REPORT_NOT_FOUND` — отчёт
 * удалён модератором: локальный черновик удаляется, а строку из индекса уберёт следующий заход в «Мои отчёты»
 * (правило 6 раздела 3.3).
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '@/api/client';
import { inspectorApi } from '@/api/inspector';
import type { ReportDto } from '@/api/types';
import { readReportsIndex } from './reportsIndex';
import { useReportDraft } from './reportDraftStore';

export const reportQueryKey = (reportId: string) => ['report', reportId] as const;

export interface UseReportResult {
  report: ReportDto | undefined;
  isLoading: boolean;
  /** Ошибка загрузки, кроме «отчёт удалён» — она разбирается отдельно (`gone`). */
  error: unknown;
  /** `true` — сервер ответил `404 REPORT_NOT_FOUND`: отчёт удалён модератором. */
  gone: boolean;
  /** `true` — `403 REPORT_ACCESS_DENIED`: отчёт чужой. */
  denied: boolean;
  /** `true` — отчёт загружен и сервер разрешает правки (`draft` / `revision_required`), раздел 2.8. */
  editable: boolean;
  refetch: () => void;
}

/** Ссылка av.by этого отчёта из локального индекса: подпись машины, пока BE-8 не отдаёт данные. */
export function avbyUrlOf(reportId: string): string | undefined {
  return readReportsIndex().find((entry) => entry.reportId === reportId)?.avbyUrl;
}

export function useReport(reportId: string): UseReportResult {
  const query = useQuery({ queryKey: reportQueryKey(reportId), queryFn: () => inspectorApi.getReport(reportId) });
  const loadDraft = useReportDraft((state) => state.load);
  const discard = useReportDraft((state) => state.discard);

  const error = query.error;
  const gone = error instanceof ApiError && error.errorCode === 'REPORT_NOT_FOUND';
  const denied = error instanceof ApiError && error.errorCode === 'REPORT_ACCESS_DENIED';

  // Отчёт удалён: локальный черновик ему больше не нужен. Строку из индекса уберёт следующий заход в «Мои отчёты»
  useEffect(() => {
    if (gone) {
      discard(reportId);
    }
  }, [gone, reportId, discard]);

  // Новый отчёт (или его новая версия) → черновик пересобирается со слиянием. Перезагрузка не должна затирать правки.
  // После `409 REPORT_NOT_EDITABLE` отчёт ушёл на модерацию: черновик в памяти нужен экрану чтения, но в `localStorage`
  // он больше не пишется — перечитывание не должно воскрешать сброшенный (правило 5).
  useEffect(() => {
    if (query.data) {
      const editableStatus = query.data.status;
      loadDraft(query.data, editableStatus === 'draft' || editableStatus === 'revision_required');
    }
  }, [query.data, loadDraft]);

  const status = query.data?.status;
  return {
    report: query.data,
    isLoading: query.isLoading,
    error: gone ? undefined : error,
    gone,
    denied,
    editable: status === 'draft' || status === 'revision_required',
    refetch: () => void query.refetch(),
  };
}
