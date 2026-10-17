import { itemLabel, PANEL_LABELS, SECTION_LABELS } from '@podbor/ui';
import type { CarSummary, ChecklistCatalog, DemandItem, SectionKey } from '@/api/types';
import { SECTION_KEYS } from '@/api/types';
import { CAR_GOLF_ID, CAR_OCTAVIA_ID, CAR_PASSAT_ID } from './ids';

/** Коды панелей в порядке seed-миграции `paint_panel` (`order_no` 1…15). */
export const PANEL_CODES = Object.keys(PANEL_LABELS);

const PASSAT: CarSummary = {
  id: CAR_PASSAT_ID,
  make: 'Volkswagen',
  model: 'Passat',
  year: 2017,
  vin: 'WVWZZZ3CZHE000000',
  avbyListingUrl: 'https://cars.av.by/volkswagen/passat/112233445',
};

const GOLF: CarSummary = {
  id: CAR_GOLF_ID,
  make: 'Volkswagen',
  model: 'Golf',
  year: 2015,
  vin: null,
  avbyListingUrl: 'https://cars.av.by/volkswagen/golf/223344556',
};

const OCTAVIA: CarSummary = {
  id: CAR_OCTAVIA_ID,
  make: 'Skoda',
  model: 'Octavia',
  year: null,
  vin: null,
  avbyListingUrl: 'https://cars.av.by/skoda/octavia/334455667',
};

export function createCars(): Record<string, CarSummary> {
  return { [PASSAT.id]: { ...PASSAT }, [GOLF.id]: { ...GOLF }, [OCTAVIA.id]: { ...OCTAVIA } };
}

/*
 * Пункты по секциям — порядок временного справочника `packages/ui/src/report/catalog.ts` (42 ключа).
 * Подписи берутся оттуда же: настоящий справочник придёт с бэкенда (BE-5, B-25).
 */
const SECTION_ITEM_KEYS: Record<SectionKey, string[]> = {
  EXTERIOR: ['geometry', 'dents', 'rust', 'sills', 'underbody', 'gaps', 'glass', 'seals'],
  PAINT: ['repaint', 'putty', 'chips', 'polish'],
  INTERIOR: ['seats', 'steering_wheel', 'plastic', 'smell', 'headliner', 'flood_traces'],
  ENGINE: ['oil', 'leaks', 'timing', 'coolant', 'battery', 'engine_noise'],
  SUSPENSION: ['shock_absorbers', 'brakes', 'tires', 'control_arms', 'tie_rods', 'cv_joints', 'gearbox_leaks'],
  ELECTRICS: ['obd', 'lights', 'dashboard', 'ac', 'windows'],
  DOCUMENTS: ['vin', 'tech_passport', 'owners', 'customs', 'gai', 'service_book'],
};

/** Ответ мока `GET /inspector/catalog/checklist` (BE-5). Тексты инструкций и подсказок — заглушки. */
export function createChecklist(): ChecklistCatalog {
  return {
    version: 1,
    sections: SECTION_KEYS.map((sectionKey) => ({
      sectionKey,
      title: SECTION_LABELS[sectionKey],
      instruction: `Заполните все пункты секции «${SECTION_LABELS[sectionKey]}» и напишите итог.`,
      items: SECTION_ITEM_KEYS[sectionKey].map((itemKey, index) => ({
        itemKey,
        title: itemLabel(itemKey),
        hint: `Подсказка: ${itemLabel(itemKey).toLowerCase()}.`,
        required: true,
        photoRequiredOn: 'BAD' as const,
        orderNo: index + 1,
      })),
    })),
  };
}

/** Данные мока `GET /inspector/demand` (BE-15) без `myReportId`: его хендлер считает по отчётам подборщика. */
export function createDemand(): Omit<DemandItem, 'myReportId'>[] {
  return [
    { car: { ...GOLF, listingStatus: 'active' }, waitingCount: 7, lastRequestedAt: '2026-09-26T15:00:00Z', publishedReportsCount: 0 },
    { car: { ...PASSAT, listingStatus: 'active' }, waitingCount: 3, lastRequestedAt: '2026-09-25T10:30:00Z', publishedReportsCount: 0 },
    { car: { ...OCTAVIA, listingStatus: 'active' }, waitingCount: 1, lastRequestedAt: '2026-09-20T08:00:00Z', publishedReportsCount: 0 },
  ];
}
