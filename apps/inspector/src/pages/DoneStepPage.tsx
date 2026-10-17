/*
 * Экран «Отправлено на модерацию» (PLAN_FRONTEND_MINIAPP.md, раздел 1.1 сценарий G, задача MINI-17).
 * После успешного submit черновик удаляется, отчёт открывается на чтение со статусом «На модерации».
 */

import { Button } from '@telegram-apps/telegram-ui';
import { useNavigate, useParams } from 'react-router';
import { useEffect } from 'react';
import { StatusScreen } from '@/components/StatusScreen';
import { useReportDraft } from '@/features/reports/reportDraftStore';

export function DoneStepPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const discard = useReportDraft((state) => state.discard);

  // Черновик больше не нужен: отчёт ушёл на модерацию (правило 7 раздела 3.3)
  useEffect(() => {
    discard(id);
  }, [id, discard]);

  return (
    <StatusScreen
      title="Отправлено на модерацию"
      description="Отчёт ушёл модератору. Как только его проверят, вы получите уведомление."
      action={
        <Button onClick={() => navigate('/reports')}>
          К моим отчётам
        </Button>
      }
    />
  );
}