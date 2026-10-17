import { StatusScreen } from '@/components/StatusScreen';

/** Аккаунт заблокирован (сценарий C). Причину API не отдаёт: она уходит только в сообщение бота. Действий на экране нет. */
export function BannedPage() {
  return <StatusScreen title="Аккаунт заблокирован" description="Доступ к приложению закрыт. Подробности — в сообщении от бота." />;
}
