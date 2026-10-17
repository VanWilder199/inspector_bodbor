/*
 * Зеркало `purchase/dto/ReportViewDto` (Блок 12).
 * Временно написано руками — после подключения springdoc заменяется генерацией в `@podbor/api`.
 */

export type ItemStatus = 'OK' | 'WARN' | 'BAD';

export type SectionKey =
  | 'EXTERIOR'
  | 'PAINT'
  | 'INTERIOR'
  | 'ENGINE'
  | 'SUSPENSION'
  | 'ELECTRICS'
  | 'DOCUMENTS';

export type MediaKind = 'PHOTO' | 'VIDEO';

export interface SectionItem {
  itemKey: string;
  status: ItemStatus;
  comment: string | null;
}

export interface ReportMedia {
  id: string;
  kind: MediaKind;
  url: string;
  status: string;
  orderNo: number;
}

export interface ReportSection {
  id: string;
  sectionKey: SectionKey;
  orderNo: number;
  summary: string;
  items: SectionItem[];
  media: ReportMedia[];
}

export interface PaintMeasurement {
  id: string;
  panelCode: string;
  spot: string | null;
  thicknessUm: number;
  note: string | null;
}

export interface ReportViewData {
  id: string;
  carId: string;
  /** Копейки (BIGINT на бэкенде). */
  priceByn: number | null;
  conclusionText: string | null;
  stopFactors: string[];
  sections: ReportSection[];
  paintMeasurements: PaintMeasurement[];
  globalMedia: ReportMedia[];
}

/**
 * Шапка отчёта: машина и подборщик. В `ReportViewDto` этих полей пока нет —
 * их нужно добавить на бэкенде (см. PLAN_FRONTEND.md).
 */
export interface ReportHeader {
  carTitle: string;
  carSubtitle?: string;
  inspectorName?: string;
  inspectedAt?: string;
}
