import { describe, expect, it } from 'vitest';
import { ApiError, apiFetch } from '@/api/client';
import { inspectorApi } from '@/api/inspector';
import type { ChecklistCatalog, DemandItem, MyReportListItem, ReportDto, SectionKey } from '@/api/types';
import { SECTION_KEYS } from '@/api/types';
import { DRAFT_REPORT_ID, FOREIGN_REPORT_ID, REVISION_REPORT_ID, uuid } from '@/mocks/fixtures/ids';
import { mockControl } from '@/mocks/state';

const AVBY_URL = 'https://cars.av.by/volkswagen/passat/112233445';

async function catchApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('Ожидалась ошибка ApiError, но запрос завершился успешно');
}

function sectionOf(report: ReportDto, key: SectionKey) {
  const section = report.sections.find((candidate) => candidate.sectionKey === key);
  if (!section) throw new Error(`Нет секции ${key}`);
  return section;
}

/** Загрузка файла «в S3» по presigned URL: PUT с тем же Content-Type, что в запросе. */
async function putToS3(uploadUrl: string, contentType: string) {
  return fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: new Blob(['x']) });
}

/** presigned → PUT → confirm, как будет делать очередь загрузок (MINI-10). */
async function uploadMedia(reportId: string, sectionId: string | null, fileName: string, contentType: 'image/jpeg' | 'video/mp4') {
  const { uploadUrl, s3Key } = await inspectorApi.presignedUrl(reportId, { sectionId, fileName, contentType });
  const res = await putToS3(uploadUrl, contentType);
  expect(res.status).toBe(200);
  await inspectorApi.confirmUpload(reportId, { sectionId, s3key: s3Key, kind: contentType === 'video/mp4' ? 'VIDEO' : 'PHOTO' });
  return s3Key;
}

describe('регистрация и профиль', () => {
  it('по умолчанию подборщик зарегистрирован и верифицирован', async () => {
    const me = await inspectorApi.me();
    expect(me.status).toBe('verified');
  });

  it('не зарегистрирован → 404 INSPECTOR_NOT_FOUND → register → pending', async () => {
    mockControl.setInspector(null);
    const notFound = await catchApiError(inspectorApi.me());
    expect(notFound.status).toBe(404);
    expect(notFound.errorCode).toBe('INSPECTOR_NOT_FOUND');

    const registered = await inspectorApi.register({ fullName: 'Иван Петров', phone: '+375291112233', email: 'ivan@example.by' });
    expect(registered.status).toBe('pending');
    expect(registered.fullName).toBe('Иван Петров');
    expect((await inspectorApi.me()).status).toBe('pending');
  });

  it('повторная регистрация → 409 INSPECTOR_ALREADY_REGISTERED', async () => {
    const err = await catchApiError(inspectorApi.register({ fullName: 'Иван', phone: '+375291112233', email: 'ivan@example.by' }));
    expect(err.status).toBe(409);
    expect(err.errorCode).toBe('INSPECTOR_ALREADY_REGISTERED');
  });
});

describe('создание отчёта', () => {
  it('создаёт черновик с 7 пустыми секциями в порядке SectionKey', async () => {
    const { reportId } = await inspectorApi.createReport(AVBY_URL);
    const report = await inspectorApi.getReport(reportId);

    expect(report.status).toBe('draft');
    expect(report.versionNo).toBe(1);
    expect(report.sections.map((section) => section.sectionKey)).toEqual([...SECTION_KEYS]);
    expect(report.sections.every((section) => section.summary === '' && section.items.length === 0)).toBe(true);
    expect(report.priceByn).toBeNull();
    expect(report.stopFactors).toEqual([]);
  });

  it('тот же URL ещё раз → новый черновик (дедупликации нет, BE-19)', async () => {
    const first = await inspectorApi.createReport(AVBY_URL);
    const second = await inspectorApi.createReport(AVBY_URL);
    expect(second.reportId).not.toBe(first.reportId);
  });

  it('не URL → 500 INTERNAL_SERVER_ERROR, пустая ссылка → 400 с ошибкой поля', async () => {
    const notUrl = await catchApiError(inspectorApi.createReport('abc'));
    expect(notUrl.status).toBe(500);
    const blank = await catchApiError(inspectorApi.createReport(' '));
    expect(blank.status).toBe(400);
    expect(blank.fieldErrors).toEqual({ avbyUrl: 'must not be blank' });
  });

  it('забаненный не может создавать, а pending — может (BE-3)', async () => {
    mockControl.setInspector('pending');
    await expect(inspectorApi.createReport(AVBY_URL)).resolves.toHaveProperty('reportId');

    mockControl.setInspector('banned');
    const err = await catchApiError(inspectorApi.createReport(AVBY_URL));
    expect(err.status).toBe(403);
    expect(err.errorCode).toBe('INSPECTOR_BANNED');
  });

  it('форсированные ошибки парсера av.by', async () => {
    mockControl.failOnce('POST /inspector/reports', { kind: 'app', status: 404, errorCode: 'CAR_LISTING_NOT_FOUND' });
    expect((await catchApiError(inspectorApi.createReport(AVBY_URL))).errorCode).toBe('CAR_LISTING_NOT_FOUND');
    mockControl.failOnce('POST /inspector/reports', { kind: 'app', status: 502, errorCode: 'PARSER_ERROR' });
    expect((await catchApiError(inspectorApi.createReport(AVBY_URL))).status).toBe(502);
  });
});

describe('чтение отчёта', () => {
  it('чужой — 403, несуществующий — 404, мягко удалённый админом — 404', async () => {
    expect((await catchApiError(inspectorApi.getReport(FOREIGN_REPORT_ID))).errorCode).toBe('REPORT_ACCESS_DENIED');
    expect((await catchApiError(inspectorApi.getReport(uuid(999)))).errorCode).toBe('REPORT_NOT_FOUND');
    mockControl.deleteReport(DRAFT_REPORT_ID);
    expect((await catchApiError(inspectorApi.getReport(DRAFT_REPORT_ID))).errorCode).toBe('REPORT_NOT_FOUND');
  });

  it('отчёт на доработке содержит заполненные данные и стоп-факторы, но не причину (её в API нет, BE-8)', async () => {
    const report = await inspectorApi.getReport(REVISION_REPORT_ID);
    expect(report.status).toBe('revision_required');
    expect(report.stopFactors).toEqual(['rust']);
    expect(report.paintMeasurements).toHaveLength(2);
    expect(report).not.toHaveProperty('lastModeration');
  });
});

describe('секции, ЛКП, заключение', () => {
  it('секция заменяется целиком: пункты, которых нет в запросе, удаляются; стоп-факторы пересчитываются', async () => {
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    const exterior = sectionOf(report, 'EXTERIOR');

    await inspectorApi.updateSection(DRAFT_REPORT_ID, exterior.id, {
      summary: 'Кузов в порядке',
      items: [
        { itemKey: 'geometry', status: 'OK' },
        { itemKey: 'rust', status: 'BAD', comment: 'Порог' },
      ],
    });
    let saved = sectionOf(await inspectorApi.getReport(DRAFT_REPORT_ID), 'EXTERIOR');
    expect(saved.items).toEqual([
      { itemKey: 'geometry', status: 'OK', comment: null },
      { itemKey: 'rust', status: 'BAD', comment: 'Порог' },
    ]);
    expect((await inspectorApi.getReport(DRAFT_REPORT_ID)).stopFactors).toEqual(['rust']);

    await inspectorApi.updateSection(DRAFT_REPORT_ID, exterior.id, { summary: 'Кузов в порядке', items: [{ itemKey: 'geometry', status: 'OK' }] });
    saved = sectionOf(await inspectorApi.getReport(DRAFT_REPORT_ID), 'EXTERIOR');
    expect(saved.items.map((item) => item.itemKey)).toEqual(['geometry']);
    expect((await inspectorApi.getReport(DRAFT_REPORT_ID)).stopFactors).toEqual([]);
  });

  it('пустой список пунктов → 500 (клиент его никогда не шлёт, BE-14)', async () => {
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    const err = await catchApiError(inspectorApi.updateSection(DRAFT_REPORT_ID, sectionOf(report, 'ENGINE').id, { summary: 'ок', items: [] }));
    expect(err.status).toBe(500);
  });

  it('секция из другого отчёта → 404 SECTION_NOT_FOUND', async () => {
    const foreignSection = uuid(2200);
    const err = await catchApiError(inspectorApi.updateSection(DRAFT_REPORT_ID, foreignSection, { summary: 'ок', items: [{ itemKey: 'oil', status: 'OK' }] }));
    expect(err.status).toBe(404);
    expect(err.errorCode).toBe('SECTION_NOT_FOUND');
  });

  it('чужой отчёт нельзя править: 403', async () => {
    const err = await catchApiError(inspectorApi.updateConclusion(FOREIGN_REPORT_ID, { conclusionText: 'ок', priceByn: 100 }));
    expect(err.errorCode).toBe('REPORT_ACCESS_DENIED');
  });

  it('ЛКП: замеры по коду панели заменяются целиком, неизвестный код — 404 PANEL_NOT_FOUND, пустой список — 500', async () => {
    await inspectorApi.updatePaint(DRAFT_REPORT_ID, {
      measurements: [
        { panelCode: 'HOOD', spot: 'центр', thicknessUm: 110 },
        { panelCode: 'HOOD', spot: 'край', thicknessUm: 120, note: 'ровно' },
      ],
    });
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    expect(report.paintMeasurements.map((m) => [m.panelCode, m.spot, m.thicknessUm, m.note])).toEqual([
      ['HOOD', 'центр', 110, null],
      ['HOOD', 'край', 120, 'ровно'],
    ]);

    await inspectorApi.updatePaint(DRAFT_REPORT_ID, { measurements: [{ panelCode: 'ROOF', thicknessUm: 90 }] });
    expect((await inspectorApi.getReport(DRAFT_REPORT_ID)).paintMeasurements.map((m) => m.panelCode)).toEqual(['ROOF']);

    const unknown = await catchApiError(inspectorApi.updatePaint(DRAFT_REPORT_ID, { measurements: [{ panelCode: 'WHEEL', thicknessUm: 1 }] }));
    expect(unknown.errorCode).toBe('PANEL_NOT_FOUND');
    const empty = await catchApiError(inspectorApi.updatePaint(DRAFT_REPORT_ID, { measurements: [] }));
    expect(empty.status).toBe(500);
  });

  it('заключение и цена в копейках сохраняются, оба поля обязательны', async () => {
    await inspectorApi.updateConclusion(DRAFT_REPORT_ID, { conclusionText: 'Рекомендую', priceByn: 5000 });
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    expect(report.conclusionText).toBe('Рекомендую');
    expect(report.priceByn).toBe(5000);

    const err = await catchApiError(inspectorApi.updateConclusion(DRAFT_REPORT_ID, { conclusionText: '', priceByn: null as never }));
    expect(err.fieldErrors).toEqual({ conclusionText: 'must not be blank', priceByn: 'must not be null' });
  });
});

describe('медиа', () => {
  it('presigned: ключ секции и глобальный ключ, ответ содержит s3Key', async () => {
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    const sectionId = sectionOf(report, 'EXTERIOR').id;

    const inSection = await inspectorApi.presignedUrl(DRAFT_REPORT_ID, { sectionId, fileName: 'a.jpg', contentType: 'image/jpeg' });
    expect(inSection.s3Key).toBe(`reports/${DRAFT_REPORT_ID}/sections/${sectionId}/a.jpg`);
    expect(inSection.uploadUrl).toContain(inSection.s3Key);

    const global = await inspectorApi.presignedUrl(DRAFT_REPORT_ID, { fileName: 'b.mp4', contentType: 'video/mp4' });
    expect(global.s3Key).toBe(`reports/${DRAFT_REPORT_ID}/b.mp4`);
  });

  it('HEIC и MOV не принимаются: 400 NOT_ALLOWDED_MEDIA_TYPE', async () => {
    for (const contentType of ['image/heic', 'video/quicktime', 'image/webp']) {
      const err = await catchApiError(inspectorApi.presignedUrl(DRAFT_REPORT_ID, { fileName: 'x', contentType: contentType as never }));
      expect(err.status).toBe(400);
      expect(err.errorCode).toBe('NOT_ALLOWDED_MEDIA_TYPE');
    }
  });

  it('confirm без PUT в «S3» → 404 MEDIA_NOT_FOUND', async () => {
    const { s3Key } = await inspectorApi.presignedUrl(DRAFT_REPORT_ID, { fileName: 'lost.jpg', contentType: 'image/jpeg' });
    const err = await catchApiError(inspectorApi.confirmUpload(DRAFT_REPORT_ID, { sectionId: null, s3key: s3Key, kind: 'PHOTO' }));
    expect(err.status).toBe(404);
    expect(err.errorCode).toBe('MEDIA_NOT_FOUND');
  });

  it('PUT с другим Content-Type, чем в presigned-запросе, → 403 (SignatureDoesNotMatch)', async () => {
    const { uploadUrl } = await inspectorApi.presignedUrl(DRAFT_REPORT_ID, { fileName: 'x.jpg', contentType: 'image/jpeg' });
    expect((await putToS3(uploadUrl, 'image/png')).status).toBe(403);
    expect((await putToS3(uploadUrl, 'image/jpeg')).status).toBe(200);
  });

  it('фото попадает в секцию (uploaded), видео без секции — в globalMedia (pending)', async () => {
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    const sectionId = sectionOf(report, 'INTERIOR').id;

    const photoKey = await uploadMedia(DRAFT_REPORT_ID, sectionId, 'p.jpg', 'image/jpeg');
    const videoKey = await uploadMedia(DRAFT_REPORT_ID, null, 'v.mp4', 'video/mp4');

    const after = await inspectorApi.getReport(DRAFT_REPORT_ID);
    expect(sectionOf(after, 'INTERIOR').media).toMatchObject([{ kind: 'PHOTO', s3Key: photoKey, status: 'uploaded' }]);
    expect(after.globalMedia).toMatchObject([{ kind: 'VIDEO', s3Key: videoKey, status: 'pending' }]);
  });

  it('confirm не идемпотентен: повтор создаёт вторую запись', async () => {
    const { uploadUrl, s3Key } = await inspectorApi.presignedUrl(DRAFT_REPORT_ID, { fileName: 'twice.jpg', contentType: 'image/jpeg' });
    await putToS3(uploadUrl, 'image/jpeg');
    await inspectorApi.confirmUpload(DRAFT_REPORT_ID, { sectionId: null, s3key: s3Key, kind: 'PHOTO' });
    await inspectorApi.confirmUpload(DRAFT_REPORT_ID, { sectionId: null, s3key: s3Key, kind: 'PHOTO' });

    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    expect(report.globalMedia.filter((media) => media.s3Key === s3Key)).toHaveLength(2);
  });

  it('медиа-эндпоинты не проверяют владельца и статус отчёта (BE-9)', async () => {
    const { s3Key } = await inspectorApi.presignedUrl(FOREIGN_REPORT_ID, { fileName: 'x.jpg', contentType: 'image/jpeg' });
    expect(s3Key).toContain(FOREIGN_REPORT_ID);
  });

  it('confirm в несуществующий отчёт → 500 (нарушение внешнего ключа)', async () => {
    const { uploadUrl, s3Key } = await inspectorApi.presignedUrl(uuid(999), { fileName: 'x.jpg', contentType: 'image/jpeg' });
    await putToS3(uploadUrl, 'image/jpeg');
    const err = await catchApiError(inspectorApi.confirmUpload(uuid(999), { sectionId: null, s3key: s3Key, kind: 'PHOTO' }));
    expect(err.status).toBe(500);
  });
});

describe('отправка на модерацию', () => {
  it('незаполненный отчёт → 409 REPORT_INCOMPLETE без деталей', async () => {
    const err = await catchApiError(inspectorApi.submit(DRAFT_REPORT_ID));
    expect(err.status).toBe(409);
    expect(err.errorCode).toBe('REPORT_INCOMPLETE');
  });

  it('видео с секцией не засчитывается как видео обхода', async () => {
    await fillEverythingExceptVideo(DRAFT_REPORT_ID);
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    await uploadMedia(DRAFT_REPORT_ID, sectionOf(report, 'EXTERIOR').id, 'v.mp4', 'video/mp4');
    expect((await catchApiError(inspectorApi.submit(DRAFT_REPORT_ID))).errorCode).toBe('REPORT_INCOMPLETE');
  });

  it('полный путь: секции, заключение, глобальное видео → submit → отчёт только для чтения', async () => {
    await fillEverythingExceptVideo(DRAFT_REPORT_ID);
    await uploadMedia(DRAFT_REPORT_ID, null, 'walkaround.mp4', 'video/mp4');

    await expect(inspectorApi.submit(DRAFT_REPORT_ID)).resolves.toBeUndefined();
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    expect(report.status).toBe('pending_review');

    const edit = await catchApiError(inspectorApi.updateConclusion(DRAFT_REPORT_ID, { conclusionText: 'новое', priceByn: 1 }));
    expect(edit.errorCode).toBe('REPORT_NOT_EDITABLE');
    const again = await catchApiError(inspectorApi.submit(DRAFT_REPORT_ID));
    expect(again.errorCode).toBe('REPORT_NOT_EDITABLE');
  });

  it('форсированная ошибка одноразовая: следующий запрос проходит', async () => {
    mockControl.failOnce('PUT /inspector/reports/:reportId/conclusion', { kind: 'app', status: 409, errorCode: 'REPORT_NOT_EDITABLE' });
    const err = await catchApiError(inspectorApi.updateConclusion(REVISION_REPORT_ID, { conclusionText: 'ок', priceByn: 100 }));
    expect(err.errorCode).toBe('REPORT_NOT_EDITABLE');
    await expect(inspectorApi.updateConclusion(REVISION_REPORT_ID, { conclusionText: 'ок', priceByn: 100 })).resolves.toBeUndefined();
  });
});

async function fillEverythingExceptVideo(reportId: string) {
  const report = await inspectorApi.getReport(reportId);
  for (const section of report.sections) {
    await inspectorApi.updateSection(reportId, section.id, { summary: 'Итог секции', items: [{ itemKey: 'item', status: 'OK' }] });
  }
  await inspectorApi.updateConclusion(reportId, { conclusionText: 'Рекомендую', priceByn: 5000 });
}

describe('будущие эндпоинты (раздел 5 плана)', () => {
  it('BE-5: справочник чеклиста — 7 секций, 42 пункта', async () => {
    const catalog = await apiFetch<ChecklistCatalog>('/inspector/catalog/checklist');
    expect(catalog.sections.map((section) => section.sectionKey)).toEqual([...SECTION_KEYS]);
    expect(catalog.sections.flatMap((section) => section.items)).toHaveLength(42);
  });

  it('BE-7: «мои отчёты» — только свои, свежие первыми, с причиной модерации; фильтр по статусу', async () => {
    const all = await apiFetch<MyReportListItem[]>('/inspector/reports');
    expect(all.map((item) => item.id)).toEqual([DRAFT_REPORT_ID, REVISION_REPORT_ID]);
    expect(all.find((item) => item.id === REVISION_REPORT_ID)?.lastModeration?.reason).toBe('Нет фото VIN-таблички');

    const drafts = await apiFetch<MyReportListItem[]>('/inspector/reports?status=draft');
    expect(drafts.map((item) => item.id)).toEqual([DRAFT_REPORT_ID]);

    mockControl.deleteReport(DRAFT_REPORT_ID);
    const deleted = await apiFetch<MyReportListItem[]>('/inspector/reports?status=deleted');
    expect(deleted.map((item) => item.id)).toEqual([DRAFT_REPORT_ID]);
  });

  it('BE-7: неизвестный статус в фильтре → 400, а не пустой список', async () => {
    const err = await catchApiError(apiFetch('/inspector/reports?status=nonsense'));
    expect(err.status).toBe(400);
    expect(err.errorCode).toBe('BAD_REQUEST');
  });

  it('BE-15: спрос по убыванию, myReportId — свой черновик по машине', async () => {
    const demand = await apiFetch<DemandItem[]>('/inspector/demand');
    expect(demand.map((entry) => entry.waitingCount)).toEqual([7, 3, 1]);
    // свой черновик есть у Passat
    expect(demand.find((entry) => entry.car.model === 'Passat')?.myReportId).toBe(DRAFT_REPORT_ID);
    expect(demand.find((entry) => entry.car.model === 'Golf')?.myReportId).toBeNull();
  });
});
