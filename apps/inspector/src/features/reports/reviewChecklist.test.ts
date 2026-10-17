import { describe, expect, it } from 'vitest';
import type { ReportDto } from '@/api/types';
import { REVISION_REPORT_ID } from '@/mocks/fixtures/ids';
import { db } from '@/mocks/state';
import { buildReviewChecklist } from './reviewChecklist';

/** Полная копия отчёта с доработки. */
function fullReport(): ReportDto {
  const report = JSON.parse(JSON.stringify(db.reports[REVISION_REPORT_ID]!)) as ReportDto;
  // Фикстура заполняет только EXTERIOR и PAINT; доводим до полной готовности по всем правилам
  report.sections = report.sections.map((section) =>
    section.summary === '' && section.items.length === 0
      ? { ...section, summary: 'Итог', items: [{ itemKey: 'geometry', status: 'OK', comment: null }] }
      : section,
  );
  report.globalMedia = [{ id: 'v', kind: 'VIDEO', s3Key: 'k', status: 'pending', orderNo: 0 }];
  report.conclusionText = report.conclusionText ?? 'Рекомендую';
  report.priceByn = report.priceByn ?? 100;
  return report;
}

/** Опустошает секции отчёта, как после создания черновика. */
function emptySections(report: ReportDto): ReportDto {
  return { ...report, sections: report.sections.map((section) => ({ ...section, summary: '', items: [] })) };
}

describe('reviewChecklist', () => {
  it('полностью заполненный отчёт — готов к отправке', () => {
    const checklist = buildReviewChecklist(fullReport());
    expect(checklist.ready).toBe(true);
    expect(checklist.items.every((item) => item.done)).toBe(true);
  });

  it('у каждой секции должны быть итог и хотя бы один пункт (правило 2)', () => {
    const report = fullReport();
    report.sections = report.sections.map((section) =>
      section.sectionKey === 'ENGINE' ? { ...section, summary: '' } : section,
    );
    const checklist = buildReviewChecklist(report);
    expect(checklist.ready).toBe(false);
    const engine = checklist.items.find((item) => item.key === 'section:ENGINE');
    expect(engine?.done).toBe(false);
  });

  it('без глобального видео — не готово (правило 3), видео в секции не засчитывается', () => {
    const report = emptySections(fullReport());
    report.sections.forEach((section) => {
      section.summary = 'итог';
      section.items = [{ itemKey: 'geometry', status: 'OK', comment: null }];
    });
    report.conclusionText = 'Ок';
    report.priceByn = 100;
    // видео в секции, а не глобальное
    report.sections[0]!.media = [{ id: 'v', kind: 'VIDEO', s3Key: 'k', status: 'pending', orderNo: 0 }];
    report.globalMedia = [];

    const checklist = buildReviewChecklist(report);
    expect(checklist.ready).toBe(false);
    expect(checklist.items.find((item) => item.key === 'video')?.done).toBe(false);
  });

  it('без заключения и цены — не готово (правило 4)', () => {
    const report = emptySections(fullReport());
    report.sections.forEach((section) => {
      section.summary = 'итог';
      section.items = [{ itemKey: 'geometry', status: 'OK', comment: null }];
    });
    report.conclusionText = '';
    report.priceByn = null;

    const checklist = buildReviewChecklist(report);
    expect(checklist.ready).toBe(false);
  });

  it('цена ниже 1 BYN блокирует отправку', () => {
    const report = fullReport();
    report.priceByn = 50; // 0,50 BYN
    const checklist = buildReviewChecklist(report);
    expect(checklist.ready).toBe(false);
    expect(checklist.items.find((item) => item.key === 'price')?.done).toBe(false);
  });

  it('отсутствие замеров ЛКП — предупреждение, а не блокер', () => {
    const report = fullReport();
    report.paintMeasurements = [];
    const checklist = buildReviewChecklist(report);
    expect(checklist.ready).toBe(true);
    expect(checklist.warnings.some((w) => w.key === 'paint')).toBe(true);
  });
});