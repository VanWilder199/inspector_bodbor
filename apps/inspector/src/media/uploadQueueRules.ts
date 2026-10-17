/*
 * Правила очереди загрузок без побочных эффектов: типы задач, backoff, разбор ошибок, подписи для интерфейса
 * (PLAN_FRONTEND_MINIAPP.md, раздел 3.4, задача MINI-11). Сам стор и воркер — в `uploadQueue.ts`.
 */

import { ApiError } from '@/api/client';
import type { MediaContentType, MediaKind } from '@/api/types';
import type { MediaTag } from '@/features/reports/draft';
import { MediaUploadError, S3UploadError, type UploadState } from './upload';

export type UploadTaskState = 'queued' | 'presigning' | 'uploading' | 'confirming' | 'done' | 'failed';

/** Откуда пришла последняя сетевая ошибка: от неё зависит, будить ли задачу после любого успешного запроса к API. */
export type RetryReason = 'api-network' | 'other';

export interface UploadTask {
  /** Имя файла в S3 (`<uuid>.jpg`): им же задача называется в очереди. */
  id: string;
  reportId: string;
  /** `null` — общее медиа (видео обхода, обязательные фото). */
  sectionId: string | null;
  kind: MediaKind;
  contentType: MediaContentType;
  tag?: MediaTag;
  /** Файл в памяти. `null` у видео после загрузки: сотни мегабайт держать незачем, фото остаётся для превью. */
  blob: Blob | null;
  thumb?: Blob;
  state: UploadTaskState;
  /** Ключ в S3 после успешной загрузки. До неё `s3Key`, `uploadUrl` и `presignedAt` лежат внутри `resume`. */
  s3Key?: string;
  /** С чего продолжить: `MediaUploadError.state` прошлой попытки (presigned URL, PUT готов, confirm под вопросом). */
  resume?: UploadState;
  /** Доля отправленного в S3, 0..1. */
  progress: number;
  attempts: number;
  lastError?: string;
  /** Когда можно пробовать снова (после backoff); `undefined` — сразу. */
  nextAttemptAt?: number;
  retryReason?: RetryReason;
  createdAt: number;
  /** Номер пачки: «Загружается 3 из 7» считается внутри пачки, а не за всё время работы приложения. */
  batch: number;
}

/** Идёт ли сейчас обмен с сервером или S3 (в отличие от `queued`, который ждёт очереди или backoff). */
export function isActive(task: UploadTask): boolean {
  return task.state === 'presigning' || task.state === 'uploading' || task.state === 'confirming';
}

// ---------- Backoff ----------

const BACKOFF_STEPS_MS = [2_000, 4_000, 8_000, 16_000, 30_000];
const JITTER = 0.2;

/** Пауза перед следующей попыткой: 2 → 4 → 8 → 16 → 30 с и дальше 30 с, плюс-минус 20% (jitter). Попыток без предела. */
export function backoffDelay(attempts: number, random: () => number = Math.random): number {
  const index = Math.min(Math.max(attempts, 1), BACKOFF_STEPS_MS.length) - 1;
  const base = BACKOFF_STEPS_MS[index] ?? 30_000;
  return Math.round(base * (1 - JITTER + random() * 2 * JITTER));
}

// ---------- Разбор ошибок ----------

export type FailureAction =
  /** Подождать backoff и повторить. */
  | { action: 'retry'; reason: RetryReason }
  /** Окончательно: задача ждёт ручного «Повторить» или «Удалить». */
  | { action: 'fail' }
  /** 401: сессия невалидна, новые попытки бессмысленны. */
  | { action: 'auth' }
  /** Загрузку отменили снаружи (удаление из очереди). */
  | { action: 'cancelled' };

/**
 * Что делать с неудачей `uploadMedia` (раздел 3.4): сеть, таймаут, 5xx и 408 повторяются без предела, прочие 4xx от API
 * и от S3 — окончательная ошибка, 401 — не ошибка задачи, а конец сессии. Повторный 403 от S3 приходит сюда уже после
 * нового presigned URL внутри `uploadMedia`, поэтому считается окончательным.
 */
export function classifyFailure(error: unknown): FailureAction {
  if (!(error instanceof MediaUploadError)) {
    return { action: 'fail' };
  }
  const cause = error.cause;
  if (cause instanceof S3UploadError) {
    if (cause.kind === 'aborted') {
      return { action: 'cancelled' };
    }
    return cause.kind === 'network' || cause.kind === 'timeout' || cause.kind === 'server' ? { action: 'retry', reason: 'other' } : { action: 'fail' };
  }
  if (cause instanceof ApiError) {
    if (cause.status === 401) {
      return { action: 'auth' };
    }
    if (cause.kind === 'network' || cause.kind === 'timeout') {
      return { action: 'retry', reason: 'api-network' };
    }
    if (cause.status === 408 || cause.status >= 500) {
      return { action: 'retry', reason: 'other' };
    }
  }
  return { action: 'fail' };
}

// ---------- Параллельность ----------

const MAX_PARALLEL_PHOTOS = 2;

/**
 * Какие задачи можно запускать прямо сейчас (раздел 3.4): две фотографии одновременно; видео строго одно и никогда
 * вместе с фото, чтобы не забивать мобильный канал. Задачи берутся по порядку постановки; пока идёт видео, фото ждут.
 * Если первым в очереди стоит видео, новые фото не стартуют: идущие досыпаются, потом уходит видео (иначе поток фото
 * обгонял бы его вечно).
 */
export function pickRunnable(tasks: readonly UploadTask[], now: number): UploadTask[] {
  const active = tasks.filter(isActive);
  if (active.some((task) => task.kind === 'VIDEO')) {
    return [];
  }
  const ready = tasks.filter((task) => task.state === 'queued' && (task.nextAttemptAt ?? 0) <= now).sort((a, b) => a.createdAt - b.createdAt);
  const first = ready[0];
  if (!first) {
    return [];
  }
  if (first.kind === 'VIDEO') {
    return active.length === 0 ? [first] : [];
  }
  const room = MAX_PARALLEL_PHOTOS - active.length;
  return ready.filter((task) => task.kind === 'PHOTO').slice(0, Math.max(room, 0));
}

/** Ближайший момент, когда задача выйдет из backoff; `undefined` — ждать нечего. */
export function nextWakeAt(tasks: readonly UploadTask[]): number | undefined {
  const times = tasks.filter((task) => task.state === 'queued' && task.nextAttemptAt !== undefined).map((task) => task.nextAttemptAt as number);
  return times.length > 0 ? Math.min(...times) : undefined;
}

// ---------- Сводка и подписи ----------

export interface QueueSummary {
  /** Сколько задач в текущей пачке. */
  total: number;
  /** Сколько из них уже загружено. */
  done: number;
  /** Ждут или идут прямо сейчас (включая паузу backoff). */
  pending: number;
  failed: number;
  /** «Загружается 3 из 7»: номер загружаемого файла в пачке. */
  position: number;
}

/** Сводка по текущей (последней) пачке: именно её показывает индикатор в шапке мастера. */
export function summarize(tasks: readonly UploadTask[]): QueueSummary {
  const batch = tasks.reduce((max, task) => Math.max(max, task.batch), 0);
  const current = tasks.filter((task) => task.batch === batch);
  const done = current.filter((task) => task.state === 'done').length;
  const failed = current.filter((task) => task.state === 'failed').length;
  const pending = current.filter((task) => task.state !== 'done' && task.state !== 'failed').length;
  return { total: current.length, done, pending, failed, position: Math.min(done + 1, current.length) };
}

/** Есть ли что-то, ради чего нельзя закрывать приложение: файл ждёт или идёт. Упавшие ждут пользователя, а не сеть. */
export function hasPendingWork(tasks: readonly UploadTask[]): boolean {
  return tasks.some((task) => task.state !== 'done' && task.state !== 'failed');
}

export const UPLOAD_STATE_LABELS: Record<UploadTaskState, string> = {
  queued: 'В очереди',
  presigning: 'Подготовка',
  uploading: 'Загружается',
  confirming: 'Подтверждение',
  done: 'Загружено',
  failed: 'Ошибка',
};

/** Склонение: 1 файл, 2 файла, 5 файлов. */
export function pluralFiles(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} файлов`;
  if (last === 1) return `${count} файл`;
  if (last >= 2 && last <= 4) return `${count} файла`;
  return `${count} файлов`;
}

/**
 * Что ещё грузится, словами для баннера «Не закрывайте приложение, идёт загрузка …»: «3 фото», а если среди них
 * есть видео, — «4 файла» (слово «фото» не склоняется, поэтому для смеси годится только общее «файл»).
 */
export function describePending(tasks: readonly UploadTask[]): string {
  const waiting = tasks.filter((task) => task.state !== 'done' && task.state !== 'failed');
  return waiting.some((task) => task.kind === 'VIDEO') ? pluralFiles(waiting.length) : `${waiting.length} фото`;
}
