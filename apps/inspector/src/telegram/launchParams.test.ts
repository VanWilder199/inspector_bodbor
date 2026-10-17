import { describe, expect, it } from 'vitest';
import { INIT_DATA_MAX_AGE_MS, initDataExpiresAt, resolveInitialPath, startParamToPath, toUiPlatform } from './launchParams';

const REPORT_ID = '5b0c7f0e-1d2a-4a47-9a33-6f0e4b3e9d21';

describe('startParamToPath', () => {
  it.each([
    ['new', '/reports/new'],
    ['demand', '/demand'],
    [`report_${REPORT_ID}`, `/reports/${REPORT_ID}`],
    [`report_${REPORT_ID.toUpperCase()}`, `/reports/${REPORT_ID.toUpperCase()}`],
  ])('«%s» ведёт на %s', (startParam, path) => {
    expect(startParamToPath(startParam)).toBe(path);
  });

  it.each([
    ['нет параметра', undefined],
    ['пустая строка', ''],
    ['неизвестное слово', 'whatever'],
    ['report_ без id', 'report_'],
    ['report_ не с UUID', 'report_123'],
    ['report_ с UUID и хвостом', `report_${REPORT_ID}x`],
    ['запрещённые символы', 'new/../admin'],
    ['пробел', 'new demand'],
    ['кириллица', 'новый'],
    ['регистр важен', 'NEW'],
    ['длиннее 512 символов', 'a'.repeat(513)],
  ])('%s ведёт на /', (_name, startParam) => {
    expect(startParamToPath(startParam)).toBe('/');
  });
});

describe('resolveInitialPath', () => {
  it('на корне применяет startapp', () => {
    expect(resolveInitialPath('/', 'new')).toBe('/reports/new');
  });

  it('не трогает адрес, если Mini App уже открыт по конкретному пути', () => {
    expect(resolveInitialPath('/reports/abc', 'new')).toBeNull();
  });

  it('не трогает адрес без параметра или с мусорным параметром', () => {
    expect(resolveInitialPath('/', undefined)).toBeNull();
    expect(resolveInitialPath('/', 'garbage')).toBeNull();
  });
});

describe('initDataExpiresAt', () => {
  it('прибавляет к auth_date 24 часа, как telegram.max-age на бэкенде', () => {
    const authDate = new Date('2026-10-13T10:00:00Z');
    expect(INIT_DATA_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
    expect(initDataExpiresAt(authDate).toISOString()).toBe('2026-10-14T10:00:00.000Z');
  });
});

describe('toUiPlatform', () => {
  it.each([
    ['ios', 'ios'],
    ['macos', 'ios'],
    ['android', 'base'],
    ['tdesktop', 'base'],
    ['weba', 'base'],
    [undefined, 'base'],
  ])('%s → %s', (platform, expected) => {
    expect(toUiPlatform(platform)).toBe(expected);
  });
});
