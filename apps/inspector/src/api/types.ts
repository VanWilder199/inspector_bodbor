/*
 * Ручные зеркала DTO бэкенда подборщика (PLAN_FRONTEND_MINIAPP.md, раздел 2) — до springdoc (BE-18).
 * Деньги (`priceByn`) — в копейках: 5000 = 50,00 BYN. Статусы подборщика и отчёта — строки в нижнем регистре,
 * enum в теле запросов (`ItemStatus`, `MediaKind`, `SectionKey`) — в верхнем.
 */

export type InspectorStatus = 'pending' | 'verified' | 'banned';
export type ReportStatus = 'draft' | 'pending_review' | 'revision_required' | 'published';
export type ItemStatus = 'OK' | 'WARN' | 'BAD';
export type MediaKind = 'PHOTO' | 'VIDEO';
/** Фото после confirm — `uploaded`, видео — `pending`; `ready` видео не получает: ffmpeg-воркера нет. */
export type MediaStatus = 'pending' | 'uploaded' | 'ready';

/** Секции в порядке `order_no` (на бэкенде всегда все 7). */
export const SECTION_KEYS = ['EXTERIOR', 'PAINT', 'INTERIOR', 'ENGINE', 'SUSPENSION', 'ELECTRICS', 'DOCUMENTS'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** Единственные `contentType`, которые принимает presigned-запрос (`MediaServiceImpl.java:30-34`). */
export type MediaContentType = 'image/jpeg' | 'image/png' | 'video/mp4';

// ---------- Ошибки ----------

/** `ProblemDetail` бэкенда. Для ошибок Spring MVC и Security `errorCode` нет, для 401 нет и тела (раздел 2.1). */
export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  timestamp?: string;
  path?: string;
  errorCode?: string;
  /** Только у ошибок `@Valid`: строки вида `"summary: must not be blank"`. */
  errors?: string[];
}

// ---------- Профиль ----------

export interface InspectorDto {
  id: string;
  telegramUserId: number;
  fullName: string;
  phone: string;
  email: string;
  status: InspectorStatus;
}

/** `email` на бэкенде `@Email` без `@NotBlank`, но без него регистрация падает с 500 (BE-4) — поэтому на фронте он обязателен. */
export interface RegisterInspectorRequest {
  fullName: string;
  phone: string;
  email: string;
}

// ---------- Отчёт ----------

export interface CreateReportRequest {
  avbyUrl: string;
}

export interface CreateReportResponse {
  reportId: string;
}

export interface SectionItemDto {
  itemKey: string;
  status: ItemStatus;
  comment: string | null;
}

export interface ReportMediaDto {
  id: string;
  kind: MediaKind;
  s3Key: string;
  status: MediaStatus;
  orderNo: number;
}

export interface ReportSectionDto {
  id: string;
  sectionKey: SectionKey;
  orderNo: number;
  summary: string;
  items: SectionItemDto[];
  media: ReportMediaDto[];
}

export interface PaintMeasurementDto {
  id: string;
  panelCode: string;
  spot: string | null;
  thicknessUm: number;
  note: string | null;
}

/** Ответ `GET /inspector/reports/{id}`. Данных машины, URL медиа и причины доработки в нём пока нет (BE-8). */
export interface ReportDto {
  id: string;
  carId: string;
  inspectorId: string;
  versionNo: number;
  status: ReportStatus;
  priceByn: number | null;
  conclusionText: string | null;
  /** `itemKey` всех пунктов со статусом `BAD`. */
  stopFactors: string[];
  sections: ReportSectionDto[];
  paintMeasurements: PaintMeasurementDto[];
  /** Медиа без секции: видео обхода и (до BE-11) обязательные фото. */
  globalMedia: ReportMediaDto[];
}

export interface SectionItemInput {
  itemKey: string;
  status: ItemStatus;
  comment?: string | null;
}

/** Полная замена: пункты, которых нет в запросе, удаляются. Пустой `items` на бэкенде, скорее всего, даёт 500 (BE-14). */
export interface UpdateSectionRequest {
  summary: string;
  items: SectionItemInput[];
}

/**
 * Замер ЛКП. Решение пользователя (B-23, 2026-10-05): бэкенд принимает код панели строкой, а не `panelId`:
 * UUID панелей разные в каждой БД, и взять их фронту неоткуда. Сейчас в коде бэкенда ещё `panelId` — эндпоинт ждёт B-23.
 */
export interface PaintMeasurementInput {
  panelCode: string;
  spot?: string | null;
  thicknessUm: number;
  note?: string | null;
}

/** Полная замена замеров на весь отчёт. Пустой список — как и у секции, вероятно, 500 (BE-14). */
export interface UpdatePaintMeasurementsRequest {
  measurements: PaintMeasurementInput[];
}

export interface UpdateConclusionRequest {
  conclusionText: string;
  /** В копейках. */
  priceByn: number;
}

// ---------- Медиа ----------

export interface PresignedUrlRequest {
  /** `null` — глобальное медиа (видео обхода). */
  sectionId?: string | null;
  /** Попадает в S3-ключ как есть, поэтому имя генерирует клиент: `<uuid>.jpg`. */
  fileName: string;
  contentType: MediaContentType;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  s3Key: string;
}

export interface ConfirmUploadRequest {
  /** Тот же, что в presigned-запросе: от него зависит, куда медиа попадёт в `GET` (секция или `globalMedia`). */
  sectionId?: string | null;
  /** Именно `s3key` со строчной `k` (в ответе presigned — `s3Key`). */
  s3key: string;
  /** Для `video/mp4` — `VIDEO`, иначе отправка не увидит видео. */
  kind: MediaKind;
}

// ---------- Будущие контракты (раздел 5 плана): бэкенда пока нет, живут только в моках ----------

export interface CarSummary {
  id: string;
  make: string;
  model: string;
  year: number | null;
  vin: string | null;
  avbyListingUrl: string;
}

/** BE-5 / B-25: `GET /inspector/catalog/checklist`. Открыто: откуда берутся `title`/`instruction` секций и `version`. */
export interface ChecklistItem {
  itemKey: string;
  title: string;
  hint: string;
  required: boolean;
  /** При каком статусе нужно фото: `BAD`, `WARN` или не нужно. */
  photoRequiredOn: 'BAD' | 'WARN' | null;
  orderNo: number;
}

export interface ChecklistSection {
  sectionKey: SectionKey;
  title: string;
  instruction: string;
  items: ChecklistItem[];
}

export interface ChecklistCatalog {
  version: number;
  sections: ChecklistSection[];
}

/** BE-7 / B-21. `deleted` — вычисляемый статус по рекомендации источника (решение по нему не принято). */
export type MyReportStatus = ReportStatus | 'deleted';

export interface LastModeration {
  action: string;
  reason: string;
  at: string;
}

/** BE-7 / B-21: `GET /inspector/reports?status=draft,revision_required`. */
export interface MyReportListItem {
  id: string;
  status: MyReportStatus;
  versionNo: number;
  car: CarSummary;
  priceByn: number | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  lastModeration: LastModeration | null;
  salesCount: number;
}

/** BE-15 / B-28: `GET /inspector/demand?limit=50`. */
export interface DemandItem {
  car: CarSummary & { listingStatus: string };
  waitingCount: number;
  lastRequestedAt: string;
  publishedReportsCount: number;
  /** Черновик этого подборщика по машине: тогда кнопка «Продолжить», а не «Создать». */
  myReportId: string | null;
}
