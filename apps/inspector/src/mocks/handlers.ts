import { delay, http, HttpResponse, type HttpResponseResolver, type PathParams } from 'msw';
import { INIT_DATA_HEADER } from '@/api/client';
import type {
  InspectorDto,
  MyReportListItem,
  MyReportStatus,
  ReportDto,
  ReportSectionDto,
  ReportStatus,
  SectionItemDto,
} from '@/api/types';
import { createChecklist, createDemand, PANEL_CODES } from './fixtures/catalog';
import { createEmptySections, stopFactorsOf } from './fixtures/reports';
import { INSPECTOR_ID, isUuid, MOCK_TELEGRAM_USER_ID, uuid } from './fixtures/ids';
import { db, mockConfig, takeFailure, type MockFailure } from './state';

/*
 * MSW-хендлеры, повторяющие бэкенд подборщика (PLAN_FRONTEND_MINIAPP.md, раздел 2): те же пути, те же проверки
 * в том же порядке, те же коды и формы ошибок — включая его дыры (например, медиа-эндпоинты не проверяют владельца отчёта).
 * Префикс `/api` — как у клиента (`api/client.ts`). Ниже основных эндпоинтов — будущие контракты из раздела 5 (BE-5, BE-7, BE-15).
 */

const API = '/api';

/** Префикс «S3»: presigned URL в моках ведёт на этот же origin, чтобы PUT перехватывал MSW без CORS. */
export const MOCK_S3_PREFIX = '/__mock-s3/';

const ITEM_STATUSES = ['OK', 'WARN', 'BAD'];
const MEDIA_KINDS = ['PHOTO', 'VIDEO'];
const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'video/mp4'];
const REPORT_STATUSES: MyReportStatus[] = ['draft', 'pending_review', 'revision_required', 'published', 'deleted'];
const EDITABLE: ReportStatus[] = ['draft', 'revision_required'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Ответы ----------

function problem(status: number, title: string, detail: string, path: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json(
    { type: 'about:blank', title, status, detail, instance: path, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

/** Форма A: `AppException` → `ProblemDetail` с `errorCode`. */
function appError(status: number, errorCode: string, detail: string, path: string) {
  return problem(status, detail, detail, path, { type: `/errors/${errorCode.toLowerCase()}`, timestamp: new Date().toISOString(), path, errorCode });
}

/** Форма A': ошибка `@Valid`, `errors` — массив строк «поле: сообщение». */
function validationError(errors: string[], path: string) {
  return problem(400, 'Bad Request', 'Validation failed', path, { errors, errorCode: 'BAD_REQUEST' });
}

/** Форма B: стандартная ошибка Spring MVC без `errorCode` (битый JSON, неизвестный enum, битый UUID, 404). */
function springError(status: number, detail: string, path: string) {
  return problem(status, status === 404 ? 'Not Found' : 'Bad Request', detail, path);
}

/** Форма C: 401 из Security. Тело — JSON Spring Boot `/error`, а при смене конфига или прокси может быть пустым. */
function securityError(path: string, empty = false) {
  if (empty) return new HttpResponse(null, { status: 401 });
  return HttpResponse.json({ timestamp: new Date().toISOString(), status: 401, error: 'Unauthorized', path }, { status: 401 });
}

function noContent() {
  return new HttpResponse(null, { status: 204 });
}

const internalError = (path: string) => appError(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', path);

async function failureResponse(failure: MockFailure, path: string) {
  switch (failure.kind) {
    case 'app':
      return appError(failure.status, failure.errorCode, failure.detail ?? failure.errorCode, path);
    case 'validation':
      return validationError(failure.errors, path);
    case 'spring':
      return springError(failure.status, failure.detail, path);
    case 'security':
      return securityError(path, failure.empty);
    case 'network':
      return HttpResponse.error();
    case 'hang':
      // ответа нет никогда: клиент уходит по своему таймауту
      return new Promise<never>(() => {});
  }
}

// ---------- Обёртка эндпоинта ----------

type Method = 'get' | 'post' | 'put';

/**
 * Порядок как в Spring: фильтр `TelegramAuthFilter` (нет заголовка → 401) → принудительная ошибка из `mockControl` → сам эндпоинт.
 * Подпись initData в моках не проверяется: достаточно непустого заголовка.
 * Ключ для `mockControl.fail`: `METHOD /шаблон/пути` (без `/api`).
 */
function route(method: Method, pattern: string, resolver: HttpResponseResolver<PathParams>) {
  const key = `${method.toUpperCase()} ${pattern}`;
  return http[method](`${API}${pattern}`, async (info) => {
    // при нулевой задержке не трогаем таймеры вообще: иначе тесты с фейковыми часами зависают на delay(0)
    if (mockConfig.latencyMs > 0) await delay(mockConfig.latencyMs);
    const path = pathOf(info.request);

    if (!info.request.headers.get(INIT_DATA_HEADER)) return securityError(path);

    const failure = takeFailure(key);
    if (failure) return failureResponse(failure, path);

    return resolver(info);
  });
}

const pathOf = (request: Request) => new URL(request.url).pathname.replace(/^\/api/, '');

// ---------- Разбор запроса ----------

const INVALID_JSON = Symbol('invalid-json');

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return INVALID_JSON;
  }
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isBlank = (value: unknown) => typeof value !== 'string' || value.trim() === '';

/** Невалидный UUID в пути → форма B (`MethodArgumentTypeMismatchException`). */
function badId(value: unknown, name: string, path: string) {
  const text = String(value);
  return isUuid(text) ? null : springError(400, `Failed to convert '${name}' with value: '${text}'`, path);
}

function nextId(): string {
  return uuid(db.seq++);
}

function touch(reportId: string) {
  db.updatedAt[reportId] = new Date().toISOString();
}

// ---------- Проверки отчёта (ReportServiceImpl.requireOwnedReport / requireEditableReport) ----------

function requireOwnedReport(reportId: string, path: string): ReportDto | Response {
  if (!db.inspector) return appError(404, 'INSPECTOR_NOT_FOUND', 'Inspector not found', path);
  const report = db.reports[reportId];
  if (!report || db.deleted.has(reportId)) return appError(404, 'REPORT_NOT_FOUND', 'Report not found', path);
  if (report.inspectorId !== db.inspector.id) return appError(403, 'REPORT_ACCESS_DENIED', 'Report access denied', path);
  return report;
}

function requireEditableReport(reportId: string, path: string): ReportDto | Response {
  const report = requireOwnedReport(reportId, path);
  if (report instanceof Response) return report;
  if (!EDITABLE.includes(report.status)) return appError(409, 'REPORT_NOT_EDITABLE', 'Report is not editable', path);
  return report;
}

/** Правила `submitForModeration` (раздел 2.8) в том же порядке. */
function isComplete(report: ReportDto): boolean {
  const sectionsFilled = report.sections.every((section) => section.summary !== '' && section.items.length > 0);
  const hasVideo = report.globalMedia.some((media) => media.kind === 'VIDEO' && (media.status === 'pending' || media.status === 'ready'));
  const hasConclusion = !isBlank(report.conclusionText) && report.priceByn !== null;
  return sectionsFilled && hasVideo && hasConclusion;
}

// ---------- Профиль ----------

/** `id` из поля `user` строки initData: так регистрация «запоминает», под кем вошли. */
function telegramUserId(request: Request): number {
  try {
    const user = new URLSearchParams(request.headers.get(INIT_DATA_HEADER) ?? '').get('user');
    const id = user ? (JSON.parse(user) as { id?: unknown }).id : undefined;
    return typeof id === 'number' ? id : MOCK_TELEGRAM_USER_ID;
  } catch {
    return MOCK_TELEGRAM_USER_ID;
  }
}

// Путь строго со слешем: trailing-slash matching в Spring Boot 3 выключен, `GET /inspector` — 404 без `errorCode` (форма B).
// MSW слеш на конце различает, поэтому «без слеша» — отдельный хендлер: иначе опечатка в пути осталась бы незамеченной.
const meHandler = route('get', '/inspector/', ({ request }) => {
  const path = pathOf(request);
  if (!db.inspector) return appError(404, 'INSPECTOR_NOT_FOUND', 'Inspector not found', path);
  return HttpResponse.json(db.inspector);
});

const meWithoutSlashHandler = route('get', '/inspector', ({ request }) => springError(404, 'No static resource inspector.', pathOf(request)));

const registerHandler = route('post', '/inspector/register', async ({ request }) => {
  const path = pathOf(request);
  const body = await readJson(request);
  if (!isRecord(body)) return springError(400, 'Required request body is missing or malformed', path);

  const errors: string[] = [];
  if (isBlank(body.fullName)) errors.push('fullName: must not be blank');
  if (body.phone == null) errors.push('phone: must not be null');
  if (body.email != null && !EMAIL_RE.test(String(body.email))) errors.push('email: must be a well-formed email address');
  if (errors.length > 0) return validationError(errors, path);

  // `inspectors.email NOT NULL`: без email INSERT падает на ограничении БД раньше, чем сработает ON CONFLICT (BE-4)
  if (body.email == null) return internalError(path);
  if (db.inspector) return appError(409, 'INSPECTOR_ALREADY_REGISTERED', 'Inspector already registered', path);

  const inspector: InspectorDto = {
    id: INSPECTOR_ID,
    telegramUserId: telegramUserId(request),
    fullName: String(body.fullName),
    phone: String(body.phone),
    email: String(body.email),
    status: 'pending',
  };
  db.inspector = inspector;
  return HttpResponse.json(inspector);
});

// ---------- Отчёты ----------

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** `CarServiceImpl.findOrCreateByUrl`: поиск по точному совпадению строки URL, парсер вызывается только для новой машины. */
function findOrCreateCar(avbyListingUrl: string): string {
  const existing = Object.values(db.cars).find((car) => car.avbyListingUrl === avbyListingUrl);
  if (existing) return existing.id;
  const id = nextId();
  db.cars[id] = { id, make: 'Volkswagen', model: 'Passat', year: 2017, vin: null, avbyListingUrl };
  return id;
}

const createReportHandler = route('post', '/inspector/reports', async ({ request }) => {
  const path = pathOf(request);
  const body = await readJson(request);
  if (!isRecord(body)) return springError(400, 'Required request body is missing or malformed', path);
  if (isBlank(body.avbyUrl)) return validationError(['avbyUrl: must not be blank'], path);

  if (!db.inspector) return appError(404, 'INSPECTOR_NOT_FOUND', 'Inspector not found', path);
  // проверяется только `banned`: `pending` создавать отчёты может (BE-3)
  if (db.inspector.status === 'banned') return appError(403, 'INSPECTOR_BANNED', 'Inspector is banned', path);
  // строка не URL: `Jsoup.connect` бросает `IllegalArgumentException`, которую никто не ловит
  if (!isHttpUrl(String(body.avbyUrl))) return internalError(path);

  const id = nextId();
  const now = new Date().toISOString();
  // каждый вызов — новый черновик, даже на ту же машину (уникальности нет, BE-19)
  db.reports[id] = {
    id,
    carId: findOrCreateCar(String(body.avbyUrl)),
    inspectorId: db.inspector.id,
    versionNo: 1,
    status: 'draft',
    priceByn: null,
    conclusionText: null,
    stopFactors: [],
    sections: createEmptySections(db.seq),
    paintMeasurements: [],
    globalMedia: [],
  };
  db.seq += 7;
  db.createdAt[id] = now;
  db.updatedAt[id] = now;
  return HttpResponse.json({ reportId: id });
});

const getReportHandler = route('get', '/inspector/reports/:reportId', ({ request, params }) => {
  const path = pathOf(request);
  const bad = badId(params.reportId, 'reportId', path);
  if (bad) return bad;
  const report = requireOwnedReport(String(params.reportId), path);
  if (report instanceof Response) return report;
  return HttpResponse.json(report);
});

/** Ошибки `@Valid` для тела секции в формате «поле: сообщение», `items[0].status` — путь до пункта. */
function validateSection(body: Json): string[] {
  const errors: string[] = [];
  if (isBlank(body.summary)) errors.push('summary: must not be blank');
  if (!Array.isArray(body.items)) {
    errors.push('items: must not be null');
    return errors;
  }
  body.items.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    if (isBlank(entry.itemKey)) errors.push(`items[${index}].itemKey: must not be blank`);
    if (entry.status == null) errors.push(`items[${index}].status: must not be null`);
  });
  return errors;
}

const updateSectionHandler = route('put', '/inspector/reports/:reportId/sections/:sectionId', async ({ request, params }) => {
  const path = pathOf(request);
  const bad = badId(params.reportId, 'reportId', path) ?? badId(params.sectionId, 'sectionId', path);
  if (bad) return bad;

  const body = await readJson(request);
  if (!isRecord(body)) return springError(400, 'Required request body is missing or malformed', path);
  // неизвестное значение enum (`"GOOD"`) — ошибка Jackson, форма B, раньше валидации
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.some((entry) => isRecord(entry) && entry.status != null && !ITEM_STATUSES.includes(String(entry.status)))) {
    return springError(400, 'JSON parse error: Cannot deserialize value of type `ItemStatus`', path);
  }
  const errors = validateSection(body);
  if (errors.length > 0) return validationError(errors, path);

  const report = requireEditableReport(String(params.reportId), path);
  if (report instanceof Response) return report;
  const section = report.sections.find((candidate) => candidate.id === params.sectionId);
  if (!section) return appError(404, 'SECTION_NOT_FOUND', 'Section not found', path);

  // пустой список: цикл вставки не добавит ни одного `values(...)`, INSERT без строк падает (BE-14)
  if (items.length === 0) return internalError(path);

  section.summary = String(body.summary);
  section.items = items.filter(isRecord).map(
    (entry): SectionItemDto => ({
      itemKey: String(entry.itemKey),
      status: entry.status as SectionItemDto['status'],
      comment: entry.comment == null ? null : String(entry.comment),
    }),
  );
  report.stopFactors = stopFactorsOf(report.sections);
  touch(report.id);
  return noContent();
});

const updatePaintHandler = route('put', '/inspector/reports/:reportId/paint', async ({ request, params }) => {
  const path = pathOf(request);
  const bad = badId(params.reportId, 'reportId', path);
  if (bad) return bad;

  const body = await readJson(request);
  if (!isRecord(body)) return springError(400, 'Required request body is missing or malformed', path);
  if (!Array.isArray(body.measurements)) return validationError(['measurements: must not be null'], path);
  const errors: string[] = [];
  body.measurements.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    if (isBlank(entry.panelCode)) errors.push(`measurements[${index}].panelCode: must not be blank`);
    if (entry.thicknessUm == null) errors.push(`measurements[${index}].thicknessUm: must not be null`);
  });
  if (errors.length > 0) return validationError(errors, path);

  const report = requireEditableReport(String(params.reportId), path);
  if (report instanceof Response) return report;

  const measurements = body.measurements.filter(isRecord);
  // Контракт B-23 (решение пользователя): панель задаётся кодом. Код ошибки для неизвестной панели там не зафиксирован —
  // пока `PANEL_NOT_FOUND` из таблицы 2.10.
  if (measurements.some((entry) => !PANEL_CODES.includes(String(entry.panelCode)))) {
    return appError(404, 'PANEL_NOT_FOUND', 'Paint panel not found', path);
  }
  // как и у секции, пустой список — INSERT без строк (BE-14)
  if (measurements.length === 0) return internalError(path);

  // полная замена на весь отчёт
  report.paintMeasurements = measurements.map((entry) => ({
    id: nextId(),
    panelCode: String(entry.panelCode),
    spot: entry.spot == null ? null : String(entry.spot),
    thicknessUm: Number(entry.thicknessUm),
    note: entry.note == null ? null : String(entry.note),
  }));
  touch(report.id);
  return noContent();
});

const updateConclusionHandler = route('put', '/inspector/reports/:reportId/conclusion', async ({ request, params }) => {
  const path = pathOf(request);
  const bad = badId(params.reportId, 'reportId', path);
  if (bad) return bad;

  const body = await readJson(request);
  if (!isRecord(body)) return springError(400, 'Required request body is missing or malformed', path);
  const errors: string[] = [];
  if (isBlank(body.conclusionText)) errors.push('conclusionText: must not be blank');
  if (body.priceByn == null) errors.push('priceByn: must not be null');
  if (errors.length > 0) return validationError(errors, path);

  const report = requireEditableReport(String(params.reportId), path);
  if (report instanceof Response) return report;
  report.conclusionText = String(body.conclusionText);
  report.priceByn = Number(body.priceByn);
  touch(report.id);
  return noContent();
});

const submitHandler = route('post', '/inspector/reports/:reportId/submit', ({ request, params }) => {
  const path = pathOf(request);
  const bad = badId(params.reportId, 'reportId', path);
  if (bad) return bad;

  const report = requireEditableReport(String(params.reportId), path);
  if (report instanceof Response) return report;
  // без уточнения, что именно не заполнено (BE-13)
  if (!isComplete(report)) return appError(409, 'REPORT_INCOMPLETE', 'Report is not complete', path);

  report.status = 'pending_review';
  db.submittedAt[report.id] = new Date().toISOString();
  touch(report.id);
  return noContent();
});

// ---------- Медиа ----------
// В этих эндпоинтах нет `@AuthenticationPrincipal`: ни владелец, ни статус отчёта, ни префикс ключа не проверяются (BE-9).

const presignedUrlHandler = route('post', '/inspector/media/presigned-url/:reportId', async ({ request, params }) => {
  const path = pathOf(request);
  const bad = badId(params.reportId, 'reportId', path);
  if (bad) return bad;

  const body = await readJson(request);
  if (!isRecord(body)) return springError(400, 'Required request body is missing or malformed', path);
  const errors: string[] = [];
  if (isBlank(body.fileName)) errors.push('fileName: must not be blank');
  if (isBlank(body.contentType)) errors.push('contentType: must not be blank');
  if (errors.length > 0) return validationError(errors, path);
  // `image/heic`, `video/quicktime` и прочее не принимаются; код ошибки с опечаткой, как на бэкенде
  if (!ALLOWED_CONTENT_TYPES.includes(String(body.contentType))) {
    return appError(400, 'NOT_ALLOWDED_MEDIA_TYPE', 'Media type is not allowed', path);
  }

  // `fileName` подставляется в ключ как есть (без санитизации)
  const reportId = String(params.reportId);
  const s3Key = body.sectionId
    ? `reports/${reportId}/sections/${String(body.sectionId)}/${String(body.fileName)}`
    : `reports/${reportId}/${String(body.fileName)}`;
  db.presigned[s3Key] = String(body.contentType);

  const uploadUrl = `${new URL(request.url).origin}${MOCK_S3_PREFIX}${s3Key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600&X-Amz-SignedHeaders=content-type%3Bhost&X-Amz-Signature=mock`;
  return HttpResponse.json({ uploadUrl, s3Key });
});

const confirmUploadHandler = route('post', '/inspector/media/confirm-upload/:reportId', async ({ request, params }) => {
  const path = pathOf(request);
  const bad = badId(params.reportId, 'reportId', path);
  if (bad) return bad;

  const body = await readJson(request);
  if (!isRecord(body)) return springError(400, 'Required request body is missing or malformed', path);
  if (body.kind != null && !MEDIA_KINDS.includes(String(body.kind))) {
    return springError(400, 'JSON parse error: Cannot deserialize value of type `MediaKind`', path);
  }
  const errors: string[] = [];
  if (isBlank(body.s3key)) errors.push('s3key: must not be blank');
  if (body.kind == null) errors.push('kind: must not be null');
  if (errors.length > 0) return validationError(errors, path);

  // `HEAD` объекта в S3: загрузка (PUT) не дошла или ключ не тот
  const s3Key = String(body.s3key);
  if (!db.uploaded.has(s3Key)) return appError(404, 'MEDIA_NOT_FOUND', 'Media not found', path);

  // нарушение внешнего ключа при INSERT — 500 (несуществующий reportId или sectionId)
  const reportId = String(params.reportId);
  if (!db.reports[reportId]) return internalError(path);
  const sectionId = body.sectionId == null ? null : String(body.sectionId);
  let section: ReportSectionDto | undefined;
  if (sectionId !== null) {
    section = Object.values(db.reports)
      .flatMap((report) => report.sections)
      .find((candidate) => candidate.id === sectionId);
    if (!section) return internalError(path);
  }

  // Не идемпотентно: уникальности на `s3_key` нет, повторный confirm создаёт вторую запись. `mediaId` в ответе нет.
  const kind = String(body.kind) as 'PHOTO' | 'VIDEO';
  const media = { id: nextId(), kind, s3Key, status: kind === 'PHOTO' ? ('uploaded' as const) : ('pending' as const), orderNo: 0 };
  (section ? section.media : db.reports[reportId].globalMedia).push(media);
  touch(reportId);
  return noContent();
});

/** «S3»: принимает PUT по presigned URL. `Content-Type` должен совпасть с подписанным (иначе 403, как у настоящего S3). */
const s3PutHandler = http.put(`${MOCK_S3_PREFIX}*`, ({ request }) => {
  const s3Key = decodeURIComponent(new URL(request.url).pathname.slice(MOCK_S3_PREFIX.length));
  const signed = db.presigned[s3Key];
  const xml = { 'Content-Type': 'application/xml' };
  if (signed === undefined) return new HttpResponse('<Error><Code>AccessDenied</Code></Error>', { status: 403, headers: xml });
  if (request.headers.get('Content-Type') !== signed) {
    return new HttpResponse('<Error><Code>SignatureDoesNotMatch</Code></Error>', { status: 403, headers: xml });
  }
  db.uploaded.add(s3Key);
  return new HttpResponse(null, { status: 200, headers: { ETag: '"mock-etag"' } });
});

// ---------- Будущие эндпоинты (раздел 5 плана): на бэкенде их ещё нет ----------

/** BE-5 / B-25. */
const checklistHandler = route('get', '/inspector/catalog/checklist', () => HttpResponse.json(createChecklist()));

/** BE-7 / B-21. Сортировка по `updatedAt` по убыванию — предложение источника, не подтверждено. */
const myReportsHandler = route('get', '/inspector/reports', ({ request }) => {
  const url = new URL(request.url);
  const path = pathOf(request);
  if (!db.inspector) return appError(404, 'INSPECTOR_NOT_FOUND', 'Inspector not found', path);

  const filter = url.searchParams.get('status')?.split(',').filter(Boolean);
  // неизвестное значение — 400, а не молчаливый пустой список
  if (filter?.some((status) => !REPORT_STATUSES.includes(status as MyReportStatus))) {
    return appError(400, 'BAD_REQUEST', 'Unknown report status in filter', path);
  }

  const inspectorId = db.inspector.id;
  const list: MyReportListItem[] = Object.values(db.reports)
    .filter((report) => report.inspectorId === inspectorId)
    .flatMap((report): MyReportListItem[] => {
      const car = db.cars[report.carId];
      if (!car) return [];
      return [
        {
          id: report.id,
          status: db.deleted.has(report.id) ? 'deleted' : report.status,
          versionNo: report.versionNo,
          car,
          priceByn: report.priceByn,
          createdAt: db.createdAt[report.id] ?? '',
          updatedAt: db.updatedAt[report.id] ?? '',
          submittedAt: db.submittedAt[report.id] ?? null,
          lastModeration: db.lastModeration[report.id] ?? null,
          salesCount: 0,
        },
      ];
    })
    .filter((item) => !filter || filter.includes(item.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return HttpResponse.json(list);
});

/** BE-15 / B-28. `myReportId` — черновик этого подборщика по машине. */
const demandHandler = route('get', '/inspector/demand', ({ request }) => {
  const url = new URL(request.url);
  const path = pathOf(request);
  if (!db.inspector) return appError(404, 'INSPECTOR_NOT_FOUND', 'Inspector not found', path);

  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
  const inspectorId = db.inspector.id;
  const list = createDemand()
    .map((entry) => ({
      ...entry,
      myReportId: Object.values(db.reports).find((report) => report.carId === entry.car.id && report.inspectorId === inspectorId && report.status === 'draft')?.id ?? null,
    }))
    .sort((a, b) => b.waitingCount - a.waitingCount)
    .slice(0, limit);
  return HttpResponse.json(list);
});

export const handlers = [
  meHandler,
  meWithoutSlashHandler,
  registerHandler,
  createReportHandler,
  getReportHandler,
  updateSectionHandler,
  updatePaintHandler,
  updateConclusionHandler,
  submitHandler,
  presignedUrlHandler,
  confirmUploadHandler,
  s3PutHandler,
  checklistHandler,
  myReportsHandler,
  demandHandler,
];
