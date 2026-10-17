# План: Telegram Mini App подборщика (`apps/inspector`) и бот (`bot/`)

> **Правило для агентов: ничего не запускать.** Не поднимать dev-серверы (`npm run dev:*`, `vite`, `vite preview`), туннели, бота (`python bot/...`, `docker compose up`), не открывать браузеры (в том числе headless Chrome/Firefox ради скриншотов), не стартовать заглушки бэкенда и любые фоновые процессы, не ходить `curl` на локальные порты. Проверка только статическая: `npm run typecheck`, `npm run build`, юнит-тесты (vitest). Всё, что требует живого приложения (визуальная проверка, прокси на бэкенд, MSW в браузере, проверка в Telegram, критерии вида «запускается на localhost»), делает и отмечает пользователь сам.
> Причина: в песочнице агент не может убить фоновые процессы (порты 5174 и 8080 остаются занятыми, Spring Boot потом не стартует), а браузер в ней не запускается.

## Контекст

Общий план фронта описан в `PLAN_FRONTEND.md`. Этот документ детализирует одно приложение: **Mini App подборщика** и тонкого **aiogram-бота** рядом с ним. Здесь собраны сценарии, точный контракт существующего API подборщика (проверен по коду на 2026-09-27, ветка `main` после PR #9), поведение клиента (SDK, автосохранение, очередь загрузок, плохой интернет), пробелы бэкенда с предлагаемыми контрактами и разбивка на фичи по 0,5–1 дню.

Визуальный дизайн сюда не входит, он будет позже. Здесь только функциональность, данные и поведение.

Решения, принятые до этого документа (см. `PLAN_FRONTEND.md`, «Зафиксированные решения»):
- Mini App — отдельное приложение `frontend/apps/inspector` на `@telegram-apps/telegram-ui` и `@telegram-apps/sdk-react`, **без MUI**. Отчёт показывается общим компонентом `ReportView` из `@podbor/ui`.
- Бот тонкий: `/start`, кнопка открытия Mini App, `/new_report`. FSM из `tech-stack-detailed.md` (`WAITING_URL`) не нужен: ссылку av.by подборщик вставляет прямо в Mini App.
- Исходящие уведомления подборщику шлёт **бэкенд** напрямую через Bot API (`sendMessage` по `telegram_user_id`), а не бот.

Легенда статусов: **готово** — эндпоинт есть и работает; **частично** — есть, но с оговорками; **нет** — нужен бэкенд.

---

## Зафиксированные решения этого плана

1. **Mini App и API живут на одном origin.** Mini App ходит на `/api/*`. Nginx в проде и Vite в разработке проксируют запросы на `api:8080` и срезают префикс, как уже сделано в `apps/web/vite.config.ts`. Причина: в `SecurityConfig` нет CORS, а запрос с кастомным заголовком `X-Telegram-Data` вызывает preflight `OPTIONS`. Цепочка `/inspector/**` требует аутентификацию (`SecurityConfig.java:34-35`), поэтому preflight получит 401, и браузер не пропустит ни один запрос. Один origin снимает проблему целиком. CORS на API нужен, только если Mini App окажется на другом домене (см. BE-1).
2. **CORS на S3-бакете нужен обязательно.** PUT по presigned URL уходит напрямую в S3 (hoster.by или MinIO), а это другой origin.
3. **Роутер `BrowserRouter`, не `HashRouter`; база — корень** (адрес и nginx уточнены в решениях 2026-09-29, п. 2). Telegram передаёт launch params (`tgWebAppData` и другие) во фрагменте URL `#...`. HashRouter перезапишет фрагмент до того, как SDK его прочитает. SDK кеширует launch params в `sessionStorage`, но первый рендер должен идти после `retrieveLaunchParams()`.
4. **Сервер — источник истины, `localStorage` — страховка.** Черновик хранится локально поштучно (по секциям, ЛКП, заключению) с флагом `dirty`. Грязные куски отправляются на сервер, чистые берутся с сервера.
5. **Очередь загрузок хранится в IndexedDB, а не в `localStorage`.** Фото и видео — это Blob размером в мегабайты, а у `localStorage` лимит около 5 МБ и только строки.
6. **Все фото перед загрузкой перекодируются в JPEG на клиенте.** Это решает сразу три задачи: HEIC (бэкенд принимает только `image/png`, `image/jpeg`, `video/mp4`, см. `MediaServiceImpl.java:30-34`), размер файла и утечку GPS из EXIF, потому что canvas не переносит метаданные.
7. **Имя файла для S3 генерирует клиент (`<uuid>.jpg`), пока бэкенд этого не делает.** `fileName` без санитизации попадает в S3-ключ (`MediaServiceImpl.java:110-122`). Одинаковые имена (`IMG_0001.jpg`) перезапишут друг друга.
8. **Типы API пишутся руками в `apps/inspector/src/api/types.ts`** как зеркало DTO. Когда появится springdoc (BE-18), их заменит `@podbor/api`. Так же сделано в `packages/ui/src/report/types.ts`.
9. **Моки через MSW.** Все фичи, для которых нет бэкенда, делаются на моках с контрактом из раздела 5. После реализации бэкенда моки выключаются флагом.

## Решения 2026-09-29 (уточняют и частично заменяют список выше)

Контракт API повторно сверен с кодом 2026-09-29 (коммит `153ef5c`), расхождений нет. Фронт живёт в отдельном репозитории, пути `frontend/...` читать относительно его корня.

1. **UI — `@telegram-apps/telegram-ui`, как и было.** Покупатель и админка на shadcn, Mini App сознательно выглядит нативно для Telegram. `ReportView` (Tailwind) подключается рядом, как описано в 3.7.
2. **Адрес — поддомен `app.site.by`** (заменяет решение 3 в части базы). SPA в корне, `BrowserRouter` без basename, Vite `base: '/'`. Отдельный `server` в nginx со своим `location /api/` (same-origin, CORS на API не нужен). `MINIAPP_URL = https://app.site.by`, web_app-кнопки ведут на `https://app.site.by/reports/<id>`. В CORS бакета — origin `https://app.site.by`. Правило «не HashRouter» остаётся в силе.
3. **Устойчивость к сети — упрощённо для MVP** (заменяет решение 5):
   - черновик — как в плане, в `localStorage` с `dirty`-флагами (3.3 без изменений);
   - очередь загрузок живёт **в памяти**, пока Mini App открыт: повторы с backoff, пауза в офлайне, возобновление по `online`/`activated`. IndexedDB, восстановление очереди после закрытия и `persistQueryClient` — во втором этапе;
   - пока очередь не пуста, включена closing confirmation и виден баннер «Не закрывайте приложение, идёт загрузка N фото»; если всё же закрыли — незагруженные фото нужно выбрать заново (экран секции показывает, чего не хватает, по серверным данным);
   - миниатюры своих фото — `URL.createObjectURL` в памяти; после перезапуска фото показываются по серверному `url` (BE-8), поэтому BE-8 для MVP становится важнее;
   - MINI-11 упрощается, MINI-21 переносится во второй этап (раздел 6).
4. **Уведомления подборщику — все в Telegram, самые важные дублируются на email** (таблица 4.6, BE-16): на email дополнительно уходят «отчёт опубликован», «выплата сформирована / оплачена», «верификация» и «бан». Остальное (доработка, удаление, продажа) — только Telegram.

---

## 1. Сценарии и карта экранов

### 1.1. Сценарии

**A. Первый вход и регистрация.**
1. Подборщик нажимает `/start` в боте, затем кнопку «Открыть» (inline `WebAppInfo`) или Menu Button.
2. Mini App стартует и вызывает `GET /inspector/` (со слешем на конце, см. 2.3).
3. Ответ `404 INSPECTOR_NOT_FOUND` означает «не зарегистрирован». Показываем форму: ФИО (предзаполнено из `initData.user.first_name` и `last_name`), телефон, email.
4. `POST /inspector/register` возвращает `InspectorDto` со `status: "pending"`, и открывается экран ожидания верификации.

**B. Ожидание верификации.** Экран «Заявка на проверке». Статус перезапрашивается при каждом открытии Mini App и при возврате в него (событие активации). Когда админ верифицирует, бэкенд присылает сообщение в Telegram (BE-16), подборщик открывает Mini App и видит главный экран.
> Сейчас бэкенд **не запрещает** `pending` создавать и отправлять отчёты: проверяется только `banned` (`InspectorController.java:48`). Mini App сам не пускает `pending` в мастер. Серверная проверка — BE-3.

**C. Бан.** `status: "banned"` показывает экран «Аккаунт заблокирован» без действий. Причину бана API не отдаёт, она уходит только в уведомление (`InspectorServiceImpl.java:106-107`).

**D. Создание отчёта по ссылке av.by.** Главный экран → «Новый отчёт» → поле ссылки (плюс кнопка «Вставить» из буфера, если доступно `navigator.clipboard.readText`; в Telegram iOS доступно не всегда) → клиентская нормализация и проверка домена → `POST /inspector/reports` → `{ reportId }` → переход в мастер. Парсер ходит на av.by синхронно, таймаут 10 с (`AvByParser.java:21`), поэтому нужен явный лоадер «Загружаем объявление…».

**E. Пошаговый мастер.** Шаги:
`Старт осмотра (обязательные фото)` → `7 секций по порядку` (ЛКП включает замеры толщины) → `Видео обхода` → `Заключение и цена` → `Проверка и превью` → `Отправка`.
Каждая секция устроена одинаково: инструкция, фото, оценка каждого пункта (OK/WARN/BAD) с комментарием, итог секции (`summary`). MainButton — «Далее», BackButton — назад по шагам. Автосохранение срабатывает при изменениях и при уходе с шага.

**F. Загрузка медиа.** Фото делается камерой или выбирается из галереи, затем сжимается, конвертируется из HEIC, попадает в очередь, получает presigned URL, загружается PUT в S3 и подтверждается через confirm. Прогресс виден на миниатюре и в общем индикаторе очереди. Ошибки повторяются автоматически. Если Mini App закрыли, очередь продолжится при следующем открытии.

**G. Отправка на модерацию.** Экран «Проверка» показывает локальный чек-лист «что осталось заполнить» по тем же правилам, что `submitForModeration` (раздел 2.8), и превью через `ReportView`. Кнопка «Отправить» вызывает `POST .../submit`, дальше экран «Отправлено». Статус становится `pending_review`, отчёт только для чтения.

**H. Доработка (`revision_required`).** Уведомление в Telegram (BE-16) с кнопкой «Открыть отчёт» ведёт в Mini App с `startapp=report_<id>`. Баннер показывает причину (API её сейчас не отдаёт, см. BE-8). Мастер снова редактируемый, повторная отправка устроена так же, как G.

**I. Мои отчёты.** Список с фильтрами: черновики, на модерации, на доработке, опубликованные. **Эндпоинта нет** (BE-7). До его появления используется локальный индекс созданных на этом устройстве `reportId` и `GET` по каждому.

**J. Спрос.** Машины, отсортированные по числу ожидающих покупателей, с кнопкой «Создать отчёт» (ссылка av.by подставляется из `avbyListingUrl`). **Эндпоинта нет** (BE-15).

### 1.2. Карта роутов

База — корень `app.site.by` (решение 2026-09-29, п. 2; nginx отдаёт `index.html` как fallback). Пути ниже — от корня.

| Роут | Экран | Кто видит | API |
|---|---|---|---|
| `/` | Bootstrap: SDK → `GET /inspector/` → редирект по статусу | все | `GET /inspector/` |
| `/register` | Регистрация | не зарегистрирован | `POST /inspector/register` |
| `/pending` | Ожидание верификации | `pending` | `GET /inspector/` (перезапрос) |
| `/banned` | Заблокирован | `banned` | — |
| `/reports` | Мои отчёты (главная, таб 1) | `verified` | BE-7 (временно локальный индекс) |
| `/reports/new` | Новый отчёт по ссылке | `verified` | `POST /inspector/reports` |
| `/reports/:id` | Хаб отчёта: список шагов с прогрессом, статус, баннер доработки | владелец | `GET /inspector/reports/{id}` |
| `/reports/:id/start` | Обязательные фото (одометр, VIN, подборщик у машины, документы) | владелец | медиа (BE-11 для тегов) |
| `/reports/:id/section/:sectionKey` | Шаг секции (`EXTERIOR` … `DOCUMENTS`) | владелец | `PUT .../sections/{sectionId}`, медиа |
| `/reports/:id/paint` | Замеры ЛКП (подшаг секции `PAINT`) | владелец | `PUT .../paint`, BE-6 |
| `/reports/:id/video` | Видео обхода | владелец | медиа (глобальное, `sectionId = null`) |
| `/reports/:id/conclusion` | Заключение и цена | владелец | `PUT .../conclusion` |
| `/reports/:id/review` | Чек-лист готовности, превью `ReportView`, отправка | владелец | `POST .../submit` |
| `/reports/:id/done` | «Отправлено на модерацию» | владелец | — |
| `/demand` | Спрос (таб 2) | `verified` | BE-15 |
| `/profile` | Профиль и статус (таб 3) | все зарегистрированные | `GET /inspector/` |
| `/uploads` | Очередь загрузок (bottom sheet или экран) | все | — |
| `/session-expired` | «Сессия устарела, переоткройте приложение» | — | — |
| `/not-in-telegram` | Открыто вне Telegram (в проде) | — | — |

Для отчёта не в `draft` и не в `revision_required` все шаги мастера открываются только на чтение, а `/reports/:id` показывает превью `ReportView`.

### 1.3. `startapp`-параметры

`start_param` приходит, только если Mini App открыт по прямой ссылке `https://t.me/<bot>/<short_name>?startapp=<param>` (Direct Link Mini App, создаётся в BotFather через `/newapp`) или по ссылке на main Mini App `https://t.me/<bot>?startapp=<param>`. Допустимые символы: `A-Za-z0-9_-`, длина до 512. UUID с дефисами проходит.

| `start_param` | Роут |
|---|---|
| — (нет) | `/` |
| `new` | `/reports/new` |
| `report_<uuid>` | `/reports/<uuid>` |
| `demand` | `/demand` |

Параметр валидируется регуляркой. Неизвестный параметр ведёт на `/`. Для inline-кнопок `web_app` (в боте и в уведомлениях бэкенда) `start_param` не используется: там в URL сразу кладётся путь, например `https://app.site.by/reports/<id>`.

---

## 2. Справочник API подборщика

### 2.1. Общее

- **Базовый путь** из Mini App: `/api` (proxy) + путь бэкенда. Ниже указаны пути бэкенда.
- **Авторизация:** заголовок `X-Telegram-Data: <initData raw>` в **каждом** запросе к `/inspector/**` (`TelegramAuthFilter.java:20`). Значение — сырая строка `window.Telegram.WebApp.initData` (в SDK это `retrieveRawInitData()`) **без перекодирования**. Сервер сам делит строку по `&`, URL-декодирует значения и строит data-check-string (`TelegramInitDataValidator.java:117-133`, `:70-75`). Пересборка строки на клиенте ломает подпись.
- **Проверки initData** (`TelegramInitDataValidator.java:41-46`): HMAC-SHA256 с ключом `HMAC("WebAppData", botToken)` (`:35-38`); `auth_date + telegram.max-age` должен быть не раньше текущего момента (`:77-89`), `max-age: 24h` (`application.yml:48`); поле `user` обязательно (`:91-105`). Бот, который открывает Mini App, должен быть **тем же ботом**, чей токен прописан в `TELEGRAM_BOT_TOKEN` бэкенда.
- **Кто такой пользователь:** из initData сервер берёт только `id`, `first_name` и `username` (`TelegramUser.java`). Роль всегда `ROLE_INSPECTOR` (`TelegramAuthFilter.java:51`). Регистрация на уровне фильтра **не проверяется**, поэтому валидный initData незарегистрированного пользователя проходит фильтр.
- **Ответ 401:** при отсутствии заголовка, неверной подписи **и истечении** запрос получает одинаковый `401`. Фильтр глотает `AppException` (`TelegramAuthFilter.java:55-58`), а entry point делает голый `response.sendError(401)` (`SecurityConfig.java:87-89`). Тело приходит от стандартного `/error` Spring Boot, **без `errorCode`**. Коды `TELEGRAM_AUTH_INVALID` и `TELEGRAM_AUTH_EXPIRED` в `ErrorCode.java:72-81` до клиента не доходят. Отличить истечение фронт может только сам, по `auth_date` (раздел 3.1). Исправление — BE-2.
- **Формат ошибок бизнес-логики** — `ProblemDetail` (`GlobalExceptionHandler.java:30-39`):
  ```json
  {
    "type": "/errors/report_incomplete",
    "title": "Report is not complete",
    "status": 409,
    "detail": "Report is not complete",
    "instance": "/inspector/reports/5b0c…/submit",
    "timestamp": "2026-09-27T10:15:30.123Z",
    "path": "/inspector/reports/5b0c…/submit",
    "errorCode": "REPORT_INCOMPLETE"
  }
  ```
- **Ошибка `@Valid`** (`ValidationExceptionHandler.java:45-58`): `400`, `errorCode: "BAD_REQUEST"`, плюс массив `errors` строк вида `"summary: must not be blank"` (формат `поле: сообщение`, `fe.getField()` даёт путь вроде `items[0].status`).
- **Ошибки без `errorCode`:** битый JSON, неизвестное значение enum (`"status": "GOOD"`), невалидный UUID в пути, несуществующий путь. Всё это обрабатывает базовый `ResponseEntityExceptionHandler`, он отдаёт `ProblemDetail` с `status` 400 или 404, но без `errorCode`. Фронт должен уметь показать ошибку по одному HTTP-статусу.
- **Неожиданная ошибка:** `500`, `errorCode: "INTERNAL_SERVER_ERROR"` (`ValidationExceptionHandler.java:23-43`). Сюда же попадают нарушения ограничений БД (см. регистрацию без email, confirm с несуществующим `reportId`).
- **Деньги** хранятся в копейках: `reports.price_byn BIGINT` (`V007:1`, `PROJECT_CONTEXT.md` «Деньги»). Имя поля `priceByn` вводит в заблуждение: `5000` означает 50,00 BYN.
- **Статусы — строки в нижнем регистре:** `inspectors.status` принимает `pending | verified | banned` (`V004:16`, `InspectorServiceImpl.java:87,102`), `reports.status` — `draft | pending_review | revision_required | published` (`ReportStatus.java`). Enum-значения в теле запросов пишутся в верхнем регистре: `ItemStatus` `OK | WARN | BAD`, `MediaKind` `PHOTO | VIDEO`, `SectionKey` `EXTERIOR | PAINT | INTERIOR | ENGINE | SUSPENSION | ELECTRICS | DOCUMENTS`.

### 2.2. Сводная таблица эндпоинтов

| # | Метод и путь | Статус | Ответ |
|---|---|---|---|
| 1 | `POST /inspector/register` | частично (email) | `200 InspectorDto` |
| 2 | `GET /inspector/` | готово | `200 InspectorDto` |
| 3 | `POST /inspector/reports` | частично (дубли, pending) | `200 { reportId }` |
| 4 | `GET /inspector/reports/{reportId}` | частично (нет машины, URL медиа, причины доработки) | `200 ReportDto` |
| 5 | `PUT /inspector/reports/{reportId}/sections/{sectionId}` | частично (summary обязателен, пустой список) | `204` |
| 6 | `PUT /inspector/reports/{reportId}/paint` | частично (нет справочника панелей) | `204` |
| 7 | `PUT /inspector/reports/{reportId}/conclusion` | готово | `204` |
| 8 | `POST /inspector/reports/{reportId}/submit` | частично (нет деталей ошибки) | `204` |
| 9 | `POST /inspector/media/presigned-url/{reportId}` | частично (нет проверок) | `200 { uploadUrl, s3Key }` |
| 10 | `POST /inspector/media/confirm-upload/{reportId}` | частично (нет проверок) | `204` |

Ни одного эндпоинта-справочника или списка у подборщика нет. `/cars/search` и прочие публичные пути лежат в `defaultChain` под JWT покупателя (`SecurityConfig.java:62-79`) и Mini App недоступны.

### 2.3. Профиль и регистрация

#### `GET /inspector/` — текущий подборщик

`InspectorController.java:34-39`. Путь **строго со слешем на конце**, `"/"` внутри `@RequestMapping("/inspector")`. В Spring Boot 3 trailing-slash matching выключен, поэтому `GET /inspector` получит `404` без `errorCode`. В тестах используется именно `/inspector/` (`InspectorFlowTest`).

Ответ `200` (`InspectorDto`):
```json
{
  "id": "3f9a1c2e-7b44-4d0e-9a51-2a8e6c1d0f11",
  "telegramUserId": 123456789,
  "fullName": "Иван Петров",
  "phone": "+375291234567",
  "email": "ivan@example.by",
  "status": "pending"
}
```

| Ошибка | Когда |
|---|---|
| `401` (без `errorCode`) | нет, неверный или истёкший initData |
| `404 INSPECTOR_NOT_FOUND` | по `telegram_user_id` записи нет (`InspectorServiceImpl.java:45-47`). **Это штатный сигнал «нужна регистрация»**, а не ошибка |

Что можно делать в каждом статусе (фактическое поведение кода и то, что должен разрешать фронт):

| Статус | Бэкенд сейчас разрешает | Mini App разрешает |
|---|---|---|
| не зарегистрирован | только `register`; все `/inspector/reports/**` дают `404 INSPECTOR_NOT_FOUND`. **Но `/inspector/media/**` работает**, потому что там нет проверки подборщика (`MediaController.java:23-44`) | только регистрация |
| `pending` | всё: создание, редактирование, отправку (`InspectorController.java:48` проверяет только `banned`) | экран ожидания, профиль. Мастер закрыт (BE-3) |
| `verified` | всё | всё |
| `banned` | нельзя создать отчёт (`403 INSPECTOR_BANNED`). **Можно** читать, редактировать и отправлять существующие: `ReportController` статус не проверяет | экран «заблокирован» |

#### `POST /inspector/register`

`InspectorController.java:26-32` → `InspectorServiceImpl.register` (`:52-67`): `INSERT … ON CONFLICT (telegram_user_id) DO NOTHING RETURNING`.

Тело (`RegisterInspectorRequest.java`):
```json
{ "fullName": "Иван Петров", "phone": "+375291234567", "email": "ivan@example.by" }
```
- `fullName` — `@NotBlank`. Берётся из тела, а не из Telegram.
- `phone` — только `@NotNull`, **пустая строка проходит**. Формат не проверяется.
- `email` — только `@Email`, **может быть `null`**. Но в БД стоит `inspectors.email CITEXT NOT NULL` (`V004:15`), поэтому регистрация без email падает на ограничении БД и отдаёт **`500 INTERNAL_SERVER_ERROR`**. На фронте email обязателен, BE-4 исправляет валидацию.

Ответ `200 InspectorDto`, `status: "pending"` (default в `V004:16`). Именно `200`, не `201`.

| Ошибка | Когда |
|---|---|
| `400 BAD_REQUEST` + `errors[]` | пустой `fullName`, `phone: null`, некорректный email |
| `409 INSPECTOR_ALREADY_REGISTERED` | запись с этим `telegram_user_id` уже есть, в том числе забаненная (`:66`) |
| `500 INTERNAL_SERVER_ERROR` | `email` не передан или `null` |

Редактировать профиль нельзя, эндпоинта нет. Для MVP это не нужно.

### 2.4. Создание отчёта

#### `POST /inspector/reports`

`InspectorController.java:41-56`.

Тело (`RegisterCarReportRequest.java`): `{ "avbyUrl": "https://cars.av.by/volkswagen/passat/112233445" }`, поле `@NotBlank`.

Порядок работы:
1. `findByTelegramId`. Если подборщика нет — `404 INSPECTOR_NOT_FOUND`, если забанен — `403 INSPECTOR_BANNED` (`:46-50`).
2. `CarServiceImpl.findOrCreateByUrl(url)` (`CarServiceImpl.java:27-59`). Ищет `cars` по **точному совпадению строки** `avby_listing_url`. Если нашёл, **парсер не вызывается** и возвращается существующий `carId`. Если нет, вызывается `AvByParser.parse(url)`, потом `INSERT … ON CONFLICT (avby_listing_url) DO NOTHING` с защитой от гонки.
3. `ReportServiceImpl.createReport` (`ReportServiceImpl.java:31-50`) создаёт `reports` (`status = draft`, `version_no = 1`) и **7 секций** в порядке `SectionKey`: `EXTERIOR(1), PAINT(2), INTERIOR(3), ENGINE(4), SUSPENSION(5), ELECTRICS(6), DOCUMENTS(7)`, у всех `summary = ""`.

Что делает парсер (`AvByParser.java`): Jsoup GET с desktop User-Agent, таймаут 10 с (`:19-35`).
- `make` берётся из `span[itemprop=brand]@content`. Поле обязательно, без него `PARSER_ERROR` (`:58-64`).
- `model` — из хлебной крошки с `position=3`, `a@title`. Тоже обязательно (`:72-84`).
- `year` ищется регуляркой `(\d{4})\s*г` в `.card__params`. Может быть `null` (`:86-93`).
- `vin` берётся из `.card-vin__button b`. Может быть `null` (`:66-69`).
- Цену, пробег и фото парсер **не берёт**.

Ответ `200` (`CreateReportResponse.java`):
```json
{ "reportId": "5b0c7f0e-1d2a-4a47-9a33-6f0e4b3e9d21" }
```
Данных машины в ответе **нет**, как и в `GET` отчёта (там только `carId`). Показать в Mini App «VW Passat 2017» сейчас нечем (BE-8).

| Ошибка | Когда |
|---|---|
| `400 BAD_REQUEST` | пустой `avbyUrl` |
| `403 INSPECTOR_BANNED` | подборщик забанен |
| `404 INSPECTOR_NOT_FOUND` | не зарегистрирован |
| `404 CAR_LISTING_NOT_FOUND` | av.by ответил 404: объявление снято или ссылка неверная (`AvByParser.java:38-41`) |
| `502 PARSER_ERROR` | любой другой HTTP-статус av.by, таймаут или IO (`:42-45`), либо на странице нет марки или модели (вёрстка изменилась, капча, ссылка не на объявление) |
| `500 INTERNAL_SERVER_ERROR` | строка не URL (`"abc"`, без схемы): `Jsoup.connect` бросает `IllegalArgumentException`, которую никто не ловит |

**Повторное создание на ту же машину.** Уникальности `(car_id, inspector_id)` нет (`PLAN_FINAL_CHECKLIST.md` 3.3). Каждый вызов создаёт **новый** черновик с новым `reportId`. Машина при этом переиспользуется, и парсер повторно не зовётся, **если строка URL совпала байт в байт**. `https://cars.av.by/x/y/1`, `…/1?utm=tg` и `…/1/` — это три разные машины. Отсюда правила для фронта:
- нормализовать URL перед отправкой: `https`, хост в нижнем регистре, без query, фрагмента и завершающего `/`;
- проверять домен (`av.by`, `cars.av.by`), чтобы не ловить 500 и не отдавать серверу произвольные URL (на бэкенде это ещё и SSRF, BE-19);
- **не повторять POST автоматически** при таймауте, потому что это создаст дубль. При сетевой ошибке сначала проверить «мои отчёты» (BE-7 или локальный индекс);
- кнопку блокировать на время запроса.

### 2.5. Чтение отчёта

#### `GET /inspector/reports/{reportId}`

`ReportController.java:82-90` → `ReportServiceImpl.getReport` (`:195-199`) → `requireOwnedReport` (`:301-314`): отчёт существует, `deleted_at IS NULL`, принадлежит подборщику. Работает в **любом** статусе.

Ответ `200` (`ReportDto` и вложенные DTO из `car/dto`):
```json
{
  "id": "5b0c7f0e-1d2a-4a47-9a33-6f0e4b3e9d21",
  "carId": "0e7d9a5c-8f11-4a3b-b1c2-9d8e7f6a5b4c",
  "inspectorId": "3f9a1c2e-7b44-4d0e-9a51-2a8e6c1d0f11",
  "versionNo": 1,
  "status": "draft",
  "priceByn": null,
  "conclusionText": null,
  "stopFactors": ["rust"],
  "sections": [
    {
      "id": "a1b2c3d4-0000-4000-8000-000000000001",
      "sectionKey": "EXTERIOR",
      "orderNo": 1,
      "summary": "Кузов в хорошем состоянии, ржавчина на пороге",
      "items": [
        { "itemKey": "geometry", "status": "OK", "comment": null },
        { "itemKey": "rust", "status": "BAD", "comment": "Левый порог, сквозная" }
      ],
      "media": [
        { "id": "…", "kind": "PHOTO", "s3Key": "reports/5b0c…/sections/a1b2…/9f1e….jpg", "status": "uploaded", "orderNo": 0 }
      ]
    }
  ],
  "paintMeasurements": [
    { "id": "…", "panelCode": "HOOD", "spot": "центр", "thicknessUm": 110, "note": null }
  ],
  "globalMedia": [
    { "id": "…", "kind": "VIDEO", "s3Key": "reports/5b0c…/7c2a….mp4", "status": "pending", "orderNo": 0 }
  ]
}
```
В массиве `sections` всегда 7 элементов.

Особенности, которые нужно учесть:
- **`sectionId` для `PUT .../sections/{sectionId}` берётся только отсюда:** `sections[].id`, сопоставление по `sectionKey`. Другого способа нет. Id генерируются при создании отчёта.
- **Порядок `items` и `media` не гарантирован.** `REPORT_SECTION_ITEM` и `REPORT_MEDIA` читаются без `ORDER BY` (`:225-232`), хотя `order_no` при сохранении пишется (`:87-96`). Фронт сортирует пункты сам, по порядку справочника.
- **URL медиа нет, только `s3Key`** (`ReportMediaDto`). Бакет приватный, поэтому показать уже загруженные фото на другом устройстве или после очистки кеша нельзя. Фронт показывает свои загрузки из локального кеша (IndexedDB) по `s3Key`, чужие — заглушкой. Исправление в BE-8: presigned GET, как уже сделано в `ReportAccessServiceImpl.generateViewUrl` (`:93-99`).
- **`paintMeasurements[]` содержит `panelCode`, но не `panelId`** (`PaintMeasurementDto`), а `PUT .../paint` требует `panelId`. Перезаписать замеры, прочитанные с сервера, без справочника панелей невозможно (раздел 2.7).
- `stopFactors` — это `itemKey` всех пунктов со статусом `BAD` (`:280-283`). Подпись берётся через `itemLabel()` из справочника.
- `status` у медиа: у фото `uploaded`, у видео `pending` (`MediaServiceImpl.java:86`). В `ready` видео никогда не переходит, потому что ffmpeg-воркера нет.
- Причины доработки или удаления в ответе **нет** (они лежат в `moderation_log`, `V008`). Данных машины, `createdAt` и даты отправки тоже нет (в `reports` нет ни `updated_at`, ни `submitted_at`).

| Ошибка | Когда |
|---|---|
| `404 INSPECTOR_NOT_FOUND` | не зарегистрирован |
| `404 REPORT_NOT_FOUND` | нет такого отчёта **или он мягко удалён админом** (`:302-309`). Причину удаления подборщик не узнает |
| `403 REPORT_ACCESS_DENIED` | чужой отчёт (`:311`) |

### 2.6. Обновление секции

#### `PUT /inspector/reports/{reportId}/sections/{sectionId}`

`ReportController.java:30-42` → `ReportServiceImpl.updateSection` (`:53-100`), в одной `@Transactional`.

Тело (`UpdateSectionRequest`, `SectionItemInput`):
```json
{
  "summary": "Кузов в хорошем состоянии, ржавчина на пороге",
  "items": [
    { "itemKey": "geometry", "status": "OK",  "comment": null },
    { "itemKey": "rust",     "status": "BAD", "comment": "Левый порог, сквозная" }
  ]
}
```
- `summary` — `@NotBlank` (`UpdateSectionRequest.java:10`);
- `items` — `@NotNull @Valid`; у каждого элемента `itemKey` `@NotBlank` (**свободная строка**, со справочником не сверяется, дубли не запрещены), `status` `@NotNull` (`OK | WARN | BAD`), `comment` — необязательный.

**Семантика — полная замена (replace-all):** сначала `UPDATE summary`, потом `DELETE` всех пунктов секции, потом `INSERT` пришедших, `order_no` по порядку массива (`:69-99`). Для автосохранения это значит:
- **всегда отправлять полный список пунктов секции**, а не только изменённый. Пункт, которого нет в запросе, удаляется;
- запрос идемпотентен, поэтому повтор после сетевой ошибки безопасен;
- для одной секции в полёте должен быть максимум один запрос, а новые изменения объединяются в следующий (last write wins). Иначе старый запрос, пришедший позже, затрёт новые данные.

Ограничения, которые мешают автосохранению:
1. **Без `summary` секцию не сохранить** (`@NotBlank`). Пока подборщик не написал итог, отметки пунктов живут только локально. Варианты: сохранять на сервер только при непустом `summary` и показывать «сохранено на устройстве», либо ослабить валидацию (BE-14; проверка `summary != ""` всё равно есть в submit).
2. **У каждого отправляемого пункта обязателен `status`.** Пункты «ещё не оценён» не отправляются.
3. **Пустой `items: []` — вероятно, `500`.** Цикл вставки не добавит ни одного `values(...)` (`:89-99`), и jOOQ выполнит `INSERT` без строк (скорее всего `DEFAULT VALUES` с нарушением `NOT NULL section_id`). Тестом это не покрыто. Фронт пустой список не отправляет, BE-14 это чинит.

| Ошибка | Когда |
|---|---|
| `400 BAD_REQUEST` + `errors[]` | пустой `summary`, `items: null`, пустой `itemKey`, нет `status` |
| `400` без `errorCode` | неизвестный `status`, битый UUID |
| `404 INSPECTOR_NOT_FOUND` / `404 REPORT_NOT_FOUND` / `403 REPORT_ACCESS_DENIED` | как в `GET` |
| `409 REPORT_NOT_EDITABLE` | статус не `draft` и не `revision_required` (`:316-324`) |
| `404 SECTION_NOT_FOUND` | `sectionId` не принадлежит этому отчёту (`:58-66`) |

### 2.7. Замеры ЛКП

#### `PUT /inspector/reports/{reportId}/paint`

`ReportController.java:44-55` → `ReportServiceImpl.updatePaintMeasurements` (`:102-140`), `@Transactional`.

Тело (`UpdatePaintMeasurementsRequest`, `PaintMeasurementInput`):
```json
{
  "measurements": [
    { "panelId": "c0ffee00-…", "spot": "центр", "thicknessUm": 110, "note": null },
    { "panelId": "c0ffee01-…", "spot": null,    "thicknessUm": 420, "note": "шпаклёвка" }
  ]
}
```
- `panelId` — `@NotNull UUID`; `thicknessUm` — `@NotNull Integer`, **диапазон не проверяется** (можно `0`, `-5` или `100000`); `spot` и `note` необязательны.
- Несколько замеров на одну панель разрешены (например, разные точки `spot`).
- **Полная замена на весь отчёт:** `DELETE` всех замеров отчёта, затем `INSERT` (`:118-139`). Отправлять всегда полный список по всем панелям.
- Проверка панелей: все уникальные `panelId` должны существовать в `paint_panel`, иначе `404 PANEL_NOT_FOUND` (`:107-116`).
- Пустой `measurements: []` (чтобы очистить все замеры), скорее всего, тоже падает с `500`, по той же причине, что пустые `items`.
- Для отправки на модерацию замеры **не обязательны**.

**Откуда фронту взять `panelId` — неоткуда. Это пробел бэкенда.** Справочник `paint_panel` (15 строк, `V007:13-34`) заполняется миграцией с `id = gen_random_uuid()`. UUID **разные в каждой базе** (локально, в тесте и в проде), поэтому захардкодить их нельзя. Эндпоинта со списком панелей нет, а `GET` отчёта отдаёт только `panelCode`. Решение — BE-6 (`GET /inspector/catalog/paint-panels`) или приём `panelCode` вместо `panelId`.

Коды панелей из seed (`order_no`): `HOOD(1) ROOF(2) TRUNK(3) FRONT_BUMPER(4) REAR_BUMPER(5) FENDER_FL(6) FENDER_FR(7) FENDER_RL(8) FENDER_RR(9) DOOR_FL(10) DOOR_FR(11) DOOR_RL(12) DOOR_RR(13) SILL_L(14) SILL_R(15)`. Подписи уже есть в `PANEL_LABELS` (`packages/ui/src/report/catalog.ts`).

| Ошибка | Когда |
|---|---|
| `400 BAD_REQUEST` | `measurements: null`, нет `panelId` или `thicknessUm` |
| `404 PANEL_NOT_FOUND` | хотя бы одного `panelId` нет в справочнике |
| `409 REPORT_NOT_EDITABLE`, `404 REPORT_NOT_FOUND`, `403 REPORT_ACCESS_DENIED`, `404 INSPECTOR_NOT_FOUND` | как выше |

### 2.8. Заключение и отправка

#### `PUT /inspector/reports/{reportId}/conclusion`

`ReportController.java:57-68` → `ReportServiceImpl.updateConclusion` (`:142-152`).

Тело (`UpdateConclusionRequest`): `{ "conclusionText": "Рекомендую к покупке после торга…", "priceByn": 5000 }`. Оба поля обязательны (`@NotBlank`, `@NotNull`), поэтому автосохранение возможно только при заполненных обоих. `priceByn` указывается **в копейках**: подборщик вводит «50», фронт отправляет `5000`. Знак и минимум не проверяются, `0` и отрицательные значения проходят. На фронте нужен минимум (предлагаю 1 BYN) и разумный максимум.

Ошибки: `400 BAD_REQUEST`, `409 REPORT_NOT_EDITABLE`, `404 REPORT_NOT_FOUND`, `403 REPORT_ACCESS_DENIED`, `404 INSPECTOR_NOT_FOUND`.

#### `POST /inspector/reports/{reportId}/submit`

`ReportController.java:70-80` → `ReportServiceImpl.submitForModeration` (`:154-192`). Тела нет, ответ `204`.

**Точные правила** проверяются по порядку. Первая неудача даёт `409 REPORT_INCOMPLETE` **без уточнения, что именно не так**:
1. Отчёт свой, не удалён, статус `draft` или `revision_required` (`requireEditableReport`, `:156`). Иначе `404`, `403` или `409 REPORT_NOT_EDITABLE`. Повторная отправка из `pending_review` тоже даёт `409 REPORT_NOT_EDITABLE`.
2. **У каждой из 7 секций** `summary != ""` **и** хотя бы один пункт в `report_section_item` (`:158-169`, `LEFT JOIN … HAVING count = 0 OR summary = ''`). Хватает **одного** пункта на секцию: полноту по справочнику из ~45 пунктов бэкенд не проверяет.
3. Есть **глобальное** видео: запись `report_media` с `section_id IS NULL`, `kind = 'VIDEO'`, `status IN ('pending','ready')` (`:171-181`). Видео, загруженное с `sectionId`, **не засчитывается**.
4. `conclusionText` не пустой и не из пробелов, `priceByn IS NOT NULL` (`:183-185`).

Затем `status = 'pending_review'` (`:187-190`). Уведомления админу нет.

**Что не проверяется:** фото (ни обязательные, ни секционные), замеры ЛКП, полнота пунктов, диапазон цены, статус подборщика (`pending` и `banned` отправить могут).

**Клиентский чек-лист готовности** (экран «Проверка») повторяет правила 2–4 один в один и добавляет рекомендательные пункты продукта. Их можно отключить, пока бэкенд их не требует:

| Пункт | Правило | Блокирует отправку |
|---|---|---|
| Секция «X»: итог | `summary.trim() !== ''` | да (бэк) |
| Секция «X»: оценки | `items.length ≥ 1` | да (бэк) |
| Видео обхода | глобальное `VIDEO` в `globalMedia` (после confirm) | да (бэк) |
| Заключение | `conclusionText.trim() !== ''` | да (бэк) |
| Цена | `priceByn != null` и `≥ 100` | да (бэк + фронт) |
| Все пункты справочника оценены | по справочнику | нет, предупреждение (станет «да» с BE-5) |
| Обязательные фото: одометр, VIN, подборщик у машины, документы | по локальным тегам или BE-11 | нет, предупреждение (станет «да» с BE-11) |
| Замеры ЛКП | ≥ 1 замер | нет, предупреждение |
| Незавершённые загрузки | очередь пуста | да (фронт): иначе отправка уйдёт без части фото |
| Несохранённые изменения | нет `dirty`-черновиков | да (фронт): перед отправкой flush |

Перед `submit` фронт обязательно делает flush всех грязных сохранений, дожидается пустой очереди загрузок и перечитывает `GET` отчёта. Чек-лист строится по **серверным** данным, а не по локальным.

#### Какие статусы допускают редактирование

Только `draft` и `revision_required` (`ReportServiceImpl.java:319`). Это касается секций, ЛКП, заключения и submit. На `pending_review` и `published` все эти операции получают `409 REPORT_NOT_EDITABLE`. **Медиа-эндпоинты статус не проверяют**, поэтому загрузить фото в опубликованный отчёт технически можно. Фронт это блокирует сам, бэкенд — в BE-9. Новой версии опубликованного отчёта (`version_no + 1`) API не предусматривает.

### 2.9. Медиа

Два эндпоинта в `MediaController.java`. **В них нет `@AuthenticationPrincipal`**: они не проверяют ни регистрацию, ни владельца отчёта, ни его статус, ни принадлежность секции к отчёту, ни префикс `s3Key` (`PLAN_FRONTEND.md` и `PLAN_FINAL_CHECKLIST.md` 2.2). Аутентификация (валидный initData) всё же требуется, потому что путь лежит под `/inspector/**`.

#### Шаг 1. `POST /inspector/media/presigned-url/{reportId}`

Тело (`PresignedUrlRequest`):
```json
{ "sectionId": "a1b2c3d4-…", "fileName": "9f1e2d3c-….jpg", "contentType": "image/jpeg" }
```
- `sectionId` — необязателен. Если указан, фото относится к секции и ключ имеет вид `reports/{reportId}/sections/{sectionId}/{fileName}`. Если `null`, медиа общее, ключ `reports/{reportId}/{fileName}` (`MediaServiceImpl.java:110-122`).
- `fileName` — `@NotBlank`, **подставляется в ключ как есть**. Клиент генерирует `crypto.randomUUID() + '.jpg'` / `'.mp4'`.
- `contentType` — `@NotBlank`, допустимы **только** `image/png`, `image/jpeg`, `video/mp4` (`:30-34`). Остальное, включая `image/heic`, `image/webp` и `video/quicktime` (видео с iPhone), даёт `400 NOT_ALLOWDED_MEDIA_TYPE` (опечатка в коде ошибки, фронту нужно писать именно так).

Ответ `200` (`PresignedUrlResponse`):
```json
{
  "uploadUrl": "https://s3.hoster.by/marketplace-media/reports/5b0c…/sections/a1b2…/9f1e….jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=…&X-Amz-SignedHeaders=content-type%3Bhost&X-Amz-Expires=3600&X-Amz-Credential=…&X-Amz-Signature=…",
  "s3Key": "reports/5b0c…/sections/a1b2…/9f1e….jpg"
}
```
- URL строится path-style (`S3Config.java:31-37`, `pathStyleAccessEnabled`) на хосте `s3.endpoint`.
- **TTL** — `s3.presigned-url-ttl-minutes: 60` (`application.yml:31`), то есть час. После него S3 отвечает `403`.
- `contentType` зашит в подпись (`MediaServiceImpl.java:61-67`, `.contentType(contentType)` попадает в `X-Amz-SignedHeaders=content-type;host`).
- Размер в подпись **не** зашит, лимитов нет.

#### Шаг 2. `PUT {uploadUrl}` напрямую в S3 из браузера

```
PUT https://s3.hoster.by/marketplace-media/reports/…/9f1e….jpg?X-Amz-…
Content-Type: image/jpeg          ← ровно то же значение, что в presigned-запросе
<тело: Blob файла>
```
- `Content-Type` **обязателен и должен побайтно совпадать** с подписанным. Иначе будет `403 SignatureDoesNotMatch`. Выставлять явно, не полагаясь на `Blob.type`: у файлов с Android `type` бывает пустым.
- Никаких других `x-amz-*` заголовков не добавлять (ACL, метаданные): они не подписаны.
- Использовать `XMLHttpRequest`, потому что только у него есть `upload.onprogress`. У `fetch` нет прогресса отправки в Safari/WebKit.
- Успех — `200` (тело пустое, есть `ETag`). Если `403` с `Request has expired` или `SignatureDoesNotMatch`, нужно запросить новый presigned URL и повторить. Сетевая ошибка или `5xx` — повтор с backoff.
- Повторный PUT на тот же ключ просто перезапишет объект, это безопасно.

**CORS на бакете нужен.** Mini App на `https://<host>` делает cross-origin PUT с `Content-Type: image/jpeg`. Это не «простой» запрос, поэтому браузер пошлёт preflight `OPTIONS`. Конфигурация бакета (hoster.by — через `aws s3api put-bucket-cors --endpoint-url https://s3.hoster.by`; MinIO — `mc cors set` на новых версиях, на старых переменная `MINIO_API_CORS_ALLOW_ORIGIN`):
```json
{
  "CORSRules": [{
    "AllowedOrigins": ["https://<домен-mini-app>", "https://<туннель-для-разработки>"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }]
}
```
Для `<img>` и `<video>` по presigned GET CORS не нужен. Он понадобится, только если читать картинку в canvas.

#### Шаг 3. `POST /inspector/media/confirm-upload/{reportId}`

Тело (`ConfirmUploadRequest`):
```json
{ "sectionId": "a1b2c3d4-…", "s3key": "reports/5b0c…/sections/a1b2…/9f1e….jpg", "kind": "PHOTO" }
```
- Поле называется **`s3key`** со строчной `k`, в отличие от `s3Key` в ответе presigned (`ConfirmUploadRequest.java:10`). Перепутать легко.
- `sectionId` — тот же, что в шаге 1. Сервер его не сверяет с ключом, поэтому клиент обязан передать то же значение. От него зависит, куда медиа попадёт в `GET` (секция или `globalMedia`).
- `kind` — `PHOTO | VIDEO`, с `contentType` не сверяется. Для `video/mp4` передавать `VIDEO`, иначе submit не увидит видео.

Сервер делает `HEAD` объекта в S3 и, если объект есть, `INSERT report_media` со `status = uploaded` для `PHOTO` или `pending` для `VIDEO`, `order_no = 0` (`MediaServiceImpl.java:76-95`). Ответ `204`. `mediaId` **не возвращается**, узнать его можно только из следующего `GET` отчёта по `s3Key`.

| Ошибка | Когда |
|---|---|
| `400 BAD_REQUEST` | пустой `s3key`, нет `kind` |
| `404 MEDIA_NOT_FOUND` | объекта по ключу нет в S3: PUT не дошёл или ключ не тот (`:97-99`) |
| `500 UNEXPECTED_ERROR` | любая другая ошибка S3 (`:102-105`) |
| `500 INTERNAL_SERVER_ERROR` | `reportId` или `sectionId` не существуют (нарушение FK при INSERT) |

**Confirm не идемпотентен.** Уникальности на `s3_key` нет, повторный confirm создаёт **вторую запись**, и фото задублируется в отчёте. Если confirm упал по таймауту, фронт перед повтором перечитывает `GET` отчёта и ищет `s3Key` в `media` / `globalMedia`. Если нашёл, confirm уже прошёл.

**Удалить медиа нельзя**, эндпоинта нет (BE-12). Ошибочное фото останется в отчёте. До BE-12 перед загрузкой нужно показывать превью с подтверждением («Загрузить это фото?»), а не грузить сразу.

**Обязательные фото** в модели не выделены (`PLAN_REPORT_CONTENT.md`, решение 2). До BE-11 одометр, VIN, подборщик у машины и документы загружаются как обычные глобальные фото (`sectionId = null`), а тег хранится только локально. Бэкенд их не отличает, и в превью они окажутся в общей галерее.

### 2.10. Коды ошибок подборщика (для таблицы `errorCode → текст`)

| `errorCode` | HTTP | Где | Текст для пользователя |
|---|---|---|---|
| — (нет тела) | 401 | любой `/inspector/**` | «Сессия Telegram устарела. Закройте и откройте приложение заново» |
| `INSPECTOR_NOT_FOUND` | 404 | `GET /inspector/`, все отчёты | (не ошибка) → регистрация |
| `INSPECTOR_ALREADY_REGISTERED` | 409 | register | «Вы уже зарегистрированы» → перезапрос профиля |
| `INSPECTOR_BANNED` | 403 | создание отчёта | «Аккаунт заблокирован» |
| `CAR_LISTING_NOT_FOUND` | 404 | создание отчёта | «Объявление не найдено на av.by. Проверьте ссылку» |
| `PARSER_ERROR` | 502 | создание отчёта | «Не удалось прочитать объявление av.by. Повторите позже» |
| `REPORT_NOT_FOUND` | 404 | отчёт | «Отчёт не найден или удалён модератором» |
| `REPORT_ACCESS_DENIED` | 403 | отчёт | «Это не ваш отчёт» |
| `REPORT_NOT_EDITABLE` | 409 | правки, submit | «Отчёт на модерации или опубликован, редактирование недоступно» → перезапрос отчёта |
| `REPORT_INCOMPLETE` | 409 | submit | «Отчёт заполнен не полностью» + локальный чек-лист |
| `SECTION_NOT_FOUND` | 404 | секция | «Секция не найдена» → перезапрос отчёта |
| `PANEL_NOT_FOUND` | 404 | ЛКП | «Неизвестная панель кузова» → перезапрос справочника |
| `NOT_ALLOWDED_MEDIA_TYPE` | 400 | presigned | «Такой формат файла не поддерживается» |
| `MEDIA_NOT_FOUND` | 404 | confirm | (внутреннее) → перезагрузить файл заново |
| `UNEXPECTED_ERROR` | 500 | confirm | «Ошибка хранилища, повторим автоматически» |
| `BAD_REQUEST` | 400 | любой | показать `errors[]` у полей формы |
| `INTERNAL_SERVER_ERROR` | 500 | любой | «Что-то пошло не так, повторите» |

---

## 3. Как всё должно работать

### 3.1. SDK, initData и сессия

- `@telegram-apps/sdk-react` v3. В `main.tsx` до рендера роутера:
  1. `init()`;
  2. `retrieveLaunchParams()` → `tgWebAppStartParam`, `tgWebAppPlatform`, `tgWebAppThemeParams`;
  3. `retrieveRawInitData()` → строка для заголовка;
  4. `miniApp.mount()`, `themeParams.mount()` + `bindCssVars()`, `viewport.mount()` + `expand()`, `backButton.mount()`, `mainButton.mount()`, `closingBehavior.mount()`, `swipeBehavior.mount()`.
  Вызовы оборачиваются в `isAvailable()`, потому что старые клиенты Telegram поддерживают не всё.
- **Вне Telegram.** В dev-режиме `mockTelegramEnv()` подставляет тестовые launch params с initData, подписанным **локальным** токеном `1234567890:AAFg…` из `application-local.yml:19`. Для этого есть скрипт `scripts/sign-init-data.ts`, аналог `TelegramTestDataGenerator` из тестов. Так Mini App работает в обычном браузере против локального бэкенда. В проде вне Telegram показывается `/not-in-telegram`.
- **API-клиент** — один `fetch`-wrapper, который добавляет `X-Telegram-Data`, разбирает `ProblemDetail` в `ApiError { status, errorCode?, errors?, detail }`, ставит таймаут через `AbortController` (15 с, для `POST /inspector/reports` 30 с) и различает сетевую ошибку (`TypeError`) и HTTP-ошибку.
- **Истечение initData.** `authDate` берётся из initData, `expiresAt = authDate + 24h`. Константа должна совпадать с `telegram.max-age` на бэкенде (`application.yml:48`). Правила:
  - любой `401` означает «сессия невалидна». Показать `/session-expired` с кнопкой «Закрыть» (`miniApp.close()`), черновики и очередь сохранены локально, после переоткрытия всё продолжится;
  - за 10 минут до `expiresAt` показать ненавязчивый баннер «Сессия скоро истечёт, переоткройте приложение, данные сохранены»;
  - очередь загрузок и автосохранение не стартуют новые запросы после `expiresAt`, чтобы не терять попытки;
  - сценарий реален: Telegram позволяет держать Mini App свёрнутым часами, а initData при разворачивании не обновляется. Время клиента может расходиться с сервером, так что `401` остаётся главным сигналом, а таймер — подсказкой.

### 3.2. Интеграция с Telegram UI

| Элемент | Поведение |
|---|---|
| **MainButton** | Единственная основная кнопка шага. Текст зависит от шага: «Создать отчёт», «Далее», «Проверить отчёт», «Отправить на модерацию», «Зарегистрироваться». `isEnabled` зависит от валидности шага. `isLoaderVisible` включается во время запроса. Обработчик ставится через хук `useMainButton(text, onClick, {enabled, loading})`, который снимает его при unmount. На экранах только для чтения кнопка скрыта |
| **SecondaryButton** (Bot API 7.10+, если доступна) | «Превью» на шагах мастера. Если недоступна, обычная кнопка в контенте |
| **BackButton** | Показывается везде, кроме корневых табов (`/reports`, `/demand`, `/profile`, `/pending`). Нажатие вызывает `navigate(-1)`, а в мастере ведёт на предыдущий шаг. Перед уходом с шага срабатывает flush автосохранения |
| **Тема** | `themeParams.bindCssVars()` выставляет `--tg-theme-*`. `AppRoot` из telegram-ui получает `appearance` из `miniApp.isDark` и `platform` из `tgWebAppPlatform` (ios / base). Статусные цвета `ok/warn/bad` берутся из токенов `@podbor/ui` поверх темы. `miniApp.setHeaderColor('bg_color')` |
| **Closing confirmation** | `closingBehavior.enableConfirmation()`, пока есть `dirty`-черновики или активная очередь загрузок. Когда всё синхронизировано — `disableConfirmation()` |
| **Вертикальные свайпы** | `swipeBehavior.disableVertical()` на экранах мастера, иначе свайп вниз при прокрутке списка пунктов сворачивает Mini App |
| **Haptic** | `hapticFeedback.notificationOccurred('success' / 'error')` на сохранение, отправку и ошибку. `selectionChanged()` на выбор OK/WARN/BAD |
| **Popup / confirm** | `popup.open()` для деструктивных и необратимых действий: «Отправить на модерацию? Редактирование будет недоступно», «Загрузить это фото?» |
| **Write access** | Если Mini App открыт по прямой ссылке без `/start`, бот не сможет писать пользователю. После регистрации нужно вызвать `requestWriteAccess()` («Разрешить уведомления о модерации»), иначе `sendMessage` бэкенда получит `403 Forbidden: bot can't initiate conversation` |
| **Активация** | Событие `activated` (Mini App развернули) → перезапрос профиля или отчёта и запуск очереди. `deactivated` → flush автосохранения |

### 3.3. Автосохранение и черновик

Модель данных черновика хранится в zustand с `persist` в `localStorage`, ключ `podbor:draft:<reportId>`:
```ts
interface ReportDraft {
  schema: 1;
  reportId: string;
  loadedAt: string;                         // когда последний раз читали сервер
  sections: Record<SectionKey, {
    sectionId: string;
    summary: string;
    items: Record<string /*itemKey*/, { status?: 'OK'|'WARN'|'BAD'; comment?: string }>;
    dirty: boolean;
    lastSavedAt?: string;
    lastError?: string;
  }>;
  paint: { measurements: { panelCode: string; spot?: string; thicknessUm?: number; note?: string }[]; dirty: boolean };
  conclusion: { conclusionText: string; priceByn?: number /*копейки*/; dirty: boolean };
  localMediaTags: Record<string /*s3Key*/, 'ODOMETER'|'VIN_PLATE'|'INSPECTOR_WITH_CAR'|'DOCUMENTS'>;
}
```

Правила:
1. **Загрузка отчёта.** `GET` → для каждой части: если в локальном черновике `dirty = true`, остаётся локальная версия и ставится в отправку, иначе берётся серверная. Конфликты между устройствами вне скоупа (last write wins).
2. **Триггеры сохранения:** debounce 1,5 с после изменения, уход с шага (BackButton, MainButton, переход по хабу), `deactivated` и `visibilitychange: hidden`, явный flush перед submit.
3. **Условия отправки на сервер** (из-за валидации бэкенда):
   - секция отправляется, если `summary.trim() !== ''` и есть хотя бы один пункт со `status`. В запрос попадают только пункты со `status`, в порядке справочника;
   - ЛКП отправляется, если есть хотя бы один полный замер **и** известен `panelId` для каждого `panelCode` (BE-6). До этого замеры живут только локально;
   - заключение отправляется, если заполнены и текст, и цена.
   Если условие не выполнено, индикатор показывает «сохранено на устройстве», а не ошибку.
4. **Одна секция — один запрос в полёте.** Новые изменения во время запроса помечаются `dirty` и уходят следующим PUT после ответа.
5. **Ответ `409 REPORT_NOT_EDITABLE`** (отчёт ушёл на модерацию с другого устройства или его вернули) → черновик сбрасывается, отчёт перечитывается и открывается только на чтение.
6. **Ответ `404 REPORT_NOT_FOUND`** → черновик удаляется, сообщение «Отчёт удалён».
7. **После успешного submit** черновик удаляется.
8. Черновики старше 30 дней чистятся при старте.
9. **Локальный индекс отчётов** (`podbor:reports-index`: `[{reportId, avbyUrl, createdAt}]`) пополняется после каждого `POST /inspector/reports`. Это временная замена BE-7.

Серверное состояние (отчёт, профиль) лежит в TanStack Query, а черновик — источник для форм. После успешного PUT обновляется кеш `['report', id]` (оптимистично, без повторного GET).

### 3.4. Очередь загрузок

> **MVP (решение 2026-09-29, п. 3):** та же модель `UploadTask` и тот же жизненный цикл, но задачи лежат в сторе в памяти (zustand без `persist`), `blob` — в памяти. Пункты ниже про IndexedDB, «возобновление после закрытия», квоту и хранение миниатюр 7 дней — второй этап. Всё остальное (параллельность, backoff, протухший URL, проверка confirm через GET, офлайн-пауза, UI) — в MVP.

Хранилище (второй этап) — IndexedDB (обёртка `idb-keyval` или `idb`), store `uploads`:
```ts
interface UploadTask {
  id: string;                     // uuid, он же имя файла
  reportId: string;
  sectionId: string | null;       // null — глобальное
  kind: 'PHOTO' | 'VIDEO';
  contentType: 'image/jpeg' | 'video/mp4';
  tag?: 'ODOMETER' | 'VIN_PLATE' | 'INSPECTOR_WITH_CAR' | 'DOCUMENTS';
  blob: Blob;                     // уже сжатый JPEG / исходное видео
  thumb?: Blob;                   // миниатюра 480px для списка (до B-39 — только локально)
  state: 'queued' | 'presigning' | 'uploading' | 'confirming' | 'done' | 'failed';
  s3Key?: string; uploadUrl?: string; presignedAt?: number;
  progress: number;               // 0..1
  attempts: number; lastError?: string;
  createdAt: number;
}
```

Жизненный цикл:
```
queued → presigning (POST presigned-url) → uploading (XHR PUT, progress)
       → confirming (POST confirm-upload) → done → через 7 дней blob удаляется, миниатюра остаётся в кеше превью
```
- **Параллельность:** 2 фото одновременно, видео строго одно и не параллельно с фото, чтобы не забивать мобильный канал.
- **Повтор:** экспоненциальный backoff 2 → 4 → 8 → 16 → 30 с (с jitter), без лимита попыток при сетевых ошибках. На `4xx` от API (кроме `401` и `408`) задача переходит в `failed` и ждёт ручного «Повторить» или «Удалить».
- **Протухший URL:** если `Date.now() - presignedAt > 50 мин` или S3 ответил `403`, запрашиваем новый presigned URL с тем же `fileName` (ключ тот же, объект перезапишется).
- **Confirm после сбоя:** при сетевой ошибке на confirm сначала `GET` отчёта. Если `s3Key` уже есть в `media` / `globalMedia` — задача `done`. Иначе повтор confirm. Если confirm ответил `404 MEDIA_NOT_FOUND`, объект не дошёл до S3, и задача возвращается в `uploading`.
- **Возобновление после закрытия Mini App:** при старте все задачи в `presigning`, `uploading` и `confirming` возвращаются в `queued` (кроме `confirming` с известным `s3Key`: для неё сначала проверка через GET). Одиночный presigned PUT докачивать с середины нельзя: после закрытия загрузка начинается заново. Для больших видео это главный риск (см. 3.5 и BE-20).
- **Офлайн:** очередь на паузе, пока нет сети. Возобновление по событию `online`, по успешному запросу к API или по `activated`.
- **UI:** миниатюра с кольцом прогресса и статусом «в очереди / грузится / ошибка», общий индикатор «Загружается 3 из 7» в шапке мастера, экран `/uploads` со списком и кнопками «Повторить» и «Удалить из очереди».
- **Отображение уже загруженного:** превью строится из `thumb` в IndexedDB по `s3Key`. На другом устройстве до BE-8 показывается заглушка «фото загружено».
- **Квота IndexedDB.** Перед постановкой в очередь проверяем `navigator.storage.estimate()`. На iOS WebView квота может быть маленькой: при `QuotaExceededError` показываем ошибку и не принимаем новые файлы, пока очередь не разгрузится. Вызываем `navigator.storage.persist()`, если API доступно.

### 3.5. Обработка фото и видео перед загрузкой

**Фото** (Web Worker + `OffscreenCanvas`, где доступно; иначе main thread):
1. Выбор файла: `<input type="file" accept="image/*" capture="environment">` для камеры и без `capture` для галереи, с `multiple`.
2. **HEIC.** Определяется по `file.type` (`image/heic`, `image/heif`) или по расширению, если `type` пустой. Сначала `createImageBitmap(file)`: Safari 17+ и iOS WebView умеют декодировать HEIC сами. Если не вышло, lazy-import `heic2any` (libheif в wasm, около 1 МБ, грузится только при необходимости).
3. **Ориентация.** `createImageBitmap(file, { imageOrientation: 'from-image' })`, чтобы EXIF-поворот применился к пикселям.
4. **Ресайз:** длинная сторона до **2560 px** (для документов и VIN читаемости хватает с запасом). Меньшие фото не увеличиваются.
5. **Кодирование** в JPEG с `quality 0.82`. Итог обычно 0,5–1,5 МБ вместо 3–8 МБ. `contentType` всегда `image/jpeg`.
6. **EXIF, включая GPS, не переносится** — это плюс для приватности подборщика.
7. **Миниатюра** 480 px (JPEG) для очереди, превью и загрузки в S3 (3.2 `PLAN_MEDIA_THUMBNAILS.md`).
8. **Память:** на iOS WebView много больших canvas подряд приводят к падению вкладки. Файлы обрабатываются строго по одному, после каждого `bitmap.close()` и `canvas.width = canvas.height = 0`.

**Видео:**
- `<input type="file" accept="video/*" capture="environment">`.
- **iPhone отдаёт `.MOV` (`video/quicktime`, часто HEVC), а бэкенд принимает только `video/mp4`.** Варианты по убыванию правильности: (а) BE-10 разрешает `video/quicktime`, и тогда перекодировку для покупателя делает будущий ffmpeg-воркер; (б) временно загружать MOV с `contentType: video/mp4`, потому что контейнеры совместимы (ISO BMFF), но HEVC не проиграется у части покупателей на Android; (в) подсказка в UI: «Камера → Форматы → Наиболее совместимый». Для MVP — (а) + (в). Перекодировать видео в браузере через ffmpeg.wasm на телефоне нереально (десятки секунд на минуту видео, сотни МБ памяти).
- **Размер.** Видео обхода на 2–3 минуты в 1080p весит 200–600 МБ. На клиенте нужен лимит: предупреждение от 300 МБ, отказ от 1 ГБ (серверный лимит в BE-10). В UI подсказка «до 3 минут».
- Одиночный PUT на сотни мегабайт по мобильной сети — самое хрупкое место. После разрыва загрузка начинается заново. Полное решение — multipart upload (BE-20). До него: видео в очереди отдельно, Wake Lock (`navigator.wakeLock.request('screen')`, если доступен), чтобы экран не гас, и явное предупреждение «Не закрывайте приложение до окончания загрузки видео» с процентами.

### 3.6. Плохой интернет

- **Детект:** `navigator.onLine` и события `online`/`offline` как подсказка, а реальный признак — `TypeError` от `fetch` или `xhr.onerror` и таймаут. Состояние `network: online | offline | degraded` хранится в сторе, при `offline` показывается баннер «Нет сети — данные сохраняются на устройстве».
- **Запросы на чтение:** TanStack Query с `retry: 3`, `retryDelay` экспоненциальный. `networkMode: 'offlineFirst'` и `persistQueryClient` (открытие кешированного отчёта без сети) — второй этап (MINI-21).
- **Запросы на запись:**
  - идемпотентные PUT (секции, ЛКП, заключение) идут через автосохранение с повторами (3.3);
  - `POST /inspector/reports` автоматически **не повторяется** (2.4);
  - `POST .../submit` безопасно повторить: второй вызов после успешного первого вернёт `409 REPORT_NOT_EDITABLE`, и это трактуется как успех после перечитывания статуса;
  - `POST /inspector/register` при повторе отдаст `409 INSPECTOR_ALREADY_REGISTERED`, это тоже успех → `GET /inspector/`.
- **Медленная сеть:** в мастере нет спиннеров, блокирующих экран. Всё сохраняется в фоне с индикатором «Сохранение… / Сохранено / На устройстве».
- **Создание отчёта** требует сети: без неё кнопка неактивна и видна подсказка.

### 3.7. Превью через общий `ReportView`

- `ReportView` из `@podbor/ui` принимает `ReportViewData` (`packages/ui/src/report/types.ts`). Это зеркало `ReportViewDto`, у медиа поле `url`. Для подборщика нужен адаптер `toReportViewData(report: ReportDto, localMedia): ReportViewData`:
  - для своих неотправленных/только что загруженных фото `sections[].media[].url` — `URL.createObjectURL(thumb или blob)` из очереди в памяти (MVP, 3.4); для остальных — серверный `url` (BE-8). IndexedDB вместо очереди в памяти — второй этап (MINI-23);
  - медиа, которые ещё в очереди, добавляются в превью с пометкой «загружается», чтобы подборщик видел отчёт целиком;
  - `stopFactors` приходят с сервера как `itemKey`, подписи даёт `itemLabel()`;
  - `header` (`ReportHeader`): `carTitle` из данных машины (BE-8; до него — из `avbyUrl`, распознанного на клиенте, или «Автомобиль»), `inspectorName` из профиля;
  - `showPrice = true`.
- Превью строится по **серверным данным после flush**, а не по черновику. Подборщик видит ровно то, что уйдёт на модерацию.
- `ReportView` использует Tailwind, а telegram-ui — свои стили. `packages/ui/theme.css` подключается в `apps/inspector`, CSS-переменные статусов остаются общими, фон и текст берутся из `--tg-theme-*`.

### 3.8. Заголовки безопасности (S-9)

CSP для `app.site.by` настраивается в nginx (`DEPLOYMENT.md`), не копируется с покупательского фронта:
- `frame-ancestors https://web.telegram.org` — **обязательно**, никогда не `'none'`: Telegram Web открывает Mini App в iframe, и запрет встраивания сломает запуск оттуда (desktop-клиенты и мобильные открывают без iframe, им это не мешает);
- `script-src 'self' https://telegram.org`, если `telegram-web-app.js` грузится с `telegram.org` (а не бандлится локально);
- `connect-src 'self'` + хост S3-бакета (presigned PUT и GET уходят напрямую в S3);
- `img-src` / `media-src` — `'self'`, хост S3-бакета и `blob:` (превью через `URL.createObjectURL`, 3.4 и 3.7).

Дополнительно: `initData` уходит только на `/api` и нигде не логируется и не хранится дольше, чем кеширует сам SDK (`sessionStorage`); `mockTelegramEnv`, локальный тестовый токен бота и `eruda` не должны попасть в prod-сборку (критерий приёмки — MINI-2, MINI-4).

---

## 4. Бот (`bot/`, aiogram 3)

### 4.1. Назначение и команды

Бот **тонкий**: не ходит в API и БД, не хранит состояние, FSM нет.

| Команда / событие | Ответ |
|---|---|
| `/start` | Приветствие («Маркетплейс автоотчётов: создавайте отчёты об осмотре авто с av.by и продавайте их покупателям») + **inline**-кнопка `InlineKeyboardButton(text="Открыть приложение", web_app=WebAppInfo(url=MINIAPP_URL))` |
| `/start <payload>` (deep link `t.me/<bot>?start=…`) | То же, кнопка ведёт на соответствующий путь |
| `/new_report` | «Вставьте ссылку av.by в приложении» + inline-кнопка `WebAppInfo(url=f"{MINIAPP_URL}/reports/new")` |
| `/help` | Короткая инструкция и контакт поддержки |
| любой текст с ссылкой av.by | Подсказка «Создайте отчёт в приложении» + кнопка `WebAppInfo(url=f"{MINIAPP_URL}/reports/new?url=<urlencoded>")`, Mini App подставит ссылку в поле |
| любой другой текст | Подсказка с кнопкой «Открыть приложение» |

**Кнопки только inline или Menu Button, не reply-клавиатура.** Mini App, открытый из `KeyboardButton(web_app=…)` (reply-клавиатура), **не получает initData** (такой режим рассчитан на `sendData`), и все запросы к `/inspector/**` будут падать с `401`. initData есть при запуске из inline-кнопки, Menu Button, прямой ссылки (`t.me/<bot>/<app>`) и из attachment menu.

### 4.2. Menu Button и Direct Link

- **Menu Button:** при старте бот вызывает `bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="Отчёты", web_app=WebAppInfo(url=MINIAPP_URL)))`. Это надёжнее, чем разовая настройка в BotFather, потому что URL меняется между окружениями (туннель в разработке). Альтернатива — BotFather → Bot Settings → Menu Button.
- **Direct Link Mini App:** BotFather → `/newapp` → short name `app` → URL Mini App. Тогда работают ссылки `https://t.me/<bot>/app?startapp=report_<id>`, их можно слать в уведомлениях, делиться ими и открывать из любого чата. Для main Mini App (`t.me/<bot>?startapp=`) нужно включить Main App в BotFather.
- Команды регистрируются через `bot.set_my_commands([...])` при старте.

### 4.3. Конфигурация

| Переменная | Назначение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Токен бота. **Тот же, что у бэкенда** (`telegram.bot-token`), иначе подпись initData не сойдётся |
| `MINIAPP_URL` | `https://app.site.by` (прод) или URL туннеля |
| `MINIAPP_DIRECT_LINK` | `https://t.me/<bot>/app`, для ссылок `startapp` |
| `TELEGRAM_TEST_ENV` | `true` — работать с тестовым окружением Telegram (`TelegramAPIServer` с суффиксом `/test`) |
| `LOG_LEVEL` | уровень логов |

Переменная `TELEGRAM_BOT_SECRET` из `env.example` в коде нигде не используется. Её нужно удалить или задокументировать.

Режим — **long polling** (`dp.start_polling`). Вебхук не нужен: бот не принимает платежей и нагрузки нет. Polling не конфликтует с тем, что бэкенд параллельно вызывает `sendMessage` тем же токеном: конфликт бывает только между двумя `getUpdates` или между `getUpdates` и webhook. Поэтому **запущен ровно один экземпляр бота** на токен.

Структура: `bot/app/__main__.py`, `config.py` (pydantic-settings), `handlers/start.py`, `handlers/fallback.py`, `keyboards.py`, `requirements.txt` (`aiogram>=3.13`, `pydantic-settings`), `Dockerfile` (python:3.12-slim), тесты хендлеров на `pytest` + `aiogram`-моках.

### 4.4. Локальная разработка

Mini App открывается в Telegram только по **HTTPS**. Варианты:

1. **Туннель (основной).** `cloudflared tunnel --url http://localhost:5173` (или ngrok) даёт `https://<random>.trycloudflare.com`. Этот URL прописывается в `MINIAPP_URL` бота (Menu Button обновится при рестарте). В `vite.config.ts` для `apps/inspector`: `server.allowedHosts: ['.trycloudflare.com']` (Vite 6 блокирует чужие хосты), `server.hmr: { clientPort: 443 }`, proxy `/api → http://localhost:8080` с rewrite, как в `apps/web`. Бэкенд запускается с настоящим токеном **dev-бота** в `TELEGRAM_BOT_TOKEN`: тестовый токен из `application-local.yml` не подойдёт, потому что initData подписывает Telegram настоящим токеном.
2. **Тестовое окружение Telegram.** Отдельный аккаунт в test DC (iOS: 10 тапов по «Настройки» → Accounts → Login to another account → Test; Desktop: Shift+Alt+правый клик по «Добавить аккаунт»), бот через тестового `@BotFather`. В тестовом окружении Mini App **можно открывать по `http://`**, включая `http://127.0.0.1:5173` в Telegram Desktop. Bot API вызывается как `https://api.telegram.org/bot<token>/test/<method>`. Это нужно поддержать и в боте (`TELEGRAM_TEST_ENV`), и в Telegram-клиенте бэкенда (BE-16).
3. **Браузер без Telegram** для вёрстки и логики: `mockTelegramEnv` + initData, подписанный локальным токеном (3.1).

**S3 в локальной разработке — неочевидная проблема.** Presigned URL строится на хосте `s3.endpoint` = `http://localhost:9000` (`application-local.yml:23`). Телефон до `localhost` компьютера не достучится, а страница по HTTPS не сможет сделать PUT на `http://` (mixed content). Нужно:
- поднять MinIO (в `docker-compose.yml` его сейчас нет) и отдельный туннель на `:9000`;
- выставить `S3_ENDPOINT=https://<minio-tunnel>`, потому что подпись включает `host`, и URL должен совпадать с тем, куда пойдёт браузер;
- правильнее разделить endpoint для серверного `S3Client` (внутренний) и для `S3Presigner` (публичный), это BE-17;
- CORS бакета должен разрешать origin туннеля Mini App.

**Отладка на телефоне:** iOS — в Telegram «Настройки» → 10 тапов по версии → Allow Web View Inspection, дальше Safari → Develop. Android — Telegram Settings → долгий тап по версии → Enable WebView Debug, дальше `chrome://inspect`. Плюс `eruda`, подключённый только в dev-сборке.

### 4.5. docker-compose

В целевой compose (`PLAN_FRONTEND.md`, «Порядок реализации», п. 7) добавляются:
```yaml
  bot:
    build: ./bot
    environment:
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      MINIAPP_URL: https://app.${PUBLIC_HOST}
      MINIAPP_DIRECT_LINK: https://t.me/${BOT_USERNAME}/app
    restart: unless-stopped
    deploy: { resources: { limits: { memory: 128M } } }
    # сеть до api не нужна: бот тонкий

  minio:                      # только для локального окружения
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
  minio-init:                 # создаёт бакет и CORS
    image: minio/mc
    depends_on: [minio]
    entrypoint: >
      sh -c "mc alias set local http://minio:9000 test test &&
             mc mb -p local/test-bucket && mc cors set local/test-bucket /cors.json"
```
`nginx`: отдельный `server` для `app.site.by` раздаёт `apps/inspector/dist` из корня (`try_files $uri /index.html`) и проксирует `/api/` → `api:8080/`. Бот и Mini App обновляются независимо.

### 4.6. Уведомления подборщику (шлёт бэкенд через Bot API)

Сейчас `NotificationSender.notify` только пишет в лог (UniSender в работе). Все вызовы для подборщика адресованы на **email** (`Channel.EMAIL`), а канала `TELEGRAM` в `Channel.java` нет. Контракт реализации — BE-16.

**Каналы (решение 2026-09-29, п. 4):** все события уходят в Telegram; колонка «Email» — дублирование на почту для самых важных.

| Событие | Где в коде сейчас | Текст | Кнопка | Email |
|---|---|---|---|---|
| Верификация | `InspectorServiceImpl.java:91` | «Ваш аккаунт подборщика подтверждён. Можно создавать отчёты» | «Открыть приложение» → `MINIAPP_URL` | ✅ |
| Бан | `InspectorServiceImpl.java:106-107` | «Аккаунт заблокирован: {reason}» | — | ✅ |
| Отчёт принят на модерацию | нет (`ReportServiceImpl.java:187`) | «Отчёт {марка модель} отправлен на модерацию» (необязательно, Mini App и так показывает) | — | — |
| Одобрен и опубликован | `ModerationServiceImpl.java:79` | «Отчёт {марка модель} опубликован и доступен покупателям» | «Открыть отчёт» → `/reports/{id}` | ✅ |
| На доработку | `ModerationServiceImpl.java:102` | «Отчёт {марка модель} требует правок: {reason}» | «Исправить» → `/reports/{id}` | — |
| Удалён (снят с продажи) | `ModerationServiceImpl.java:118` | «Отчёт {марка модель} снят с продажи модератором: {reason}» | — | — |
| **Продажа** | **нет.** `PurchaseServiceImpl.applySuccessfulPayment` уведомляет только покупателя. Место вставки — после `payoutService.createPayout` | «Ваш отчёт {марка модель} купили. +{сумма} BYN к выплате» | — | — |
| Выплата сформирована | `PayoutBatchScheduler.java:93` (расписание включено; месяц сейчас по-английски, B-62) | «Выплата за {месяц}: {сумма} BYN готова к оплате» | — | ✅ |
| **Выплата оплачена** | **нет.** `PayoutServiceImpl.markAsPaid` никого не уведомляет | «Выплата за {месяц}: {сумма} BYN переведена» | — | ✅ |
| Новый спрос на машину (позже) | нет | «3 человека ждут отчёт по {марка модель}» | «Смотреть спрос» → `/demand` | — |

Кнопка — `reply_markup` с `inline_keyboard: [[{ text, web_app: { url } }]]`. `web_app`-кнопки в сообщениях работают только в личном чате с ботом, а это как раз наш случай. Альтернатива — обычная `url`-кнопка на `MINIAPP_DIRECT_LINK?startapp=report_<id>`.

---

## 5. Чего не хватает на бэкенде

> **Сводный список всех бэкенд-доработок с общим порядком — `BACKEND_TODO.md`** (пункты этого раздела там — этап 4 и этап 1). Здесь остаются подробные контракты. BE-1 (CORS) при текущих решениях не нужен.
> Новые бэкенд-пункты по итогам `REVIEW_REPORT.md`: B-90…B-97 в `BACKEND_TODO.md` (оплата, refresh, админ-логин).

Приоритет: **P0** блокирует основной флоу Mini App; **P1** нужно до запуска с реальными подборщиками; **P2** улучшение. Бэкенд пишет пользователь («объяснение → код»), поэтому ниже контракты, а не реализация.

| # | Что | Приоритет | Блокирует фичи |
|---|---|---|---|
| BE-1 | CORS на API (только если Mini App на другом домене) + `OPTIONS` permitAll | P2 | — |
| BE-2 | `401` с `errorCode` (`TELEGRAM_AUTH_EXPIRED` / `INVALID`) | P1 | MINI-3 (улучшение) |
| BE-3 | Гейт по статусу подборщика | P1 | MINI-5 (улучшение) |
| BE-4 | Валидация регистрации (email обязателен) | P0 (одна строка) | MINI-5 |
| BE-5 | Справочник пунктов чеклиста | P1 | MINI-9 (до него локальный справочник) |
| BE-6 | Справочник панелей ЛКП | **P0** | MINI-15 |
| BE-7 | Список «мои отчёты» | **P0** | MINI-19 |
| BE-8 | Расширение `ReportDto`: машина, даты, причина доработки, URL медиа, `mediaId` | **P0** | MINI-8, MINI-17, MINI-18 |
| BE-9 | Проверки в медиа (владелец, статус, секция, префикс ключа, имя файла) | P0 (безопасность) | — |
| BE-10 | Лимиты размера и типы (`video/quicktime`) | P1 | MINI-14 |
| BE-11 | Обязательные фото (`mandatoryType`) | P1 | MINI-13 |
| BE-12 | Удаление медиа | P1 | MINI-13 |
| BE-13 | Детали `REPORT_INCOMPLETE` | P2 | MINI-17 |
| BE-14 | Ослабить валидацию для автосохранения и починить пустые списки | P1 | MINI-9, MINI-15 |
| BE-15 | `GET /inspector/demand` | P1 | MINI-20 |
| BE-16 | Уведомления в Telegram | P1 | BOT-3 |
| BE-17 | S3: публичный endpoint для presigner, MinIO в compose, CORS бакета | **P0 для локальной разработки на телефоне** | MINI-4, MINI-10 |
| BE-18 | springdoc + `/v3/api-docs` | P2 | переход на `@podbor/api` |
| BE-19 | Валидация и нормализация URL av.by, дедупликация отчёта | P1 | MINI-7 |
| BE-20 | Multipart upload для видео | P2 | MINI-14 (надёжность) |

### BE-1. CORS

Не нужен, пока Mini App и API на одном домене (решение 1). Если понадобится, то в `SecurityConfig` `http.cors(...)` во всех трёх цепочках + `CorsConfigurationSource` с origin из конфига (`app.cors.allowed-origins`), `allowedHeaders: [Content-Type, X-Telegram-Data, Authorization]`, `allowedMethods: [GET, POST, PUT, DELETE, OPTIONS]`. Без `http.cors()` preflight упадёт на `401`.

### BE-2. `401` с кодом

В `TelegramAuthFilter` при `AppException` класть код в атрибут запроса (`request.setAttribute("auth.errorCode", e.getErrorCode())`), а в `authenticationEntryPoint` писать `ProblemDetail` JSON с этим кодом (по умолчанию `UNAUTHORIZED`) вместо `sendError`.
```json
{ "status": 401, "title": "Telegram authentication has expired", "errorCode": "TELEGRAM_AUTH_EXPIRED", "path": "/inspector/reports/…" }
```

### BE-3. Гейт по статусу подборщика

`POST /inspector/reports` разрешён только для `verified`. Для `pending` — новый `ErrorCode.INSPECTOR_NOT_VERIFIED` (`403`). Все `/inspector/reports/**` и `/inspector/media/**` для `banned` отдают `403 INSPECTOR_BANNED`. `GET /inspector/` работает всегда. Удобнее всего сделать метод `inspectorService.requireActive(telegramId)`, который возвращает `InspectorDto`.

### BE-4. Регистрация

`RegisterInspectorRequest`: `email` — `@NotBlank @Email` (БД `NOT NULL`, `V004:15`), `phone` — `@NotBlank @Pattern("^\\+375\\d{9}$")` (или мягче). Иначе регистрация без email даёт `500`.

### BE-5. Справочник пунктов чеклиста

Сейчас `itemKey` — свободная строка, и список нигде не хранится. Временный справочник — `ITEM_LABELS` в `packages/ui/src/report/catalog.ts` (42 ключа).

Рекомендую **таблицу + seed-миграцию** `V010__checklist_item.sql` (как `paint_panel`): `checklist_item(id, section_key, item_key UNIQUE, title, hint, order_no, required BOOLEAN, photo_required_on BAD|WARN|NULL, active BOOLEAN)`. Проверку `itemKey ∈ справочник секции` добавить в `updateSection` (`400 UNKNOWN_CHECKLIST_ITEM`).

`GET /inspector/catalog/checklist` (путь под `/inspector/**`, чтобы работал initData; `/catalog/**` попал бы в JWT-цепочку):
```json
{
  "version": 1,
  "sections": [
    {
      "sectionKey": "EXTERIOR",
      "title": "Кузов",
      "instruction": "Осмотрите кузов при дневном свете с 4 сторон…",
      "items": [
        { "itemKey": "geometry", "title": "Геометрия кузова", "hint": "Зазоры капота и дверей равномерные…", "required": true, "photoRequiredOn": "BAD", "orderNo": 1 }
      ]
    }
  ]
}
```
Справочник кешируется на клиенте по `version`. Этот же ответ нужен админке и покупателю для подписей, их путь — `GET /catalog/checklist` с `permitAll`.

### BE-6. Справочник панелей ЛКП

`GET /inspector/catalog/paint-panels`:
```json
[ { "id": "c0ffee00-…", "code": "HOOD", "orderNo": 1 }, … ]
```
Альтернатива, которая проще для фронта: `PaintMeasurementInput` принимает `panelCode` вместо `panelId` (сервер резолвит его по `paint_panel.code`), а в `PaintMeasurementDto` добавить `panelId`. Можно сделать и то, и другое.

### BE-7. Мои отчёты

`GET /inspector/reports?status=draft,revision_required` (фильтр необязателен). Нужна миграция: `reports.updated_at TIMESTAMPTZ`, `reports.submitted_at TIMESTAMPTZ`, их нужно обновлять в `updateSection`, `updatePaintMeasurements`, `updateConclusion` и `submit`.
```json
[
  {
    "id": "5b0c…",
    "status": "revision_required",
    "versionNo": 1,
    "car": { "id": "0e7d…", "make": "Volkswagen", "model": "Passat", "year": 2017, "vin": "WVWZZZ3CZHE000000", "avbyListingUrl": "https://cars.av.by/…" },
    "priceByn": 5000,
    "createdAt": "2026-09-20T09:00:00Z",
    "updatedAt": "2026-09-21T18:30:00Z",
    "submittedAt": "2026-09-21T18:31:00Z",
    "lastModeration": { "action": "revise", "reason": "Нет фото VIN-таблички", "at": "2026-09-22T10:00:00Z" },
    "salesCount": 0
  }
]
```
Мягко удалённые отчёты не отдаются, или отдаются со `status: "deleted"` и `lastModeration.reason`, чтобы подборщик понимал, что произошло. Рекомендую второй вариант.

### BE-8. Расширение `ReportDto` для подборщика

Добавить в ответ `GET /inspector/reports/{id}`:
- `car: { make, model, year, vin, avbyListingUrl }`;
- `createdAt`, `updatedAt`, `submittedAt`;
- `lastModeration: { action, reason, at } | null` (из `moderation_log`);
- в каждом медиа `url` (presigned GET, TTL из `s3.presigned-url-ttl-minutes`, логика из `ReportAccessServiceImpl.generateViewUrl`) и `mandatoryType` (BE-11);
- сортировку `items` и `media` по `order_no` (сейчас порядок не гарантирован);
- в `paintMeasurements[]` — `panelId`.

Лучше отдельная DTO `InspectorReportDto`, чтобы не раздувать `ReportDto`, который используют админка и `ReportAccessServiceImpl`.

Заодно `confirm-upload` должен возвращать `200 { "mediaId": "…", "status": "uploaded" }` вместо `204`: тогда фронту не нужен GET, чтобы узнать id.

### BE-9. Проверки в медиа

(`PLAN_FINAL_CHECKLIST.md` 2.2, 3.5.) В `MediaController` добавить `@AuthenticationPrincipal TelegramUser`, в сервисе проверять:
- `requireEditableReport(reportId, inspectorId)` (вынести в публичный метод `ReportService`): регистрация, владелец, статус `draft` / `revision_required`;
- `sectionId`, если передан, принадлежит `reportId` → `404 SECTION_NOT_FOUND`;
- в confirm `s3key` начинается с `reports/{reportId}/` → `400 BAD_REQUEST`;
- имя файла сервер генерирует сам: `UUID + расширение по contentType`, а `fileName` из запроса игнорирует или убирает из контракта;
- `kind` согласован с `contentType` (`image/*` → `PHOTO`, `video/*` → `VIDEO`);
- идемпотентность confirm: `UNIQUE (s3_key)` + `ON CONFLICT DO NOTHING RETURNING` / `SELECT`.

### BE-10. Лимиты и типы

- Разрешить `video/quicktime`, пока нет ffmpeg-воркера.
- В confirm проверять `headObject().contentLength()`: фото ≤ 20 МБ, видео ≤ 1 ГБ (значения в `S3Properties`). При превышении удалять объект и отдавать новый `413 MEDIA_TOO_LARGE`.
- Презайнить `contentLength`, только если клиент передаёт размер в presigned-запросе: `"size": 1234567` → `.contentLength(size)`, S3 сам отклонит несовпадение.
- Отдавать лимиты клиенту: `GET /inspector/catalog/media-limits` → `{ "photoMaxBytes": 20971520, "videoMaxBytes": 1073741824, "allowedContentTypes": [...] }`, или включить их в ответ справочника BE-5.

### BE-11. Обязательные фото

Миграция: `report_media.mandatory_type TEXT NULL CHECK (mandatory_type IN ('ODOMETER','VIN_PLATE','INSPECTOR_WITH_CAR','DOCUMENTS'))`. `PresignedUrlRequest` и `ConfirmUploadRequest` получают необязательное поле `mandatoryType`. Если оно задано, `sectionId` должен быть `null`, ключ — `reports/{reportId}/mandatory/{type}/{uuid}.jpg` (как в `tech-stack-detailed.md`, «S3 структура бакета»). `submitForModeration` проверяет, что есть хотя бы по одному фото каждого типа. `ReportMediaDto` получает поле `mandatoryType`.

### BE-12. Удаление медиа

`DELETE /inspector/media/{mediaId}` → `204`. Проверки: медиа принадлежит отчёту подборщика, отчёт редактируемый. Удаляется строка и объект S3 (`deleteObject`, ошибку S3 логировать, но не падать).
Ошибки: `404 MEDIA_NOT_FOUND`, `403 REPORT_ACCESS_DENIED`, `409 REPORT_NOT_EDITABLE`.
Позже понадобится `PUT /inspector/reports/{id}/media/order` → `{ "sectionId": "…", "mediaIds": ["…"] }` для порядка фото.

### BE-13. Детали `REPORT_INCOMPLETE`

`AppException` с дополнительными свойствами (или отдельный `ReportIncompleteException`). В `ProblemDetail` добавить:
```json
{
  "errorCode": "REPORT_INCOMPLETE",
  "missing": [
    { "type": "SECTION_SUMMARY", "sectionKey": "ENGINE" },
    { "type": "SECTION_ITEMS", "sectionKey": "ENGINE" },
    { "type": "VIDEO" },
    { "type": "CONCLUSION" },
    { "type": "PRICE" },
    { "type": "MANDATORY_PHOTO", "mandatoryType": "VIN_PLATE" }
  ]
}
```
Проверки собирать все сразу, не останавливаясь на первой. Опционально добавить `GET /inspector/reports/{id}/readiness` → `{ "ready": false, "missing": [...] }`, тогда фронт не дублирует правила.

### BE-14. Автосохранение без лишней валидации

- `UpdateSectionRequest.summary`: убрать `@NotBlank`, заменить на `@NotNull`. Проверка непустого summary уже есть в submit (`ReportServiceImpl.java:164`).
- `SectionItemInput.status`: оставить `@NotNull` (неоценённые пункты просто не отправляются).
- Пустые `items` и `measurements`: пропускать `insert.execute()`, когда список пуст. Сейчас это, скорее всего, `500`. Добавить тест на `items: []`.
- `UpdateConclusionRequest`: разрешить частичное сохранение (`conclusionText` и `priceByn` nullable, проверка в submit уже есть, `:183`). `priceByn` — `@Positive`.
- `PaintMeasurementInput.thicknessUm`: `@Min(1) @Max(5000)`.

### BE-15. Спрос

`GET /inspector/demand?limit=50` по `report_requests` (`V006`), группировка по `car_id`:
```json
[
  {
    "car": { "id": "0e7d…", "make": "Volkswagen", "model": "Passat", "year": 2017, "vin": null, "avbyListingUrl": "https://cars.av.by/…", "listingStatus": "active" },
    "waitingCount": 7,
    "lastRequestedAt": "2026-09-26T15:00:00Z",
    "publishedReportsCount": 0,
    "myReportId": null
  }
]
```
Сортировка по `waitingCount desc`, по умолчанию исключать машины, на которые уже есть опубликованный отчёт. `myReportId` — черновик этого подборщика по машине, если есть. Тогда кнопка «Продолжить», а не «Создать».

### BE-16. Уведомления в Telegram

- `Channel.TELEGRAM` в `auth/dto/Channel.java` (или отдельный интерфейс `InspectorNotifier`, чтобы не смешивать с OTP).
- `TelegramBotClient` на `RestClient`: `POST https://api.telegram.org/bot{token}/sendMessage` (для тестового окружения — `/bot{token}/test/sendMessage`, флаг `telegram.test-env`). Тело: `{ "chat_id": <telegram_user_id>, "text": "…", "parse_mode": "HTML", "reply_markup": { "inline_keyboard": [[{ "text": "Исправить", "web_app": { "url": "https://app.site.by/reports/<id>" } }]] } }`.
- Новые свойства: `telegram.miniapp-url`, `telegram.test-env`.
- Отправка **после коммита** (`@TransactionalEventListener(phase = AFTER_COMMIT)` + `@Async`): сейчас `notify` вызывается внутри `@Transactional` (например, `ModerationServiceImpl.java:79,102,118`), и при откате транзакции сообщение уже улетело бы.
- Ошибки: `403` (пользователь заблокировал бота или не запускал его) логировать без повторов, `429` — повтор через `retry_after`, `5xx` — 3 повтора.
- События и тексты — таблица в 4.6. Особенно важны «на доработку» (с причиной) и «продажа», которой сейчас нет вообще.
- **Каналы:** Telegram для всех событий; для отмеченных в колонке «Email» (верификация, бан, опубликован, выплата сформирована/оплачена) — дополнительно письмо через UniSender. Ошибка одного канала не мешает другому. Новое событие «выплата оплачена» — в `PayoutServiceImpl.markAsPaid`.

### BE-17. S3 для Mini App

- `S3Properties.publicEndpoint`: презайнер строится на публичном endpoint, `S3Client` — на внутреннем (в compose `http://minio:9000`, снаружи — туннель или домен).
- MinIO + `minio-init` в `docker-compose.yml` (4.5).
- CORS бакета (2.9) — отдельная инструкция для hoster.by в README.

### BE-18. springdoc

`springdoc-openapi-starter-webmvc-ui`, `permitAll` для `/v3/api-docs/**` и `/swagger-ui/**` в `defaultChain`. Описать security scheme `X-Telegram-Data` (apiKey in header) для `/inspector/**`. После этого `packages/api` генерирует типы, и ручные `types.ts` удаляются.

### BE-19. URL av.by и дубли отчётов

- Валидация: `URI` парсится, схема `https`/`http`, хост `av.by` или `*.av.by`, иначе новый `400 INVALID_AVBY_URL` (заодно закрывает SSRF). `IllegalArgumentException` от Jsoup больше не превращается в `500`.
- Нормализация перед поиском и сохранением: без query, фрагмента и завершающего `/`, хост в нижнем регистре.
- Дедупликация: `UNIQUE (car_id, inspector_id) WHERE deleted_at IS NULL` (`PLAN_FINAL_CHECKLIST.md` 3.3). При повторе отдавать `409 REPORT_ALREADY_EXISTS` со свойством `reportId` в `ProblemDetail`. Тогда Mini App откроет существующий черновик, а `POST` станет безопасно повторяемым.
- В `CreateReportResponse` добавить `car` (make, model, year, vin): Mini App сразу покажет, что распознано, и подборщик проверит, та ли это машина.

### BE-20. Multipart upload для видео

`POST /inspector/media/multipart/{reportId}/init` `{ contentType, size, kind }` → `{ uploadId, s3Key, partSize, parts: [{ partNumber, url }] }`; `POST …/complete` `{ uploadId, s3Key, parts: [{ partNumber, etag }] }` (внутри — confirm); `POST …/abort`. Части по 8–16 МБ. Клиент запоминает загруженные части в IndexedDB и после переоткрытия докачивает только недостающие. Для CORS бакета нужен `ExposeHeaders: ["ETag"]` (уже в 2.9). Для S3 также нужна lifecycle-политика `AbortIncompleteMultipartUpload` через 1 день.

---

## 6. Разбивка на фичи

Порядок: сначала инфраструктура, потом всё, для чего бэкенд уже готов, потом фичи, которые ждут бэкенд (их можно начинать на моках). Оценка каждой — 0,5–1 день.

Обозначения зависимостей: `MINI-n` / `BOT-n` — другие фичи, `BE-n` — бэкенд из раздела 5.

### Фаза 0. Инфраструктура

#### MINI-1. Каркас `apps/inspector`
- **Цель:** приложение собирается и запускается в workspace.
- **Состав:** `apps/inspector` (Vite 6, React 19, TS ~5.9), зависимости `@telegram-apps/telegram-ui`, `@telegram-apps/sdk-react`, `react-router`, `@tanstack/react-query`, `zustand`, `@podbor/ui`, `tailwindcss` (для `ReportView`). `vite.config.ts`: `base: '/'` (поддомен `app.site.by`), proxy `/api → :8080` с rewrite, `allowedHosts` для туннеля, `hmr.clientPort`. Скрипт `dev:inspector` в корневом `package.json`. Скелет роутов из 1.2 с заглушками. `AppRoot` из telegram-ui, подключение `@podbor/ui/theme.css`. ESLint и tsconfig наследуют `tsconfig.base.json`.
- **Эндпоинты:** нет.
- **Зависимости:** нет.
- **Критерии приёмки:**
  - [ ] `npm run dev:inspector` открывает приложение (порт 5175, чтобы не конфликтовать с web 5173 и admin 5174);
  - [ ] `npm run build` и `npm run typecheck` проходят для всего workspace;
  - [ ] на тестовой странице рендерится `ReportView` на моке из `apps/web/src/mocks/report.ts` (стили Tailwind не конфликтуют с telegram-ui);
  - [ ] прямой заход на `/reports/123` отдаёт SPA, а не 404.
- **Моки:** всё.

#### MINI-2. Telegram SDK: инициализация, тема, кнопки, окружение
- **Цель:** приложение корректно живёт внутри Telegram и в браузере.
- **Состав:** `src/telegram/init.ts` (последовательность из 3.1, `isAvailable`-guard), `mockTelegramEnv` для dev с initData, подписанным локальным токеном (`scripts/sign-init-data.ts`), хуки `useMainButton`, `useBackButton` (синхронизация с роутером), `useClosingConfirmation(enabled)`, `useHaptic`, привязка темы (`bindCssVars`, `appearance`, `platform`), `swipeBehavior.disableVertical` в мастере, разбор `start_param` → начальный роут (1.3), экран `/not-in-telegram` для прода.
- **Эндпоинты:** нет.
- **Зависимости:** MINI-1.
- **Критерии приёмки:**
  - [ ] в Telegram (через MINI-4) цвета следуют светлой и тёмной теме и меняются без перезагрузки при смене темы;
  - [ ] BackButton скрыт на корневых экранах и ведёт назад на вложенных;
  - [ ] MainButton показывается и скрывается хуком, обработчик снимается при уходе с экрана (нет двойных срабатываний);
  - [ ] `startapp=report_<uuid>` открывает `/reports/<uuid>`, мусорный параметр ведёт на `/`;
  - [ ] в обычном браузере в dev приложение работает с мок-окружением;
  - [ ] `mockTelegramEnv` и локальный тестовый токен бота (3.1) не попадают в prod-сборку (проверить бандл).
- **Моки:** всё. Проверка в реальном Telegram после MINI-4.

#### MINI-3. API-клиент и обработка ошибок
- **Цель:** единый слой доступа к `/inspector/**`.
- **Состав:** `src/api/client.ts` (fetch-wrapper: `X-Telegram-Data` из `retrieveRawInitData()`, таймауты, разбор `ProblemDetail` → `ApiError`, различение сетевой и HTTP-ошибки), `src/api/types.ts` (ручные зеркала `InspectorDto`, `ReportDto`, `ReportSectionDto`, `SectionItemDto`, `ReportMediaDto`, `PaintMeasurementDto`, `PresignedUrlResponse`, `CreateReportResponse` и тел запросов), `src/api/errors.ts` (таблица 2.10 `errorCode → текст`), `src/api/inspector.ts` (функции для всех 10 эндпоинтов из 2.2 с точными путями, включая `/inspector/` со слешем и поле `s3key` в confirm), глобальный обработчик `401` → `/session-expired`, таймер истечения по `authDate`, MSW-хендлеры для всех эндпоинтов и для контрактов BE-*, флаг `VITE_API_MOCKS`.
- **Эндпоинты:** все из 2.2 (обёртки).
- **Зависимости:** MINI-1, MINI-2.
- **Критерии приёмки:**
  - [ ] каждый запрос несёт `X-Telegram-Data`, строка передаётся без изменений;
  - [ ] ответ с `errorCode` показывает русский текст из таблицы, ответ без `errorCode` (400/404/500) — общий текст по статусу;
  - [ ] `400 BAD_REQUEST` с `errors[]` раскладывается по полям формы (`items[0].status` → поле пункта);
  - [ ] любой `401` ведёт на `/session-expired` без бесконечных ретраев;
  - [ ] за 10 минут до `authDate + 24h` появляется баннер;
  - [ ] с `VITE_API_MOCKS=1` все экраны работают без бэкенда;
  - [ ] unit-тесты на разбор `ProblemDetail` и на таблицу ошибок.
- **Моки:** MSW — это часть фичи.

#### MINI-4. Локальный запуск в Telegram через туннель
- **Цель:** разработчик открывает локальный Mini App в Telegram на телефоне, и тот ходит в локальный бэкенд.
- **Состав:** инструкция `apps/inspector/README.md` (dev-бот в BotFather, cloudflared для `:5173` и `:9000`, env бэкенда: `TELEGRAM_BOT_TOKEN` dev-бота, `S3_ENDPOINT` туннеля MinIO), настройка `allowedHosts`, eruda в dev, описание тестового окружения Telegram как альтернативы, скрипт `npm run tunnel` (если cloudflared установлен).
- **Эндпоинты:** `GET /inspector/` (дымовой тест).
- **Зависимости:** MINI-3, BOT-1 (или ручная Menu Button в BotFather). Для медиа — BE-17 (MinIO + публичный endpoint), без него медиа проверяются только в десктопном браузере с мок-окружением.
- **Критерии приёмки:**
  - [ ] Mini App открывается из Menu Button dev-бота на iOS и Android;
  - [ ] `GET /inspector/` проходит с настоящим initData (бэкенд с токеном dev-бота);
  - [ ] HMR работает через туннель;
  - [ ] eruda открывается на телефоне в dev-сборке и отсутствует в prod-сборке.
- **Моки:** нет, это интеграционная фича.

#### BOT-1. Каркас бота: `/start`, Menu Button, конфигурация
- **Цель:** бот открывает Mini App.
- **Состав:** `bot/` (aiogram 3, pydantic-settings, 4.3), хендлеры `/start` (inline `WebAppInfo`) и `/help`, fallback, установка Menu Button и команд при старте, `Dockerfile`, `requirements.txt`, `.env.example` бота, запуск polling.
- **Эндпоинты:** Bot API (`setChatMenuButton`, `setMyCommands`).
- **Зависимости:** нет. Для открытия реального Mini App нужен URL (MINI-4 или любой HTTPS со статикой).
- **Критерии приёмки:**
  - [ ] `/start` присылает приветствие с inline-кнопкой, и Mini App открывается **с initData** (проверить `GET /inspector/`);
  - [ ] Menu Button «Отчёты» открывает Mini App;
  - [ ] смена `MINIAPP_URL` + рестарт обновляют Menu Button;
  - [ ] `docker build ./bot` собирается, контейнер стартует с env;
  - [ ] тесты хендлеров (`pytest`) проверяют клавиатуры.
- **Моки:** Bot API в тестах.

### Фаза 1. Бэкенд уже готов

#### MINI-5. Онбординг: bootstrap, регистрация, ожидание, бан
- **Цель:** маршрутизация по статусу подборщика.
- **Экраны и компоненты:** `/` (bootstrap), `/register` (форма react-hook-form + zod: ФИО с предзаполнением из `initData.user`, телефон с маской `+375`, **email обязателен**), `/pending` (перезапрос по `activated` и pull-to-refresh), `/banned`, `/profile` (данные `InspectorDto`), запрос `requestWriteAccess()` после регистрации.
- **Эндпоинты:** `GET /inspector/`, `POST /inspector/register`.
- **Зависимости:** MINI-3. Бэкенд готов. BE-4 желателен (без него фронт сам не пропускает пустой email), BE-3 — серверная защита.
- **Критерии приёмки:**
  - [ ] `404 INSPECTOR_NOT_FOUND` ведёт на `/register`, `pending` — на `/pending`, `verified` — на `/reports`, `banned` — на `/banned`;
  - [ ] после успешной регистрации открывается `/pending` без повторного запроса;
  - [ ] `409 INSPECTOR_ALREADY_REGISTERED` трактуется как успех (перезапрос профиля);
  - [ ] ошибки `errors[]` показываются у полей;
  - [ ] пользователь `pending` не может попасть в `/reports/new` и мастер, даже по прямой ссылке или `startapp`;
  - [ ] при возврате в Mini App статус перечитывается.
- **Моки:** все четыре статуса в MSW.

#### MINI-6. Навигация и главная
- **Цель:** оболочка для верифицированного подборщика.
- **Экраны и компоненты:** таб-бар (`Отчёты / Спрос / Профиль`) на telegram-ui `Tabbar`, `/reports` с кнопкой «Новый отчёт» и списком из **локального индекса** (3.3, п. 9): `GET` по каждому `reportId` с отображением статуса и пустым состоянием, `/demand` как заглушка «скоро».
- **Эндпоинты:** `GET /inspector/reports/{id}` (для каждого из индекса).
- **Зависимости:** MINI-5.
- **Критерии приёмки:**
  - [ ] табы переключаются, BackButton на табах скрыт;
  - [ ] созданный на устройстве отчёт появляется в списке со статусом (черновик, на модерации, на доработке, опубликован);
  - [ ] отчёт, получивший `404`, исчезает из индекса с пометкой «удалён»;
  - [ ] пустое состояние с подсказкой «Создайте первый отчёт».
- **Моки:** да.

#### MINI-7. Создание отчёта по ссылке av.by
- **Цель:** подборщик вставляет ссылку и попадает в мастер.
- **Экраны и компоненты:** `/reports/new`: поле URL, кнопка «Вставить», подстановка из `?url=` (от бота), нормализация и проверка домена (2.4), MainButton «Создать отчёт» с лоадером, текст «Загружаем объявление с av.by…», обработка ошибок, запись в локальный индекс, переход на `/reports/:id`.
- **Эндпоинты:** `POST /inspector/reports`.
- **Зависимости:** MINI-6. Бэкенд готов. BE-19 и BE-3 — улучшения.
- **Критерии приёмки:**
  - [ ] `https://cars.av.by/.../123?utm=x#a` отправляется как `https://cars.av.by/.../123`;
  - [ ] ссылка не на av.by не отправляется, показывается ошибка валидации;
  - [ ] `404 CAR_LISTING_NOT_FOUND`, `502 PARSER_ERROR`, `403 INSPECTOR_BANNED` дают понятные тексты;
  - [ ] при таймауте или сетевой ошибке POST не повторяется автоматически, предлагается «Проверить мои отчёты»;
  - [ ] двойной тап не создаёт два отчёта (кнопка заблокирована на время запроса);
  - [ ] после успеха `reportId` лежит в индексе, открыт хаб отчёта.
- **Моки:** все варианты ответа.

#### MINI-8. Хаб отчёта и каркас мастера
- **Цель:** загрузка отчёта, модель черновика, навигация по шагам.
- **Экраны и компоненты:** `/reports/:id` (шапка: машина — пока из URL или «Автомобиль» до BE-8; статус; список шагов с прогрессом «заполнено / частично / пусто» и индикатором синхронизации), стор черновика (3.3) с `persist`, слияние сервер ↔ черновик, `WizardLayout` (шапка с прогрессом шагов и индикатором очереди, MainButton «Далее», BackButton — предыдущий шаг), режим только для чтения для `pending_review` / `published`, closing confirmation при `dirty`.
- **Эндпоинты:** `GET /inspector/reports/{id}`.
- **Зависимости:** MINI-7. Бэкенд готов. BE-8 — для шапки и медиа.
- **Критерии приёмки:**
  - [ ] `sectionId` каждой секции берётся из `GET` по `sectionKey`;
  - [ ] порядок шагов: старт → 7 секций в порядке `orderNo` (ЛКП включает замеры) → видео → заключение → проверка;
  - [ ] после перезагрузки Mini App несохранённые локальные правки на месте и помечены `dirty`;
  - [ ] отчёт `pending_review` открывается только на чтение, MainButton скрыт;
  - [ ] `404 REPORT_NOT_FOUND` показывает экран «удалён» и чистит черновик;
  - [ ] при закрытии с `dirty`-данными Telegram спрашивает подтверждение.
- **Моки:** отчёты во всех статусах.

#### MINI-9. Шаг секции: чеклист, оценки, итог, автосохранение
- **Цель:** заполнение одной секции с надёжным сохранением.
- **Экраны и компоненты:** `/reports/:id/section/:sectionKey`: инструкция секции, список пунктов из справочника (временно `ITEM_LABELS` + локальная раскладка по секциям в `apps/inspector/src/catalog/checklist.ts`, до BE-5), у каждого пункта сегмент OK/WARN/BAD (цвет + иконка + текст) и комментарий (обязателен при WARN/BAD на фронте), поле «Итог секции» (`summary`), индикатор «Сохранено / На устройстве / Ошибка». Автосохранение по правилам 3.3: полный список пунктов, только оценённые, одна секция — один запрос, debounce и flush.
- **Эндпоинты:** `PUT /inspector/reports/{id}/sections/{sectionId}`.
- **Зависимости:** MINI-8. Бэкенд готов (с ограничениями из 2.6). BE-5 и BE-14 — улучшения.
- **Критерии приёмки:**
  - [ ] без `summary` запрос не уходит, индикатор показывает «На устройстве»;
  - [ ] при изменении одного пункта уходит PUT со **всеми** оценёнными пунктами секции в порядке справочника;
  - [ ] пустой список пунктов никогда не отправляется;
  - [ ] быстрые изменения не создают параллельных PUT одной секции, последнее состояние доходит до сервера;
  - [ ] уход с шага (BackButton или MainButton) дожидается flush или оставляет `dirty` при офлайне;
  - [ ] `409 REPORT_NOT_EDITABLE` переводит экран в режим чтения;
  - [ ] после перезагрузки данные совпадают с сервером (перечитать и сравнить).
- **Моки:** да.

#### MINI-10. Медиа-конвейер: одна загрузка end-to-end
- **Цель:** надёжный путь presigned → PUT → confirm для одного файла.
- **Состав:** `src/media/upload.ts`: `presign(reportId, {sectionId, fileName, contentType})`, `putToS3(url, blob, contentType, onProgress)` на XHR, `confirm(reportId, {sectionId, s3key, kind})`, генерация `fileName = uuid + ext`, обработка `403` от S3 (перезапрос URL), проверка confirm через `GET` при неясном исходе (2.9).
- **Эндпоинты:** `POST /inspector/media/presigned-url/{reportId}`, S3 PUT, `POST /inspector/media/confirm-upload/{reportId}`.
- **Зависимости:** MINI-8. Для проверки на телефоне — BE-17 и CORS бакета.
- **Критерии приёмки:**
  - [ ] фото, загруженное с `sectionId`, появляется в `sections[].media`, а без него — в `globalMedia`;
  - [ ] `Content-Type` PUT совпадает с presigned, других заголовков нет;
  - [ ] прогресс отображается от 0 до 100 %;
  - [ ] просроченный URL (эмуляция) перезапрашивается автоматически;
  - [ ] повторный confirm после таймаута не создаёт дубль (проверка через GET);
  - [ ] интеграционный тест против локального MinIO (Playwright или ручной сценарий в README).
- **Моки:** MSW для API + фейковый S3-хендлер.

#### MINI-11. Очередь загрузок в памяти, повтор (MVP)
- **Цель:** загрузки переживают плохую сеть, пока Mini App открыт (решение 2026-09-29, п. 3).
- **Состав:** стор очереди в памяти (3.4, MVP), воркер очереди (параллельность 2, видео отдельно, backoff), пауза и возобновление по сети и `activated`, экран или шит `/uploads`, общий индикатор в `WizardLayout`, closing confirmation и баннер «Не закрывайте приложение» при активной очереди. IndexedDB и восстановление после закрытия — второй этап (MINI-23).
- **Эндпоинты:** те же, что MINI-10.
- **Зависимости:** MINI-10.
- **Критерии приёмки:**
  - [ ] в авиарежиме фото встают в очередь, после включения сети грузятся сами (приложение открыто);
  - [ ] при попытке закрыть Mini App с активной очередью Telegram спрашивает подтверждение;
  - [ ] `4xx` от API переводит задачу в `failed` с кнопками «Повторить» и «Удалить»;
  - [ ] индикатор показывает «N из M»;
  - [ ] после перезапуска Mini App уже загруженные фото видны (по серверному `url`, BE-8), недогруженных нет — и это видно на экране секции.
- **Моки:** да (MSW + фейковый S3 с задержками и обрывами).

#### MINI-12. Обработка фото: HEIC → JPEG, ресайз, миниатюры
- **Цель:** все фото уходят как JPEG разумного размера.
- **Состав:** `src/media/processImage.ts` в Web Worker (3.5): определение HEIC, `createImageBitmap` с fallback на lazy `heic2any`, ориентация, ресайз до 2560, JPEG 0.82, миниатюра 480, последовательная обработка, освобождение памяти. Интеграция в постановку в очередь. **Загрузка миниатюры:** вторым объектом в S3 через второй presigned PUT (`thumbUploadUrl`/`thumbS3Key`, см. `PLAN_MEDIA_THUMBNAILS.md` 3.2); confirm дополнительно отправляет `thumbS3Key`, `width`, `height`. До реализации бэкенда (**B-39**) миниатюра остаётся только локальной — для очереди и превью на этом устройстве.
- **Эндпоинты:** нет. Загрузка миниатюры — B-39.
- **Зависимости:** MINI-11.
- **Критерии приёмки:**
  - [ ] HEIC с iPhone загружается как `image/jpeg`, вертикальное фото не повёрнуто;
  - [ ] фото 12 Мп на 4–8 МБ становится ≤ 1,5 МБ;
  - [ ] 20 фото подряд не роняют WebView на iPhone среднего класса;
  - [ ] в итоговом JPEG нет EXIF GPS;
  - [ ] `heic2any` не попадает в основной бандл (проверить отчёт сборки);
  - [ ] при наличии B-39 миниатюра 480 px грузится вторым presigned PUT, confirm отправляет `thumbS3Key`, `width`, `height`.
- **Моки:** не нужны (чистая клиентская логика, тестовые файлы в фикстурах).

#### MINI-13. Фото в секциях и обязательные фото
- **Цель:** UI съёмки и галереи в мастере.
- **Экраны и компоненты:** блок фото на шаге секции (кнопки «Камера» и «Галерея», сетка миниатюр со статусом загрузки, полноэкранный просмотр), шаг `/reports/:id/start` со слотами «Одометр», «VIN-табличка», «Подборщик у машины», «Документы» (глобальные фото + локальный тег в `localMediaTags` до BE-11), подтверждение перед загрузкой (потому что удаления нет, BE-12), при наличии BE-12 — кнопка «Удалить».
- **Эндпоинты:** медиа (через очередь). BE-11 и BE-12 — когда появятся.
- **Зависимости:** MINI-12. Без BE-11 теги видны только на этом устройстве, без BE-12 нельзя удалить, без B-39 миниатюра не покидает устройство (сетка показывает локальный `thumb`). Принятый риск (S-22): клиентская миниатюра может не совпадать с полным фото (подмена в сетке) — вариант A сознательно доверяет проверенным подборщикам, записано как техдолг бэкенда B-97.
- **Критерии приёмки:**
  - [ ] фото секции попадают в `sections[].media` нужной секции;
  - [ ] слоты обязательных фото показывают «заполнено», когда фото загружено;
  - [ ] перед загрузкой показывается превью с подтверждением;
  - [ ] после перезагрузки миниатюры своих фото на месте (из IndexedDB);
  - [ ] в отчёте только для чтения кнопок съёмки нет.
- **Моки:** да, включая контракт BE-11 и BE-12 в MSW.

#### MINI-14. Видео обхода
- **Цель:** загрузка одного глобального видео, которое засчитывает submit.
- **Экраны и компоненты:** `/reports/:id/video`: запись или выбор, проверка типа и размера (3.5), подсказки («до 3 минут», «Наиболее совместимый» для iPhone), загрузка с процентами, Wake Lock, предупреждение «не закрывайте», замена видео (новое загружается, а старое остаётся в БД до BE-12, и фронт показывает последнее). **Постер** — первый кадр, снятый через `<video>` + canvas, грузится тем же способом, что миниатюра фото (вторым presigned PUT, 3.2 `PLAN_MEDIA_THUMBNAILS.md`; до B-39 — только локально).
- **Эндпоинты:** медиа с `sectionId = null`, `kind = VIDEO`, `contentType = video/mp4`.
- **Зависимости:** MINI-11. `video/quicktime` с iPhone — BE-10 (до него обход из 3.5). Надёжность больших файлов — BE-20. Постер — B-39 (как в MINI-12).
- **Критерии приёмки:**
  - [ ] видео с Android (`mp4`) загружается и появляется в `globalMedia` со статусом `pending`;
  - [ ] видео уходит с `sectionId = null` и `kind = VIDEO`, так что submit его засчитывает;
  - [ ] файл больше лимита отклоняется до загрузки;
  - [ ] `.MOV` с iPhone обрабатывается по выбранной стратегии (BE-10 или обход) и не падает с непонятной ошибкой;
  - [ ] прогресс и повтор после обрыва работают (с начала, до BE-20).
- **Моки:** да.

#### MINI-16. Заключение и цена
- **Цель:** итог отчёта.
- **Экраны и компоненты:** `/reports/:id/conclusion`: текст заключения (с подсказкой-шаблоном: плюсы, минусы, рекомендация), цена в BYN (ввод «50» или «49,90» → копейки), автосохранение при заполненных обоих полях.
- **Эндпоинты:** `PUT /inspector/reports/{id}/conclusion`.
- **Зависимости:** MINI-8. Бэкенд готов.
- **Критерии приёмки:**
  - [ ] «50» отправляется как `5000`, «49,90» — как `4990`;
  - [ ] цена `< 1` BYN или пустая не отправляется, показывается ошибка;
  - [ ] без текста или цены состояние «На устройстве»;
  - [ ] сохранённые значения восстанавливаются из `GET` (копейки → BYN).
- **Моки:** да.

#### MINI-17. Проверка, превью и отправка на модерацию
- **Цель:** подборщик видит, что осталось, и отправляет отчёт.
- **Экраны и компоненты:** `/reports/:id/review`: flush всех черновиков и ожидание очереди, перечитывание `GET`, чек-лист готовности (таблица 2.8) со ссылками на шаги, превью `ReportView` через адаптер (3.7), MainButton «Отправить на модерацию» (активна только при выполненных блокирующих пунктах), `popup` с подтверждением, `/reports/:id/done`, удаление черновика.
- **Эндпоинты:** `GET /inspector/reports/{id}`, `POST /inspector/reports/{id}/submit`.
- **Зависимости:** MINI-9, MINI-13, MINI-14, MINI-16. Бэкенд готов. BE-8 (URL медиа, машина) и BE-13 — улучшения.
- **Критерии приёмки:**
  - [ ] чек-лист совпадает с серверной проверкой: на отчёте, где фронт показывает «готово», submit не получает `REPORT_INCOMPLETE` (набор тест-кейсов по правилам 2–4 из 2.8);
  - [ ] видео, привязанное к секции, чек-лист **не** засчитывает;
  - [ ] пока есть незавершённые загрузки или несохранённые правки, отправка недоступна;
  - [ ] превью показывает все секции, стоп-факторы (подписи из справочника), ЛКП и медиа, включая локальные;
  - [ ] при сетевой ошибке submit повторяется, `409 REPORT_NOT_EDITABLE` после повтора трактуется как успех после перечитывания;
  - [ ] после отправки отчёт открывается только на чтение со статусом «На модерации».
- **Моки:** да.

#### MINI-18. Доработка после `revision_required`
- **Цель:** замкнуть цикл модерации.
- **Экраны и компоненты:** баннер «Требуются правки» в хабе и в мастере с причиной (из `lastModeration`, BE-8; до этого — «Причина в сообщении от бота»), те же шаги мастера в режиме редактирования, повторная отправка через MINI-17, вход по `startapp=report_<id>` и по web_app-кнопке уведомления.
- **Эндпоинты:** те же, что мастер.
- **Зависимости:** MINI-17. Причина доработки — BE-8, уведомление — BE-16 / BOT-3.
- **Критерии приёмки:**
  - [ ] отчёт в `revision_required` редактируется, а `pending_review` — нет;
  - [ ] причина видна, если бэкенд её отдаёт;
  - [ ] повторная отправка переводит отчёт в `pending_review`;
  - [ ] глубокая ссылка из уведомления открывает именно этот отчёт.
- **Моки:** да, с `lastModeration`.

#### MINI-21. Плохой интернет: офлайн-режим и устойчивость — **второй этап**
> Перенесено из MVP решением 2026-09-29 (п. 3). В MVP остаются только баннер офлайна и пауза очереди (MINI-11).
- **Цель:** приложение предсказуемо ведёт себя без сети.
- **Состав:** стор состояния сети (3.6), баннер офлайна, `persistQueryClient` для профиля и открытых отчётов, `networkMode: 'offlineFirst'`, правила повторов для мутаций (3.6), блокировка создания отчёта без сети, ручной тест-план («авиарежим на каждом шаге»).
- **Эндпоинты:** все.
- **Зависимости:** MINI-9, MINI-11, MINI-17.
- **Критерии приёмки:**
  - [ ] открытый ранее отчёт открывается в авиарежиме, правки копятся локально;
  - [ ] при появлении сети правки и загрузки уходят без действий пользователя;
  - [ ] в офлайне нет бесконечных спиннеров, все блокирующие действия объясняют, почему недоступны;
  - [ ] тест-план пройден на iOS и Android.
- **Моки:** MSW с режимом «сеть пропала».

#### BOT-2. `/new_report`, deep links, Direct Link Mini App
- **Цель:** быстрый вход в нужный экран из бота.
- **Состав:** `/new_report` (кнопка на `/reports/new`), распознавание ссылки av.by в сообщении (кнопка с `?url=`), `/start <payload>`, регистрация Direct Link Mini App в BotFather (`/newapp`) и документирование ссылок `startapp`, `set_my_commands`.
- **Эндпоинты:** Bot API.
- **Зависимости:** BOT-1, MINI-2 (разбор `start_param`), MINI-7 (приём `?url=`).
- **Критерии приёмки:**
  - [ ] `/new_report` открывает Mini App сразу на создании отчёта;
  - [ ] отправка ссылки av.by боту даёт кнопку, которая открывает Mini App с подставленной ссылкой;
  - [ ] `https://t.me/<bot>/app?startapp=report_<id>` открывает отчёт;
  - [ ] во всех случаях Mini App получает initData (не reply-клавиатура).
- **Моки:** Bot API в тестах.

#### BOT-4. Бот и Mini App в docker-compose и деплой статики
- **Цель:** всё поднимается одной командой.
- **Состав:** сервис `bot` в `docker-compose.yml`, `nginx`-конфиг: отдельный `server` для `app.site.by`, раздающий SPA из корня (`try_files $uri /index.html`, кеширование ассетов с хешами, `index.html` без кеша) плюс `location /api/` на `api:8080`, MinIO + `minio-init` с CORS для локалки (если BE-17 ещё не сделан — вместе с ним), переменные в `env.example`.
- **Эндпоинты:** нет.
- **Зависимости:** BOT-1, MINI-1. Сервис `api` в compose (`PLAN_FINAL_CHECKLIST.md`, раздел 5, Dockerfile) — общее предусловие.
- **Критерии приёмки:**
  - [ ] `docker compose up` поднимает nginx со статикой Mini App, бота и MinIO с бакетом и CORS;
  - [ ] `https://app.site.by/reports/x` отдаёт SPA, `/api/inspector/` проксируется;
  - [ ] после деплоя новой версии пользователи получают свежий `index.html`.
- **Моки:** нет.

### Фаза 2. Ждут бэкенд (можно начинать на моках)

#### MINI-15. Замеры ЛКП
- **Цель:** ввод толщины ЛКП по 15 панелям.
- **Экраны и компоненты:** `/reports/:id/paint`: схема кузова `PaintDiagram` из `@podbor/ui` (тап по панели) + список панелей в порядке `orderNo` с подписями `PANEL_LABELS`, ввод мкм (числовая клавиатура), несколько точек на панель (`spot`), заметка, мгновенная подсветка по шкале `paintLevel()`, автосохранение полным списком.
- **Эндпоинты:** `PUT /inspector/reports/{id}/paint`, **BE-6** (`GET /inspector/catalog/paint-panels` или приём `panelCode`).
- **Зависимости:** MINI-8. **Блокер отправки на сервер — BE-6.** До него замеры хранятся только в черновике. BE-14 — очистка всех замеров.
- **Критерии приёмки:**
  - [ ] все 15 панелей из справочника, `panelId` берётся из ответа BE-6 (или отправляется `panelCode`);
  - [ ] PUT содержит полный список замеров по всем панелям;
  - [ ] значения вне 1–5000 мкм не принимаются;
  - [ ] после перезагрузки замеры восстанавливаются из `GET` (сопоставление `panelCode` → панель);
  - [ ] пустой список не отправляется (до BE-14).
- **Моки:** MSW-контракт BE-6 со случайными UUID.

#### MINI-19. Мои отчёты с сервера
- **Цель:** полный список отчётов подборщика с любого устройства.
- **Экраны и компоненты:** `/reports` переводится на `GET /inspector/reports`: фильтры-чипы по статусу, карточка (машина, статус, дата изменения, цена, число продаж, причина доработки), слияние с локальным индексом (локальный индекс остаётся fallback), статус «удалён модератором» с причиной.
- **Эндпоинты:** **BE-7**.
- **Зависимости:** MINI-6, BE-7.
- **Критерии приёмки:**
  - [ ] отчёт, созданный на другом устройстве, виден в списке;
  - [ ] фильтры работают, по умолчанию сверху «на доработке», потом черновики;
  - [ ] у доработки видна причина, у удалённого — причина удаления (если бэкенд отдаёт);
  - [ ] pull-to-refresh и перезапрос при `activated`.
- **Моки:** MSW-контракт BE-7.

#### MINI-20. Спрос
- **Цель:** подборщик видит, какие машины ждут покупатели.
- **Экраны и компоненты:** `/demand`: список машин (марка, модель, год, «N ждут», дата последнего запроса), кнопка «Открыть на av.by» (`openLink`), «Создать отчёт» (переход в MINI-7 с подставленной ссылкой) или «Продолжить черновик», если есть `myReportId`.
- **Эндпоинты:** **BE-15**, `POST /inspector/reports`.
- **Зависимости:** MINI-7, BE-15.
- **Критерии приёмки:**
  - [ ] список отсортирован по числу ожидающих;
  - [ ] «Создать отчёт» открывает MINI-7 с ссылкой из `avbyListingUrl`;
  - [ ] при `myReportId` открывается существующий черновик;
  - [ ] пустое состояние «Пока запросов нет».
- **Моки:** MSW-контракт BE-15.

#### MINI-22. Серверный справочник чеклиста и медиа-лимиты
- **Цель:** убрать локальный справочник.
- **Состав:** загрузка `GET /inspector/catalog/checklist` (кеш по `version` в `localStorage`), замена `apps/inspector/src/catalog/checklist.ts`, обязательность пунктов (`required`) и фото (`photoRequiredOn`) в чек-листе готовности (MINI-17) становится блокирующей, лимиты медиа из BE-10.
- **Эндпоинты:** **BE-5**, BE-10.
- **Зависимости:** MINI-9, MINI-17, BE-5.
- **Критерии приёмки:**
  - [ ] пункты секций, подписи и подсказки приходят с сервера;
  - [ ] неизвестный локальный `itemKey` из старого черновика не отправляется (с предупреждением);
  - [ ] чек-лист готовности блокирует отправку при неоценённом `required`-пункте.
- **Моки:** MSW-контракт BE-5.

#### MINI-23. Очередь загрузок в IndexedDB — **второй этап**
- **Цель:** загрузки переживают закрытие Mini App.
- **Состав:** перевод стора очереди из MINI-11 на IndexedDB по полной версии 3.4: восстановление задач при старте, проверка confirm через GET для `confirming`, миниатюры из IndexedDB, проверка квоты и `navigator.storage.persist()`.
- **Зависимости:** MINI-11, MINI-12.
- **Критерии приёмки:**
  - [ ] Mini App закрыт посреди загрузки 5 фото → при повторном открытии оставшиеся догружаются, дублей в отчёте нет;
  - [ ] при переполнении квоты новые файлы не принимаются, показывается ошибка.
- **Моки:** да.

#### BOT-3. Уведомления подборщику (приёмка BE-16 со стороны клиента)
- **Цель:** проверить, что уведомления бэкенда приходят и ведут в правильное место Mini App.
- **Состав:** тексты и кнопки из 4.6 согласованы с бэкендом; web_app-кнопки ведут на существующие роуты; Mini App корректно открывается по ним (MINI-18); тест-план по событиям: верификация, бан, одобрение, доработка, удаление, продажа; тестовое окружение Telegram (`TELEGRAM_TEST_ENV`).
- **Эндпоинты:** Bot API `sendMessage` (со стороны бэкенда).
- **Зависимости:** **BE-16**, MINI-18, BOT-2.
- **Критерии приёмки:**
  - [ ] каждое событие из таблицы 4.6 даёт сообщение в Telegram подборщику, а отмеченные в колонке «Email» — ещё и письмо;
  - [ ] «Исправить» из уведомления о доработке открывает нужный отчёт с причиной;
  - [ ] если подборщик заблокировал бота, это не ломает модерацию (ошибка только в логе);
  - [ ] уведомление не уходит, если транзакция откатилась.
- **Моки:** нет (интеграционная фича).

### Сводка и рекомендуемый порядок

| Порядок | Фича | Бэкенд-предусловие |
|---|---|---|
| 1 | MINI-1 Каркас | — |
| 2 | MINI-2 SDK | — |
| 3 | MINI-3 API-клиент | — |
| 4 | BOT-1 Каркас бота | — |
| 5 | MINI-4 Туннель | BE-17 (для медиа) |
| 6 | MINI-5 Онбординг | BE-4 желательно |
| 7 | MINI-6 Навигация | — |
| 8 | MINI-7 Создание отчёта | BE-19 желательно |
| 9 | MINI-8 Хаб и мастер | BE-8 желательно |
| 10 | MINI-9 Секция | BE-14 желательно |
| 11 | MINI-10 Медиа-конвейер | CORS бакета, BE-17 |
| 12 | MINI-11 Очередь (в памяти) | BE-8 желательно (фото после перезапуска) |
| 13 | MINI-12 Обработка фото | — |
| 14 | MINI-13 Фото и обязательные фото | BE-11, BE-12 желательно |
| 15 | MINI-14 Видео | BE-10 (iPhone) |
| 16 | MINI-16 Заключение | — |
| 17 | MINI-17 Проверка и отправка | BE-13 желательно |
| 18 | MINI-18 Доработка | BE-8 (причина) |
| 19 | BOT-2 Deep links | — |
| 20 | BOT-4 Compose | Dockerfile `api` |
| 21 | MINI-15 ЛКП | **BE-6** |
| 22 | MINI-19 Мои отчёты | **BE-7** |
| 23 | MINI-20 Спрос | **BE-15** |
| 24 | MINI-22 Справочник | **BE-5** |
| 25 | BOT-3 Уведомления | **BE-16** |
| второй этап | MINI-21 Офлайн, MINI-23 Очередь в IndexedDB | — |

Итого 27 фич: 23 MINI и 4 BOT. В MVP 25 (таблица выше), MINI-21 и MINI-23 — второй этап. Минимальный рабочий путь «регистрация → отчёт → отправка» — это MINI-1…MINI-14, MINI-16, MINI-17 и BOT-1.

Бэкенд параллельно, в порядке, который разблокирует фронт раньше: **BE-4** (одна строка) → **BE-17** + CORS бакета → **BE-9** (безопасность) → **BE-6** → **BE-8** (в MVP важнее: без него фото после перезапуска не видны) → **BE-7** → BE-14 → BE-3 → BE-19 → BE-11 / BE-12 → BE-10 → BE-16 → BE-15 → BE-5 → BE-2 → BE-13 → BE-18 → BE-20. Общий порядок со всеми приложениями — `BACKEND_TODO.md`, этапы 1 и 4.

---

## Гочи (коротко)

1. `GET /inspector/` — **со слешем**, без него `404`.
2. Любой `401` одинаковый, `errorCode` нет. Истечение initData (24 ч) определяется на клиенте по `auth_date`.
3. В confirm поле называется **`s3key`**, а в ответе presigned — **`s3Key`**.
4. `Content-Type` в PUT в S3 должен совпадать с тем, что передан в presigned-запросе.
5. Видео обхода должно быть **глобальным** (`sectionId = null`) и с `kind = VIDEO`, иначе submit его не увидит.
6. `PUT` секции и ЛКП — **полная замена**: отправлять весь список. Пустой список, скорее всего, даёт `500`.
7. `summary` секции обязателен при каждом сохранении, так что автосохранение до ввода итога только локальное.
8. `priceByn` — в **копейках**.
9. `panelId` взять неоткуда: UUID генерируются миграцией и разные в каждой базе.
10. Повторный `POST /inspector/reports` создаёт **новый** черновик. URL, отличающийся хоть одним символом, создаёт ещё и новую машину.
11. Confirm не идемпотентен: повтор задублирует фото.
12. Медиа не удалить, URL для просмотра в `GET` нет.
13. Регистрация без email — `500` (в БД `NOT NULL`).
14. Бэкенд пускает `pending` в создание отчётов, а `banned` — в редактирование. Ограничения держит фронт до BE-3.
15. Кнопки открытия Mini App в боте — только **inline** или Menu Button: из reply-клавиатуры initData не приходит.
16. Токен бота у бота и у бэкенда должен быть одним и тем же.
17. В локальной разработке presigned URL указывает на `http://localhost:9000`, а с телефона и из HTTPS-страницы он недоступен. Нужен туннель для MinIO и `S3_ENDPOINT` на него.
