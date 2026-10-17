import { describe, expect, it, vi } from 'vitest';
import { carTitleFromAvbyUrl } from './carTitle';
import { addToReportsIndex, readReportsIndex, REPORTS_INDEX_KEY, removeFromReportsIndex } from './reportsIndex';

const PASSAT = 'https://cars.av.by/volkswagen/passat/112233445';
const GOLF = 'https://cars.av.by/volkswagen/golf/223344556';

describe('локальный индекс отчётов', () => {
  it('пустой, пока ничего не добавлено', () => {
    expect(readReportsIndex()).toEqual([]);
  });

  it('новые отчёты идут первыми, а время создания по умолчанию — текущее', () => {
    addToReportsIndex({ reportId: 'first', avbyUrl: PASSAT, createdAt: '2026-10-01T10:00:00.000Z' });
    addToReportsIndex({ reportId: 'second', avbyUrl: GOLF });

    const entries = readReportsIndex();
    expect(entries.map((entry) => entry.reportId)).toEqual(['second', 'first']);
    expect(Number.isNaN(Date.parse(entries[0]?.createdAt ?? ''))).toBe(false);
    expect(entries[1]).toEqual({ reportId: 'first', avbyUrl: PASSAT, createdAt: '2026-10-01T10:00:00.000Z' });
  });

  it('повторное добавление того же отчёта ничего не меняет', () => {
    addToReportsIndex({ reportId: 'same', avbyUrl: PASSAT, createdAt: '2026-10-01T10:00:00.000Z' });
    addToReportsIndex({ reportId: 'same', avbyUrl: GOLF, createdAt: '2026-10-02T10:00:00.000Z' });

    expect(readReportsIndex()).toEqual([{ reportId: 'same', avbyUrl: PASSAT, createdAt: '2026-10-01T10:00:00.000Z' }]);
  });

  it('удаляет отчёт; удаление неизвестного отчёта не трогает остальные', () => {
    addToReportsIndex({ reportId: 'a', avbyUrl: PASSAT });
    addToReportsIndex({ reportId: 'b', avbyUrl: GOLF });

    removeFromReportsIndex('a');
    removeFromReportsIndex('unknown');

    expect(readReportsIndex().map((entry) => entry.reportId)).toEqual(['b']);
  });

  it('пишет версию схемы', () => {
    addToReportsIndex({ reportId: 'a', avbyUrl: PASSAT });

    expect(JSON.parse(window.localStorage.getItem(REPORTS_INDEX_KEY)!)).toMatchObject({ schema: 1 });
  });

  it('читает формат из плана (голый массив) и при следующей записи переводит его в текущий', () => {
    window.localStorage.setItem(REPORTS_INDEX_KEY, JSON.stringify([{ reportId: 'old', avbyUrl: PASSAT, createdAt: '2026-09-01T00:00:00.000Z' }]));
    expect(readReportsIndex().map((entry) => entry.reportId)).toEqual(['old']);

    addToReportsIndex({ reportId: 'new', avbyUrl: GOLF });

    expect(readReportsIndex().map((entry) => entry.reportId)).toEqual(['new', 'old']);
    expect(JSON.parse(window.localStorage.getItem(REPORTS_INDEX_KEY)!)).toMatchObject({ schema: 1 });
  });

  it.each([
    ['битый JSON', '{не json'],
    ['не массив и не объект с entries', '42'],
    ['null', 'null'],
    ['entries не массив', '{"schema":1,"entries":"x"}'],
  ])('%s — пустой список, приложение не падает', (_name, raw) => {
    window.localStorage.setItem(REPORTS_INDEX_KEY, raw);

    expect(readReportsIndex()).toEqual([]);
  });

  it('отбрасывает записи неверной формы и повторы', () => {
    window.localStorage.setItem(
      REPORTS_INDEX_KEY,
      JSON.stringify({
        schema: 1,
        entries: [
          { reportId: 'ok', avbyUrl: PASSAT, createdAt: '2026-09-01T00:00:00.000Z' },
          { reportId: 'ok', avbyUrl: GOLF, createdAt: '2026-09-02T00:00:00.000Z' },
          { reportId: '', avbyUrl: PASSAT, createdAt: '2026-09-01T00:00:00.000Z' },
          { reportId: 'no-url', createdAt: '2026-09-01T00:00:00.000Z' },
          'строка',
          null,
        ],
      }),
    );

    expect(readReportsIndex()).toEqual([{ reportId: 'ok', avbyUrl: PASSAT, createdAt: '2026-09-01T00:00:00.000Z' }]);
  });

  it('недоступное хранилище не роняет добавление', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(() => addToReportsIndex({ reportId: 'a', avbyUrl: PASSAT })).not.toThrow();

    setItem.mockRestore();
  });
});

describe('подпись машины по ссылке av.by', () => {
  it.each([
    [PASSAT, 'Volkswagen Passat'],
    ['https://cars.av.by/land-rover/range-rover/1', 'Land rover Range rover'],
    ['https://cars.av.by/audi/a6/445566778', 'Audi A6'],
    ['https://cars.av.by/skoda', 'Skoda'],
    ['https://cars.av.by/12345', 'Автомобиль'],
    ['https://cars.av.by/', 'Автомобиль'],
    ['не ссылка', 'Автомобиль'],
    ['', 'Автомобиль'],
    ['https://cars.av.by/%E0%A4%A/passat/1', '%E0%A4%A Passat'],
  ])('%s → %s', (url, title) => {
    expect(carTitleFromAvbyUrl(url)).toBe(title);
  });
});
