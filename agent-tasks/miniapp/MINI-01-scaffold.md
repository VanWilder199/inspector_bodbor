# MINI-01: Каркас `apps/inspector`

## Цель
Приложение Mini App подборщика собирается и запускается в workspace, со всеми нужными зависимостями и прокси к API.

## Контекст
- **Источник:** `PLAN_FRONTEND_MINIAPP.md`, раздел 6, фича MINI-1; решения 2026-09-29 п. 1-2
- **Бэкенд:** не нужен

## Зависимости
- Нет. Для рендера `ReportView` нужен готовый `packages/ui` (DS-1 из `PLAN_FRONTEND_DESIGN.md`, как и в ADM-01).

## Требования

### Стек и структура
`apps/inspector` (Vite 6, React 19, TS ~5.9):
```
apps/inspector/
├── package.json          # @podbor/inspector
├── vite.config.ts        # порт 5175, base: '/', прокси /api
├── tsconfig.json         # extends tsconfig.base.json
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx            # роуты-заглушки из карты 1.2
│   └── index.css          # tailwind + @podbor/ui/theme.css
```
Зависимости: `@telegram-apps/telegram-ui`, `@telegram-apps/sdk-react`, `react-router`, `@tanstack/react-query`, `zustand`, `@podbor/ui`, `tailwindcss` (нужен только для `ReportView`, остальной UI — telegram-ui).

### vite.config.ts
- `base: '/'` (поддомен `app.site.by`, не подпуть — решение 2026-09-29 п.2);
- `server.port: 5175` (web — 5173, admin — 5174);
- `server.proxy['/api']` → `http://localhost:8080` с rewrite (как в `apps/web/vite.config.ts`);
- `server.allowedHosts` — заготовка под туннель (заполнится в MINI-04);
- `server.hmr.clientPort` — заготовка под туннель.

### Роуты-заглушки
Все пути из карты 1.2 плана (`/`, `/register`, `/pending`, `/banned`, `/reports`, `/reports/new`, `/reports/:id`, `/reports/:id/start`, `/reports/:id/section/:sectionKey`, `/reports/:id/paint`, `/reports/:id/video`, `/reports/:id/conclusion`, `/reports/:id/review`, `/reports/:id/done`, `/demand`, `/profile`, `/uploads`, `/session-expired`, `/not-in-telegram`) — просто заглушки-страницы, реальная логика придёт в MINI-02 и далее.

### nginx fallback
Прямой заход на `/reports/123` должен отдавать SPA (`try_files $uri /index.html`), а не 404. Для локальной разработки это даёт сам Vite dev server; для прод-сборки — задокументировать требование к nginx (конфиг появится в BOT-04).

## Acceptance Criteria
- [ ] `npm run dev:inspector` открывает приложение на `localhost:5175`
- [ ] `npm run build` и `npm run typecheck` проходят для всего workspace
- [ ] на тестовой странице рендерится `ReportView` из `@podbor/ui` на моке `apps/web/src/mocks/report.ts` (стили Tailwind не конфликтуют с telegram-ui)
- [ ] прямой заход на `/reports/123` в dev-режиме отдаёт SPA, а не 404
- [ ] `BrowserRouter`, не `HashRouter` (решение 3)

## Gotchas
1. **Не `HashRouter`.** Telegram передаёт launch params во фрагменте URL (`#tgWebAppData=...`), `HashRouter` перезапишет фрагмент раньше, чем SDK его прочитает.
2. **Порт 5175**, чтобы не конфликтовать с web (5173) и admin (5174).
3. `ReportView` на Tailwind, telegram-ui — свои стили; конфликт классов проверить сразу на тестовой странице.
4. `base: '/'` — Mini App живёт на отдельном поддомене `app.site.by`, не на подпути, в отличие от того, что можно было бы предположить по аналогии с админкой.

## Промпт для агента
```
Создай каркас приложения apps/inspector в монорепозитории согласно MINI-01-scaffold.md:

1. Структура apps/inspector/ с package.json (@podbor/inspector), vite.config.ts, tsconfig.json
2. Зависимости: @telegram-apps/telegram-ui, @telegram-apps/sdk-react, react-router, @tanstack/react-query, zustand, @podbor/ui, tailwindcss
3. vite.config.ts: base: '/', порт 5175, прокси /api → localhost:8080 с rewrite, заготовка allowedHosts/hmr.clientPort под туннель
4. src/main.tsx, src/App.tsx с react-router и роутами-заглушками по карте роутов из раздела 1.2 плана
5. src/index.css: tailwind + @podbor/ui/theme.css
6. Скрипт dev:inspector в корневом package.json
7. Тестовая страница с ReportView из @podbor/ui на моковых данных

Проверь:
- npm run dev:inspector запускается на 5175
- npm run build и typecheck проходят
- /reports/123 в dev отдаёт SPA
- используется BrowserRouter, не HashRouter
```
