/*
 * Все 10 эндпоинтов подборщика (PLAN_FRONTEND_MINIAPP.md, раздел 2.2) с точными путями.
 * Клиент никогда не отправляет пустые `items` и `measurements`: на бэкенде это, скорее всего, 500 (BE-14).
 */

import { apiFetch } from './client';
import type {
  ConfirmUploadRequest,
  CreateReportResponse,
  InspectorDto,
  PresignedUrlRequest,
  PresignedUrlResponse,
  RegisterInspectorRequest,
  ReportDto,
  UpdateConclusionRequest,
  UpdatePaintMeasurementsRequest,
  UpdateSectionRequest,
} from './types';

/** Создание отчёта ждёт синхронного парсинга av.by (на бэкенде до 10 с), поэтому таймаут больше обычного. */
const CREATE_REPORT_TIMEOUT_MS = 30_000;

function json(method: 'POST' | 'PUT', body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) };
}

const id = encodeURIComponent;

export const inspectorApi = {
  /** `404 INSPECTOR_NOT_FOUND` — штатный сигнал «нужна регистрация». Слеш на конце обязателен: без него 404 без `errorCode`. */
  me: () => apiFetch<InspectorDto>('/inspector/'),

  register: (body: RegisterInspectorRequest) => apiFetch<InspectorDto>('/inspector/register', json('POST', body)),

  /** Не повторять автоматически: каждый вызов создаёт новый черновик (2.4). */
  createReport: (avbyUrl: string) =>
    apiFetch<CreateReportResponse>('/inspector/reports', { ...json('POST', { avbyUrl }), timeoutMs: CREATE_REPORT_TIMEOUT_MS }),

  getReport: (reportId: string) => apiFetch<ReportDto>(`/inspector/reports/${id(reportId)}`),

  /** Полная замена секции: всегда полный список пунктов. */
  updateSection: (reportId: string, sectionId: string, body: UpdateSectionRequest) =>
    apiFetch(`/inspector/reports/${id(reportId)}/sections/${id(sectionId)}`, json('PUT', body)),

  /** Полная замена замеров на весь отчёт. */
  updatePaint: (reportId: string, body: UpdatePaintMeasurementsRequest) =>
    apiFetch(`/inspector/reports/${id(reportId)}/paint`, json('PUT', body)),

  updateConclusion: (reportId: string, body: UpdateConclusionRequest) =>
    apiFetch(`/inspector/reports/${id(reportId)}/conclusion`, json('PUT', body)),

  /** Повтор безопасен: второй вызов после успешного даст `409 REPORT_NOT_EDITABLE`, это успех после перечитывания статуса. */
  submit: (reportId: string) => apiFetch(`/inspector/reports/${id(reportId)}/submit`, json('POST')),

  presignedUrl: (reportId: string, body: PresignedUrlRequest) =>
    apiFetch<PresignedUrlResponse>(`/inspector/media/presigned-url/${id(reportId)}`, json('POST', body)),

  /** Не идемпотентен: повтор создаёт второе фото. После сбоя сначала перечитать отчёт и поискать `s3Key` (3.4). */
  confirmUpload: (reportId: string, body: ConfirmUploadRequest) =>
    apiFetch(`/inspector/media/confirm-upload/${id(reportId)}`, json('POST', body)),
};
