import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDraft,
  createDraftFromReport,
  draftKey,
  hasDirtyDraft,
  mergeDraft,
  parseDraft,
  pruneStaleDrafts,
  readDraft,
  writeDraft,
} from './draft';
import { DRAFT_REPORT_ID, REVISION_REPORT_ID, uuid } from '@/mocks/fixtures/ids';
import { createReports } from '@/mocks/fixtures/reports';

const reports = createReports();
const draftReport = reports.reports[DRAFT_REPORT_ID]!;
const revisionReport = reports.reports[REVISION_REPORT_ID]!;

beforeEach(() => {
  window.localStorage.clear();
});

describe('createDraftFromReport', () => {
  it('переносит секции по ключам, справочник пунктов и заключение', () => {
    const draft = createDraftFromReport(revisionReport);
    expect(draft.schema).toBe(1);
    expect(draft.reportId).toBe(REVISION_REPORT_ID);
    expect(Object.keys(draft.sections)).toHaveLength(7);
    expect(draft.sections.EXTERIOR.summary).toBe('Кузов в хорошем состоянии, ржавчина на пороге');
    expect(draft.sections.EXTERIOR.items.rust).toEqual({ status: 'BAD', comment: 'Левый порог, сквозная' });
    expect(draft.sections.EXTERIOR.items.geometry).toEqual({ status: 'OK' });
    expect(draft.conclusion).toEqual({ conclusionText: 'Рекомендую к покупке после торга', priceByn: 5000, dirty: false });
    expect(draft.paint.measurements).toHaveLength(2);
    // Чистый черновик из сервера: правок нет
    expect(hasDirtyDraft(draft)).toBe(false);
  });

  it('пустой черновик: секции без пунктов и итогов, заключение пустое', () => {
    const draft = createDraftFromReport(draftReport);
    expect(draft.paint.measurements).toEqual([]);
    expect(draft.conclusion).toEqual({ conclusionText: '', dirty: false });
    expect(draft.sections.ENGINE.items).toEqual({});
  });
});

describe('mergeDraft', () => {
  it('чистую часть берёт с сервера, грязную оставляет локальной', () => {
    const server = createDraftFromReport(revisionReport);
    const local = createDraftFromReport(revisionReport);
    local.sections.EXTERIOR.summary = 'Локальный итог';
    local.sections.EXTERIOR.dirty = true;
    local.sections.ENGINE.summary = 'Не должно попасть';
    local.sections.ENGINE.dirty = false;

    const merged = mergeDraft(server, local);
    expect(merged.sections.EXTERIOR.summary).toBe('Локальный итог');
    expect(merged.sections.EXTERIOR.dirty).toBe(true);
    // Чистая секция остаётся серверной, даже если локально поле меняли
    expect(merged.sections.ENGINE.summary).toBe('');
  });

  it('sectionId всегда серверный, даже у грязной секции: клиент его не придумывает', () => {
    const server = createDraftFromReport(revisionReport);
    const local = createDraftFromReport(revisionReport);
    local.sections.EXTERIOR.dirty = true;
    local.sections.EXTERIOR.sectionId = uuid(9999);

    const merged = mergeDraft(server, local);
    expect(merged.sections.EXTERIOR.sectionId).toBe(server.sections.EXTERIOR.sectionId);
  });

  it('ЛКП и заключение сливаются по своим флагам независимо от секций', () => {
    const server = createDraftFromReport(revisionReport);
    const local = createDraftFromReport(revisionReport);
    local.paint = { measurements: [{ panelCode: 'HOOD', thicknessUm: 200 }], dirty: true };
    local.conclusion = { conclusionText: 'Сервер', priceByn: 1000, dirty: false };

    const merged = mergeDraft(server, local);
    expect(merged.paint.measurements).toEqual([{ panelCode: 'HOOD', thicknessUm: 200 }]);
    expect(merged.conclusion).toEqual(server.conclusion);
  });

  it('чужой schema или другой отчёт — берётся серверный черновик без слияния', () => {
    const server = createDraftFromReport(revisionReport);
    const local = createDraftFromReport(revisionReport);
    local.schema = 2 as never;
    expect(mergeDraft(server, local)).toBe(server);

    const other = createDraftFromReport(draftReport);
    other.sections.EXTERIOR.dirty = true;
    expect(mergeDraft(server, other).sections.EXTERIOR.dirty).toBe(false);
  });

  it('теги обязательных фото из локального черновика переживают слияние (на сервере их нет, BE-11)', () => {
    const server = createDraftFromReport(draftReport);
    const local = createDraftFromReport(draftReport);
    local.localMediaTags = { 'reports/x/1.jpg': 'VIN_PLATE' };

    expect(mergeDraft(server, local).localMediaTags).toEqual({ 'reports/x/1.jpg': 'VIN_PLATE' });
  });
});

describe('чтение и запись', () => {
  it('parseDraft: битый JSON, чужой schema и не та форма — это «черновика нет»', () => {
    expect(parseDraft('{', DRAFT_REPORT_ID)).toBeNull();
    expect(parseDraft('[]', DRAFT_REPORT_ID)).toBeNull();
    expect(parseDraft(JSON.stringify({ schema: 1, reportId: 'other' }), DRAFT_REPORT_ID)).toBeNull();
    expect(parseDraft(JSON.stringify({ schema: 2, reportId: DRAFT_REPORT_ID, sections: {}, paint: {}, conclusion: {} }), DRAFT_REPORT_ID)).toBeNull();
    expect(parseDraft(null, DRAFT_REPORT_ID)).toBeNull();
  });

  it('writeDraft → readDraft возвращает тот же черновик', () => {
    const draft = createDraftFromReport(revisionReport);
    draft.sections.EXTERIOR.dirty = true;
    writeDraft(draft);
    const restored = readDraft(REVISION_REPORT_ID);
    expect(restored?.sections.EXTERIOR.summary).toBe(draft.sections.EXTERIOR.summary);
    expect(restored?.sections.EXTERIOR.dirty).toBe(true);
    // Черновик другого отчёта по этому ключу не читается
    expect(readDraft(DRAFT_REPORT_ID)).toBeNull();
  });

  it('clearDraft удаляет только свой отчёт', () => {
    writeDraft(createDraftFromReport(revisionReport));
    writeDraft(createDraftFromReport(draftReport));
    clearDraft(REVISION_REPORT_ID);
    expect(readDraft(REVISION_REPORT_ID)).toBeNull();
    expect(readDraft(DRAFT_REPORT_ID)).not.toBeNull();
    expect(window.localStorage.getItem(draftKey(REVISION_REPORT_ID))).toBeNull();
  });
});

describe('pruneStaleDrafts', () => {
  function staleDraft(reportId: string, ageDays: number, dirty: boolean) {
    const draft = createDraftFromReport(reports.reports[reportId]!);
    draft.loadedAt = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000).toISOString();
    if (dirty) {
      draft.sections.EXTERIOR.dirty = true;
    }
    writeDraft(draft);
  }

  it('удаляет чистые черновики старше 30 дней, свежие оставляет', () => {
    staleDraft(DRAFT_REPORT_ID, 40, false);
    staleDraft(REVISION_REPORT_ID, 3, false);
    expect(pruneStaleDrafts()).toBe(1);
    expect(readDraft(DRAFT_REPORT_ID)).toBeNull();
    expect(readDraft(REVISION_REPORT_ID)).not.toBeNull();
  });

  it('грязный черновик не удаляется никогда, даже старый', () => {
    staleDraft(DRAFT_REPORT_ID, 400, true);
    expect(pruneStaleDrafts()).toBe(0);
    expect(readDraft(DRAFT_REPORT_ID)).not.toBeNull();
  });
});
