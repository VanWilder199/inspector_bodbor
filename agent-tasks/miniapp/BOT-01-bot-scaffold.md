# BOT-01: Каркас бота — `/start`, Menu Button, конфигурация

## Цель
Тонкий aiogram-бот, который открывает Mini App с валидным initData, без собственного состояния.

## Контекст
- **Источник:** `PLAN_FRONTEND_MINIAPP.md`, раздел 4.1 (назначение и команды), 4.2 (Menu Button и Direct Link), 4.3 (конфигурация), фича BOT-1
- **Бэкенд:** не нужен (бот не ходит в API и БД)

## Зависимости
- Нет. Для открытия реального Mini App нужен HTTPS URL (MINI-04 или любая статика).

## Требования

### Принцип: бот тонкий
Не ходит в API и БД, не хранит состояние, **FSM нет** (`WAITING_URL` из старого `tech-stack-detailed.md` не нужен — ссылку av.by подборщик вставляет прямо в Mini App).

### Команды
| Команда / событие | Ответ |
|---|---|
| `/start` | Приветствие + **inline**-кнопка `InlineKeyboardButton(web_app=WebAppInfo(url=MINIAPP_URL))` |
| `/start <payload>` | То же, кнопка ведёт на соответствующий путь (реализация — BOT-2) |
| `/help` | Короткая инструкция и контакт поддержки |
| любой другой текст | Подсказка с кнопкой «Открыть приложение» |

### Критично: только inline или Menu Button
**Никогда reply-клавиатура** (`KeyboardButton(web_app=…)`) — такой режим Mini App не получает initData (рассчитан на `sendData`), и все запросы к `/inspector/**` упадут с `401`. initData приходит только из inline-кнопки, Menu Button, прямой ссылки (`t.me/<bot>/<app>`) и attachment menu.

### Menu Button
При старте: `bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="Отчёты", web_app=WebAppInfo(url=MINIAPP_URL)))`. Надёжнее разовой настройки в BotFather, потому что URL меняется между окружениями (туннель в разработке).

### Конфигурация (`config.py`, pydantic-settings)
| Переменная | Назначение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | **Тот же**, что у бэкенда (`telegram.bot-token`) — иначе подпись initData не сойдётся |
| `MINIAPP_URL` | `https://app.site.by` (прод) или URL туннеля |
| `MINIAPP_DIRECT_LINK` | `https://t.me/<bot>/app` (для BOT-2) |
| `TELEGRAM_TEST_ENV` | `true` — тестовое окружение Telegram |
| `LOG_LEVEL` | уровень логов |

`TELEGRAM_BOT_SECRET` из `env.example` нигде не используется — удалить или задокументировать, не переносить бездумно.

### Структура
`bot/app/__main__.py`, `config.py`, `handlers/start.py`, `handlers/fallback.py`, `keyboards.py`, `requirements.txt` (`aiogram>=3.13`, `pydantic-settings`), `Dockerfile` (`python:3.12-slim`), тесты хендлеров на `pytest` + aiogram-моках.

### Режим — long polling
`dp.start_polling()`. Вебхук не нужен (нет платежей, нагрузки нет). **Запущен ровно один экземпляр бота** на токен (конфликт `getUpdates` vs `getUpdates`/webhook).

## Acceptance Criteria
- [ ] `/start` присылает приветствие с inline-кнопкой, и Mini App открывается **с initData** (проверить `GET /inspector/`)
- [ ] Menu Button «Отчёты» открывает Mini App
- [ ] смена `MINIAPP_URL` + рестарт обновляют Menu Button
- [ ] `docker build ./bot` собирается, контейнер стартует с env
- [ ] тесты хендлеров (`pytest`) проверяют клавиатуры
- [ ] нигде в коде нет reply-клавиатуры с `web_app`

## Gotchas
1. **Reply-клавиатура не даёт initData** — только inline/Menu Button/Direct Link/attachment menu.
2. **Токен бота должен совпадать с `TELEGRAM_BOT_TOKEN` бэкенда** — иначе HMAC-подпись initData не пройдёт проверку.
3. Бот и бэкенд оба могут одновременно звать `sendMessage` этим токеном — это не конфликт (конфликт только между двумя `getUpdates`/webhook).
4. `TELEGRAM_BOT_SECRET` в `env.example` — мёртвая переменная, разобраться перед копированием конфигурации.

## Промпт для агента
```
Реализуй каркас Telegram-бота согласно BOT-01-bot-scaffold.md:

1. bot/ (aiogram 3, pydantic-settings): app/__main__.py, config.py, handlers/start.py, handlers/fallback.py, keyboards.py
2. /start — приветствие + inline-кнопка WebAppInfo(url=MINIAPP_URL), НЕ reply-клавиатура
3. /help — инструкция
4. fallback на любой другой текст — кнопка «Открыть приложение»
5. set_chat_menu_button(MenuButtonWebApp) и set_my_commands при старте
6. requirements.txt, Dockerfile (python:3.12-slim), .env.example бота
7. Запуск через long polling (dp.start_polling)
8. Тесты pytest на хендлеры и клавиатуры (убедиться, что используется inline/web_app, а не reply keyboard)

Проверь:
- /start открывает Mini App с initData (не reply-клавиатура!)
- Menu Button работает и обновляется при смене MINIAPP_URL + рестарте
- docker build ./bot собирается
- TELEGRAM_BOT_TOKEN в .env.example помечен как "должен совпадать с бэкендом"
```
