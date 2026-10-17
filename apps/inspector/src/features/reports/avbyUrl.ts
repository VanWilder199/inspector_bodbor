/*
 * Нормализация и проверка ссылки на объявление av.by до отправки на бэкенд (PLAN_FRONTEND_MINIAPP.md, раздел 2.4).
 *
 * Бэкенд ищет машину по точному совпадению строки URL, поэтому `…/1`, `…/1?utm=tg` и `…/1/` для него разные машины,
 * а каждый вызов создаёт новый черновик. Нормализация делает из этих ссылок одну. Проверка домена закрывает два риска:
 * строка не URL (`abc`) даёт на бэкенде `500`, а произвольный адрес — это запрос бэкенда в чужую сеть (SSRF, BE-19).
 */

export type AvbyUrlProblem = 'empty' | 'invalid' | 'not-avby' | 'no-listing';

export type AvbyUrlResult = { ok: true; url: string } | { ok: false; problem: AvbyUrlProblem };

/** Подсказка пользователю по каждой причине отказа. `empty` показывается только после попытки отправить. */
export const AVBY_URL_PROBLEM_MESSAGES: Record<AvbyUrlProblem, string> = {
  empty: 'Вставьте ссылку на объявление av.by',
  invalid: 'Это не похоже на ссылку. Скопируйте её из браузера или приложения av.by',
  'not-avby': 'Нужна ссылка на объявление с av.by',
  'no-listing': 'Это главная страница av.by. Откройте объявление и скопируйте его ссылку',
};

/** `https://…`, `http://…`, а также любая другая схема с `//` (её отсекает проверка протокола). */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

function isAvbyHost(hostname: string): boolean {
  return hostname === 'av.by' || hostname.endsWith('.av.by');
}

/**
 * `https://CARS.av.by/vw/passat/1/?utm=x#a` → `https://cars.av.by/vw/passat/1`.
 * Схема без `//` не нужна: `cars.av.by/vw/passat/1` принимается как `https://…`. Адрес с логином (`user@av.by`),
 * портом или чужим доменом (`notav.by`, `av.by.evil.com`) отклоняется.
 */
export function normalizeAvbyUrl(input: string): AvbyUrlResult {
  const text = input.trim();
  if (text === '') {
    return { ok: false, problem: 'empty' };
  }

  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, problem: 'invalid' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, problem: 'invalid' };
  }
  // Логин и порт в ссылке на объявление не бывают; с ними адрес ведёт не туда, куда выглядит
  if (url.username !== '' || url.password !== '' || url.port !== '') {
    return { ok: false, problem: 'invalid' };
  }
  // WHATWG URL уже привёл хост к нижнему регистру
  if (!isAvbyHost(url.hostname)) {
    return { ok: false, problem: 'not-avby' };
  }

  const path = url.pathname.replace(/\/+$/, '');
  if (path === '') {
    return { ok: false, problem: 'no-listing' };
  }
  return { ok: true, url: `https://${url.hostname}${path}` };
}
