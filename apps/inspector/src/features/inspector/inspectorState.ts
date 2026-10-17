import { ApiError } from '@/api/client';
import { inspectorApi } from '@/api/inspector';
import type { InspectorDto, InspectorStatus } from '@/api/types';

export const inspectorQueryKey = ['inspector'] as const;

/** Что приложение знает о подборщике. `unregistered` — бэкенд ответил `404 INSPECTOR_NOT_FOUND`. */
export type InspectorState = 'unregistered' | InspectorStatus;

/**
 * `GET /inspector/`. `404 INSPECTOR_NOT_FOUND` — штатный сигнал «нужна регистрация», а не ошибка, поэтому он превращается в `null`.
 * Любой другой ответ (в том числе 404 без `errorCode` от пути без слеша) остаётся ошибкой.
 */
export async function fetchInspector(): Promise<InspectorDto | null> {
  try {
    return await inspectorApi.me();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.errorCode === 'INSPECTOR_NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

export function stateOf(inspector: InspectorDto | null): InspectorState {
  return inspector ? inspector.status : 'unregistered';
}

const HOME_PATHS: Record<InspectorState, string> = {
  unregistered: '/register',
  pending: '/pending',
  verified: '/reports',
  banned: '/banned',
};

/** Экран, на котором подборщик в этом состоянии должен находиться. */
export function homePathFor(state: InspectorState): string {
  return HOME_PATHS[state];
}

export const STATUS_LABELS: Record<InspectorStatus, string> = {
  pending: 'На проверке',
  verified: 'Подтверждён',
  banned: 'Заблокирован',
};
