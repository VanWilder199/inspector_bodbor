import { Button } from '@telegram-apps/telegram-ui';
import { StatusScreen } from '@/components/StatusScreen';
import { useInspector } from '@/features/inspector/useInspector';
import { useAppActivated } from '@/telegram/useAppActivated';

/**
 * Заявка на проверке (сценарий B). Статус читается при каждом открытии приложения (его грузит гейт),
 * при возвращении в Mini App (`visibility_changed`) и по кнопке. Как только админ подтвердит подборщика,
 * кеш профиля обновится, и `InspectorGate` сам уведёт на `/reports`.
 */
export function PendingPage() {
  const { refetch, isFetching } = useInspector();

  // `cancelRefetch: false`: если запрос уже идёт, второй не создаём
  const checkStatus = () => void refetch({ cancelRefetch: false });
  useAppActivated(checkStatus);

  return (
    <StatusScreen
      title="Заявка на проверке"
      description="Мы проверяем ваши данные. Когда аккаунт подтвердят, бот пришлёт сообщение: после этого откройте приложение снова."
      action={
        <Button size="m" mode="bezeled" loading={isFetching} onClick={checkStatus}>
          Проверить статус
        </Button>
      }
    />
  );
}
