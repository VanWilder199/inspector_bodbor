import type { ItemStatus, ReportHeader, ReportMedia, ReportSection, ReportViewData, SectionKey } from '@podbor/ui';

/* Заглушка фото без внешней сети: SVG с подписью. */
function photo(id: string, label: string, hue: number, orderNo = 0): ReportMedia {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="hsl(${hue} 25% 70%)"/><text x="200" y="210" font-family="sans-serif" font-size="28" text-anchor="middle" fill="hsl(${hue} 30% 25%)">${label}</text></svg>`;
  return { id, kind: 'PHOTO', url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, status: 'uploaded', orderNo };
}

function section(
  orderNo: number,
  sectionKey: SectionKey,
  summary: string,
  items: [string, ItemStatus, string?][],
  media: ReportMedia[] = [],
): ReportSection {
  return {
    id: `s-${sectionKey.toLowerCase()}`,
    sectionKey,
    orderNo,
    summary,
    items: items.map(([itemKey, status, comment]) => ({ itemKey, status, comment: comment ?? null })),
    media,
  };
}

export const mockHeader: ReportHeader = {
  carTitle: 'Volkswagen Passat B8, 2017',
  carSubtitle: '2.0 TDI · DSG · 142 000 км · VIN WVWZZZ3CZHE123456',
  inspectorName: 'Иван Петров',
  inspectedAt: '12 сентября 2026',
};

export const mockReport: ReportViewData = {
  id: 'r-1',
  carId: 'c-1',
  priceByn: 5000,
  conclusionText:
    'Машина в целом живая, двигатель и коробка без нареканий, диагностика чистая.\n\nНо: следы воды под ковриками в салоне и шпаклёвка на заднем левом крыле — автомобиль, скорее всего, был в ДТП и мог стоять в воде. Брать только со скидкой и после проверки электрики на СТО.',
  stopFactors: ['flood_traces'],
  sections: [
    section(
      1,
      'EXTERIOR',
      'Геометрия в норме, зазоры ровные. Небольшая вмятина на задней левой двери, ржавчина на кромке багажника.',
      [
        ['geometry', 'OK'],
        ['dents', 'WARN', 'Вмятина ~3 см на задней левой двери, без повреждения ЛКП'],
        ['rust', 'WARN', 'Начальная коррозия на нижней кромке крышки багажника'],
        ['sills', 'OK'],
        ['underbody', 'OK'],
        ['gaps', 'OK'],
        ['glass', 'OK'],
        ['seals', 'OK'],
      ],
      [photo('m1', 'Вмятина', 210, 1), photo('m2', 'Кромка багажника', 30, 2), photo('m3', 'Днище', 120, 3)],
    ),
    section(
      2,
      'PAINT',
      'Заднее левое крыло — шпаклёвка, задняя левая дверь перекрашена. Остальное заводское.',
      [
        ['repaint', 'WARN', 'Перекрас задней левой двери'],
        ['putty', 'BAD', 'Заднее левое крыло — до 480 мкм, следы кузовного ремонта'],
        ['chips', 'OK'],
        ['polish', 'OK'],
      ],
      [photo('m4', 'Замер 480 мкм', 0, 1)],
    ),
    section(
      3,
      'INTERIOR',
      'Салон ухожен, но под ковриками водителя и заднего ряда — следы высохшей воды и песок.',
      [
        ['seats', 'OK'],
        ['steering_wheel', 'OK'],
        ['plastic', 'OK'],
        ['smell', 'WARN', 'Лёгкий запах сырости'],
        ['headliner', 'OK'],
        ['flood_traces', 'BAD', 'Разводы и песок под ковриками, окисление разъёмов под сиденьем водителя'],
      ],
      [photo('m5', 'Под ковриком', 45, 1), photo('m6', 'Разъём', 200, 2)],
    ),
    section(4, 'ENGINE', 'Двигатель запускается ровно, подтёков нет, масло чистое.', [
      ['oil', 'OK'],
      ['leaks', 'OK'],
      ['timing', 'OK', 'Замена ГРМ по чеку на 120 000 км'],
      ['coolant', 'OK'],
      ['battery', 'WARN', 'АКБ 2019 года, заряд 71%'],
      ['engine_noise', 'OK'],
    ]),
    section(5, 'SUSPENSION', 'Ходовая в хорошем состоянии, тормоза недавно меняли.', [
      ['shock_absorbers', 'OK'],
      ['brakes', 'OK'],
      ['tires', 'WARN', 'Летняя резина, остаток протектора 3 мм'],
      ['control_arms', 'OK'],
      ['tie_rods', 'OK'],
      ['cv_joints', 'OK'],
      ['gearbox_leaks', 'OK'],
    ]),
    section(6, 'ELECTRICS', 'Ошибок в блоках нет, всё работает.', [
      ['obd', 'OK', 'Ошибок нет, пробег в блоках совпадает'],
      ['lights', 'OK'],
      ['dashboard', 'OK'],
      ['ac', 'OK'],
      ['windows', 'OK'],
    ]),
    section(7, 'DOCUMENTS', 'Пригнан из Германии в 2021, растаможен. По базе ГАИ РБ ограничений нет.', [
      ['vin', 'OK'],
      ['tech_passport', 'OK'],
      ['owners', 'OK', '2 владельца в РБ'],
      ['customs', 'OK', 'Растаможен в 2021, документы есть'],
      ['gai', 'OK'],
      ['service_book', 'WARN', 'Записи только до 2020 года'],
    ]),
  ],
  paintMeasurements: [
    { id: 'p1', panelCode: 'HOOD', spot: null, thicknessUm: 118, note: null },
    { id: 'p2', panelCode: 'ROOF', spot: null, thicknessUm: 124, note: null },
    { id: 'p3', panelCode: 'TRUNK', spot: null, thicknessUm: 131, note: null },
    { id: 'p4', panelCode: 'FRONT_BUMPER', spot: null, thicknessUm: 142, note: null },
    { id: 'p5', panelCode: 'REAR_BUMPER', spot: null, thicknessUm: 150, note: null },
    { id: 'p6', panelCode: 'FENDER_FL', spot: null, thicknessUm: 121, note: null },
    { id: 'p7', panelCode: 'FENDER_FR', spot: null, thicknessUm: 119, note: null },
    { id: 'p8', panelCode: 'FENDER_RL', spot: 'центр', thicknessUm: 310, note: null },
    { id: 'p9', panelCode: 'FENDER_RL', spot: 'арка', thicknessUm: 480, note: 'Шпаклёвка у арки' },
    { id: 'p10', panelCode: 'FENDER_RR', spot: null, thicknessUm: 126, note: null },
    { id: 'p11', panelCode: 'DOOR_FL', spot: null, thicknessUm: 115, note: null },
    { id: 'p12', panelCode: 'DOOR_FR', spot: null, thicknessUm: 120, note: null },
    { id: 'p13', panelCode: 'DOOR_RL', spot: null, thicknessUm: 245, note: 'Перекрас' },
    { id: 'p14', panelCode: 'DOOR_RR', spot: null, thicknessUm: 117, note: null },
    { id: 'p15', panelCode: 'SILL_L', spot: null, thicknessUm: 138, note: null },
  ],
  globalMedia: [
    photo('g1', 'Одометр', 260, 1),
    photo('g2', 'VIN-табличка', 180, 2),
    photo('g3', 'Подборщик у авто', 90, 3),
    photo('g4', 'Техпаспорт', 330, 4),
  ],
};
