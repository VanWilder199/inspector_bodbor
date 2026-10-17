# MINI-10: Медиа-конвейер — одна загрузка end-to-end

## Цель
Надёжный путь presigned → PUT → confirm для одного файла.

## Контекст
- **Источник:** `PLAN_FRONTEND_MINIAPP.md`, раздел 2.9 (медиа), фича MINI-10
- **Бэкенд:** 🟡 частично — оба эндпоинта работают, но **без каких-либо проверок владельца/статуса/секции** (BE-9), что само по себе не блокер для UI, но влияет на порядок обработки ошибок

## Зависимости
- MINI-08. Для проверки на телефоне — 🟡 BE-17 (публичный S3-endpoint) и CORS бакета.

## Требования

### Шаг 1 — `POST /inspector/media/presigned-url/{reportId}`
Тело: `{ sectionId?, fileName, contentType }`.
- `sectionId` — опционален: если указан, ключ `reports/{reportId}/sections/{sectionId}/{fileName}`; если `null`, ключ `reports/{reportId}/{fileName}` (глобальное медиа — для видео и обязательных фото);
- `fileName` — клиент генерирует `crypto.randomUUID() + '.jpg'`/`'.mp4'` (подставляется в ключ **как есть**, без санитизации сервером);
- `contentType` — допустимы **только** `image/png`, `image/jpeg`, `video/mp4`. Остальное (включая `image/heic`, `video/quicktime`) → `400 NOT_ALLOWDED_MEDIA_TYPE` (опечатка в коде ошибки — писать именно так).
Ответ: `{ uploadUrl, s3Key }`. TTL presigned URL — **60 минут**. `contentType` зашит в подпись (`X-Amz-SignedHeaders=content-type;host`). Размер в подпись не зашит, лимитов нет (пока, см. BE-10).

### Шаг 2 — `PUT {uploadUrl}` напрямую в S3
- `Content-Type` в PUT должен **побайтно совпадать** с тем, что передано в presigned-запросе — иначе `403 SignatureDoesNotMatch`. Выставлять явно, не полагаться на `Blob.type` (на Android бывает пустым);
- никаких других `x-amz-*` заголовков — они не подписаны;
- использовать `XMLHttpRequest` — только у него есть `upload.onprogress` (у `fetch` нет прогресса отправки в Safari/WebKit);
- успех — `200` с `ETag`. `403` (`Request has expired`/`SignatureDoesNotMatch`) → новый presigned URL и повтор. Сетевая ошибка/`5xx` → повтор с backoff;
- повторный PUT на тот же ключ просто перезапишет объект — это безопасно.
- CORS на бакете необходим (cross-origin PUT с кастомным заголовком → preflight).

### Шаг 3 — `POST /inspector/media/confirm-upload/{reportId}`
Тело: `{ sectionId?, s3key, kind }` — **поле называется `s3key` со строчной `k`**, в отличие от `s3Key` в ответе presigned (легко перепутать). `sectionId` — тот же, что в шаге 1 (сервер не сверяет с ключом, клиент обязан передать то же значение). `kind` — `PHOTO|VIDEO`, не сверяется с `contentType` — для `video/mp4` обязательно передавать `VIDEO`, иначе submit не увидит видео (MINI-14).

Ответ `204`, **`mediaId` не возвращается** — узнать его можно только из следующего `GET` отчёта по `s3Key` (до BE-8, где confirm должен начать возвращать `{ mediaId, status }`).

**Confirm не идемпотентен.** Повтор после таймаута создаёт **вторую запись** (дубль фото в отчёте). Правило: при сетевой ошибке на confirm — сначала `GET` отчёта, искать `s3Key` в `media`/`globalMedia`; если нашёлся — задача `done`, confirm не повторять.

### `src/media/upload.ts`
`presign(reportId, {sectionId, fileName, contentType})`, `putToS3(url, blob, contentType, onProgress)` на XHR, `confirm(reportId, {sectionId, s3key, kind})`, генерация `fileName = uuid + ext`.

## Acceptance Criteria
- [ ] фото, загруженное с `sectionId`, появляется в `sections[].media`, а без него — в `globalMedia`
- [ ] `Content-Type` PUT совпадает с presigned, других заголовков нет
- [ ] прогресс отображается от 0 до 100%
- [ ] просроченный URL (эмуляция) перезапрашивается автоматически
- [ ] повторный confirm после таймаута не создаёт дубль (проверка через `GET` перед повтором)
- [ ] интеграционный тест против локального MinIO (Playwright или ручной сценарий в README)

## Gotchas
1. **`s3key` (confirm, строчная `k`) vs `s3Key` (ответ presigned)** — перепутать легко и типично.
2. **Confirm не идемпотентен** — всегда проверять через `GET`, прежде чем повторять.
3. `mediaId` не возвращается confirm-ом — до BE-8 узнаётся только через `GET`.
4. `kind` не сверяется с `contentType` сервером — клиент обязан передавать правильный `kind` сам, особенно для видео.
5. `Content-Type` должен совпадать побайтно — не доверять `Blob.type` на Android.

## Промпт для агента
```
Реализуй медиа-конвейер согласно MINI-10-media-pipeline.md:

1. src/media/upload.ts: presign(), putToS3() на XHR с onprogress, confirm()
2. Presign: генерация fileName = crypto.randomUUID() + ext на клиенте, contentType только из {image/jpeg, image/png, video/mp4}
3. PUT в S3: Content-Type строго совпадает с presigned (явно выставлять, не доверять Blob.type), только этот заголовок, без других x-amz-*
4. Обработка 403 от S3 (SignatureDoesNotMatch/expired) — перезапрос presigned URL и повтор
5. Confirm: тело { sectionId, s3key (!), kind } — проверь правильное имя поля s3key, не s3Key
6. Перед повтором confirm после сетевой ошибки — GET отчёта, поиск s3Key в media/globalMedia, если найден — не повторять
7. mediaId неизвестен после confirm (204 без тела) — учитывай это в коде, не полагайся на ответ

Проверь все acceptance criteria. Особое внимание на поле s3key/s3Key и неидемпотентность confirm.
```
