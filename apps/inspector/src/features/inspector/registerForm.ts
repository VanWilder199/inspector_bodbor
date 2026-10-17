import { z } from 'zod';

/** Телефон в том виде, в каком его принимает бэкенд после BE-4: `+375` и 9 цифр без пробелов. */
const PHONE_RE = /^\+375\d{9}$/;

const COUNTRY_CODE = '375';
/** Длина номера без плюса: код страны и 9 цифр. */
const MAX_PHONE_DIGITS = 12;

/**
 * Приводит ввод к `+375XXXXXXXXX`: понимает вставку `+375…`, `8 029…` и ввод без кода страны.
 * Префикс `+375` не стирается: если пользователь удаляет его, остаётся `+375`.
 */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (COUNTRY_CODE.startsWith(digits)) {
    return `+${COUNTRY_CODE}`;
  }
  if (digits.startsWith('80')) {
    digits = COUNTRY_CODE + digits.slice(2);
  } else if (!digits.startsWith(COUNTRY_CODE)) {
    digits = COUNTRY_CODE + digits;
  }
  return `+${digits.slice(0, MAX_PHONE_DIGITS)}`;
}

/** Номер для показа в поле: код страны, затем группы 2-3-2-2. Работает и с неполным номером: показывает столько групп, сколько введено. */
export function formatPhone(normalized: string): string {
  const rest = normalized.replace(/\D/g, '').slice(COUNTRY_CODE.length);
  const groups = [rest.slice(0, 2), rest.slice(2, 5), rest.slice(5, 7), rest.slice(7, 9)].filter(Boolean);
  return [`+${COUNTRY_CODE}`, ...groups].join(' ');
}

/**
 * Email обязателен на фронте, хотя `@Email` на бэкенде пропускает `null`: в БД `inspectors.email NOT NULL`,
 * и регистрация без email заканчивается 500, а не 400 (BE-4 ещё не сделан).
 */
export const registerSchema = z.object({
  fullName: z.string().trim().min(1, 'Укажите ФИО'),
  phone: z.string().regex(PHONE_RE, 'Укажите телефон: +375 и 9 цифр'),
  email: z.string().trim().min(1, 'Укажите email').email('Некорректный email'),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;
export type RegisterField = keyof RegisterFormValues;

/** Текст у поля, когда его отклонил сервер: сообщения валидатора приходят по-английски (`must not be blank`). */
const SERVER_FIELD_TEXT: Record<RegisterField, string> = {
  fullName: 'Проверьте ФИО',
  phone: 'Проверьте телефон',
  email: 'Проверьте email',
};

/** Ошибки `@Valid` (`ApiError.fieldErrors`) → тексты у полей формы. Чужие поля и `_form` отбрасываются. */
export function mapServerFieldErrors(fieldErrors: Record<string, string> | undefined): Partial<Record<RegisterField, string>> {
  const result: Partial<Record<RegisterField, string>> = {};
  for (const field of Object.keys(SERVER_FIELD_TEXT) as RegisterField[]) {
    if (fieldErrors?.[field]) {
      result[field] = SERVER_FIELD_TEXT[field];
    }
  }
  return result;
}
