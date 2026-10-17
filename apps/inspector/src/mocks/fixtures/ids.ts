/* Детерминированные идентификаторы для мок-данных: по ним проще читать тесты и логи. */

/** `uuid(1)` → `00000000-0000-4000-8000-000000000001`. */
export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Текущий подборщик в моках. */
export const INSPECTOR_ID = uuid(1);
/** Другой подборщик: владелец «чужого» отчёта (проверка `403 REPORT_ACCESS_DENIED`). */
export const OTHER_INSPECTOR_ID = uuid(2);

export const CAR_PASSAT_ID = uuid(11);
export const CAR_GOLF_ID = uuid(12);
export const CAR_OCTAVIA_ID = uuid(13);

/** Свой черновик без заполненных секций. */
export const DRAFT_REPORT_ID = uuid(101);
/** Свой отчёт на доработке: в списке у него `lastModeration` с причиной. */
export const REVISION_REPORT_ID = uuid(102);
/** Отчёт другого подборщика. */
export const FOREIGN_REPORT_ID = uuid(103);

export const MOCK_TELEGRAM_USER_ID = 123456789;
