# MINI-03: API-клиент и обработка ошибок

## Цель
Единый слой доступа к `/inspector/**`, который умеет аутентифицировать каждый запрос initData, разбирать все формы ошибок бэкенда и работать на моках.

## Контекст
- **Источник:** `PLAN_FRONTEND_MINIAPP.md`, раздел 2 (весь справочник API подборщика), раздел 2.10 (таблица errorCode → текст), раздел 3.1 (истечение initData), фича MINI-3
- **Бэкенд:** все 10 эндпоинтов из раздела 2.2 — 🟡 частично (основной путь работает, см. README). BE-2 (401 с errorCode) — желательное улучшение.

## Зависимости
- MINI-01, MINI-02 (нужен `retrieveRawInitData()`)

## Требования

### Структура
```
src/api/
├── client.ts        # apiFetch, ApiError, таймауты, различение сетевой/HTTP ошибки
├── types.ts         # ручные зеркала всех DTO (до BE-18/springdoc)
├── errors.ts         # таблица errorCode → текст (раздел 2.10)
├── inspector.ts      # функции для всех 10 эндпоинтов
src/mocks/
├── handlers.ts       # MSW-хендлеры на все эндпоинты + контракты BE-*
├── fixtures/
└── browser.ts
```

### client.ts — ключевые моменты
- Заголовок `X-Telegram-Data: <initData raw>` в **каждом** запросе к `/inspector/**` — ровно строка из `retrieveRawInitData()`, **без перекодирования** (пересборка строки ломает подпись, раздел 2.1).
- Таймаут через `AbortController`: 15 с по умолчанию, **30 с** для `POST /inspector/reports` (синхронный парсинг av.by, таймаут на бэкенде 10 с, но сеть может быть медленнее).
- Разбор `ProblemDetail` → `ApiError { status, errorCode?, errors?, detail }` (форматы: с `errorCode`, с массивом `errors[]` при `@Valid`, без `errorCode` для Spring MVC ошибок — битый JSON, неизвестный enum, невалидный UUID, несуществующий путь).
- **Любой `401` без `errorCode`** (сервер его не отдаёт сейчас, см. BE-2) трактуется как «сессия невалидна» → глобальный редирект на `/session-expired`.
- Различение сетевой ошибки (`TypeError` от `fetch`) и HTTP-ошибки — нужно для очереди загрузок и retry-политики (MINI-11).

### types.ts — DTO из раздела 2
`InspectorDto`, `RegisterInspectorRequest`, `CreateReportResponse`, `ReportDto` (с вложенными `ReportSectionDto`, `SectionItemDto`, `ReportMediaDto`, `PaintMeasurementDto`), `UpdateSectionRequest`/`SectionItemInput`, `UpdatePaintMeasurementsRequest`/`PaintMeasurementInput`, `UpdateConclusionRequest`, `PresignedUrlRequest`/`PresignedUrlResponse`, `ConfirmUploadRequest` (поле **`s3key`** со строчной `k`, не `s3Key`!). Деньги — `number` в копейках (`priceByn`). Статусы — строки в нижнем регистре (`inspectors.status`, `reports.status`), enum в теле запросов — в верхнем (`ItemStatus`, `MediaKind`, `SectionKey`).

### inspector.ts — функции
Все 10 эндпоинтов из таблицы 2.2, с точными путями, включая `GET /inspector/` **со слешем** (без него — `404` без `errorCode`, Spring Boot 3 trailing-slash matching выключен).

### errors.ts — таблица 2.10
Полная таблица `errorCode → текст`: `INSPECTOR_NOT_FOUND` (не ошибка → регистрация), `INSPECTOR_ALREADY_REGISTERED`, `INSPECTOR_BANNED`, `CAR_LISTING_NOT_FOUND`, `PARSER_ERROR`, `REPORT_NOT_FOUND`, `REPORT_ACCESS_DENIED`, `REPORT_NOT_EDITABLE`, `REPORT_INCOMPLETE`, `SECTION_NOT_FOUND`, `PANEL_NOT_FOUND`, `NOT_ALLOWDED_MEDIA_TYPE` (опечатка в коде ошибки — писать именно так), `MEDIA_NOT_FOUND`, `UNEXPECTED_ERROR`, `BAD_REQUEST`, `INTERNAL_SERVER_ERROR`, плюс безтелый `401`.

### Истечение сессии (раздел 3.1)
`authDate` из initData, `expiresAt = authDate + 24h` (константа должна совпадать с `telegram.max-age` на бэкенде). За 10 минут до `expiresAt` — ненавязчивый баннер. Очередь загрузок и автосохранение не стартуют новые запросы после `expiresAt`.

### MSW-моки
Хендлеры на все 10 эндпоинтов + контракты из раздела 5 (BE-5, BE-6, BE-7, BE-15 — как будущие эндпоинты, уже с моками, чтобы MINI-15/19/20/22 можно было начинать не дожидаясь бэкенда). Флаг `VITE_API_MOCKS`.

## Acceptance Criteria
- [ ] каждый запрос несёт `X-Telegram-Data`, строка передаётся без изменений
- [ ] ответ с `errorCode` показывает текст из таблицы 2.10, ответ без `errorCode` (400/404/500) — общий текст по статусу
- [ ] `400 BAD_REQUEST` с `errors[]` раскладывается по полям формы (`items[0].status` → поле пункта)
- [ ] любой `401` ведёт на `/session-expired` без бесконечных ретраев
- [ ] за 10 минут до `authDate + 24h` появляется баннер
- [ ] `GET /inspector/` вызывается со слешем на конце
- [ ] поле `s3key` (строчная `k`) используется именно в confirm-upload, `s3Key` — в ответе presigned
- [ ] с `VITE_API_MOCKS=1` все экраны работают без бэкенда
- [ ] unit-тесты на разбор `ProblemDetail` и на таблицу ошибок

## Gotchas
1. **`GET /inspector/` строго со слешем** — без него `404` без `errorCode`.
2. **401 всегда одинаковый**, без `errorCode` (`TELEGRAM_AUTH_INVALID`/`EXPIRED` до клиента не доходят, это BE-2). Различать истечение можно только по `auth_date` на клиенте.
3. **`s3key` (confirm) vs `s3Key` (presigned response)** — разный регистр, легко перепутать.
4. **`priceByn` в копейках.**
5. Пустой `items: []` или `measurements: []` в PUT, скорее всего, даёт `500` — клиент никогда не отправляет пустые списки (до BE-14).
6. Таймаут `POST /inspector/reports` должен быть заметно больше остальных — синхронный av.by-парсинг.

## Промпт для агента
```
Реализуй API-клиент для Mini App подборщика согласно MINI-03-api-client.md:

1. src/api/client.ts: apiFetch с X-Telegram-Data из retrieveRawInitData(), AbortController-таймауты (15с, 30с для создания отчёта), разбор ProblemDetail → ApiError, различение сетевой/HTTP ошибки, глобальный редирект на /session-expired при любом 401
2. src/api/types.ts: все DTO из раздела 2 плана PLAN_FRONTEND_MINIAPP.md (InspectorDto, ReportDto и вложенные, PresignedUrlRequest/Response с полем s3key в confirm!, и т.д.)
3. src/api/errors.ts: таблица errorCode → текст из раздела 2.10
4. src/api/inspector.ts: функции на все 10 эндпоинтов раздела 2.2, включая GET /inspector/ со слешем
5. Таймер истечения сессии по authDate + 24h с баннером за 10 минут
6. src/mocks/: MSW-хендлеры на все 10 эндпоинтов + заготовки под будущие BE-5/6/7/15 эндпоинты
7. Unit-тесты (vitest) на разбор ошибок и таблицу errorCode

Проверь:
- X-Telegram-Data передаётся без изменений
- 401 без errorCode ведёт на /session-expired
- s3key (confirm) и s3Key (presigned) не перепутаны
- VITE_API_MOCKS=1 включает моки для всех экранов
```
