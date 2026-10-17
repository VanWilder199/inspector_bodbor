# Mini App подборщика

Telegram Mini App инспектора (`@podbor/inspector`). Vite + React 19 + `@telegram-apps/telegram-ui` + TanStack Query.

## Запуск

```bash
npm install --force        # peer-конфликт telegram-ui с React 19; версии зафиксированы в overrides корня
npm run dev:mocks -w @podbor/inspector   # с MSW-моками, бэкенд не нужен
npm run dev -w @podbor/inspector         # без моков, прокси /api → localhost:8080
```

Требуется Node 22 (`.nvmrc`). Системная Node 20 не подойдёт.

## Проверка

```bash
npm run typecheck -w @podbor/inspector
npm run test -w @podbor/inspector
npm run build -w @podbor/inspector
```

## Локальный запуск в Telegram через туннель (MINI-04)

Чтобы открыть локальный Mini App на реальном телефоне в Telegram:

1. **Dev-бот в BotFather.** Создайте/возьмите бота и получите токен. **Внимание (gotcha 1):** у бэкенда
   `TELEGRAM_BOT_TOKEN` должен быть именно этого dev-бота, а не тестовый токен из `application-local.yml` —
   иначе подпись initData не сойдётся. В BotFather задайте Menu Button с адресом вашего туннеля (раздел Mini App).

2. **Запустите Vite через туннель:**
   ```bash
   npm run tunnel -w @podbor/inspector     # тот же vite, но VITE_TUNNEL=1
   cloudflared tunnel --url http://localhost:5175
   ```
   Получите `https://<random>.trycloudflare.com`. Скрипт `tunnel` включает `allowedHosts` для trycloudflare/ngrok
   и `hmr.clientPort: 443`, чтобы HMR работал через туннель. Без этого Vite 6 отвечает 403 на чужой Host.

3. **Пропишите URL туннеля** в `MINIAPP_URL` бота (`bot/.env`) — Menu Button обновится при рестарте.

4. **Debug на телефоне:** iOS — «Настройки» → 10 тапов по версии → Allow Web View Inspection → Safari → Develop.
   Android — долгий тап по версии Telegram → Enable WebView Debug → `chrome://inspect`. В dev-сборке (не в моках)
   доступен `eruda` (отладчик), в prod-сборке его нет.

### Проблема S3 / mixed content

HTTPS-страница Mini App **не может** сделать PUT на `http://localhost:9000` (mixed content), а телефон не достучится
до `localhost` компьютера. Чтобы проверить загрузку медиа на телефоне, нужен **отдельный туннель на MinIO**:

```bash
docker compose --profile local up -d minio
cloudflared tunnel --url http://localhost:9000
```

и на бэкенде `S3_ENDPOINT=https://<minio-tunnel>` (подпись включает `host`, URL должен совпадать с тем, куда пойдёт
браузер) + CORS бакета должен разрешать origin туннеля Mini App (см. `deploy/minio/cors.json`). Без BE-17
(разделение публичного/внутреннего S3-endpoint) это временный ручной туннель. Без него работают только JSON-эндпоинты
(`GET /inspector/` и пр.).

### Альтернатива — тестовое окружение Telegram

Отдельный аккаунт в тестовом DC (iOS: 10 тапов «Настройки» → Accounts → Login to another account → Test;
Desktop: Shift+Alt+правый клик по «Добавить аккаунт»), бот через тестового `@BotFather`. Mini App можно открывать
по `http://127.0.0.1:5175` в Telegram Desktop. Бот ходит в `https://api.telegram.org/bot<token>/test/<method>`
при `TELEGRAM_TEST_ENV=true`. Требует поддержки test-окружения в бэкенде (BE-16).

### Альтернатива — браузер без Telegram

`npm run dev:mocks` + `mockTelegramEnv` — для вёрстки и логики без телефона (см. MINI-02).

## Оффлайн-устойчивость (MINI-21)

Приложение различает три состояния сети (стор `src/network/networkStore.ts`):

- `online` — интерфейс есть и последний запрос прошёл;
- `offline` — `navigator.onLine === false` (нет интерфейса);
- `degraded` — интерфейс есть, но реальный запрос упал (сервер недоступен).

Поведение:

- системный баннер `OfflineBanner` в корневом лейауте сообщает о потере связи и что правки копятся локально;
- кеш профиля и открытых отчётов персистится в `localStorage` (`queryPersist.ts`) — переживает закрытие Mini App;
- запросы на чтение — `networkMode: 'offlineFirst'` (отдают закешированный ответ, если есть);
- создание отчёта блокируется без сети (кнопка гаснет, показывается подсказка);
- очередь загрузок ставится на паузу в офлайне и возобновляется автоматически при появлении сети (MINI-11);
- повторяемые мутации повторяются автоматически (автосохранение секций), не повторяемые — не повторяются (`POST reports`, `register` с 409=успех, `submit`).

### Ручной тест-план «авиарежим на каждом шаге мастера»

Проводится на реальном устройстве (iOS и Android): в WebView Telegram WebKit/Chromium ведут себя по-разному,
и часть сценариев автоматизации не поддаётся.

1. **Создание отчёта**: в авиарежиме на `/reports/new` кнопка «Создать отчёт» неактивна, подсказка о сети видна.
2. **Секция**: откройте отчёт, включите авиарежим, внесите правки — индикатор «Сохранено на устройстве», спиннеров нет.
   Включите сеть — правки уходят сами (без действий).
3. **Фото**: в авиарежиме загрузка ставится на паузу, баннер оффлайна виден; верните сеть — загрузки продолжаются.
4. **Видео**: то же, что фото; сообщение «не закрывайте приложение» не должно мешать поверке.
5. **Заключение/цена**: в авиарежиме текст остаётся на устройстве, на сервер уходит после возврата сети.
6. **Отправка**: в авиарежиме кнопка «Отправить» неактивна; после сети — доступна.
7. **Закрытие Mini App посреди загрузки**: файлы (память) теряются — это известное ограничение MVP (MINI-23
   перенесёт очередь в IndexedDB).

Ожидаемое поведение на каждом шаге: нет бесконечных спиннеров; все блокирующие действия объясняют причину;
правки и загрузки уходят автоматически при появлении сети.