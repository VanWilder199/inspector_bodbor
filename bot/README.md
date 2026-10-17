# Бот подборщика (aiogram 3)

Тонкий бот: `/start`, `/new_report`, `/help` и кнопки открытия Mini App. В API и БД не ходит, состояния не хранит, FSM нет.
Все кнопки только inline или Menu Button: Mini App, открытый из кнопки обычной клавиатуры, не получает initData.

## Настройка

Создайте файл `.env` рядом с `Dockerfile` (шаблон `.env.example` не удалось создать из-за запрета записи, поэтому он здесь):

```dotenv
# Токен бота от @BotFather.
# ВАЖНО: должен совпадать с telegram.bot-token бэкенда (TELEGRAM_BOT_TOKEN),
# иначе подпись initData не сойдётся и все запросы Mini App получат 401.
TELEGRAM_BOT_TOKEN=

# Адрес Mini App (HTTPS), без завершающего слеша. Прод: https://app.site.by, разработка: URL туннеля.
MINIAPP_URL=https://app.site.by

# Direct Link Mini App (BotFather -> /newapp, см. раздел ниже). Для ссылок startapp; кодом бота пока не используется.
# MINIAPP_DIRECT_LINK=https://t.me/<bot>/app

# true — работать с тестовым окружением Telegram
TELEGRAM_TEST_ENV=false

LOG_LEVEL=INFO
```

- `TELEGRAM_BOT_TOKEN` должен совпадать с токеном бэкенда (`telegram.bot-token`), иначе подпись initData не сойдётся.
- `MINIAPP_URL` — HTTPS-адрес Mini App без завершающего слеша. Чтобы сменить адрес (например, новый туннель), поменяйте переменную и перезапустите бота: Menu Button обновляется при каждом старте.
- `TELEGRAM_TEST_ENV=true` — тестовое окружение Telegram.
- `TELEGRAM_BOT_SECRET` из `env.example` бэкенда нигде не используется, сюда не переносится.

## Команды и deep links

| Что | Куда ведёт inline-кнопка `web_app` |
|---|---|
| `/start` | главная (`MINIAPP_URL`) |
| `/start new` (`https://t.me/<bot>?start=new`) | `/reports/new` |
| `/start demand` | `/demand` |
| `/start report_<uuid>` | `/reports/<uuid>` |
| `/start <что-то другое>` | главная |
| `/new_report` | `/reports/new` |
| текст со ссылкой av.by | `/reports/new?url=<ссылка, закодированная целиком>` |
| любой другой текст | главная |

Ссылку av.by бот ищет простым регулярным выражением (домен `av.by` и его поддомены, схема необязательна), нормализация и строгая проверка — в Mini App. Payload в `/start` Telegram ограничивает 64 символами, `report_<uuid>` (43 символа) помещается. Кнопки `web_app` получают путь прямо в URL, параметр `startapp` им не нужен.

## Direct Link Mini App (BotFather)

Нужен для ссылок `https://t.me/<bot>/app?startapp=report_<id>`: их шлёт бэкенд в уведомлениях (BOT-03) и ими можно делиться в любом чате. Настраивается отдельно от Menu Button.

1. BotFather → `/newapp` → выберите бота.
2. Short name — `app`, URL — тот же, что `MINIAPP_URL` (например, `https://app.site.by`).
3. Ссылка `https://t.me/<bot>/app` — значение `MINIAPP_DIRECT_LINK`.
4. Для main Mini App (`https://t.me/<bot>?startapp=…`) отдельно включите Main App в настройках бота в BotFather.

`start_param` из `startapp` разбирает сам Mini App (MINI-02): `new`, `report_<uuid>`, `demand`. Mini App, открытый по Direct Link, получает initData.

## Запуск вручную

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest                 # тесты
python -m app          # long polling
```

Docker: `docker build -t podbor-bot .` и `docker run --env-file .env podbor-bot`.

**На один токен должен быть запущен ровно один экземпляр бота** (два `getUpdates` одновременно конфликтуют). Бэкенд параллельно может вызывать `sendMessage` тем же токеном, это не мешает.
