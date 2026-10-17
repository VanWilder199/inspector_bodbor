import { describe, expect, it } from 'vitest';
import { normalizeAvbyUrl } from './avbyUrl';

const LISTING = 'https://cars.av.by/volkswagen/passat/112233445';

/** Успешная нормализация: сравниваем только её результат, иначе тест читается тяжело. */
function normalized(input: string): string {
  const result = normalizeAvbyUrl(input);
  expect(result.ok).toBe(true);
  return result.ok ? result.url : '';
}

function problem(input: string): string {
  const result = normalizeAvbyUrl(input);
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.problem;
}

describe('normalizeAvbyUrl: приведение ссылки к одному виду', () => {
  it.each([
    ['query отбрасывается', `${LISTING}?utm_source=tg&utm_campaign=x`],
    ['фрагмент отбрасывается', `${LISTING}#photos`],
    ['завершающий слеш отбрасывается', `${LISTING}/`],
    ['несколько слешей в конце', `${LISTING}///`],
    ['хост приводится к нижнему регистру', 'https://CARS.AV.BY/volkswagen/passat/112233445'],
    ['без схемы подставляется https', 'cars.av.by/volkswagen/passat/112233445'],
    ['http заменяется на https', 'http://cars.av.by/volkswagen/passat/112233445'],
    ['пробелы по краям срезаются', `  ${LISTING}  `],
  ])('%s', (_name, input) => {
    expect(normalized(input)).toBe(LISTING);
  });

  it('ссылки, отличающиеся только query, слешем или регистром, дают одну строку — для бэкенда это одна машина', () => {
    const variants = [LISTING, `${LISTING}?utm=tg`, `${LISTING}/`, 'https://CARS.av.by/volkswagen/passat/112233445#a'];
    expect(new Set(variants.map(normalized))).toEqual(new Set([LISTING]));
  });

  it('корневой домен av.by и поддомен принимаются', () => {
    expect(normalized('av.by/volkswagen/passat/1')).toBe('https://av.by/volkswagen/passat/1');
    expect(normalized('https://cars.av.by/vw/passat/1')).toBe('https://cars.av.by/vw/passat/1');
  });

  it('http от av.by принимается и переводится в https: сам протокол не повод отказывать', () => {
    expect(normalized('http://cars.av.by/vw/passat/1')).toBe('https://cars.av.by/vw/passat/1');
  });
});

describe('normalizeAvbyUrl: что отклоняется', () => {
  it.each([
    ['пустая строка', '', 'empty'],
    ['только пробелы', '   ', 'empty'],
    ['строка без схемы и домена', 'abc', 'not-avby'],
    ['чужой домен', 'https://onliner.by/vw/passat/1', 'not-avby'],
    ['домен, лишь оканчивающийся похоже', 'https://notav.by/vw/passat/1', 'not-avby'],
    ['av.by как поддомен чужого домена', 'https://av.by.evil.com/vw/passat/1', 'not-avby'],
    ['логин в адресе', 'https://user@av.by/vw/passat/1', 'invalid'],
    ['порт в адресе', 'https://cars.av.by:8443/vw/passat/1', 'invalid'],
    ['чужая схема', 'ftp://cars.av.by/vw/passat/1', 'invalid'],
    ['javascript в ссылке', 'javascript:alert(1)', 'invalid'],
    ['главная страница без пути объявления', 'https://cars.av.by', 'no-listing'],
    ['путь из одних слешей', 'https://cars.av.by/', 'no-listing'],
  ])('%s → %s', (_name, input, expected) => {
    expect(problem(input)).toBe(expected);
  });

  it('строка, которая парсится как адрес только с чужой схемой, отклоняется, а не превращается в https', () => {
    expect(problem('mailto:someone')).toBe('invalid');
  });
});
