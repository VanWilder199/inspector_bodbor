# MINI-04: Локальный запуск в Telegram через туннель

## Цель
Разработчик открывает локальный Mini App в настоящем Telegram на телефоне, и тот ходит в локальный бэкенд (и в MinIO для медиа).

## Контекст
- **Источник:** `PLAN_FRONTEND_MINIAPP.md`, раздел 4.4 (локальная разработка), фича MINI-4
- **Бэкенд:** 🟡 BE-17 нужен для проверки медиа на телефоне (публичный S3-endpoint); без него работает только `GET /inspector/` и остальные JSON-эндпоинты

## Зависимости
- MINI-03, BOT-01 (или ручная Menu Button в BotFather)

## Требования

### Вариант 1 — туннель (основной)
`cloudflared tunnel --url http://localhost:5175` (или ngrok) → `https://<random>.trycloudflare.com`. Этот URL:
- прописывается в `MINIAPP_URL` бота (Menu Button обновится при рестарте);
- добавляется в `vite.config.ts`: `server.allowedHosts: ['.trycloudflare.com']` (Vite 6 блокирует чужие хосты), `server.hmr.clientPort: 443`.
Бэкенд запускается с токеном **настоящего dev-бота** в `TELEGRAM_BOT_TOKEN` — тестовый токен из `application-local.yml` не подойдёт, потому что initData подписывает Telegram настоящим токеном.

### Вариант 2 — тестовое окружение Telegram
Отдельный аккаунт в test DC (iOS: 10 тапов по «Настройки» → Accounts → Login to another account → Test; Desktop: Shift+Alt+правый клик по «Добавить аккаунт»), бот через тестового `@BotFather`. В этом режиме Mini App можно открывать по `http://`, включая `http://127.0.0.1:5175` в Telegram Desktop. Bot API — `https://api.telegram.org/bot<token>/test/<method>`. Нужна поддержка `TELEGRAM_TEST_ENV` и в боте, и в Telegram-клиенте бэкенда (относится к BE-16, здесь только задокументировать).

### Вариант 3 — браузер без Telegram
`mockTelegramEnv` (MINI-02) + подписанный initData — для вёрстки и логики без телефона.

### S3 в локальной разработке — отдельная проблема
Presigned URL строится на `s3.endpoint = http://localhost:9000`. Телефон не достучится до `localhost` компьютера, а HTTPS-страница не сделает PUT на `http://` (mixed content). Нужно:
- поднять MinIO (в текущем `docker-compose.yml` его нет — координировать с BOT-04/BE-17);
- отдельный туннель на `:9000`;
- `S3_ENDPOINT=https://<minio-tunnel>` на бэкенде (подпись включает `host`, URL должен совпадать с тем, куда пойдёт браузер);
- CORS бакета должен разрешать origin туннеля Mini App.
Без BE-17 (разделение публичного/внутреннего S3-endpoint) эта настройка — временный ручной туннель, а не постоянное решение.

### Состав задачи
`apps/inspector/README.md` с инструкцией (dev-бот в BotFather, cloudflared для `:5175` и `:9000`, нужные env бэкенда), настройка `allowedHosts`, `eruda` подключён только в dev-сборке, скрипт `npm run tunnel` (если `cloudflared` установлен локально).

### Отладка на телефоне
iOS — «Настройки» → 10 тапов по версии → Allow Web View Inspection → Safari → Develop. Android — Telegram Settings → долгий тап по версии → Enable WebView Debug → `chrome://inspect`.

## Acceptance Criteria
- [ ] Mini App открывается из Menu Button dev-бота на iOS и Android
- [ ] `GET /inspector/` проходит с настоящим initData (бэкенд с токеном dev-бота)
- [ ] HMR работает через туннель
- [ ] `eruda` открывается на телефоне в dev-сборке и отсутствует в prod-сборке
- [ ] README описывает оба варианта (туннель и тестовое окружение Telegram) и проблему S3/mixed content

## Gotchas
1. **Токен dev-бота у бэкенда и бота должен совпадать**, тестовый токен из `application-local.yml` не подписывает настоящий Telegram initData.
2. **Mixed content для S3**: HTTPS-страница не может PUT на `http://localhost:9000` — без туннеля на MinIO медиа не проверить на реальном телефоне.
3. Vite 6 блокирует неизвестные хосты по умолчанию — обязательно `allowedHosts`.
4. `eruda` и мок-окружение не должны попасть в prod-сборку (см. также MINI-02).

## Промпт для агента
```
Настрой локальный запуск Mini App в Telegram через туннель согласно MINI-04-tunnel.md:

1. apps/inspector/README.md: инструкция по cloudflared/ngrok для :5175, dev-бот в BotFather, настройка TELEGRAM_BOT_TOKEN бэкенда на dev-бота
2. vite.config.ts: allowedHosts для .trycloudflare.com (или домена ngrok), hmr.clientPort: 443
3. Раздел про тестовое окружение Telegram как альтернативу (TELEGRAM_TEST_ENV)
4. Раздел про проблему S3/mixed content: нужен отдельный туннель на :9000 для MinIO, S3_ENDPOINT на бэкенде должен указывать на туннель
5. eruda подключить только при import.meta.env.DEV
6. Скрипт npm run tunnel, если cloudflared доступен

Проверь (если есть доступ к Telegram на реальном устройстве — иначе явно укажи, что шаг требует ручной проверки):
- Mini App открывается из Menu Button с initData
- GET /inspector/ проходит
- eruda отсутствует в prod build (grep по dist)
```
