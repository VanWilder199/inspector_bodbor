import { SessionExpiryBanner } from '@/components/SessionExpiryBanner';
import { useUploadQueueResume, useHasPendingUploads } from '@/media/uploadQueue';
import { useBackButton } from '@/telegram/useBackButton';
import { useClosingConfirmation } from '@/telegram/useClosingConfirmation';
import { Outlet } from 'react-router';

/**
 * Корневой лейаут: управляет BackButton Telegram, показывает баннер конца сессии, возобновляет очередь загрузок
 * по возвращении в приложение и включает подтверждение закрытия, пока идут загрузки.
 */
export function RootLayout() {
  useBackButton();
  useUploadQueueResume();
  useClosingConfirmation(useHasPendingUploads());
  return (
    <>
      <SessionExpiryBanner />
      <Outlet />
    </>
  );
}
