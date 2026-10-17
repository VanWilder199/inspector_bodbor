/*
 * Стор текущего черновика (PLAN_FRONTEND_MINIAPP.md, раздел 3.3). Только состояние и его изменения — чтение сервера
 * и отправка на сервер остаются хукам, поэтому стор проверяется юнит-тестами без React.
 *
 * Стор один на приложение: открыт один отчёт (экран хаба или шаг мастера). `load` зовётся при входе в отчёт,
 * дальше экраны читают и правят черновик; при выходе стор сбрасывается из памяти, а `localStorage` не трогается.
 */

import { create } from 'zustand';
import type { ReportDto, SectionKey } from '@/api/types';
import { clearDraft, createDraftFromReport, mergeDraft, readDraft, writeDraft, type MediaTag, type ReportDraft, type SectionDraft, type SectionItemDraft } from './draft';

export interface ReportDraftState {
  reportId: string | null;
  draft: ReportDraft | null;
  /**
   * Прочитать серверный отчёт, слить с локальным черновиком и запомнить. Возвращает черновик.
   * `persist` — писать ли результат в `localStorage`. `false` для отчётов, которые править нельзя
   * (`pending_review`/`published`): после `409 REPORT_NOT_EDITABLE` сброшенный черновик не воскрешаем.
   */
  load: (report: ReportDto, persist?: boolean) => ReportDraft;
  /** Снять отчёт из памяти (уход с экрана); черновик в `localStorage` остаётся и переживает перезапуск. */
  reset: () => void;
  /** Удалить черновик совсем: `404 REPORT_NOT_FOUND`, успешная отправка (правила 6–7 раздела 3.3). */
  discard: (reportId: string) => void;
  updateSection: (sectionKey: SectionKey, update: (section: SectionDraft) => SectionDraft) => void;
  /** Отметка пункта чеклиста: `status` и/или комментарий. */
  setItem: (sectionKey: SectionKey, itemKey: string, patch: SectionItemDraft) => void;
  setSummary: (sectionKey: SectionKey, summary: string) => void;
  setPaint: (measurements: ReportDraft['paint']['measurements']) => void;
  setConclusion: (patch: Partial<Pick<ReportDraft['conclusion'], 'conclusionText' | 'priceByn'>>) => void;
  setMediaTag: (s3Key: string, tag: MediaTag) => void;
  /** Снять флаг `dirty` и запомнить время: часть ушла на сервер (MINI-09). Без ключа — ЛКП и заключение. */
  markSaved: (sectionKey?: SectionKey) => void;
}

/** Каждое изменение сразу пишется в `localStorage`: перезапуск Mini App не должен терять правки (раздел 3.3, п. 1). */
function commit(draft: ReportDraft): { draft: ReportDraft } {
  writeDraft(draft);
  return { draft };
}

export const useReportDraft = create<ReportDraftState>((set, get) => ({
  reportId: null,
  draft: null,

  load: (report, persist = true) => {
    const draft = mergeDraft(createDraftFromReport(report), readDraft(report.id));
    set({ reportId: report.id, draft });
    // Слияние могло изменить форму (подтянулся новый `sectionId`) — сохраняем результат
    if (persist) {
      writeDraft(draft);
    }
    return draft;
  },

  reset: () => set({ reportId: null, draft: null }),

  discard: (reportId) => {
    clearDraft(reportId);
    if (get().reportId === reportId) {
      set({ reportId: null, draft: null });
    }
  },

  updateSection: (sectionKey, update) =>
    set((state) => {
      if (!state.draft) {
        return state;
      }
      const section = state.draft.sections[sectionKey];
      return commit({ ...state.draft, sections: { ...state.draft.sections, [sectionKey]: { ...update(section), dirty: true } } });
    }),

  setItem: (sectionKey, itemKey, patch) => {
    const current = get().draft?.sections[sectionKey].items[itemKey] ?? {};
    get().updateSection(sectionKey, (section) => ({ ...section, items: { ...section.items, [itemKey]: { ...current, ...patch } } }));
  },

  setSummary: (sectionKey, summary) => {
    get().updateSection(sectionKey, (section) => ({ ...section, summary }));
  },

  setPaint: (measurements) =>
    set((state) => (state.draft ? commit({ ...state.draft, paint: { measurements, dirty: true } }) : state)),

  setConclusion: (patch) =>
    set((state) => (state.draft ? commit({ ...state.draft, conclusion: { ...state.draft.conclusion, ...patch, dirty: true } }) : state)),

  setMediaTag: (s3Key, tag) =>
    set((state) => (state.draft ? commit({ ...state.draft, localMediaTags: { ...state.draft.localMediaTags, [s3Key]: tag } }) : state)),

  markSaved: (sectionKey) =>
    set((state) => {
      if (!state.draft) {
        return state;
      }
      const savedAt = new Date().toISOString();
      return commit(
        sectionKey
          ? { ...state.draft, sections: { ...state.draft.sections, [sectionKey]: { ...state.draft.sections[sectionKey], dirty: false, lastSavedAt: savedAt } } }
          : { ...state.draft, paint: { ...state.draft.paint, dirty: false }, conclusion: { ...state.draft.conclusion, dirty: false } },
      );
    }),
}));
