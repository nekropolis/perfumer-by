# Perfumer Dev Guide

Короткая памятка для локальной/серверной разработки.

> Для первого переезда проекта на production-сервер с нуля — см. [`PRODUCTION.md`](./PRODUCTION.md)
> (подбор сервера, установка пакетов, Nginx/Supervisor/PM2, деплой-скрипт).

## 1) Стек

- Backend: Laravel 13 (`/backend`)
- Frontend: Next.js 16 (`/frontend`)
- DB: MySQL 8
- Cache/Queue: Redis
- Process manager: pm2

## 2) Первый запуск

### Backend

```bash
cd /var/www/perfumer-by/backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan storage:link
php artisan optimize:clear
```

### Frontend

```bash
cd /var/www/perfumer-by/frontend
npm install
```

## 3) Ежедневная разработка

### Frontend dev (через pm2)

```bash
make dev
make logs-dev
make dev-stop
```

**Почему открывают `http://192.168.0.25/` без `:3001`:** в браузере это порт **80** → **Nginx** проксирует на **`127.0.0.1:3000`** (см. `PRODUCTION.md`). Next dev обязан слушать **именно 3000**, иначе сайт «не тот» или пусто. Скрипт `npm run dev` зафиксирован на `-p 3000`; `make dev` останавливает prod `perfumer-frontend` и освобождает порт. Если 3000 всё ещё занят — смотрите `ss -lntp | grep 3000` и освободите процесс.

### Backend служебные

```bash
make backend-clear
make backend-migrate
```

### Проверка процессов

```bash
make status
```

## 4) Prod команды

```bash
make prod
make prod-restart
make logs
make prod-stop
```

> Не запускай одновременно `dev` и `prod` режимы на одном порту.

## 5) Vanille / Seller One

### Парсинг только карточек Vanille (без пересбора ссылок)

```bash
cd /var/www/perfumer-by/backend
php artisan catalog:parse-vanille-products
```

Полезно после проблем с правами в `storage`.

Опции:

- `--once`
- `--offset=<n>`
- `--limit=<n>`
- `--max-links=<n>`
- `--mode=full|new_only`
- `--links-path=/abs/path/to/product_links.json`

### Seller One

В админке есть 2 основных запуска:

- `Новый парсинг` — разбор прайса и матчинга
- `Обновить цены` — обновление цен только связанных товаров по коду

### Очистка мусора и дублей после импорта

Все товары в каталоге должны идти только с Vanille (`supplier_products`, поставщик `vanille`).
Дубли и «пустые оболочки» появлялись из‑за разных slug/H1 при одном аромате — импорт теперь сопоставляет карточки по URL и каноническому ключу пути.

**Одна команда очистки** (сначала dry-run):

```bash
cd /var/www/perfumer-by/backend
php artisan catalog:prune-products-without-vanille --dry-run
php artisan catalog:prune-products-without-vanille --force
php artisan catalog:prune-brands-without-products
php artisan catalog:merge-duplicate-brands --dry-run
php artisan catalog:merge-duplicate-brands --force
```

Удаляются товары, если:

- нет привязки к Vanille, **или**
- 0 вариантов **и** 0 значений атрибутов (пустая карточка, в т.ч. с ошибочной связью).

Опции: `--limit=N` — пачками; `--force` — без подтверждения.

Импорт не создаёт новые дубли: `VanilleParsedImportGuard` требует характеристики на карточке; при импорте ищется существующий товар по URL Vanille и identity-ключу пути (`ProductDisplayName::vanilleProductPathIdentityKey`).

Один бренд (например Dolce & Gabbana):

```bash
php artisan catalog:vanille-brand dolce-i-gabbana preflight|collect|parse|run --expected=121
```

Полный цикл ссылок/брендов:

```bash
php artisan catalog:vanille-sync brands|links|parse
```

## 6) Входящие звонки (Android → Reverb → CRM)

Ручной перевод звонка в админку: менеджер на телефоне нажимает **«Открыть в CRM»** → открывается создание заказа с подставленным телефоном.

```text
Android (CallScreeningService, локально)
  → POST /api/incoming-calls/send-to-crm  (device token)
  → Laravel broadcast (SendToCrmEvent)
  → Reverb WebSocket
  → Next.js admin (Echo) → /admin/orders/create?phone=...
```

Подробнее про Android: [`android/incoming-call-bridge/README.md`](./android/incoming-call-bridge/README.md).

### Переменные окружения

**Ключи Reverb не «берутся» снаружи** — задаёте сами (или `php artisan install:broadcasting --reverb`).  
`REVERB_APP_KEY` в backend и `NEXT_PUBLIC_REVERB_APP_KEY` во frontend **должны совпадать**.

**Важно:** в `REVERB_HOST` / `NEXT_PUBLIC_REVERB_HOST` — **только hostname**, без `http://` и без порта.

```env
# backend/.env
BROADCAST_CONNECTION=reverb
REVERB_APP_ID=local-app-id
REVERB_APP_KEY=local-app-key
REVERB_APP_SECRET=local-app-secret
REVERB_HOST=perfumer.test
REVERB_BROADCAST_HOST=127.0.0.1
REVERB_PORT=8080
REVERB_SCHEME=http
REVERB_SERVER_HOST=0.0.0.0
REVERB_SERVER_PORT=8080
```

```env
# frontend/.env.local
NEXT_PUBLIC_REVERB_APP_KEY=local-app-key
NEXT_PUBLIC_REVERB_HOST=perfumer.test
NEXT_PUBLIC_REVERB_PORT=8080
NEXT_PUBLIC_REVERB_SCHEME=http
```

**Два разных host:** браузер подключается к `NEXT_PUBLIC_REVERB_HOST` (perfumer.test). Laravel при `broadcast()` стучится в Reverb по `REVERB_BROADCAST_HOST` — на **сервере** это почти всегда `127.0.0.1`, иначе `Could not resolve host: perfumer.test` в логах.

Если админка открывается **с другого ПК**, в `NEXT_PUBLIC_REVERB_HOST` укажите IP/домен **сервера**, а не `localhost`.

После смены env: `php artisan config:clear`, `sudo supervisorctl restart perfumer-reverb`, перезапуск frontend (pm2 / `npm run dev`).

### Локальная разработка

```bash
cd backend
composer install
php artisan migrate

# вариант 1 — всё сразу (serve + queue + reverb + vite)
composer run dev

# вариант 2 — только Reverb
php artisan reverb:start
```

Frontend: `npm install` (нужны `laravel-echo`, `pusher-js`; в проекте есть `frontend/.npmrc` с `legacy-peer-deps=true`).

### Сервер: Supervisor (Reverb)

Шаблон: [`scripts/supervisor/perfumer-reverb.conf`](./scripts/supervisor/perfumer-reverb.conf)

```bash
sudo cp /var/www/perfumer-by/scripts/supervisor/perfumer-reverb.conf /etc/supervisor/conf.d/
# проверьте путь к php: which php → command= в конфиге
sudo supervisorctl reread && sudo supervisorctl update && sudo supervisorctl start perfumer-reverb
sudo supervisorctl status perfumer-reverb
```

Ожидается: **`RUNNING`**, uptime растёт.

Типичные проблемы supervisor (**BACKOFF**): см. [`scripts/supervisor/README.md`](./scripts/supervisor/README.md) (порт 8080 занят, нет `laravel/reverb`, права на `.env`/`storage`).

### Проверка, что Reverb жив

```bash
ss -tlnp | grep 8080
# LISTEN ... php ... :8080

curl -i http://127.0.0.1:8080
# HTTP/1.1 404 Not Found — это нормально (не HTTP-сайт, а WebSocket)
```

Лог supervisor:

```bash
sudo tail -30 /var/log/supervisor/perfumer-reverb.log
# INFO  Starting server on 0.0.0.0:8080 ...
```

**Не запускайте второй** `php artisan reverb:start` в SSH, если уже работает supervisor — порт будет занят, новый процесс упадёт с BACKOFF.

### Проверка в браузере

1. Админка под менеджером (`admin` / `manager` / `ceo`).
2. DevTools → Network → **WS**.
3. URL вида `ws://perfumer.test:8080/app/local-app-key?...` → статус **101 Switching Protocols**.

С машины разработчика: `perfumer.test` в `/etc/hosts` → IP сервера; при необходимости `sudo ufw allow 8080/tcp` (в LAN). На production лучше **wss через nginx** на 443, без открытия 8080 в интернет.

### Устройства и API

- Админка: **Система → Телефоны CRM** (`/admin/system/incoming-call-devices`) — токен на каждый телефон (показывается один раз).
- API: `POST /api/incoming-calls/send-to-crm` с `Authorization: Bearer {device_token}`, body: `phone`, `trigger: manual`, `received_at`.

Тест с сервера:

```bash
# С сервера: perfumer.test в DNS нет — укажите Host из nginx (grep server_name ...)
# и только :80 (не :8000). Иначе придёт HTML страница Next/Laravel вместо JSON.
curl -v -X POST "http://127.0.0.1/api/incoming-calls/send-to-crm" \
  -H "Host: perfumer.test" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone":"375291234567","trigger":"manual","received_at":1717160000}'
```

Ожидается JSON `{"success":true}`. Если в ответе `<!DOCTYPE html>` — запрос не попал в Laravel API (см. ниже).

## 7) Частые проблемы

### Permission denied на `storage/.../vanille/products_*.json`

1. Верни права на `backend/storage`.
2. Продолжи с нужного offset:

```bash
cd /var/www/perfumer-by/backend
php artisan catalog:parse-vanille-products --offset=<n>
```

### После правок в backend странное поведение

```bash
make backend-clear
```

## 8) Операционное (сервер 4 ГБ RAM)

### Диагностика «всё зависло»

```bash
free -m                                 # остаток RAM и swap
ps aux --sort=-%mem | head -n 10        # кто ест память
df -h                                   # остаток диска
sudo supervisorctl status               # воркеры очереди
```

Типичный виновник — `next-server` в prod: за сутки-двое может разрастись до 3+ ГБ и забить swap.
При этом `composer`, `php artisan`, queue worker начинают «висеть».

### Лечение

```bash
# 1. Остановить распухший Next
pm2 list
pm2 stop perfumer-frontend

# 2. Проверить, что RAM освободилась
free -m

# 3. Composer без dev-зависимостей и с лимитом памяти
cd /var/www/perfumer-by/backend
php -d memory_limit=512M /usr/bin/composer dump-autoload -o --no-dev

# 4. Миграции и очистка
php artisan migrate --force
php artisan optimize:clear

# 5. Поднять Next обратно с лимитом
pm2 start perfumer-frontend
pm2 restart perfumer-frontend --max-memory-restart 700M
pm2 save
```

### Supervisord: queue worker должен подниматься сам

Файл `/etc/supervisor/conf.d/perfumer-queue.conf`:

```ini
[program:perfumer-queue]
process_name=%(program_name)s_%(process_num)02d
command=/usr/bin/php /var/www/perfumer-by/backend/artisan queue:work redis --tries=1 --timeout=3720 --sleep=1 --max-jobs=500 --max-time=3600 --memory=512
autostart=true
autorestart=true
startretries=10
startsecs=5
stopasgroup=true
killasgroup=true
stopwaitsecs=70
numprocs=1
user=www-data
redirect_stderr=true
stdout_logfile=/var/log/supervisor/perfumer-queue.log
```

`numprocs=1` обязателен для dev, чтобы очередь не запускала heavy-задачи
параллельно. Дополнительно в коде Seller One parse/refresh включен общий
`WithoutOverlapping(...)->shared()` lock `laravel-queue-overlap:seller_one_heavy_global` —
одна тяжёлая задача Seller One (парсинг или обновление цен).

`--timeout` воркера должен быть **не меньше** `RunSellerOne*Job::$timeout` (3600 сек), иначе
воркер убивает задачу, `lock->release()` в middleware может не успеть выполниться, и ключ
overlap остаётся в Redis до `expireAfter` (~час+) — UI «queued / 0%», в логе воркера
`DONE` за миллисекунды (repeat `release`).

Применить:

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl status perfumer-queue:*
```

### Swap хотя бы 2 ГБ

Если стоит 512 МБ — composer/Next начинают падать при пиках.

```bash
sudo fallocate -l 2G /swapfile2
sudo chmod 600 /swapfile2
sudo mkswap /swapfile2
sudo swapon /swapfile2
echo '/swapfile2 none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 9) Очередь импорта Vanille

### Быстрая диагностика

```bash
cd /var/www/perfumer-by/backend
php artisan catalog:vanille-queue status
```

Покажет `QUEUE_CONNECTION`, количество записей в `jobs`/`failed_jobs` и 10 последних `VanilleImportJob`.

### Если воркер стоял и джоб завис

```bash
# дожать текущую активную задачу синхронно (pending/running)
php artisan catalog:vanille-queue run-pending

# возобновить упавшую задачу с того же offset, где она остановилась
php artisan catalog:vanille-queue resume --job-id=<id>
```

`resume`:

- берёт `result.state.offset` из БД;
- переводит джоб из `failed` в `pending`, чистит `error`/`finished_at`;
- синхронно добивает оставшиеся батчи через `VanilleImportService::runJobToCompletionSync`;
- ничего не кладёт в Redis — поэтому крах воркера/PM2 во время `resume` никак не влияет.

**Важно**: `resume` запускайте в `tmux`/`screen`, иначе падение SSH убьёт процесс:

```bash
tmux new -s vanille
php artisan catalog:vanille-queue resume --job-id=4
# detach: Ctrl+b, d
# attach: tmux attach -t vanille
```

### Почему повторный импорт не плодит дубли

- `SupplierProduct` — `updateOrCreate` по `external_url`; товар ищется по slug, URL Vanille и identity-ключу пути.
- Короткое имя/slug нормализуются из URL (`resolveCanonicalShortName`), а не только из H1.
- `result.state.offset` — индекс по отсортированному `glob('products_*.json')`, порядок детерминированный, продолжит ровно с нужного файла.

### «Зомби»-payload'ы в Redis

Если после аварии в Redis остались payload'ы джобов, которые уже `failed`/`completed` в БД — `VanilleImportService::runQueuedJob` их молча пропустит (guard по `terminal_status_skip`). При старте нового джоба через админку `enqueueJob()` вызывает `pruneOrphanQueuePayloads()` и сам чистит их из `queues:default`.

Ручная чистка (если прям нужно):

```bash
redis-cli LLEN queues:default
# только если уверены, что в очереди osiротевшие импорты:
redis-cli DEL queues:default queues:default:delayed queues:default:reserved
```

