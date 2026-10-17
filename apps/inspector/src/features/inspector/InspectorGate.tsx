import { Button } from '@telegram-apps/telegram-ui';
import { Navigate, Outlet } from 'react-router';
import { ApiError } from '@/api/client';
import { getErrorMessage } from '@/api/errors';
import { StatusScreen } from '@/components/StatusScreen';
import { homePathFor, stateOf, type InspectorState } from './inspectorState';
import { useInspector } from './useInspector';

interface InspectorGateProps {
  /** В каких состояниях подборщика этот набор роутов открыт. Пустой список — всегда уводить на экран по статусу (`/`). */
  allow: readonly InspectorState[];
}

/**
 * Гейт над роутами, которым нужен профиль подборщика. Один и тот же `GET /inspector/` (кеш `useInspector`) решает всё:
 * незарегистрированный уходит на `/register`, `pending` — на `/pending`, `banned` — на `/banned`, `verified` — на `/reports`.
 * Гейт стоит на роуте, а не на экране, поэтому прямая ссылка и `startapp` попадают под него так же, как переход из приложения:
 * `pending` не откроет мастер, даже если бэкенд его пока не останавливает (BE-3).
 */
export function InspectorGate({ allow }: InspectorGateProps) {
  const { data, error, refetch, isFetching } = useInspector();

  // `null` — не зарегистрирован, это тоже готовый ответ; ждём только пока данных нет совсем
  if (data === undefined) {
    if (error) {
      const message = error instanceof ApiError ? getErrorMessage(error) : getErrorMessage({ status: 0, kind: 'network' });
      return (
        <StatusScreen
          title="Не удалось загрузить профиль"
          description={message}
          action={
            <Button size="m" loading={isFetching} onClick={() => void refetch()}>
              Повторить
            </Button>
          }
        />
      );
    }
    return <StatusScreen title="Загрузка" loading />;
  }

  const state = stateOf(data);
  if (!allow.includes(state)) {
    return <Navigate to={homePathFor(state)} replace />;
  }
  return <Outlet />;
}
