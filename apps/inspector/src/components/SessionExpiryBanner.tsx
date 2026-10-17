import { Banner } from '@telegram-apps/telegram-ui';
import { useSessionPhase } from '@/telegram/useSessionPhase';

/**
 * Ненавязчивый баннер: за 10 минут до конца жизни initData (`auth_date` + 24 ч) и после него.
 * Редиректа тут нет — время клиента может расходиться с серверным; главный сигнал — 401 (он уводит на `/session-expired`).
 */
export function SessionExpiryBanner() {
  const phase = useSessionPhase();
  if (phase === 'active') return null;

  const expired = phase === 'expired';
  return (
    <Banner
      role="status"
      type="section"
      header={expired ? 'Сессия истекла' : 'Сессия скоро истечёт'}
      description={
        expired
          ? 'Закройте и снова откройте приложение. Введённые данные сохранены на устройстве.'
          : 'Переоткройте приложение, когда будет удобно. Введённые данные сохранены на устройстве.'
      }
    />
  );
}
