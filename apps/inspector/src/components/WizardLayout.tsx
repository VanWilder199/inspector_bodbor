import { useUploadQueueSummary } from '@/media/uploadQueue';
import { useVerticalSwipeLock } from '@/telegram/useVerticalSwipeLock';
import { Outlet } from 'react-router';

const HINT_COLOR = 'var(--tgui--hint_color)';

/**
 * Лейаут экранов мастера: пока он смонтирован, свайп вниз не сворачивает Mini App. Когда идут загрузки, показывает
 * общий индикатор «Загружается N из M» и подсказку не закрывать приложение (MINI-11).
 */
export function WizardLayout() {
  useVerticalSwipeLock();
  const summary = useUploadQueueSummary();

  const uploading = summary.pending > 0;
  return (
    <>
      {uploading && (
        <div style={{ padding: '8px 16px 0', color: HINT_COLOR, fontSize: 13 }}>
          Загружается {summary.position} из {summary.total}
        </div>
      )}
      <Outlet />
    </>
  );
}