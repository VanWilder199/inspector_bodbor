import { useQueries } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import { inspectorApi } from '@/api/inspector';
import type { MyReportStatus } from '@/api/types';
import { carTitleFromAvbyUrl } from './carTitle';
import { readReportsIndex, removeFromReportsIndex } from './reportsIndex';

export interface MyReportRow {
  id: string;
  /** Подпись машины. До BE-8 берётся из ссылки av.by. */
  title: string;
  createdAt: string;
  /** `undefined` — статус ещё не пришёл или его не удалось загрузить (см. `isError`). */
  status: MyReportStatus | undefined;
  isError: boolean;
}

export interface MyReports {
  rows: MyReportRow[];
  /** Повторить запросы тех отчётов, у которых статус не загрузился. */
  retryFailed: () => void;
}

/**
 * Отчёт, которого подборщик больше не видит: удалён модератором или чужой. Только эти два кода означают «убрать из индекса»;
 * 404 без `errorCode` (например, неверный путь) локальные данные удалять не должен.
 */
function isGone(error: unknown): boolean {
  return error instanceof ApiError && (error.errorCode === 'REPORT_NOT_FOUND' || error.errorCode === 'REPORT_ACCESS_DENIED');
}

/**
 * «Мои отчёты» подборщика. Сейчас строится по локальному индексу (`reportsIndex.ts`) и `GET /inspector/reports/{id}` на каждый
 * отчёт, потому что `GET /inspector/reports` (BE-7 / B-21) ещё нет. Когда он появится (MINI-19), заменяется тело этого хука:
 * экран получает те же `MyReports` и не меняется.
 *
 * Индекс читается один раз за визит на экран. Отчёт, который сервер больше не отдаёт, сразу убирается из хранилища, но в этом
 * визите остаётся в списке с пометкой «Удалён»: подборщик видит, что с ним случилось, а при следующем открытии строки уже нет.
 */
export function useMyReports(): MyReports {
  const [entries] = useState(readReportsIndex);

  const queries = useQueries({
    queries: entries.map((entry) => ({
      queryKey: ['report', entry.reportId],
      queryFn: () => inspectorApi.getReport(entry.reportId),
    })),
  });

  const goneIds = entries.filter((_, index) => isGone(queries[index]?.error)).map((entry) => entry.reportId);
  const goneKey = goneIds.join(',');
  useEffect(() => {
    for (const reportId of goneKey ? goneKey.split(',') : []) {
      removeFromReportsIndex(reportId);
    }
  }, [goneKey]);

  const rows = entries.map((entry, index): MyReportRow => {
    const query = queries[index];
    const gone = isGone(query?.error);
    return {
      id: entry.reportId,
      title: carTitleFromAvbyUrl(entry.avbyUrl),
      createdAt: entry.createdAt,
      status: gone ? 'deleted' : query?.data?.status,
      isError: !gone && Boolean(query?.isError),
    };
  });

  return {
    rows,
    retryFailed: () => {
      for (const query of queries) {
        if (query.isError && !isGone(query.error)) {
          void query.refetch();
        }
      }
    },
  };
}
