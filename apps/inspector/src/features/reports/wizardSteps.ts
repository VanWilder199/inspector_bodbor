/*
 * Шаги мастера отчёта (PLAN_FRONTEND_MINIAPP.md, раздел 1.2). Порядок фиксирован: обязательные фото → 7 секций по
 * `orderNo` → видео → заключение → проверка.
 *
 * Один список на хаб и на шаги: хаб рисует его целиком, шаг знает своих соседей для MainButton «Далее» и BackButton
 * «предыдущий шаг». Появление нового шага — правка только этого файла.
 */

import { SECTION_KEYS, type ReportDto, type SectionKey } from '@/api/types';
import { SECTION_LABELS } from '@podbor/ui';
import type { ReportDraft } from './draft';

export type StepKind = 'start' | 'section' | 'paint' | 'video' | 'conclusion' | 'review';

export interface WizardStep {
  /** Ключ шага в URL; у секций — это `SectionKey`. */
  key: string;
  kind: StepKind;
  title: string;
  /** Путь мастера для этого шага (`/reports/:id/...`). */
  path: string;
}

/** ЛКП — подшаг секции `PAINT` (`/reports/:id/paint`), в списке шагов он идёт вместо обычного шага секции. */
const PAINT_SECTION: SectionKey = 'PAINT';

const START_STEP: WizardStep = { key: 'start', kind: 'start', title: 'Обязательные фото', path: 'start' };
const VIDEO_STEP: WizardStep = { key: 'video', kind: 'video', title: 'Видео обхода', path: 'video' };
const CONCLUSION_STEP: WizardStep = { key: 'conclusion', kind: 'conclusion', title: 'Заключение и цена', path: 'conclusion' };
const REVIEW_STEP: WizardStep = { key: 'review', kind: 'review', title: 'Проверка и отправка', path: 'review' };

/** Путь шага секции в URL: ЛКП — `paint`, остальные — `section/<KEY>`. */
function sectionStepPath(key: SectionKey): string {
  return key === PAINT_SECTION ? 'paint' : `section/${key}`;
}

/**
 * Порядок шагов по умолчанию — он же порядок `SECTION_KEYS`, а он же `order_no` секций на бэкенде.
 * Нужен там, где серверного ответа ещё нет: чтобы посчитать соседний шаг по одному адресу.
 */
export const WIZARD_STEP_PATHS: readonly string[] = [
  START_STEP.path,
  ...SECTION_KEYS.map(sectionStepPath),
  VIDEO_STEP.path,
  CONCLUSION_STEP.path,
  REVIEW_STEP.path,
];

/** Путь шага мастера из адреса: `/reports/<id>/section/ENGINE` → `section/ENGINE`. Иначе `null` (это не шаг мастера). */
export function stepPathFromPathname(pathname: string): string | null {
  const match = /^\/reports\/[^/]+\/(.+)$/.exec(pathname.replace(/\/+$/, ''));
  return match?.[1] ?? null;
}

/** Предыдущий шаг или `null`, если это первый шаг мастера (тогда «назад» ведёт на хаб). */
export function previousStepPath(pathname: string): string | null {
  const current = stepPathFromPathname(pathname);
  const index = current ? WIZARD_STEP_PATHS.indexOf(current) : -1;
  return (index > 0 ? WIZARD_STEP_PATHS[index - 1] : null) ?? null;
}

/** Следующий шаг или `null`, если это последний («Проверка»). */
export function nextStepPath(pathname: string): string | null {
  const current = stepPathFromPathname(pathname);
  const index = current ? WIZARD_STEP_PATHS.indexOf(current) : -1;
  return (index >= 0 && index < WIZARD_STEP_PATHS.length - 1 ? WIZARD_STEP_PATHS[index + 1] : null) ?? null;
}

/**
 * Куда ведёт кнопка «Продолжить» на хабе: первый неготовый шаг, а если готовы все — «Проверка и отправка».
 * Прогресс берётся из серверных данных и черновика, поэтому кнопка ведёт туда, где подборщик остановился.
 */
export function nextIncompleteStep(report: ReportDto, draft: ReportDraft | null): WizardStep {
  const steps = wizardSteps(report);
  return steps.find((step) => step.kind !== 'review' && stepProgress(step, report, draft).state !== 'done') ?? steps[steps.length - 1]!;
}

/** Порядок шагов мастера: секции берутся по `orderNo` из ответа, между ними вклиниваются фиксированные шаги. */
export function wizardSteps(report: ReportDto | undefined): WizardStep[] {
  const orderedKeys = orderSectionKeys(report);
  const sectionSteps: WizardStep[] = orderedKeys.map((key) => {
    const isPaint = key === PAINT_SECTION;
    return {
      key,
      kind: isPaint ? 'paint' : 'section',
      title: isPaint ? 'Замеры ЛКП' : SECTION_LABELS[key],
      path: sectionStepPath(key),
    };
  });
  return [START_STEP, ...sectionSteps, VIDEO_STEP, CONCLUSION_STEP, REVIEW_STEP];
}

/**
 * Порядок секций: у секций из ответа — по `orderNo`; ЛКП без замеров бэкенд всё равно присылает, поэтому
 * отсутствующие ключи добираются в исходном порядке `SECTION_KEYS`.
 */
function orderSectionKeys(report: ReportDto | undefined): SectionKey[] {
  if (!report) {
    return [...SECTION_KEYS];
  }
  const present = report.sections
    .slice()
    .sort((a, b) => a.orderNo - b.orderNo)
    .map((section) => section.sectionKey)
    .filter((key): key is SectionKey => (SECTION_KEYS as readonly string[]).includes(key));
  return present.length === SECTION_KEYS.length ? present : [...SECTION_KEYS];
}

export interface StepProgress {
  /** `empty` — ничего не заполнено, `partial` — начато, `done` — заполнено. */
  state: 'empty' | 'partial' | 'done';
  /** Что уже есть: «2 из 5 пунктов», «видео загружено (не обработано)» и т.п. */
  detail?: string;
}

/**
 * Прогресс шага по серверным данным и черновику. Для секции — по `summary` и числу оценённых пунктов; остальные шаги
 * считаются по своим признакам. Готовность к отправке (раздел 2.8) здесь не проверяется — это чек-лист (`review`).
 */
export function stepProgress(step: WizardStep, report: ReportDto, draft: ReportDraft | null): StepProgress {
  switch (step.kind) {
    case 'start': {
      const tagged = draft ? Object.keys(draft.localMediaTags).length : 0;
      return tagged === 0 ? { state: 'empty', detail: 'Фото с тегами хранятся на этом устройстве' } : { state: 'partial', detail: `Отмечено ${tagged}` };
    }
    case 'section':
    case 'paint': {
      const section = step.kind === 'paint' ? null : report.sections.find((candidate) => candidate.sectionKey === step.key);
      const sectionDraft = draft?.sections[step.key as SectionKey];
      const summary = sectionDraft?.summary ?? section?.summary ?? '';
      const rated = sectionDraft ? Object.values(sectionDraft.items).filter((item) => item.status).length : (section?.items.length ?? 0);
      if (summary.trim() === '' && rated === 0) {
        return { state: 'empty' };
      }
      const filled = summary.trim() !== '' && rated > 0;
      return { state: filled ? 'done' : 'partial', detail: rated > 0 ? `Оценено пунктов: ${rated}` : 'Нужен итог секции' };
    }
    case 'video': {
      const video = report.globalMedia.find((media) => media.kind === 'VIDEO');
      if (!video) {
        return { state: 'empty' };
      }
      return { state: 'done', detail: video.status === 'pending' ? 'Загружено, обработка не завершена' : 'Загружено' };
    }
    case 'conclusion': {
      const text = draft?.conclusion.conclusionText ?? report.conclusionText ?? '';
      const price = draft?.conclusion.priceByn ?? report.priceByn;
      if (text.trim() === '' && price == null) {
        return { state: 'empty' };
      }
      return text.trim() !== '' && price != null ? { state: 'done' } : { state: 'partial' };
    }
    case 'review':
      // Готовность считает экран проверки по серверным правилам submit (раздел 2.8), здесь всегда «частично»
      return { state: 'partial' };
  }
}
