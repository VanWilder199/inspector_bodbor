import { beforeEach, describe, expect, it } from 'vitest';
import { useReportDraft } from './reportDraftStore';
import { readDraft } from './draft';
import { DRAFT_REPORT_ID, REVISION_REPORT_ID } from '@/mocks/fixtures/ids';
import { createReports } from '@/mocks/fixtures/reports';

const reports = createReports();
const revisionReport = reports.reports[REVISION_REPORT_ID]!;
const state = () => useReportDraft.getState();

beforeEach(() => {
  window.localStorage.clear();
  state().reset();
});

describe('стор черновика', () => {
  it('load строит черновик из отчёта и кладёт его в localStorage', () => {
    const draft = state().load(revisionReport);
    expect(draft.reportId).toBe(REVISION_REPORT_ID);
    expect(state().draft).not.toBeNull();
    expect(readDraft(REVISION_REPORT_ID)).not.toBeNull();
  });

  it('load сливает локальные грязные правки с серверным отчётом', () => {
    state().load(revisionReport);
    state().setSummary('EXTERIOR', 'Правка на устройстве');
    expect(state().draft?.sections.EXTERIOR.dirty).toBe(true);

    // «Перезапуск»: сбрасываем память, но не localStorage, и снова загружаем тот же серверный отчёт
    state().reset();
    state().load(revisionReport);
    expect(state().draft?.sections.EXTERIOR.summary).toBe('Правка на устройстве');
    expect(state().draft?.sections.EXTERIOR.dirty).toBe(true);
  });

  it('setItem ставит отметку и комментарий, не затирая соседние пункты', () => {
    state().load(revisionReport);
    state().setItem('EXTERIOR', 'geometry', { status: 'WARN', comment: 'зазор' });
    expect(state().draft?.sections.EXTERIOR.items.geometry).toEqual({ status: 'WARN', comment: 'зазор' });
    expect(state().draft?.sections.EXTERIOR.items.rust).toEqual({ status: 'BAD', comment: 'Левый порог, сквозная' });
  });

  it('setConclusion и setPaint поднимают dirty своей части', () => {
    state().load(revisionReport);
    state().setConclusion({ priceByn: 12300 });
    state().setPaint([{ panelCode: 'HOOD', thicknessUm: 90 }]);
    expect(state().draft?.conclusion).toEqual({ conclusionText: 'Рекомендую к покупке после торга', priceByn: 12300, dirty: true });
    expect(state().draft?.paint.dirty).toBe(true);
  });

  it('markSaved снимает dirty только у указанной части', () => {
    state().load(revisionReport);
    state().setSummary('EXTERIOR', 'итог');
    state().setConclusion({ conclusionText: 'текст' });
    state().markSaved('EXTERIOR');
    expect(state().draft?.sections.EXTERIOR.dirty).toBe(false);
    expect(state().draft?.sections.EXTERIOR.lastSavedAt).toBeTruthy();
    expect(state().draft?.conclusion.dirty).toBe(true);

    state().markSaved();
    expect(state().draft?.conclusion.dirty).toBe(false);
  });

  it('изменения без загруженного отчёта ничего не делают', () => {
    state().setSummary('EXTERIOR', 'некуда');
    state().setConclusion({ priceByn: 1 });
    expect(state().draft).toBeNull();
  });

  it('discard удаляет черновик из памяти и хранилища', () => {
    state().load(revisionReport);
    state().discard(REVISION_REPORT_ID);
    expect(readDraft(REVISION_REPORT_ID)).toBeNull();
    expect(state().draft).toBeNull();
  });

  it('discard чужого отчёта не трогает открытый черновик', () => {
    state().load(revisionReport);
    state().discard(DRAFT_REPORT_ID);
    expect(state().draft?.reportId).toBe(REVISION_REPORT_ID);
  });
});
