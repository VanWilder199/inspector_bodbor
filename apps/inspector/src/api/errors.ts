/*
 * errorCode бэкенда → текст для пользователя (PLAN_FRONTEND_MINIAPP.md, раздел 2.10).
 * Коды сверены с `ErrorCode.java`; `NOT_ALLOWDED_MEDIA_TYPE` — с опечаткой, как на бэкенде.
 */

import type { ApiError } from './client';

const SERVER_ERROR_MESSAGE = 'Что-то пошло не так, повторите';

export const errorMessages: Record<string, string> = {
  // не ошибка: по нему экран загрузки уводит на регистрацию, текст нужен на случай, если код всплывёт в другом месте
  INSPECTOR_NOT_FOUND: 'Вы ещё не зарегистрированы',
  INSPECTOR_ALREADY_REGISTERED: 'Вы уже зарегистрированы',
  INSPECTOR_BANNED: 'Аккаунт заблокирован',
  CAR_LISTING_NOT_FOUND: 'Объявление не найдено на av.by. Проверьте ссылку',
  PARSER_ERROR: 'Не удалось прочитать объявление av.by. Повторите позже',
  REPORT_NOT_FOUND: 'Отчёт не найден или удалён модератором',
  REPORT_ACCESS_DENIED: 'Это не ваш отчёт',
  REPORT_NOT_EDITABLE: 'Отчёт на модерации или опубликован, редактирование недоступно',
  REPORT_INCOMPLETE: 'Отчёт заполнен не полностью',
  SECTION_NOT_FOUND: 'Секция не найдена',
  PANEL_NOT_FOUND: 'Неизвестная панель кузова',
  NOT_ALLOWDED_MEDIA_TYPE: 'Такой формат файла не поддерживается',
  // внутренний код: фронт сам перезагружает файл, пользователю показывать его не нужно
  MEDIA_NOT_FOUND: 'Файл не дошёл до хранилища, загрузим его заново',
  UNEXPECTED_ERROR: 'Ошибка хранилища, повторим автоматически',
  BAD_REQUEST: 'Проверьте правильность заполнения полей',
  INTERNAL_SERVER_ERROR: SERVER_ERROR_MESSAGE,
};

/** 401 приходит без `errorCode` (его не отдаёт Security, BE-2), поэтому свой текст по статусу. */
const SESSION_EXPIRED_MESSAGE = 'Сессия Telegram устарела. Закройте и откройте приложение заново';

/** Тексты для ответов без `errorCode`: ошибки Spring MVC и прокси (битый JSON, неизвестный enum, несуществующий путь). */
export function messageForStatus(status: number): string {
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 403) return 'Нет доступа';
  if (status === 404) return 'Не найдено';
  if (status >= 500) return SERVER_ERROR_MESSAGE;
  if (status >= 400) return 'Некорректный запрос';
  return 'Произошла ошибка';
}

/**
 * Текст ошибки для пользователя. Порядок: сеть и таймаут → 401 → `errorCode` из таблицы → общий текст по статусу.
 * Неизвестный `errorCode` виден в тексте, чтобы его можно было найти в бэкенде.
 */
export function getErrorMessage(error: Pick<ApiError, 'status' | 'errorCode' | 'kind'>): string {
  if (error.kind === 'network') return 'Нет связи с сервером. Проверьте интернет';
  if (error.kind === 'timeout') return 'Сервер долго не отвечает. Повторите позже';
  if (error.status === 401) return SESSION_EXPIRED_MESSAGE;
  if (error.errorCode) return errorMessages[error.errorCode] ?? `Ошибка: ${error.errorCode}`;
  return messageForStatus(error.status);
}
