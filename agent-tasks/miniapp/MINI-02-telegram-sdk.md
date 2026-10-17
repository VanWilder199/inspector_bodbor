# MINI-02: Telegram SDK — инициализация, тема, кнопки, окружение

## Цель
Приложение корректно живёт внутри Telegram (тема, MainButton/BackButton, свайпы, closing confirmation) и в обычном браузере через мок-окружение.

## Контекст
- **Источник:** `PLAN_FRONTEND_MINIAPP.md`, раздел 3.1 (SDK, initData, сессия), раздел 3.2 (интеграция с Telegram UI), раздел 1.3 (`startapp`-параметры), фича MINI-2
- **Бэкенд:** не нужен

## Зависимости
- MINI-01

## Требования

### Инициализация (`src/telegram/init.ts`)
Последовательность до рендера роутера (раздел 3.1):
1. `init()`;
2. `retrieveLaunchParams()` → `tgWebAppStartParam`, `tgWebAppPlatform`, `tgWebAppThemeParams`;
3. `retrieveRawInitData()` → строка для заголовка `X-Telegram-Data` (используется в MINI-03);
4. `miniApp.mount()`, `themeParams.mount()` + `bindCssVars()`, `viewport.mount()` + `expand()`, `backButton.mount()`, `mainButton.mount()`, `closingBehavior.mount()`, `swipeBehavior.mount()`.
Все вызовы — через `isAvailable()`-guard (старые клиенты Telegram не всё поддерживают).

### Dev-окружение вне Telegram
`mockTelegramEnv()` подставляет тестовые launch params с initData, подписанным **локальным** токеном `1234567890:AAFg…` из `application-local.yml`. Скрипт `scripts/sign-init-data.ts` (аналог `TelegramTestDataGenerator` из бэкенд-тестов) генерирует подпись. В проде вне Telegram — экран `/not-in-telegram`.

### Хуки
- `useMainButton(text, onClick, { enabled, loading })` — снимает обработчик при unmount, управляет видимостью/лоадером.
- `useBackButton()` — показывается везде, кроме корневых табов (`/reports`, `/demand`, `/profile`, `/pending`); `navigate(-1)`, в мастере — предыдущий шаг.
- `useClosingConfirmation(enabled)` — `enableConfirmation()` пока есть `dirty`-черновики или активная очередь загрузок.
- `useHaptic()` — `notificationOccurred('success'/'error')` на сохранение/отправку/ошибку, `selectionChanged()` на выбор OK/WARN/BAD.
- `swipeBehavior.disableVertical()` — включать только на экранах мастера.

### Тема
`themeParams.bindCssVars()` → `--tg-theme-*`. `AppRoot` из telegram-ui получает `appearance` из `miniApp.isDark`, `platform` из `tgWebAppPlatform` (ios/base). Статусные цвета `ok/warn/bad` — токены `@podbor/ui` поверх темы. `miniApp.setHeaderColor('bg_color')`.

### `startapp`-параметры (раздел 1.3)
Парсинг `start_param` → начальный роут:
| `start_param` | Роут |
|---|---|
| — | `/` |
| `new` | `/reports/new` |
| `report_<uuid>` | `/reports/<uuid>` |
| `demand` | `/demand` |
Валидация регуляркой (`[A-Za-z0-9_-]{1,512}`), неизвестный параметр → `/`.

## Acceptance Criteria
- [ ] в Telegram (проверка после MINI-04) цвета следуют светлой/тёмной теме и меняются без перезагрузки
- [ ] BackButton скрыт на корневых экранах, ведёт назад на вложенных
- [ ] MainButton показывается/скрывается хуком, обработчик снимается при уходе с экрана (нет двойных срабатываний)
- [ ] `startapp=report_<uuid>` открывает `/reports/<uuid>`, мусорный параметр ведёт на `/`
- [ ] в обычном браузере в dev приложение работает с мок-окружением
- [ ] `mockTelegramEnv` и локальный тестовый токен бота не попадают в prod-сборку (проверить бандл)

## Gotchas
1. **`HashRouter` запрещён** (уже решено в MINI-01) — launch params во фрагменте URL.
2. SDK кеширует launch params в `sessionStorage`, первый рендер — строго после `retrieveLaunchParams()`.
3. `requestWriteAccess()` нужен после регистрации подборщика, иначе бэкенд получит `403 Forbidden: bot can't initiate conversation` при попытке `sendMessage` (но сам вызов — задача MINI-05/BOT-03, здесь только наличие API-обёртки).
4. Prod-сборка должна **исключать** мок-окружение и тестовый токен — проверять явно (например, `import.meta.env.DEV`-гейт + анализ бандла).

## Промпт для агента
```
Реализуй интеграцию с Telegram SDK согласно MINI-02-telegram-sdk.md:

1. src/telegram/init.ts: init(), retrieveLaunchParams(), retrieveRawInitData(), mount() для miniApp/themeParams/viewport/backButton/mainButton/closingBehavior/swipeBehavior, всё через isAvailable()-guard
2. src/telegram/mock.ts + scripts/sign-init-data.ts: mockTelegramEnv с initData, подписанным локальным токеном из application-local.yml, активируется только в dev
3. Хуки: useMainButton, useBackButton, useClosingConfirmation, useHaptic
4. Привязка темы: bindCssVars, appearance из miniApp.isDark, platform из tgWebAppPlatform
5. Парсинг start_param по таблице из раздела 1.3 плана (regex [A-Za-z0-9_-]{1,512}, неизвестный → /)
6. Экран /not-in-telegram для прода без Telegram-окружения
7. swipeBehavior.disableVertical() на экранах мастера

Проверь:
- в dev приложение запускается с мок-окружением
- startapp=report_<uuid> ведёт на /reports/<uuid>, мусор — на /
- mockTelegramEnv и тестовый токен бота отсутствуют в prod-бандле (собери и проверь grep по dist)
```
