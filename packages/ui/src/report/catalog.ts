import type { ItemStatus, SectionKey } from './types';

export const SECTION_LABELS: Record<SectionKey, string> = {
  EXTERIOR: 'Кузов',
  PAINT: 'ЛКП',
  INTERIOR: 'Салон',
  ENGINE: 'Двигатель',
  SUSPENSION: 'Ходовая',
  ELECTRICS: 'Электрика',
  DOCUMENTS: 'Документы',
};

export const STATUS_LABELS: Record<ItemStatus, string> = {
  OK: 'Норма',
  WARN: 'Замечание',
  BAD: 'Проблема',
};

export const PANEL_LABELS: Record<string, string> = {
  HOOD: 'Капот',
  ROOF: 'Крыша',
  TRUNK: 'Крышка багажника',
  FRONT_BUMPER: 'Передний бампер',
  REAR_BUMPER: 'Задний бампер',
  FENDER_FL: 'Крыло переднее левое',
  FENDER_FR: 'Крыло переднее правое',
  FENDER_RL: 'Крыло заднее левое',
  FENDER_RR: 'Крыло заднее правое',
  DOOR_FL: 'Дверь передняя левая',
  DOOR_FR: 'Дверь передняя правая',
  DOOR_RL: 'Дверь задняя левая',
  DOOR_RR: 'Дверь задняя правая',
  SILL_L: 'Порог левый',
  SILL_R: 'Порог правый',
};

/*
 * Временный справочник пунктов чеклиста. На бэкенде `itemKey` — свободная строка,
 * и списка ~45 пунктов нет нигде. После появления `GET /catalog/checklist` этот объект
 * заменяется данными с сервера.
 */
export const ITEM_LABELS: Record<string, string> = {
  geometry: 'Геометрия кузова',
  dents: 'Вмятины',
  rust: 'Ржавчина',
  sills: 'Пороги',
  underbody: 'Днище',
  gaps: 'Зазоры',
  glass: 'Стёкла',
  seals: 'Уплотнители',
  repaint: 'Перекрасы',
  putty: 'Шпаклёвка',
  chips: 'Сколы',
  polish: 'Полировка',
  seats: 'Сиденья',
  steering_wheel: 'Руль',
  plastic: 'Пластик',
  smell: 'Запах',
  headliner: 'Потолок',
  flood_traces: 'Следы затопления',
  oil: 'Масло',
  leaks: 'Утечки',
  timing: 'ГРМ',
  coolant: 'Охлаждающая жидкость',
  battery: 'Аккумулятор',
  engine_noise: 'Посторонние звуки',
  shock_absorbers: 'Амортизаторы',
  brakes: 'Тормоза',
  tires: 'Шины',
  control_arms: 'Рычаги',
  tie_rods: 'Рулевые тяги',
  cv_joints: 'ШРУСы',
  gearbox_leaks: 'Подтёки КПП',
  obd: 'Диагностика OBD-II',
  lights: 'Световые приборы',
  dashboard: 'Приборная панель',
  ac: 'Кондиционер',
  windows: 'Стеклоподъёмники',
  vin: 'VIN',
  tech_passport: 'Техпаспорт РБ',
  owners: 'Владельцы',
  customs: 'Растаможка',
  gai: 'База ГАИ РБ',
  service_book: 'Сервисная книжка',
};

export function itemLabel(itemKey: string): string {
  return ITEM_LABELS[itemKey] ?? itemKey.replace(/_/g, ' ');
}
