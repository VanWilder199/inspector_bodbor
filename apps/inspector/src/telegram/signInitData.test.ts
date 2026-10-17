import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signInitData } from '../../scripts/sign-init-data';

// Фиктивный токен: к настоящему боту отношения не имеет
const TEST_TOKEN = '000000:test-token-for-unit-tests';
const AUTH_DATE = 1_760_000_000;

/** Независимая проверка по алгоритму из документации Telegram: разбираем готовую строку и пересчитываем подпись. */
function verify(initData: string, botToken: string): boolean {
  const pairs = initData.split('&').map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))] as const;
  });
  const hash = pairs.find(([key]) => key === 'hash')?.[1];
  const dataCheckString = pairs
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secret).update(dataCheckString).digest('hex') === hash;
}

describe('signInitData', () => {
  it('подписывает initData так, что подпись проходит проверку по токену бота', () => {
    const initData = signInitData({ botToken: TEST_TOKEN, userId: 42, firstName: 'Иван', username: 'ivan', authDate: AUTH_DATE });

    expect(verify(initData, TEST_TOKEN)).toBe(true);
  });

  it('с другим токеном подпись не проходит', () => {
    const initData = signInitData({ botToken: TEST_TOKEN, userId: 42, firstName: 'Иван', authDate: AUTH_DATE });

    expect(verify(initData, '000000:another-token')).toBe(false);
  });

  it('кладёт в initData auth_date и пользователя', () => {
    const initData = signInitData({ botToken: TEST_TOKEN, userId: 42, firstName: 'Иван', lastName: 'Петров', authDate: AUTH_DATE });
    const params = new URLSearchParams(initData);

    expect(params.get('auth_date')).toBe(String(AUTH_DATE));
    expect(JSON.parse(params.get('user') ?? '{}')).toMatchObject({ id: 42, first_name: 'Иван', last_name: 'Петров' });
  });

  it('кодирует пробелы как %20, а не как «+»: бэкенд декодирует значения по одному', () => {
    const initData = signInitData({ botToken: TEST_TOKEN, userId: 1, firstName: 'Иван Иванович', authDate: AUTH_DATE });

    expect(initData).not.toContain('+');
    expect(verify(initData, TEST_TOKEN)).toBe(true);
  });
});
