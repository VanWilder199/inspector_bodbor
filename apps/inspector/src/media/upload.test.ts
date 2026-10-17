import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import { inspectorApi } from '@/api/inspector';
import type { MediaContentType, ReportDto } from '@/api/types';
import { DRAFT_REPORT_ID, uuid } from '@/mocks/fixtures/ids';
import { MOCK_S3_PREFIX } from '@/mocks/handlers';
import { db, mockControl } from '@/mocks/state';
import { server } from '@/test/server';
import { createFileName, getUploadErrorMessage, kindOf, MediaUploadError, putToS3, S3UploadError, uploadMedia } from './upload';

const CONFIRM_KEY = 'POST /inspector/media/confirm-upload/:reportId';
const CONFIRM_URL = '/api/inspector/media/confirm-upload/:reportId';
const PUT_URL = `${MOCK_S3_PREFIX}*`;

const photo = () => new Blob(['photo-bytes'], { type: 'image/jpeg' });

/** Журнал запросов конвейера в порядке отправки: presign, put, confirm, get-report. */
function trackRequests(): string[] {
  const log: string[] = [];
  server.events.on('request:start', ({ request }) => {
    const { pathname } = new URL(request.url);
    if (pathname.includes('/media/presigned-url/')) log.push('presign');
    else if (pathname.includes('/media/confirm-upload/')) log.push('confirm');
    else if (pathname.startsWith(MOCK_S3_PREFIX)) log.push('put');
    else if (request.method === 'GET' && pathname === `/api/inspector/reports/${DRAFT_REPORT_ID}`) log.push('get-report');
  });
  return log;
}

const count = (log: string[], name: string) => log.filter((entry) => entry === name).length;

async function failure(promise: Promise<unknown>): Promise<MediaUploadError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(MediaUploadError);
    return e as MediaUploadError;
  }
  throw new Error('Ожидалась ошибка MediaUploadError, но загрузка завершилась успешно');
}

/** Все записи отчёта с этим `s3Key`: и общие, и из секций. */
function mediaWithKey(report: ReportDto, s3Key: string) {
  return [...report.globalMedia, ...report.sections.flatMap((section) => section.media)].filter((media) => media.s3Key === s3Key);
}

async function exteriorSectionId(): Promise<string> {
  const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
  const section = report.sections.find((candidate) => candidate.sectionKey === 'EXTERIOR');
  if (!section) throw new Error('В фикстуре нет секции EXTERIOR');
  return section.id;
}

describe('имя файла и тип', () => {
  it('имя — uuid с расширением по типу', () => {
    expect(createFileName('image/jpeg')).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(createFileName('image/png')).toMatch(/\.png$/);
    expect(createFileName('video/mp4')).toMatch(/\.mp4$/);
    expect(createFileName('image/jpeg')).not.toBe(createFileName('image/jpeg'));
  });

  it('видео получает kind VIDEO, остальное — PHOTO', () => {
    expect(kindOf('video/mp4')).toBe('VIDEO');
    expect(kindOf('image/jpeg')).toBe('PHOTO');
    expect(kindOf('image/png')).toBe('PHOTO');
  });
});

describe('три шага: presigned → PUT → confirm', () => {
  it('фото с sectionId попадает в sections[].media', async () => {
    const sectionId = await exteriorSectionId();

    const result = await uploadMedia({ reportId: DRAFT_REPORT_ID, sectionId, blob: photo(), contentType: 'image/jpeg' });

    expect(result).toMatchObject({ kind: 'PHOTO', sectionId, confirmedVia: 'confirm' });
    expect(result.s3Key).toBe(`reports/${DRAFT_REPORT_ID}/sections/${sectionId}/${result.fileName}`);
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    const exterior = report.sections.find((section) => section.id === sectionId);
    expect(exterior?.media).toMatchObject([{ kind: 'PHOTO', s3Key: result.s3Key, status: 'uploaded' }]);
    expect(report.globalMedia).toHaveLength(0);
  });

  it('без sectionId файл попадает в globalMedia, а видео получает kind VIDEO', async () => {
    const video = new Blob(['video-bytes'], { type: 'video/mp4' });

    const result = await uploadMedia({ reportId: DRAFT_REPORT_ID, blob: video, contentType: 'video/mp4' });

    expect(result).toMatchObject({ kind: 'VIDEO', sectionId: null });
    expect(result.s3Key).toBe(`reports/${DRAFT_REPORT_ID}/${result.fileName}`);
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    expect(report.globalMedia).toMatchObject([{ kind: 'VIDEO', s3Key: result.s3Key, status: 'pending' }]);
  });

  it('PUT уходит с тем же Content-Type, что в presigned-запросе, и без x-amz-заголовков', async () => {
    const headers: Headers[] = [];
    server.use(
      http.put(PUT_URL, ({ request }) => {
        headers.push(request.headers);
        db.uploaded.add(decodeURIComponent(new URL(request.url).pathname.slice(MOCK_S3_PREFIX.length)));
        return new HttpResponse(null, { status: 200 });
      }),
    );
    // У файлов с Android type бывает пустым: тип берётся из contentType, а не из Blob
    const withoutType = new Blob(['photo-bytes'], { type: '' });

    await uploadMedia({ reportId: DRAFT_REPORT_ID, blob: withoutType, contentType: 'image/jpeg' });

    expect(headers).toHaveLength(1);
    expect(headers[0]?.get('Content-Type')).toBe('image/jpeg');
    expect([...(headers[0]?.keys() ?? [])].filter((name) => name.startsWith('x-amz-'))).toEqual([]);
  });

  it('прогресс идёт от 0 до 1 и не убывает', async () => {
    const fractions: number[] = [];

    await uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg', onProgress: (fraction) => fractions.push(fraction) });

    expect(fractions[0]).toBe(0);
    expect(fractions.at(-1)).toBe(1);
    expect(fractions.every((fraction) => fraction >= 0 && fraction <= 1)).toBe(true);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
  });

  it('шаги сообщаются по порядку', async () => {
    const stages: string[] = [];

    await uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg', onStage: (stage) => stages.push(stage) });

    expect(stages).toEqual(['presign', 'put', 'confirm']);
  });
});

describe('просроченная ссылка (403 от S3)', () => {
  it('один раз берёт новый presigned URL и повторяет PUT', async () => {
    const log = trackRequests();
    server.use(http.put(PUT_URL, () => new HttpResponse('<Error><Code>RequestTimeTooSkewed</Code></Error>', { status: 403 }), { once: true }));

    const result = await uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg' });

    expect(result.confirmedVia).toBe('confirm');
    expect(count(log, 'presign')).toBe(2);
    expect(count(log, 'put')).toBe(2);
    expect(count(log, 'confirm')).toBe(1);
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    expect(mediaWithKey(report, result.s3Key)).toHaveLength(1);
  });

  it('второй 403 подряд — ошибка на шаге put, без повтора', async () => {
    const log = trackRequests();
    server.use(http.put(PUT_URL, () => new HttpResponse('<Error><Code>SignatureDoesNotMatch</Code></Error>', { status: 403 })));

    const error = await failure(uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg' }));

    expect(error.stage).toBe('put');
    expect(error.retryable).toBe(false);
    expect(error.cause).toBeInstanceOf(S3UploadError);
    expect(error.cause).toMatchObject({ kind: 'forbidden', status: 403, s3Code: 'SignatureDoesNotMatch' });
    expect(count(log, 'presign')).toBe(2);
    expect(count(log, 'confirm')).toBe(0);
  });
});

describe('сбои PUT и продолжение', () => {
  it('5xx — ошибка с retryable; повтор по resume не просит presigned URL заново', async () => {
    const log = trackRequests();
    server.use(http.put(PUT_URL, () => new HttpResponse(null, { status: 503 }), { once: true }));

    const error = await failure(uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg' }));
    expect(error.stage).toBe('put');
    expect(error.retryable).toBe(true);
    expect(error.cause).toMatchObject({ kind: 'server', status: 503 });
    expect(error.state.putDone).toBeFalsy();

    const result = await uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg', resume: error.state });

    expect(result.fileName).toBe(error.state.fileName);
    expect(count(log, 'presign')).toBe(1);
    expect(count(log, 'put')).toBe(2);
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    expect(mediaWithKey(report, result.s3Key)).toHaveLength(1);
  });

  it('обрыв сети на PUT — сетевая ошибка, её можно повторить', async () => {
    server.use(http.put(PUT_URL, () => HttpResponse.error(), { once: true }));

    const error = await failure(uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg' }));

    expect(error.stage).toBe('put');
    expect(error.retryable).toBe(true);
    expect(error.cause).toMatchObject({ kind: 'network' });
  });

  it('отмена до старта не отправляет запросов', () => {
    const controller = new AbortController();
    controller.abort();

    return expect(putToS3('http://localhost:5175/__mock-s3/x.jpg', photo(), 'image/jpeg', { signal: controller.signal })).rejects.toMatchObject({
      kind: 'aborted',
    });
  });
});

describe('confirm не идемпотентен', () => {
  it('потерян ответ, но запись создана: отчёт показывает файл, повторного confirm нет', async () => {
    const log = trackRequests();
    server.use(
      http.post(
        CONFIRM_URL,
        async ({ request, params }) => {
          const body = (await request.json()) as { s3key: string; kind: 'PHOTO' | 'VIDEO' };
          db.reports[String(params.reportId)]?.globalMedia.push({ id: uuid(9001), kind: body.kind, s3Key: body.s3key, status: 'uploaded', orderNo: 0 });
          return HttpResponse.error();
        },
        { once: true },
      ),
    );

    const result = await uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg' });

    expect(result.confirmedVia).toBe('report-check');
    expect(count(log, 'confirm')).toBe(1);
    expect(count(log, 'get-report')).toBe(1);
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    expect(mediaWithKey(report, result.s3Key)).toHaveLength(1);
  });

  it('сеть оборвалась до записи: отчёт файла не показывает, confirm повторяется один раз', async () => {
    const log = trackRequests();
    mockControl.failOnce(CONFIRM_KEY, { kind: 'network' });

    const result = await uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg' });

    expect(result.confirmedVia).toBe('confirm');
    expect(log.filter((entry) => entry === 'confirm' || entry === 'get-report')).toEqual(['confirm', 'get-report', 'confirm']);
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    expect(mediaWithKey(report, result.s3Key)).toHaveLength(1);
  });

  it('confirm не проходит: после ошибки resume сначала читает отчёт и не грузит файл заново', async () => {
    const log = trackRequests();
    mockControl.fail(CONFIRM_KEY, { kind: 'network' });

    const error = await failure(uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg' }));
    expect(error.stage).toBe('confirm');
    expect(error.retryable).toBe(true);
    expect(error.state).toMatchObject({ putDone: true, confirmUnsure: true });
    expect(count(log, 'confirm')).toBe(2);

    mockControl.clear(CONFIRM_KEY);
    const result = await uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg', resume: error.state });

    expect(result.confirmedVia).toBe('confirm');
    expect(count(log, 'put')).toBe(1);
    expect(count(log, 'presign')).toBe(1);
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    expect(mediaWithKey(report, result.s3Key)).toHaveLength(1);
  });

  it('ответ 4xx на confirm — ошибка без повтора и без чтения отчёта', async () => {
    const log = trackRequests();
    mockControl.fail(CONFIRM_KEY, { kind: 'validation', errors: ['s3key: must not be blank'] });

    const error = await failure(uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg' }));

    expect(error.stage).toBe('confirm');
    expect(error.retryable).toBe(false);
    expect(count(log, 'confirm')).toBe(1);
    expect(count(log, 'get-report')).toBe(0);
  });
});

describe('404 MEDIA_NOT_FOUND на confirm', () => {
  it('объект не дошёл до S3: файл кладётся заново и confirm повторяется', async () => {
    const log = trackRequests();
    mockControl.failOnce(CONFIRM_KEY, { kind: 'app', status: 404, errorCode: 'MEDIA_NOT_FOUND' });

    const result = await uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg' });

    expect(result.confirmedVia).toBe('confirm');
    expect(count(log, 'put')).toBe(2);
    expect(count(log, 'confirm')).toBe(2);
    expect(count(log, 'presign')).toBe(1);
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    expect(mediaWithKey(report, result.s3Key)).toHaveLength(1);
  });

  it('если и после повторного PUT объекта нет — ошибка confirm', async () => {
    const log = trackRequests();
    mockControl.fail(CONFIRM_KEY, { kind: 'app', status: 404, errorCode: 'MEDIA_NOT_FOUND' });

    const error = await failure(uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/jpeg' }));

    expect(error.stage).toBe('confirm');
    expect(error.retryable).toBe(false);
    expect(error.cause).toMatchObject({ status: 404, errorCode: 'MEDIA_NOT_FOUND' });
    expect(count(log, 'put')).toBe(2);
    expect(count(log, 'confirm')).toBe(2);
  });
});

describe('presigned отклонил тип файла', () => {
  it('NOT_ALLOWDED_MEDIA_TYPE (с опечаткой, как на бэкенде) даёт понятную ошибку и ни одного PUT', async () => {
    const log = trackRequests();

    const error = await failure(uploadMedia({ reportId: DRAFT_REPORT_ID, blob: photo(), contentType: 'image/heic' as MediaContentType }));

    expect(error.stage).toBe('presign');
    expect(error.retryable).toBe(false);
    expect(error.cause).toBeInstanceOf(ApiError);
    expect(error.cause).toMatchObject({ status: 400, errorCode: 'NOT_ALLOWDED_MEDIA_TYPE' });
    expect(getUploadErrorMessage(error)).toBe('Такой формат файла не поддерживается');
    expect(count(log, 'put')).toBe(0);
  });

  it('тексты для ошибок хранилища и сети', () => {
    const state = { fileName: 'x.jpg' };
    expect(getUploadErrorMessage(new MediaUploadError('put', new S3UploadError('server', 503), state))).toBe('Ошибка хранилища, повторим автоматически');
    expect(getUploadErrorMessage(new MediaUploadError('put', new S3UploadError('network', 0), state))).toBe('Нет связи с хранилищем. Проверьте интернет');
    expect(getUploadErrorMessage(new MediaUploadError('confirm', new ApiError(0, undefined, 'Network error', undefined, undefined, 'network'), state))).toBe(
      'Нет связи с сервером. Проверьте интернет',
    );
  });
});
