import { OfflineBanner } from '@/components/OfflineBanner';
import { SessionExpiryBanner } from '@/components/SessionExpiryBanner';
import { useNetworkInterface } from '@/network/useNetworkInterface';
import { useUploadQueueResume, useHasPendingUploads } from '@/media/uploadQueue';
import { useBackButton } from '@/telegram/useBackButton';
import { useClosingConfirmation } from '@/telegram/useClosingConfirmation';
import { Outlet } from 'react-router';

/**
 * Корневой лейаут: управляет BackButton Telegram, показывает баннеры конца сессии и оффлайна, слушает события сети,
 * возобновляет очередь загрузок по возвращении в приложение и включает подтверждение закрытия, пока идут загрузки.
 */
export function RootLayout() {
  useBackButton();
  useNetworkInterface();
  useUploadQueueResume();
  useClosingConfirmation(useHasPendingUploads());
  return (
    <>
      <SessionExpiryBanner />
      <OfflineBanner />
      <Outlet />
    </>
  );
}
