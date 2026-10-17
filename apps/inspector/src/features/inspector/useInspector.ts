import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { inspectorApi } from '@/api/inspector';
import type { InspectorDto, RegisterInspectorRequest } from '@/api/types';
import { requestNotificationsAccess } from '@/telegram/writeAccess';
import { fetchInspector, inspectorQueryKey } from './inspectorState';

/**
 * Профиль считается свежим полминуты: за это время переходы между экранами не гоняют `GET /inspector/` заново,
 * а только что записанный в кеш профиль (после регистрации) не перезапрашивается при открытии `/pending`.
 */
const INSPECTOR_STALE_TIME_MS = 30_000;

/** Текущий подборщик: `null` — не зарегистрирован. Гейт роутов и экраны статусов читают его отсюда. */
export function useInspector() {
  return useQuery({ queryKey: inspectorQueryKey, queryFn: fetchInspector, staleTime: INSPECTOR_STALE_TIME_MS });
}

interface RegistrationResult {
  inspector: InspectorDto;
  /** `false` — подборщик уже был зарегистрирован (409), профиль перечитан. */
  isNew: boolean;
}

async function registerInspector(body: RegisterInspectorRequest): Promise<RegistrationResult> {
  try {
    return { inspector: await inspectorApi.register(body), isNew: true };
  } catch (error) {
    // Повтор после обрыва сети: запись уже есть. Это успех, берём профиль с сервера
    if (error instanceof ApiError && error.errorCode === 'INSPECTOR_ALREADY_REGISTERED') {
      return { inspector: await inspectorApi.me(), isNew: false };
    }
    throw error;
  }
}

/**
 * Регистрация. Ответ кладётся прямо в кеш профиля: повторного `GET /inspector/` нет, а `InspectorGate`
 * сам уводит с `/register` на экран по статусу. Разрешение писать в личку просим только у новой записи.
 */
export function useRegisterInspector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: registerInspector,
    onSuccess: ({ inspector, isNew }) => {
      queryClient.setQueryData(inspectorQueryKey, inspector);
      if (isNew) {
        // Отказ пользователя — не ошибка, ждать ответа не нужно
        void requestNotificationsAccess();
      }
    },
  });
}
