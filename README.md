# inspector_bodbor — Mini App подборщика и бот (Telegram)

Отдельный репозиторий фронтенда: Telegram Mini App подборщика и тонкий aiogram-бот.
Вынесен из монорепо `backend-podbor/frontend` (2026-10-17): здесь только то, что касается подборщика.

## Состав

| Каталог | Что это |
|---|---|
| `apps/inspector` | Telegram Mini App подборщика (`@podbor/inspector`), Vite + React 19 + `@telegram-apps/telegram-ui` |
| `bot/` | Тонкий aiogram-бот: `/start`, `/new_report`, deep links, кнопки открытия Mini App |
| `packages/ui` | Общий UI-пакет `@podbor/ui` (превью `ReportView`, примитивы), зависимость Mini App |
| `deploy/` | nginx-конфиг и MinIO CORS для `docker compose` (BOT-04) |
| `docker-compose.yml` | Бот + статика Mini App + MinIO для локалки (профиль `local`) |
| `agent-tasks/miniapp/` | Разбивка задач на MINI-01…23 и BOT-01…04 (план и шаги) |
| `PLAN_FRONTEND_MINIAPP.md` | Исходный план Mini App и бота (из репозитория бэкенда) |

## Требования и запуск

- **Node 22** (`.nvmrc`). Системная Node 20 не подойдёт.
- Установка: `npm install --force` (известный конфликт peer-зависимостей `@telegram-apps/telegram-ui` с React 19; версии `react`/`react-dom` зафиксированы в `overrides` корневого `package.json`).

```bash
npm run typecheck -w @podbor/inspector
npm run test -w @podbor/inspector
npm run build -w @podbor/inspector
npm run dev -w @podbor/inspector            # без моков, прокси /api → localhost:8080
npm run dev:mocks -w @podbor/inspector      # с MSW-моками, бэкенд не нужен
```

Бот (Python 3.9+):

```bash
cd bot
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
cp .env.example .env   # заполнить TELEGRAM_BOT_TOKEN и MINIAPP_URL
python -m app          # long polling
```

### Docker Compose (BOT-04)

Поднимает nginx со статикой Mini App (`apps/inspector/dist`, нужно собрать заранее), бота и (в профиле `local`) MinIO
с бакетом и CORS для локальной разработки.

```bash
cp .env.example .env   # заполнить TELEGRAM_BOT_TOKEN и PUBLIC_HOST
npm run build -w @podbor/inspector
docker compose up -d                                          # nginx + bot (+ api)
docker compose --profile local up -d minio minio-init        # локальное S3-хранилище
```

- nginx раздаёт SPA (fallback на `index.html`, `index.html` без кеша, ассеты с хешами — долгий кеш) и проксирует `/api/` → `api:8080`.
- MinIO — только локальная разработка (`--profile local`), в проде используется внешний S3.

## Что реализовано

MVP-путь «регистрация → создание отчёта → заполнение → отправка на модерацию»:

- MINI-01…03, 05…10 — каркас, Telegram SDK, API-клиент, онбординг, навигация, создание отчёта, хаб/мастер, шаг секции, медиа-конвейер одной загрузки.
- MINI-11 — очередь загрузок в памяти (параллельность 2 фото / 1 видео, backoff, повтор, `/uploads`-логика через стор).
- MINI-13 — обязательные фото (слоты одометр/VIN/подборщик/документы) с подтверждением перед загрузкой.
- MINI-14 — видео обхода (глобальное, строго `sectionId=null` + `kind=VIDEO`, проверка типа/размера, подсказка для iPhone `.MOV`).
- MINI-16 — заключение и цена (конвертация BYN↔копейки в одном месте).
- MINI-17 — проверка и отправка: чек-лист по серверным данным, превью `ReportView`, `submit`, экран «Отправлено».
- MINI-21 — оффлайн-устойчивость: стор сети (online/offline/degraded), баннер, `persistQueryClient`, `networkMode: 'offlineFirst'`, блокировка создания отчёта без сети.
- MINI-23 — очередь загрузок в IndexedDB: задачи переживают закрытие Mini App, гидратация при старте, проверка квоты, `navigator.storage.persist()`.
- BOT-01, BOT-02 — каркас бота, deep links.
- BOT-04 — `docker-compose` (nginx + бот + MinIO для локалки), деплой статики.

Проверено: **514 тестов** Mini App, **50 тестов** бота, `typecheck` и `build` зелёные (Node 22).

## Заблокировано бэкендом (не реализовано здесь)

| Задача | Блокер |
|---|---|
| MINI-15 Замеры ЛКП (`/paint`) | BE-6 — справочник панелей / приём `panelCode` на бэкенде |
| MINI-19 «Мои отчёты» с сервера | BE-7 — эндпоинт `GET /inspector/reports` (сейчас локальный индекс) |
| MINI-20 «Спрос» (`/demand`) | BE-15 — эндпоинт `GET /inspector/demand` (страница-заглушка) |
| MINI-22 Серверный справочник чеклиста | BE-5 — эндпоинт (справочник хардкодится на клиенте) |
| BOT-03 Уведомления в Telegram | BE-16 — канал уведомлений на бэкенде |

Полная разбивка задач и статусы — в `agent-tasks/miniapp/TASKS_SUMMARY.md` и `README.md`.