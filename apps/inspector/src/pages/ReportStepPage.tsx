import { Button } from '@telegram-apps/telegram-ui';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import { StatusScreen } from '@/components/StatusScreen';
import type { ReportContext } from '@/features/reports/ReportLayout';
import { avbyUrlOf } from '@/features/reports/useReport';

/**
 * Экран шага мастера, который ещё не реализован (MINI-09 и дальше). Существует, чтобы навигация по шагам была
 * проверяемой уже сейчас: с хаба открывается нужный адрес, BackButton и MainButton ведут по соседям.
 * Настоящие экраны (секция, ЛКП, видео, заключение, проверка) заменят его в своих задачах.
 */
export function ReportStepPage({ title }: { title: string }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { editable } = useOutletContext<ReportContext>();
  const avbyUrl = avbyUrlOf(id);

  return (
    <StatusScreen
      title={title}
      description={
        <>
          Шаг в разработке.
          {editable ? '' : ' Отчёт сейчас только для чтения.'}
          {avbyUrl ? ` Объявление: ${avbyUrl}` : ''}
        </>
      }
      action={<Button onClick={() => navigate(`/reports/${id}`)}>К шагам отчёта</Button>}
    />
  );
}
