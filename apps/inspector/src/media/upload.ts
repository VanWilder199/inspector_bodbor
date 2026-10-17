/*
 * Медиа-конвейер одной загрузки (PLAN_FRONTEND_MINIAPP.md, раздел 2.9, задача MINI-10):
 * presigned URL → PUT напрямую в S3 → confirm.
 *
 * Здесь ровно одна загрузка. Очередь, параллельность, backoff и сжатие фото — задачи MINI-11 и MINI-12: они зовут
 * `uploadMedia` и по `MediaUploadError.retryable` решают, повторять ли. Запросы presigned и confirm идут через
 * `inspectorApi` (MINI-03), отдельных обёрток над ними нет.
 *
 * Что конвейер делает сам:
 *  - 403 от S3 (ссылка просрочена или подпись не сошлась) → один раз берёт новый presigned URL с тем же именем файла;
 *  - confirm не идемпотентен (повтор создаёт вторую запись), поэтому после неясного исхода (сеть, таймаут, 5xx)
 *    сначала читает отчёт и ищет `s3Key`: нашёл — confirm уже прошёл, повторять нельзя;
 *  - `404 MEDIA_NOT_FOUND` на confirm значит, что объекта в S3 нет: один раз кладёт файл заново.
 *
 * `mediaId` ни confirm, ни конвейер не отдают (204 без тела): id появится в следующем `GET` отчёта.
 */

import { ApiError } from '@/api/client';
import { getErrorMessage } from '@/api/errors';
import { inspectorApi } from '@/api/inspector';
import type { MediaContentType, MediaKind } from '@/api/types';

/** Ссылка живёт 60 минут (`s3.presigned-url-ttl-minutes`); обновляем с запасом (раздел 3.4). */
const PRESIGN_MAX_AGE_MS = 50 * 60 * 1000;
const MAX_REPRESIGN = 1;
const MAX_REPUT_AFTER_NOT_FOUND = 1;
const MAX_CONFIRM_ATTEMPTS = 2;

// ---------- Имя файла и тип ----------

const FILE_EXTENSIONS: Record<MediaContentType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'video/mp4': '.mp4',
};

/** Имя попадает в S3-ключ как есть (сервер его не чистит), поэтому его всегда придумывает клиент. */
export function createFileName(contentType: MediaContentType): string {
  // Тип вне списка сервер всё равно отклонит (`NOT_ALLOWDED_MEDIA_TYPE`), расширение ему не нужно
  return `${crypto.randomUUID()}${FILE_EXTENSIONS[contentType] ?? ''}`;
}

/** `kind` сервер с `contentType` не сверяет, а submit ищет именно `VIDEO`: для видео он обязателен. */
export function kindOf(contentType: MediaContentType): MediaKind {
  return contentType.startsWith('video/') ? 'VIDEO' : 'PHOTO';
}

// ---------- Ошибки ----------

/** Шаги конвейера. `verify` — чтение отчёта, чтобы понять, прошёл ли confirm. */
export type UploadStage = 'presign' | 'put' | 'confirm' | 'verify';

/**
 * Исход PUT в S3: `forbidden` — 403 (просрочена ссылка или не сошлась подпись), `server` — 5xx/408/429,
 * `client` — прочие 4xx, `aborted` — загрузку отменили снаружи.
 */
export type S3FailureKind = 'network' | 'timeout' | 'forbidden' | 'server' | 'client' | 'aborted';

export class S3UploadError extends Error {
  constructor(
    public readonly kind: S3FailureKind,
    /** HTTP-статус; 0 — ответа не было. */
    public readonly status: number,
    /** `<Code>` из XML-ошибки S3 (`SignatureDoesNotMatch`, `AccessDenied`…), если он был. */
    public readonly s3Code?: string,
  ) {
    super(s3Code ? `S3 ${status}: ${s3Code}` : `S3 ${kind}${status ? ` ${status}` : ''}`);
    this.name = 'S3UploadError';
  }
}

/**
 * Что нужно, чтобы продолжить загрузку с того места, где она остановилась, не начиная заново и не плодя дубли.
 * MINI-11 кладёт это в задачу очереди и передаёт обратно в `uploadMedia({ resume })`.
 */
export interface UploadState {
  fileName: string;
  s3Key?: string;
  uploadUrl?: string;
  presignedAt?: number;
  /** PUT в S3 завершился успешно. */
  putDone?: boolean;
  /** Исход confirm неизвестен: перед повтором нужно прочитать отчёт. */
  confirmUnsure?: boolean;
}

function isRetryableCause(cause: unknown): boolean {
  if (cause instanceof S3UploadError) {
    return cause.kind === 'network' || cause.kind === 'timeout' || cause.kind === 'server';
  }
  if (cause instanceof ApiError) {
    return cause.kind === 'network' || cause.kind === 'timeout' || cause.status >= 500;
  }
  return false;
}

/** Любая неудача конвейера: на каком шаге, что именно случилось и с чего продолжить. */
export class MediaUploadError extends Error {
  /** Имеет смысл повторить позже (сеть, таймаут, 5xx). Для 4xx, отмены и повторного 403 — нет. */
  readonly retryable: boolean;

  constructor(
    public readonly stage: UploadStage,
    /** `ApiError` (presign, confirm, verify) или `S3UploadError` (put). */
    cause: unknown,
    public readonly state: UploadState,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'MediaUploadError';
    this.retryable = isRetryableCause(cause);
  }
}

const S3_MESSAGES: Record<S3FailureKind, string> = {
  network: 'Нет связи с хранилищем. Проверьте интернет',
  timeout: 'Хранилище долго не отвечает. Повторите позже',
  forbidden: 'Хранилище отклонило загрузку. Попробуйте ещё раз',
  server: 'Ошибка хранилища, повторим автоматически',
  client: 'Хранилище не приняло файл',
  aborted: 'Загрузка отменена',
};

/** Текст для пользователя; ошибки API берутся из таблицы `errorCode → текст` (раздел 2.10). */
export function getUploadErrorMessage(error: unknown): string {
  const cause = error instanceof MediaUploadError ? error.cause : error;
  if (cause instanceof ApiError) return getErrorMessage(cause);
  if (cause instanceof S3UploadError) return S3_MESSAGES[cause.kind];
  return 'Не удалось загрузить файл. Повторите попытку';
}

// ---------- PUT в S3 ----------

export interface PutToS3Options {
  /** Доля отправленного, 0..1. Первый вызов — 0 при старте, последний — 1 при успехе. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Без значения таймаута нет: видео на сотни мегабайт по мобильной сети может грузиться долго. */
  timeoutMs?: number;
}

function s3KindForStatus(status: number): S3FailureKind {
  if (status === 403) return 'forbidden';
  if (status >= 500 || status === 408 || status === 429) return 'server';
  return 'client';
}

function s3CodeOf(responseText: string): string | undefined {
  return /<Code>([^<]+)<\/Code>/.exec(responseText)?.[1];
}

/**
 * `PUT` файла по presigned URL через `XMLHttpRequest`: только у него есть прогресс отправки (у `fetch` в Safari нет).
 * `Content-Type` выставляется явно и должен побайтно совпасть с тем, что ушёл в presigned-запросе: он зашит в подпись,
 * а `Blob.type` на Android бывает пустым. Других заголовков нет — `x-amz-*` в подпись не входят. Успех — любой 2xx.
 */
export function putToS3(uploadUrl: string, blob: Blob, contentType: string, options: PutToS3Options = {}): Promise<void> {
  const { onProgress, signal, timeoutMs } = options;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new S3UploadError('aborted', 0));
      return;
    }

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const finish = (error?: S3UploadError) => {
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    if (timeoutMs) xhr.timeout = timeoutMs;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(event.loaded / event.total, 1));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        finish();
      } else {
        finish(new S3UploadError(s3KindForStatus(xhr.status), xhr.status, s3CodeOf(xhr.responseText)));
      }
    };
    xhr.onerror = () => finish(new S3UploadError('network', 0));
    xhr.ontimeout = () => finish(new S3UploadError('timeout', 0));
    xhr.onabort = () => finish(new S3UploadError('aborted', 0));

    signal?.addEventListener('abort', onAbort, { once: true });
    onProgress?.(0);
    xhr.send(blob);
  });
}

// ---------- Конвейер ----------

export interface UploadMediaParams {
  reportId: string;
  /** `null` или не указан — общее медиа (видео обхода, обязательные фото), иначе фото секции. */
  sectionId?: string | null;
  blob: Blob;
  contentType: MediaContentType;
  /** Доля отправленного в S3, 0..1 (только шаг PUT). */
  onProgress?: (fraction: number) => void;
  onStage?: (stage: UploadStage) => void;
  /** Отменяет PUT; между шагами отмена проверяется, а уже ушедший запрос к API не прерывается. */
  signal?: AbortSignal;
  /** `MediaUploadError.state` прошлой попытки: загрузка продолжится с него. */
  resume?: UploadState;
}

export interface UploadMediaResult {
  s3Key: string;
  fileName: string;
  kind: MediaKind;
  sectionId: string | null;
  /** `report-check` — confirm потерял ответ, но отчёт уже содержит файл. */
  confirmedVia: 'confirm' | 'report-check';
}

type ConfirmOutcome = { via: UploadMediaResult['confirmedVia'] } | { missing: ApiError };

function isPresignStale(state: UploadState): boolean {
  return state.presignedAt === undefined || Date.now() - state.presignedAt > PRESIGN_MAX_AGE_MS;
}

/** Исход confirm неясен: ответ мог потеряться, а запись на сервере — появиться. */
function isAmbiguous(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'network' || error.kind === 'timeout' || error.status >= 500);
}

export async function uploadMedia(params: UploadMediaParams): Promise<UploadMediaResult> {
  const { reportId, blob, contentType, onProgress, onStage, signal } = params;
  const sectionId = params.sectionId ?? null;
  const kind = kindOf(contentType);
  const state: UploadState = { ...(params.resume ?? { fileName: createFileName(contentType) }) };

  const fail = (stage: UploadStage, cause: unknown) => new MediaUploadError(stage, cause, { ...state });
  const throwIfAborted = (stage: UploadStage) => {
    if (signal?.aborted) throw fail(stage, new S3UploadError('aborted', 0));
  };

  const presign = async (): Promise<string> => {
    onStage?.('presign');
    try {
      const { uploadUrl, s3Key } = await inspectorApi.presignedUrl(reportId, { sectionId, fileName: state.fileName, contentType });
      state.uploadUrl = uploadUrl;
      state.s3Key = s3Key;
      state.presignedAt = Date.now();
      return uploadUrl;
    } catch (error) {
      throw fail('presign', error);
    }
  };

  const putFile = async (): Promise<void> => {
    let represigns = 0;
    while (!state.putDone) {
      throwIfAborted('put');
      const uploadUrl = state.uploadUrl && !isPresignStale(state) ? state.uploadUrl : await presign();
      onStage?.('put');
      try {
        await putToS3(uploadUrl, blob, contentType, { onProgress, signal });
        state.putDone = true;
      } catch (error) {
        if (error instanceof S3UploadError && error.kind === 'forbidden' && represigns < MAX_REPRESIGN) {
          represigns++;
          state.uploadUrl = undefined;
          continue;
        }
        throw fail('put', error);
      }
    }
  };

  const isConfirmed = async (s3Key: string): Promise<boolean> => {
    onStage?.('verify');
    try {
      const report = await inspectorApi.getReport(reportId);
      return report.globalMedia.some((media) => media.s3Key === s3Key) || report.sections.some((section) => section.media.some((media) => media.s3Key === s3Key));
    } catch (error) {
      throw fail('verify', error);
    }
  };

  const confirmFile = async (s3Key: string): Promise<ConfirmOutcome> => {
    // Прошлая попытка оборвалась на неясном confirm: повторять вслепую нельзя, сначала смотрим отчёт
    if (state.confirmUnsure) {
      if (await isConfirmed(s3Key)) return { via: 'report-check' };
      state.confirmUnsure = false;
    }
    for (let attempt = 1; ; attempt++) {
      throwIfAborted('confirm');
      onStage?.('confirm');
      try {
        await inspectorApi.confirmUpload(reportId, { sectionId, s3key: s3Key, kind });
        return { via: 'confirm' };
      } catch (error) {
        if (error instanceof ApiError && error.errorCode === 'MEDIA_NOT_FOUND') return { missing: error };
        if (!isAmbiguous(error)) throw fail('confirm', error);
        state.confirmUnsure = true;
        if (await isConfirmed(s3Key)) return { via: 'report-check' };
        if (attempt >= MAX_CONFIRM_ATTEMPTS) throw fail('confirm', error);
        state.confirmUnsure = false;
      }
    }
  };

  let reputs = 0;
  for (;;) {
    await putFile();
    const s3Key = state.s3Key;
    if (!s3Key) throw fail('presign', new Error('Не получен ключ S3'));

    const outcome = await confirmFile(s3Key);
    if ('via' in outcome) {
      return { s3Key, fileName: state.fileName, kind, sectionId, confirmedVia: outcome.via };
    }
    if (reputs >= MAX_REPUT_AFTER_NOT_FOUND) throw fail('confirm', outcome.missing);
    reputs++;
    state.putDone = false;
  }
}
