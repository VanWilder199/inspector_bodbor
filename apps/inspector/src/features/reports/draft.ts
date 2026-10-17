/*
 * Черновик отчёта — локальная копия правок подборщика (PLAN_FRONTEND_MINIAPP.md, раздел 3.3).
 *
 * Хранится по отчёту, ключ `podbor:draft:<reportId>`. Источник истины — сервер, черновик лишь страховка на случай
 * плохой сети и закрытого приложения, поэтому у каждой части есть флаг `dirty`: грязные части при загрузке остаются
 * локальными (и уходят на сервер), чистые берутся с сервера. Здесь только модель, чтение/запись и слияние —
 * сохранение на сервер и автосохранение добавляет MINI-09.
 *
 * Отдельно от локального индекса отчётов (`reportsIndex.ts`): индекс отвечает на вопрос «какие отчёты есть»,
 * черновик — «что в них уже набрано».
 */

import { SECTION_KEYS, type ItemStatus, type ReportDto, type SectionKey } from '@/api/types';

export const DRAFT_KEY_PREFIX = 'podbor:draft:';

/** Ключ хранения черновика конкретного отчёта. */
export function draftKey(reportId: string): string {
  return `${DRAFT_KEY_PREFIX}${reportId}`;
}

/** Пункт чеклиста в черновике: `status` нет, пока подборщик не выбрал OK/WARN/BAD. */
export interface SectionItemDraft {
  status?: ItemStatus;
  comment?: string;
}

export interface SectionDraft {
  /** Id с сервера: клиент его не придумывает (раздел 2.5). */
  sectionId: string;
  summary: string;
  items: Record<string, SectionItemDraft>;
  dirty: boolean;
  lastSavedAt?: string;
  lastError?: string;
}

export interface PaintDraftMeasurement {
  panelCode: string;
  spot?: string;
  thicknessUm?: number;
  note?: string;
}

/** Замеры ЛКП хранятся локально, пока бэкенд не принимает `panelCode` (BE-6 / B-23). */
export interface PaintDraft {
  measurements: PaintDraftMeasurement[];
  dirty: boolean;
}

export interface ConclusionDraft {
  conclusionText: string;
  /** Копейки. */
  priceByn?: number;
  dirty: boolean;
}

/** Теги обязательных фото. До BE-11 они живут только на устройстве — на другом телефоне их не видно. */
export type MediaTag = 'ODOMETER' | 'VIN_PLATE' | 'INSPECTOR_WITH_CAR' | 'DOCUMENTS';

export const MANDATORY_TAGS: readonly MediaTag[] = ['ODOMETER', 'VIN_PLATE', 'INSPECTOR_WITH_CAR', 'DOCUMENTS'];

export interface ReportDraft {
  schema: 1;
  reportId: string;
  /** Когда последний раз читали сервер: по нему чистятся брошенные черновики. */
  loadedAt: string;
  sections: Record<SectionKey, SectionDraft>;
  paint: PaintDraft;
  conclusion: ConclusionDraft;
  /** Тег обязательного фото по `s3Key` (секции в черновике нет — тег локальный). */
  localMediaTags: Record<string, MediaTag>;
}

/** Свежий черновик из серверного ответа: всё чистое, локальных правок нет. */
export function createDraftFromReport(report: ReportDto): ReportDraft {
  const sections = {} as Record<SectionKey, SectionDraft>;
  for (const key of SECTION_KEYS) {
    // Секция в ответе есть всегда, но фикстура или будущий бэкенд могут её не прислать — пустая безопаснее падения
    const section = report.sections.find((candidate) => candidate.sectionKey === key);
    const items: Record<string, SectionItemDraft> = {};
    for (const item of section?.items ?? []) {
      items[item.itemKey] = item.comment === null ? { status: item.status } : { status: item.status, comment: item.comment };
    }
    sections[key] = { sectionId: section?.id ?? '', summary: section?.summary ?? '', items, dirty: false };
  }

  return {
    schema: 1,
    reportId: report.id,
    loadedAt: new Date().toISOString(),
    sections,
    paint: {
      measurements: report.paintMeasurements.map((measurement) => ({
        panelCode: measurement.panelCode,
        ...(measurement.spot === null ? {} : { spot: measurement.spot }),
        thicknessUm: measurement.thicknessUm,
        ...(measurement.note === null ? {} : { note: measurement.note }),
      })),
      dirty: false,
    },
    conclusion: {
      conclusionText: report.conclusionText ?? '',
      ...(report.priceByn === null ? {} : { priceByn: report.priceByn }),
      dirty: false,
    },
    localMediaTags: {},
  };
}

/**
 * Слияние серверного отчёта с локальным черновиком (правило 1 раздела 3.3): грязная часть остаётся локальной,
 * чистая берётся с сервера. `sectionId` всегда серверный — локальная копия могла устареть, а `PUT` секции
 * идёт именно по нему.
 */
export function mergeDraft(server: ReportDraft, local: ReportDraft | null): ReportDraft {
  if (!local || local.schema !== server.schema || local.reportId !== server.reportId) {
    return server;
  }

  const sections = {} as Record<SectionKey, SectionDraft>;
  for (const key of SECTION_KEYS) {
    const localSection = local.sections?.[key];
    sections[key] = localSection?.dirty ? { ...localSection, sectionId: server.sections[key].sectionId } : server.sections[key];
  }

  return {
    ...server,
    sections,
    paint: local.paint?.dirty ? local.paint : server.paint,
    conclusion: local.conclusion?.dirty ? local.conclusion : server.conclusion,
    // Теги обязательных фото локальные: на сервере их пока нет (BE-11), поэтому серверный ответ их не заменяет
    localMediaTags: local.localMediaTags ?? {},
  };
}

/** Есть ли в черновике несохранённые на сервер правки (для подтверждения закрытия, раздел 3.2). */
export function hasDirtyDraft(draft: ReportDraft): boolean {
  return Object.values(draft.sections).some((section) => section.dirty) || draft.paint.dirty || draft.conclusion.dirty;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Разбирает то, что лежит в хранилище. Битый JSON, чужой `schema` и не та форма — это «черновика нет», а не падение. */
export function parseDraft(raw: string | null, reportId: string): ReportDraft | null {
  if (raw === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.schema !== 1 || parsed.reportId !== reportId) {
    return null;
  }
  if (!isRecord(parsed.sections) || !isRecord(parsed.paint) || !isRecord(parsed.conclusion)) {
    return null;
  }
  return parsed as unknown as ReportDraft;
}

export function readDraft(reportId: string): ReportDraft | null {
  try {
    return parseDraft(window.localStorage.getItem(draftKey(reportId)), reportId);
  } catch {
    // Хранилище недоступно: считаем, что черновика нет
    return null;
  }
}

export function writeDraft(draft: ReportDraft): void {
  try {
    window.localStorage.setItem(draftKey(draft.reportId), JSON.stringify(draft));
  } catch {
    // Переполнение или запрет хранилища: черновик — удобство, а не источник истины (как и индекс отчётов)
  }
}

export function clearDraft(reportId: string): void {
  try {
    window.localStorage.removeItem(draftKey(reportId));
  } catch {
    // см. writeDraft
  }
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Чистит брошенные черновики (правило 8 раздела 3.3) при старте приложения.
 * Грязные не трогает никогда: в них несохранённая работа подборщика, и возраст тут не повод её терять.
 */
export function pruneStaleDrafts(maxAgeMs: number = THIRTY_DAYS_MS): number {
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(DRAFT_KEY_PREFIX)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      const reportId = key.slice(DRAFT_KEY_PREFIX.length);
      const draft = parseDraft(window.localStorage.getItem(key), reportId);
      if (!draft || hasDirtyDraft(draft)) {
        continue;
      }
      const age = Date.now() - new Date(draft.loadedAt).getTime();
      if (!Number.isFinite(age) || age > maxAgeMs) {
        window.localStorage.removeItem(key);
        removed += 1;
      }
    }
  } catch {
    // Хранилище недоступно — чистить нечего
  }
  return removed;
}
