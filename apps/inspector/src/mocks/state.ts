import type { CarSummary, InspectorDto, InspectorStatus, LastModeration, ReportDto } from '@/api/types';
import { createCars } from './fixtures/catalog';
import { createReports } from './fixtures/reports';
import { INSPECTOR_ID, MOCK_TELEGRAM_USER_ID } from './fixtures/ids';

/*
 * Состояние «бэкенда» в моках и управление им. Хендлеры мутируют `db` (создание отчёта, правки секций, submit…),
 * `resetMocks()` возвращает чистые фикстуры — вызывать в `beforeEach` тестов.
 */

export interface MockDb {
  /** `null` — подборщик не зарегистрирован: `GET /inspector/` отдаёт 404 `INSPECTOR_NOT_FOUND`. */
  inspector: InspectorDto | null;
  reports: Record<string, ReportDto>;
  /** id отчётов, мягко удалённых админом: для подборщика они становятся 404 `REPORT_NOT_FOUND`. */
  deleted: Set<string>;
  cars: Record<string, CarSummary>;
  /** Последнее решение модератора по отчёту (мок BE-7 `lastModeration`). */
  lastModeration: Record<string, LastModeration>;
  createdAt: Record<string, string>;
  updatedAt: Record<string, string>;
  submittedAt: Record<string, string>;
  /** s3Key → contentType из presigned-запроса: по нему «S3» проверяет `Content-Type` PUT-запроса. */
  presigned: Record<string, string>;
  /** s3Key, которые клиент реально загрузил PUT-ом: `confirm-upload` без них — `404 MEDIA_NOT_FOUND`. */
  uploaded: Set<string>;
  /** Счётчик для id новых сущностей. */
  seq: number;
}

export function createInspector(status: InspectorStatus = 'verified'): InspectorDto {
  return {
    id: INSPECTOR_ID,
    telegramUserId: MOCK_TELEGRAM_USER_ID,
    fullName: 'Иван Петров',
    phone: '+375291234567',
    email: 'ivan@example.by',
    status,
  };
}

function createDb(): MockDb {
  const seed = createReports();
  return {
    inspector: createInspector(),
    reports: seed.reports,
    deleted: new Set(),
    cars: createCars(),
    lastModeration: seed.lastModeration,
    createdAt: seed.createdAt,
    updatedAt: seed.updatedAt,
    submittedAt: seed.submittedAt,
    presigned: {},
    uploaded: new Set(),
    seq: 1000,
  };
}

export const db: MockDb = createDb();

export const mockConfig = {
  /** Задержка ответа, мс. В тестах 0, в браузере её поднимает `browser.ts`. */
  latencyMs: 0,
};

// ---------- Принудительные ошибки ----------

/**
 * Какую из форм ошибок бэкенда имитировать:
 *  app        — форма A, `ProblemDetail` с `errorCode`;
 *  validation — форма A', `errorCode: BAD_REQUEST` и `errors: ["поле: сообщение"]`;
 *  spring     — форма B, `ProblemDetail` без `errorCode`;
 *  security   — форма C, 401 из Security (JSON Spring Boot или пустое тело);
 *  network    — обрыв соединения (в `fetch` это `TypeError`);
 *  hang       — ответа нет вообще, пока клиент не отменит запрос (проверка таймаута).
 */
export type MockFailure =
  | { kind: 'app'; status: number; errorCode: string; detail?: string }
  | { kind: 'validation'; errors: string[] }
  | { kind: 'spring'; status: number; detail: string }
  | { kind: 'security'; status: 401; empty?: boolean }
  | { kind: 'network' }
  | { kind: 'hang' };

interface FailureEntry {
  failure: MockFailure;
  once: boolean;
}

const failures = new Map<string, FailureEntry>();

/** Ключ — «МЕТОД шаблон-пути без /api», как в `handlers.ts`: `POST /inspector/reports`. */
export const mockControl = {
  /** Все следующие вызовы эндпоинта вернут ошибку, пока не вызван `clear`. */
  fail(key: string, failure: MockFailure) {
    failures.set(key, { failure, once: false });
  },
  /** Ошибка только на ближайший вызов. */
  failOnce(key: string, failure: MockFailure) {
    failures.set(key, { failure, once: true });
  },
  clear(key?: string) {
    if (key) failures.delete(key);
    else failures.clear();
  },
  /** `null` — не зарегистрирован; `pending` / `verified` / `banned` — статус зарегистрированного подборщика. */
  setInspector(status: InspectorStatus | null) {
    db.inspector = status === null ? null : createInspector(status);
  },
  /** Мягко удалить отчёт, как это делает админ: подборщик получит 404 `REPORT_NOT_FOUND`. */
  deleteReport(reportId: string) {
    db.deleted.add(reportId);
  },
  reset() {
    Object.assign(db, createDb());
    failures.clear();
    mockConfig.latencyMs = 0;
  },
};

export function resetMocks() {
  mockControl.reset();
}

/** Достаёт ошибку для эндпоинта (и снимает её, если она одноразовая). */
export function takeFailure(key: string): MockFailure | undefined {
  const entry = failures.get(key);
  if (!entry) return undefined;
  if (entry.once) failures.delete(key);
  return entry.failure;
}
