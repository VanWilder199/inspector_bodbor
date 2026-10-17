# BOT-04: Бот и Mini App в docker-compose и деплой статики

## Цель
Всё (бот, Mini App, MinIO для локалки) поднимается одной командой.

## Контекст
- **Источник:** `PLAN_FRONTEND_MINIAPP.md`, раздел 4.5 (docker-compose), фича BOT-4
- **Бэкенд:** сервис `api` в compose и его Dockerfile — общее предусловие (не часть этой задачи, см. `PLAN_FINAL_CHECKLIST.md` раздел 5). 🟡 BE-17 (разделение публичного/внутреннего S3-endpoint) — координировать, если ещё не сделано.

## Зависимости
- BOT-01, MINI-01

## Требования

### Сервис `bot` в `docker-compose.yml`
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
```

### MinIO для локальной разработки (только локально, не прод)
```yaml
minio:
  image: minio/minio
  command: server /data --console-address ":9001"
  ports: ["9000:9000", "9001:9001"]
minio-init:
  image: minio/mc
  depends_on: [minio]
  entrypoint: >
    sh -c "mc alias set local http://minio:9000 test test &&
           mc mb -p local/test-bucket && mc cors set local/test-bucket /cors.json"
```
CORS-файл для `minio-init` — тот же, что описан в разделе 2.9 плана (`AllowedOrigins` для домена Mini App и туннеля разработки, `AllowedMethods: PUT/GET/HEAD`, `AllowedHeaders: content-type`, `ExposeHeaders: ETag`).

### nginx
Отдельный `server` для `app.site.by`: раздаёт `apps/inspector/dist` из корня (`try_files $uri /index.html`, кеширование ассетов с хешами, `index.html` без кеша) + `location /api/` на `api:8080`. Бот и Mini App обновляются независимо друг от друга.

## Acceptance Criteria
- [ ] `docker compose up` поднимает nginx со статикой Mini App, бота и MinIO с бакетом и CORS
- [ ] `https://app.site.by/reports/x` отдаёт SPA, `/api/inspector/` проксируется
- [ ] после деплоя новой версии пользователи получают свежий `index.html` (без кеша на сам `index.html`)

## Gotchas
1. **MinIO в compose — только для локальной разработки**, в проде используется hoster.by (или другой внешний S3) — не путать окружения в одном compose-файле без явного разделения (profiles/override-файлы).
2. `index.html` без кеша, ассеты с хешами — иначе пользователи зависают на старой версии после деплоя.
3. Бот не требует сетевого доступа к `api` — специально отмечено в плане, не создавать лишнюю зависимость в compose.
4. Если BE-17 ещё не сделан (разделение публичного/внутреннего S3 endpoint) — согласовать с тем, кто делает бэкенд-доработку, прежде чем жёстко прописывать `S3_ENDPOINT` в compose.

## Промпт для агента
```
Настрой docker-compose и nginx для бота и Mini App согласно BOT-04-compose-deploy.md:

1. Сервис bot в docker-compose.yml: build ./bot, env TELEGRAM_BOT_TOKEN/MINIAPP_URL/MINIAPP_DIRECT_LINK, restart unless-stopped, лимит памяти 128M, без сети до api
2. Сервисы minio + minio-init (ТОЛЬКО для локальной разработки, явно разделить от прод-конфигурации через profile/override) с CORS-файлом по разделу 2.9 плана
3. nginx: отдельный server для app.site.by — раздача apps/inspector/dist из корня (try_files $uri /index.html), кеш ассетов с хешами, index.html без кеша, location /api/ → api:8080
4. Переменные в env.example: TELEGRAM_BOT_TOKEN, MINIAPP_URL, MINIAPP_DIRECT_LINK, PUBLIC_HOST, BOT_USERNAME

Проверь:
- docker compose up поднимает все сервисы
- SPA fallback работает для /reports/x
- /api/inspector/ проксируется на api:8080
- MinIO явно помечен как dev-only конфигурация
```
