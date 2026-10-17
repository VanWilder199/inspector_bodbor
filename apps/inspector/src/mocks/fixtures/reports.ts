import type { LastModeration, ReportDto, ReportMediaDto, ReportSectionDto, ReportStatus, SectionItemDto, SectionKey } from '@/api/types';
import { SECTION_KEYS } from '@/api/types';
import {
  CAR_GOLF_ID,
  CAR_OCTAVIA_ID,
  CAR_PASSAT_ID,
  DRAFT_REPORT_ID,
  FOREIGN_REPORT_ID,
  INSPECTOR_ID,
  OTHER_INSPECTOR_ID,
  REVISION_REPORT_ID,
  uuid,
} from './ids';

/** 7 пустых секций, как после `POST /inspector/reports`: `summary = ""`, пунктов и медиа нет. */
export function createEmptySections(sectionIdBase: number): ReportSectionDto[] {
  return SECTION_KEYS.map((sectionKey, index) => ({
    id: uuid(sectionIdBase + index),
    sectionKey,
    orderNo: index + 1,
    summary: '',
    items: [],
    media: [],
  }));
}

/** Пункты `BAD` дают стоп-факторы (`ReportServiceImpl:280-283`). */
export function stopFactorsOf(sections: ReportSectionDto[]): string[] {
  return sections.flatMap((section) => section.items.filter((item) => item.status === 'BAD').map((item) => item.itemKey));
}

function item(itemKey: string, status: SectionItemDto['status'], comment: string | null = null): SectionItemDto {
  return { itemKey, status, comment };
}

function sectionOf(report: ReportDto, key: SectionKey): ReportSectionDto {
  const section = report.sections.find((candidate) => candidate.sectionKey === key);
  if (!section) throw new Error(`В фикстуре отчёта нет секции ${key}`);
  return section;
}

function photo(n: number, s3Key: string): ReportMediaDto {
  return { id: uuid(n), kind: 'PHOTO', s3Key, status: 'uploaded', orderNo: 0 };
}

export interface ReportsSeed {
  reports: Record<string, ReportDto>;
  lastModeration: Record<string, LastModeration>;
  createdAt: Record<string, string>;
  updatedAt: Record<string, string>;
  submittedAt: Record<string, string>;
}

function baseReport(id: string, carId: string, inspectorId: string, status: ReportStatus, sectionIdBase: number): ReportDto {
  return {
    id,
    carId,
    inspectorId,
    versionNo: 1,
    status,
    priceByn: null,
    conclusionText: null,
    stopFactors: [],
    sections: createEmptySections(sectionIdBase),
    paintMeasurements: [],
    globalMedia: [],
  };
}

/** Три отчёта: свой пустой черновик, свой на доработке (с причиной), чужой. */
export function createReports(): ReportsSeed {
  const draft = baseReport(DRAFT_REPORT_ID, CAR_PASSAT_ID, INSPECTOR_ID, 'draft', 2000);

  const revision = baseReport(REVISION_REPORT_ID, CAR_GOLF_ID, INSPECTOR_ID, 'revision_required', 2100);
  const exterior = sectionOf(revision, 'EXTERIOR');
  exterior.summary = 'Кузов в хорошем состоянии, ржавчина на пороге';
  exterior.items = [item('geometry', 'OK'), item('rust', 'BAD', 'Левый порог, сквозная'), item('sills', 'WARN')];
  exterior.media = [photo(3001, `reports/${REVISION_REPORT_ID}/sections/${exterior.id}/${uuid(3001)}.jpg`)];

  const paint = sectionOf(revision, 'PAINT');
  paint.summary = 'Капот перекрашен';
  paint.items = [item('repaint', 'WARN', 'Капот')];
  revision.paintMeasurements = [
    { id: uuid(3101), panelCode: 'HOOD', spot: 'центр', thicknessUm: 110, note: null },
    { id: uuid(3102), panelCode: 'DOOR_FL', spot: null, thicknessUm: 420, note: 'шпаклёвка' },
  ];
  revision.conclusionText = 'Рекомендую к покупке после торга';
  revision.priceByn = 5000;
  revision.stopFactors = stopFactorsOf(revision.sections);
  revision.globalMedia = [
    { id: uuid(3201), kind: 'VIDEO', s3Key: `reports/${REVISION_REPORT_ID}/${uuid(3201)}.mp4`, status: 'pending', orderNo: 0 },
  ];

  const foreign = baseReport(FOREIGN_REPORT_ID, CAR_OCTAVIA_ID, OTHER_INSPECTOR_ID, 'published', 2200);

  return {
    reports: { [draft.id]: draft, [revision.id]: revision, [foreign.id]: foreign },
    lastModeration: {
      [REVISION_REPORT_ID]: { action: 'revise', reason: 'Нет фото VIN-таблички', at: '2026-09-22T10:00:00Z' },
    },
    createdAt: {
      [DRAFT_REPORT_ID]: '2026-09-25T09:00:00Z',
      [REVISION_REPORT_ID]: '2026-09-20T09:00:00Z',
      [FOREIGN_REPORT_ID]: '2026-09-10T09:00:00Z',
    },
    updatedAt: {
      [DRAFT_REPORT_ID]: '2026-09-25T09:00:00Z',
      [REVISION_REPORT_ID]: '2026-09-22T10:00:00Z',
      [FOREIGN_REPORT_ID]: '2026-09-12T09:00:00Z',
    },
    submittedAt: {
      [REVISION_REPORT_ID]: '2026-09-21T18:31:00Z',
    },
  };
}
