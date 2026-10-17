# BOT-02: `/new_report`, deep links, Direct Link Mini App

## Цель
Быстрый вход в нужный экран Mini App прямо из бота.

## Контекст
- **Источник:** `PLAN_FRONTEND_MINIAPP.md`, раздел 4.1 (команды), 4.2 (Menu Button и Direct Link), фича BOT-2
- **Бэкенд:** не нужен (Bot API только)

## Зависимости
- BOT-01, MINI-02 (разбор `start_param` на стороне Mini App), MINI-07 (приём `?url=` на экране создания отчёта)

## Требования

### `/new_report`
«Вставьте ссылку av.by в приложении» + inline-кнопка `WebAppInfo(url=f"{MINIAPP_URL}/reports/new")`.

### Распознавание ссылки av.by в произвольном сообщении
Любой текст с ссылкой av.by → подсказка «Создайте отчёт в приложении» + inline-кнопка `WebAppInfo(url=f"{MINIAPP_URL}/reports/new?url=<urlencoded>")` (Mini App подставит ссылку в поле, MINI-07 уже умеет читать `?url=`). Любой другой текст → подсказка с кнопкой «Открыть приложение».

### Direct Link Mini App
BotFather → `/newapp` → short name `app` → URL Mini App. После этого работают ссылки `https://t.me/<bot>/app?startapp=report_<id>` — используются в уведомлениях (BOT-03), можно слать в любом чате. Для main Mini App (`t.me/<bot>?startapp=`) — включить Main App в BotFather отдельно.

### `/start <payload>`
Deep link `t.me/<bot>?start=<payload>` — кнопка ведёт на соответствующий путь (та же логика сопоставления `start_param`, что в MINI-02, раздел 1.3).

### Команды
`bot.set_my_commands([...])` при старте — зарегистрировать `/start`, `/new_report`, `/help`.

## Acceptance Criteria
- [ ] `/new_report` открывает Mini App сразу на создании отчёта
- [ ] отправка ссылки av.by боту даёт кнопку, которая открывает Mini App с подставленной ссылкой
- [ ] `https://t.me/<bot>/app?startapp=report_<id>` открывает отчёт
- [ ] во всех случаях Mini App получает initData (не reply-клавиатура — см. BOT-01)

## Gotchas
1. Все кнопки — **только inline/web_app**, повторение гочи BOT-01: reply-клавиатура не передаёт initData.
2. Direct Link (`/newapp` в BotFather) — отдельная настройка от Menu Button, нужна именно для `startapp=`-ссылок в уведомлениях.
3. Распознавание av.by-ссылки в тексте — достаточно простого поиска домена, не нужен тот же уровень строгости, что в клиентской нормализации URL (MINI-07) — бот просто передаёт строку дальше, финальная валидация — на Mini App.

## Промпт для агента
```
Реализуй deep links и /new_report согласно BOT-02-deep-links.md:

1. /new_report: кнопка WebAppInfo(url=f"{MINIAPP_URL}/reports/new")
2. Распознавание ссылки av.by в произвольном тексте сообщения (простой поиск домена) → кнопка WebAppInfo(url=f"{MINIAPP_URL}/reports/new?url=<urlencoded>")
3. Fallback на прочий текст → кнопка «Открыть приложение»
4. /start <payload> — проброс payload в URL Mini App (та же логика start_param, что на фронте в MINI-02)
5. Документация по настройке Direct Link Mini App в BotFather (/newapp, short name "app")
6. bot.set_my_commands при старте: /start, /new_report, /help

Проверь все acceptance criteria, убедись что все новые кнопки — inline/web_app, не reply-клавиатура.
```
