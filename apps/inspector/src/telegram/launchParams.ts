/*
 * Чистая логика вокруг launch params Telegram — без обращений к SDK, чтобы её можно было тестировать без Telegram.
 */

/** Допустимые символы и длина `start_param` у Telegram (PLAN_FRONTEND_MINIAPP.md, раздел 1.3). */
const START_PARAM_RE = /^[A-Za-z0-9_-]{1,512}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORT_PREFIX = 'report_';

/**
 * Путь, на который ведёт `startapp`-параметр. Всё, что не распознано, ведёт на `/` (там bootstrap решит по статусу подборщика).
 * `report_<uuid>` проверяется по формату UUID: идентификатор попадает прямо в путь роута.
 */
export function startParamToPath(startParam: string | undefined): string {
  if (!startParam || !START_PARAM_RE.test(startParam)) {
    return '/';
  }
  if (startParam === 'new') {
    return '/reports/new';
  }
  if (startParam === 'demand') {
    return '/demand';
  }
  if (startParam.startsWith(REPORT_PREFIX)) {
    const reportId = startParam.slice(REPORT_PREFIX.length);
    return UUID_RE.test(reportId) ? `/reports/${reportId}` : '/';
  }
  return '/';
}

/**
 * Путь, на который нужно переписать адрес при запуске, или `null`, если трогать его не надо.
 * `startapp` применяется только к запуску на корне: если Mini App уже открыт по конкретному пути
 * (перезагрузка, кнопка `web_app` с полным URL), этот путь важнее.
 */
export function resolveInitialPath(pathname: string, startParam: string | undefined): string | null {
  if (pathname !== '/') {
    return null;
  }
  const target = startParamToPath(startParam);
  return target === '/' ? null : target;
}

/** Время жизни initData на бэкенде: `telegram.max-age: 24h` в application.yml. Значения должны совпадать. */
export const INIT_DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Когда бэкенд перестанет принимать initData: `auth_date` + max-age. */
export function initDataExpiresAt(authDate: Date): Date {
  return new Date(authDate.getTime() + INIT_DATA_MAX_AGE_MS);
}

/** Платформа для `AppRoot` из telegram-ui: у iOS и macOS свой вид компонентов, у остальных общий. */
export type UiPlatform = 'ios' | 'base';

export function toUiPlatform(tgWebAppPlatform: string | undefined): UiPlatform {
  return tgWebAppPlatform === 'ios' || tgWebAppPlatform === 'macos' ? 'ios' : 'base';
}

/**
 * Имя и фамилия из поля `user` сырой строки initData: ими предзаполняется ФИО в форме регистрации.
 * Строку не пересобираем и не проверяем подпись — это забота бэкенда; здесь только чтение для удобства пользователя.
 */
export function fullNameFromInitData(rawInitData: string | undefined): string {
  if (!rawInitData) {
    return '';
  }
  try {
    const user = new URLSearchParams(rawInitData).get('user');
    if (!user) {
      return '';
    }
    const { first_name: firstName, last_name: lastName } = JSON.parse(user) as { first_name?: unknown; last_name?: unknown };
    return [firstName, lastName].filter((part): part is string => typeof part === 'string' && part.trim() !== '').join(' ');
  } catch {
    return '';
  }
}
