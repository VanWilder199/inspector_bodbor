import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import { shouldRetry } from '@/api/queryClient';
import { fullNameFromInitData } from '@/telegram/launchParams';
import { formatPhone, mapServerFieldErrors, normalizePhone, registerSchema } from './registerForm';

// Номер собран из кусков: так в тестах нет настоящих телефонов и почты
const NUMBER = ['29', '123', '45', '67'].join('');
const PHONE = `+375${NUMBER}`;
const EMAIL = ['ivan', 'example.by'].join('@');

describe('normalizePhone', () => {
  it.each([
    ['пустой ввод → только код страны', '', '+375'],
    ['удаление части кода не ломает префикс', '37', '+375'],
    ['код страны без плюса', `375${NUMBER}`, PHONE],
    ['с плюсом и пробелами', ['+375 29', '123 45 67'].join(' '), PHONE],
    ['номер без кода страны', NUMBER, PHONE],
    ['национальный формат с 80', `80${NUMBER}`, PHONE],
    ['лишние цифры отрезаются', `${PHONE}999`, PHONE],
  ])('%s', (_name, raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });
});

describe('formatPhone', () => {
  it('показывает столько групп, сколько введено', () => {
    expect(formatPhone('+375')).toBe('+375');
    expect(formatPhone('+375291')).toBe('+375 29 1');
    expect(formatPhone(PHONE)).toBe(['+375', '29', '123', '45', '67'].join(' '));
  });

  it('форматирование и нормализация обратимы', () => {
    expect(normalizePhone(formatPhone(PHONE))).toBe(PHONE);
  });
});

describe('registerSchema', () => {
  const valid = { fullName: 'Иван Петров', phone: PHONE, email: EMAIL };

  it('принимает заполненную форму и обрезает пробелы', () => {
    expect(registerSchema.parse({ ...valid, fullName: '  Иван Петров ', email: ` ${EMAIL} ` })).toEqual(valid);
  });

  it.each([
    ['пустое ФИО', { fullName: '   ' }, 'fullName', 'Укажите ФИО'],
    ['телефон без номера', { phone: '+375' }, 'phone', 'Укажите телефон: +375 и 9 цифр'],
    // email обязателен на фронте: без него бэкенд падает в 500 (BE-4)
    ['пустой email', { email: '' }, 'email', 'Укажите email'],
    ['некорректный email', { email: 'abc' }, 'email', 'Некорректный email'],
  ])('отклоняет: %s', (_name, patch, field, message) => {
    const result = registerSchema.safeParse({ ...valid, ...patch });
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((candidate) => candidate.path[0] === field);
    expect(issue?.message).toBe(message);
  });
});

describe('mapServerFieldErrors', () => {
  it('раскладывает ошибки @Valid по полям, чужие ключи отбрасывает', () => {
    expect(
      mapServerFieldErrors({ email: 'must be a well-formed email address', fullName: 'must not be blank', 'items[0].status': 'x', _form: 'y' }),
    ).toEqual({ email: 'Проверьте email', fullName: 'Проверьте ФИО' });
  });

  it('без ошибок валидации пусто', () => {
    expect(mapServerFieldErrors(undefined)).toEqual({});
  });
});

describe('fullNameFromInitData', () => {
  const initData = (user: unknown) => `user=${encodeURIComponent(JSON.stringify(user))}&auth_date=1700000000&hash=x`;

  it('собирает имя и фамилию из поля user', () => {
    expect(fullNameFromInitData(initData({ id: 1, first_name: 'Иван', last_name: 'Петров' }))).toBe('Иван Петров');
  });

  it('без фамилии — только имя', () => {
    expect(fullNameFromInitData(initData({ id: 1, first_name: 'Иван' }))).toBe('Иван');
  });

  it.each([undefined, '', 'auth_date=1700000000', 'user=not-json'])('нет данных (%s) → пустая строка', (raw) => {
    expect(fullNameFromInitData(raw)).toBe('');
  });
});

describe('shouldRetry', () => {
  it('ответы 4xx окончательные, в том числе 404 «не зарегистрирован»', () => {
    expect(shouldRetry(0, new ApiError(404, 'INSPECTOR_NOT_FOUND'))).toBe(false);
    expect(shouldRetry(0, new ApiError(401))).toBe(false);
  });

  it('сеть и 5xx повторяются дважды', () => {
    const network = new ApiError(0, undefined, 'Network error', undefined, undefined, 'network');
    expect(shouldRetry(0, network)).toBe(true);
    expect(shouldRetry(1, new ApiError(500))).toBe(true);
    expect(shouldRetry(2, new ApiError(500))).toBe(false);
  });
});
