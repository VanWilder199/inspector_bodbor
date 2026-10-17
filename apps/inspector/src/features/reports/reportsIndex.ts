/*
 * Локальный индекс отчётов подборщика (PLAN_FRONTEND_MINIAPP.md, раздел 3.3, п.9).
 *
 * Временная замена `GET /inspector/reports` (BE-7 / B-21): пока эндпоинта нет, список «Мои отчёты» строится по `reportId`,
 * созданным на этом устройстве. Привязан к устройству и к `localStorage`, поэтому отчёт, созданный на другом телефоне,
 * здесь не появится. Индекс хранится отдельно от черновика отчёта (`podbor:draft:<id>`, MINI-08): другая сущность
 * с другим жизненным циклом. Пополняет его MINI-07 после каждого `POST /inspector/reports`.
 */

export const REPORTS_INDEX_KEY = 'podbor:reports-index';

/** Версия формата записи в `localStorage`. При смене формата поднять и добавить разбор старого в `parseStored`. */
const SCHEMA_VERSION = 1;

export interface ReportIndexEntry {
  reportId: string;
  /** Ссылка av.by, из которой создан отчёт: по ней подписывается карточка, пока бэкенд не отдаёт данные машины (BE-8). */
  avbyUrl: string;
  /** ISO-время создания на этом устройстве. */
  createdAt: string;
}

interface StoredIndex {
  schema: number;
  entries: ReportIndexEntry[];
}

function isEntry(value: unknown): value is ReportIndexEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { reportId, avbyUrl, createdAt } = value as Record<string, unknown>;
  return typeof reportId === 'string' && reportId !== '' && typeof avbyUrl === 'string' && typeof createdAt === 'string';
}

/**
 * Достаёт записи из того, что лежит в хранилище. Понимает и формат из плана (голый массив), и текущий `{ schema, entries }`.
 * Битый JSON и записи неверной формы не ломают приложение: они просто отбрасываются, повторы `reportId` схлопываются.
 */
function parseStored(raw: string | null): ReportIndexEntry[] {
  if (raw === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const candidates: unknown = Array.isArray(parsed) ? parsed : (parsed as Partial<StoredIndex> | null)?.entries;
  if (!Array.isArray(candidates)) {
    return [];
  }
  const seen = new Set<string>();
  const entries: ReportIndexEntry[] = [];
  for (const candidate of candidates) {
    if (isEntry(candidate) && !seen.has(candidate.reportId)) {
      seen.add(candidate.reportId);
      entries.push({ reportId: candidate.reportId, avbyUrl: candidate.avbyUrl, createdAt: candidate.createdAt });
    }
  }
  return entries;
}

function write(entries: ReportIndexEntry[]): void {
  try {
    const stored: StoredIndex = { schema: SCHEMA_VERSION, entries };
    window.localStorage.setItem(REPORTS_INDEX_KEY, JSON.stringify(stored));
  } catch {
    // Хранилище недоступно или переполнено. Индекс — удобство, а не источник истины: отчёт на сервере от этого не пропадает
  }
}

/** Записи индекса, новые первыми. */
export function readReportsIndex(): ReportIndexEntry[] {
  try {
    return parseStored(window.localStorage.getItem(REPORTS_INDEX_KEY));
  } catch {
    return [];
  }
}

/** Добавляет отчёт в начало индекса. Повтор того же `reportId` ничего не меняет: время создания остаётся первым. */
export function addToReportsIndex(entry: Omit<ReportIndexEntry, 'createdAt'> & { createdAt?: string }): void {
  const entries = readReportsIndex();
  if (entries.some((existing) => existing.reportId === entry.reportId)) {
    return;
  }
  write([{ reportId: entry.reportId, avbyUrl: entry.avbyUrl, createdAt: entry.createdAt ?? new Date().toISOString() }, ...entries]);
}

export function removeFromReportsIndex(reportId: string): void {
  const entries = readReportsIndex();
  if (entries.some((existing) => existing.reportId === reportId)) {
    write(entries.filter((existing) => existing.reportId !== reportId));
  }
}
