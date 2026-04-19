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

## 6) Частые проблемы

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

## 7) Операционное (сервер 4 ГБ RAM)

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
command=/usr/bin/php /var/www/perfumer-by/backend/artisan queue:work redis --tries=1 --timeout=65 --sleep=1 --max-jobs=500 --max-time=3600 --memory=256
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

## 8) Очередь импорта Vanille

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

### Почему это безопасно

- `VanilleImportService::importFromJsonFile()` использует `updateOrCreate` по `slug` → повторный прогон не плодит дубли.
- `result.state.offset` — индекс по отсортированному `glob('products_*.json')`, порядок детерминированный, продолжит ровно с нужного файла.

### «Зомби»-payload'ы в Redis

Если после аварии в Redis остались payload'ы джобов, которые уже `failed`/`completed` в БД — `VanilleImportService::runQueuedJob` их молча пропустит (guard по `terminal_status_skip`). При старте нового джоба через админку `enqueueJob()` вызывает `pruneOrphanQueuePayloads()` и сам чистит их из `queues:default`.

Ручная чистка (если прям нужно):

```bash
redis-cli LLEN queues:default
# только если уверены, что в очереди osiротевшие импорты:
redis-cli DEL queues:default queues:default:delayed queues:default:reserved
```

