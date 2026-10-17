import { useEffect } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';
import { Button } from '@telegram-apps/telegram-ui';
import { getErrorMessage } from '@/api/errors';
import { StatusScreen } from '@/components/StatusScreen';
import { hasDirtyDraft } from '@/features/reports/draft';
import { useReportDraft } from '@/features/reports/reportDraftStore';
import { useReport } from '@/features/reports/useReport';
import { useClosingConfirmation } from '@/telegram/useClosingConfirmation';
import { useInspector } from '@/features/inspector/useInspector';
import type { ReportDto } from '@/api/types';
import type { ReportDraft } from '@/features/reports/draft';

export interface ReportContext {
  report: ReportDto;
  draft: ReportDraft | null;
  /** `true` — сервер разрешает правки (`draft` / `revision_required`, раздел 2.8). */
  editable: boolean;
  /** Перечитать отчёт: нужен, когда `PUT` ответил `409 REPORT_NOT_EDITABLE` — статус изменился на другом устройстве. */
  refetch: () => void;
}

/**
 * Общий предок хаба и шагов мастера: загружает отчёт, пересобирает черновик из локального и серверного, включает
 * подтверждение закрытия при несохранённых правках и отдаёт всё детям через контекст. Живёт на уровне маршрута, а не
 * экрана: переход между хабом и шагом не должен ни перезагружать отчёт, ни ронять черновик.
 *
 * Экран отправки (`done`) и остальные «verified»-заглушки сюда не входят — у них свой жизненный цикл.
 */
export function ReportLayout() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { report, isLoading, error, gone, denied, editable, refetch } = useReport(id);
  const draft = useReportDraft((state) => state.draft);
  const reset = useReportDraft((state) => state.reset);
  useInspector(); // прогреваем профиль: хаб и шаги берут из него имя подборщика для превью

  // Подтверждение закрытия, пока есть несохранённые правки (раздел 3.2); фактическую «грязь» наполнит MINI-09
  useClosingConfirmation(draft !== null && hasDirtyDraft(draft));

  // Уход из отчёта: черновик снимается из памяти, в `localStorage` он остаётся и переживает перезапуск
  useEffect(() => () => reset(), [reset]);

  if (gone) {
    return (
      <StatusScreen
        title="Отчёт удалён"
        description="Модератор снял отчёт с публикации, и он больше недоступен."
        action={<Button onClick={() => navigate('/reports')}>К моим отчётам</Button>}
      />
    );
  }
  if (denied) {
    return (
      <StatusScreen
        title="Это не ваш отчёт"
        description="Отчёт принадлежит другому подборщику."
        action={<Button onClick={() => navigate('/reports')}>К моим отчётам</Button>}
      />
    );
  }
  if (error) {
    return <StatusScreen title="Не удалось загрузить отчёт" description={getErrorMessage(error as never)} action={<Button onClick={refetch}>Повторить</Button>} />;
  }
  if (isLoading || !report) {
    return <StatusScreen title="Загрузка" loading />;
  }

  const context: ReportContext = { report, draft, editable, refetch };
  return <Outlet context={context} />;
}
