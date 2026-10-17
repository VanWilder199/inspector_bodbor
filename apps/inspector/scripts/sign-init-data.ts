/*
 * Подпись initData для мок-окружения Mini App в браузере (аналог TelegramTestDataGenerator из тестов бэкенда).
 *
 * Токен бота НЕ хранится в репозитории. Берите его из `telegram.bot-token` в
 * `src/main/resources/application-local.yml` бэкенда и передавайте переменной окружения:
 *
 *   TELEGRAM_BOT_TOKEN=<токен> npm run sign-init-data -w @podbor/inspector
 *   TELEGRAM_BOT_TOKEN=<токен> npm run sign-init-data -w @podbor/inspector -- --id 42 --first-name Иван --username ivan
 *
 * Скрипт печатает одну строку initData. Её кладут в `apps/inspector/.env.local` как VITE_MOCK_INIT_DATA=<строка>.
 * Подпись живёт 24 часа (telegram.max-age на бэкенде), потом нужно подписать заново.
 *
 * Запуск идёт через `node --experimental-strip-types`, поэтому здесь только синтаксис TypeScript, который стирается
 * без преобразований (без enum и параметров-свойств).
 */
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export interface SignInitDataOptions {
  botToken: string;
  userId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  /** Unix-время подписи в секундах. По умолчанию — сейчас. */
  authDate?: number;
}

/**
 * Алгоритм из документации Telegram (и `TelegramInitDataValidator` бэкенда):
 * ключ = HMAC-SHA256("WebAppData", botToken); hash = HMAC-SHA256(ключ, data-check-string),
 * где data-check-string — пары `ключ=значение` без `hash`, отсортированные по ключу и склеенные через `\n`.
 * Значения кодируются через encodeURIComponent (пробел как %20): бэкенд разбирает строку по `&` и декодирует значения.
 */
export function signInitData(options: SignInitDataOptions): string {
  const { botToken, userId, firstName, lastName, username, authDate = Math.floor(Date.now() / 1000) } = options;

  const user = JSON.stringify({
    id: userId,
    first_name: firstName,
    ...(lastName ? { last_name: lastName } : {}),
    ...(username ? { username } : {}),
    language_code: 'ru',
  });
  const fields: Record<string, string> = { auth_date: String(authDate), user };

  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return [...Object.entries(fields), ['hash', hash]].map(([key, value]) => `${key}=${encodeURIComponent(value ?? '')}`).join('&');
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function main(): void {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('Задайте токен бота: TELEGRAM_BOT_TOKEN=<telegram.bot-token из application-local.yml бэкенда>');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  console.log(
    signInitData({
      botToken,
      userId: Number(readArg(args, 'id') ?? 1),
      firstName: readArg(args, 'first-name') ?? 'Тест',
      lastName: readArg(args, 'last-name'),
      username: readArg(args, 'username'),
    }),
  );
}

// Запуск из консоли; при импорте (тест) main() не вызывается
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
