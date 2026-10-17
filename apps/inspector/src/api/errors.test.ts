import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { errorMessages, getErrorMessage, messageForStatus } from './errors';

/** Коды из таблицы 2.10 плана (кроме безтелого 401: у него нет errorCode). */
const CODES_FROM_PLAN = [
  'INSPECTOR_NOT_FOUND',
  'INSPECTOR_ALREADY_REGISTERED',
  'INSPECTOR_BANNED',
  'CAR_LISTING_NOT_FOUND',
  'PARSER_ERROR',
  'REPORT_NOT_FOUND',
  'REPORT_ACCESS_DENIED',
  'REPORT_NOT_EDITABLE',
  'REPORT_INCOMPLETE',
  'SECTION_NOT_FOUND',
  'PANEL_NOT_FOUND',
  'NOT_ALLOWDED_MEDIA_TYPE',
  'MEDIA_NOT_FOUND',
  'UNEXPECTED_ERROR',
  'BAD_REQUEST',
  'INTERNAL_SERVER_ERROR',
];

describe('таблица errorCode → текст', () => {
  it('покрывает все коды из раздела 2.10 и ничего лишнего', () => {
    expect(Object.keys(errorMessages).sort()).toEqual([...CODES_FROM_PLAN].sort());
  });

  it.each(CODES_FROM_PLAN)('%s имеет непустой текст', (code) => {
    expect(errorMessages[code]).toBeTruthy();
  });

  it('код с опечаткой NOT_ALLOWDED_MEDIA_TYPE записан как на бэкенде', () => {
    expect(errorMessages).toHaveProperty('NOT_ALLOWDED_MEDIA_TYPE');
    expect(errorMessages).not.toHaveProperty('NOT_ALLOWED_MEDIA_TYPE');
  });

  it('все коды — заглавные snake_case, как в ErrorCode бэкенда', () => {
    for (const code of Object.keys(errorMessages)) expect(code).toMatch(/^[A-Z][A-Z_]+$/);
  });
});

describe('getErrorMessage', () => {
  it('ответ с errorCode → текст из таблицы', () => {
    const error = new ApiError(409, 'REPORT_NOT_EDITABLE');
    expect(getErrorMessage(error)).toBe(errorMessages.REPORT_NOT_EDITABLE);
  });

  it('неизвестный errorCode виден в тексте, чтобы его можно было найти в бэкенде', () => {
    expect(getErrorMessage(new ApiError(400, 'SOMETHING_NEW'))).toBe('Ошибка: SOMETHING_NEW');
  });

  it('401 без errorCode → просьба переоткрыть приложение', () => {
    expect(getErrorMessage(new ApiError(401))).toContain('Сессия Telegram устарела');
  });

  it.each([
    [400, 'Некорректный запрос'],
    [403, 'Нет доступа'],
    [404, 'Не найдено'],
    [500, errorMessages.INTERNAL_SERVER_ERROR],
    [502, errorMessages.INTERNAL_SERVER_ERROR],
  ])('ответ без errorCode, статус %i → общий текст по статусу', (status, text) => {
    expect(getErrorMessage(new ApiError(status))).toBe(text);
    expect(messageForStatus(status)).toBe(text);
  });

  it('сеть и таймаут различаются и не зависят от статуса 0', () => {
    expect(getErrorMessage(new ApiError(0, undefined, 'Network error', undefined, undefined, 'network'))).toContain('Нет связи');
    expect(getErrorMessage(new ApiError(0, undefined, 'Request timeout', undefined, undefined, 'timeout'))).toContain('долго не отвечает');
  });

  it('ApiError со статусом 0 по умолчанию считается сетевой ошибкой', () => {
    expect(new ApiError(0).kind).toBe('network');
    expect(new ApiError(500).kind).toBe('http');
  });
});
