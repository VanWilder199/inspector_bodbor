/*
 * Единая точка работы с API подборщика (PLAN_FRONTEND_MINIAPP.md, раздел 2.1 и 3.1).
 * Разбирает все формы ошибок бэкенда:
 *  A  — ProblemDetail с errorCode (AppException);
 *  A' — то же + `errors: ["поле: сообщение"]` (@Valid);
 *  B  — стандартные ошибки Spring MVC: ProblemDetail без errorCode (битый JSON, неизвестный enum, битый UUID, 404);
 *  C  — 401 из Security: тела нет или JSON Spring Boot без errorCode.
 */

import { getRawInitData } from './session';

const API_BASE = '/api';

/** Заголовок аутентификации: сырая строка initData (`TelegramAuthFilter.java:20`). */
export const INIT_DATA_HEADER = 'X-Telegram-Data';

const DEFAULT_TIMEOUT_MS = 15_000;

/** `http` — ответ получен, `network` — ответа не было (`TypeError` от fetch), `timeout` — вышел таймаут запроса. */
export type ApiErrorKind = 'http' | 'network' | 'timeout';

export class ApiError extends Error {
  constructor(
    /** HTTP-статус; 0 — ответа не было (сеть или таймаут). */
    public status: number,
    public errorCode?: string,
    public detail?: string,
    /** Ошибки валидации `@Valid`: путь поля → сообщение (`items[0].status` → `must not be null`). */
    public fieldErrors?: Record<string, string>,
    public raw?: unknown,
    public kind: ApiErrorKind = status === 0 ? 'network' : 'http',
  ) {
    super(detail || `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

let onUnauthorized: (() => void) | undefined;

/** Обработчик «сессия невалидна» (переход на `/session-expired`). Устанавливается в `App.tsx`. */
export function setUnauthorizedHandler(fn: (() => void) | undefined) {
  onUnauthorized = fn;
}

/** `["items[0].status: must not be null"]` → `{ "items[0].status": "must not be null" }`. */
export function parseFieldErrors(errors: unknown): Record<string, string> | undefined {
  if (!Array.isArray(errors)) return undefined;
  const result: Record<string, string> = {};
  for (const entry of errors) {
    if (typeof entry !== 'string') continue;
    const idx = entry.indexOf(':');
    if (idx === -1) {
      result['_form'] = entry.trim();
    } else {
      result[entry.slice(0, idx).trim()] = entry.slice(idx + 1).trim();
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** `items[0].status` → `['items', 0, 'status']`: так ошибка раскладывается по пункту секции. */
export function parseFieldPath(path: string): (string | number)[] {
  const parts: (string | number)[] = [];
  for (const segment of path.split('.')) {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(segment);
    if (!match) {
      parts.push(segment);
      continue;
    }
    if (match[1]) parts.push(match[1]);
    for (const index of (match[2] ?? '').matchAll(/\[(\d+)\]/g)) parts.push(Number(index[1]));
  }
  return parts;
}

function parseBody(text: string): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function defaultDetail(status: number): string {
  if (status === 401) return 'Unauthorized';
  if (status === 403) return 'Forbidden';
  return 'Unknown error';
}

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

export interface ApiRequestInit extends RequestInit {
  /** Таймаут запроса, мс. По умолчанию 15 с; для `POST /inspector/reports` — 30 с (синхронный парсинг av.by). */
  timeoutMs?: number;
}

/**
 * Запрос к `/api{path}`. Успех с пустым телом (204 у PUT и submit) → `undefined`, такие эндпоинты типизируются как `apiFetch<void>`.
 * Любая ошибка — `ApiError` (сетевая и таймаут — со `status: 0`); отмену запроса снаружи (`options.signal`) пробрасываем как есть.
 * Автоматических повторов здесь нет: что повторять и когда, решают автосохранение и очередь загрузок.
 */
export async function apiFetch<T = void>(path: string, options: ApiRequestInit = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: outerSignal, ...init } = options;

  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  // Строка передаётся как есть: сервер сам делит её по `&` и пересчитывает подпись, пересборка на клиенте её ломает
  const initData = getRawInitData();
  if (initData && !headers.has(INIT_DATA_HEADER)) headers.set(INIT_DATA_HEADER, initData);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromOutside = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener('abort', abortFromOutside, { once: true });
  }

  let res: Response;
  let text: string;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: controller.signal });
    // Тело читаем текстом: content-length у chunked-ответов нет, а пустое тело — штатный успех
    text = await res.text();
  } catch (e) {
    if (isAbortError(e)) {
      if (timedOut) throw new ApiError(0, undefined, 'Request timeout', undefined, e, 'timeout');
      throw e;
    }
    throw new ApiError(0, undefined, 'Network error', undefined, e, 'network');
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', abortFromOutside);
  }

  if (res.ok) {
    if (text === '') return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(res.status, undefined, 'Invalid JSON in response', undefined, text);
    }
  }

  // Любой 401 — сессия невалидна (истёк или не подошёл initData). Повторов нет: обработчик уводит на `/session-expired`
  if (res.status === 401) onUnauthorized?.();

  const body = parseBody(text);
  const errorCode = str(body?.errorCode);
  const detail = str(body?.detail) ?? str(body?.title) ?? str(body?.message) ?? str(body?.error) ?? defaultDetail(res.status);

  throw new ApiError(res.status, errorCode, detail, parseFieldErrors(body?.errors), body ?? (text || null));
}
