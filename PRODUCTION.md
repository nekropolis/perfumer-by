# Production deploy — пошагово

Инструкция для переезда проекта `perfumer-by` на прод с нуля. Всё под Ubuntu 22.04/24.04 LTS.

---

## 1) Выбор сервера

Минимально-рабочая конфигурация под магазин + админку + парсинг:

| Параметр | Минимум | Комфорт | Запас на рост |
| --- | --- | --- | --- |
| CPU | 2 vCPU | 4 vCPU | 6+ vCPU |
| RAM | 4 ГБ | 8 ГБ | 16 ГБ |
| SSD | 40 ГБ NVMe | 80 ГБ NVMe | 160 ГБ NVMe |
| Swap | 2 ГБ | 2–4 ГБ | 4 ГБ |
| Bandwidth | 1 Гбит/с | 1 Гбит/с | 1 Гбит/с |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS | — |

Замечания:

- **4 ГБ хватает** только если дать Next.js лимит `max-memory-restart 700M`, а `php-fpm` порезать до 6–8 воркеров. На 4 ГБ уже были случаи OOM (см. `README-dev.md §7`).
- **8 ГБ** — рекомендуемый baseline. Парсинг Vanille + `next build` параллельно не кладут систему.
- Диск: JSON-дампы Vanille (`storage/app/public/imports/vanille`) легко занимают 1–3 ГБ, плюс `vendor/` ≈ 250 МБ, `.next/` ≈ 400 МБ, логи. С запасом — 80 ГБ.
- База данных на одной машине с приложением — ок до ~10k товаров + ~100 заказов/день. Дальше MySQL выносим отдельно.

Провайдеры:

- **Hetzner Cloud** CX22/CX32 (Germany/Finland) — самое дешёвое и быстрое соотношение RAM/₽.
- **BeGet / REG.RU** — если нужен .by-хостинг и оплата в BYN/RUB.
- **DigitalOcean** — 4 CPU / 8 GB (Premium AMD).

---

## 2) Инициализация сервера

Всё делаем под пользователем с sudo (не под root напрямую). Если у хостера по умолчанию `root` — создайте deploy-пользователя и дайте ему sudo:

```bash
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Дальнейшие команды — из-под `deploy` (через `sudo`).

### 2.1. Обновление системы и базовые пакеты

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  curl git unzip zip build-essential \
  ca-certificates gnupg lsb-release \
  software-properties-common \
  htop iotop tmux \
  ufw fail2ban
```

### 2.2. Файрвол

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

### 2.3. Swap (если у провайдера нет)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2.4. PHP 8.3

```bash
sudo add-apt-repository -y ppa:ondrej/php
sudo apt update
sudo apt install -y \
  php8.3 php8.3-cli php8.3-fpm \
  php8.3-mysql php8.3-mbstring php8.3-xml php8.3-curl \
  php8.3-zip php8.3-bcmath php8.3-gd php8.3-intl \
  php8.3-redis php8.3-opcache
```

Проверка:

```bash
php -v           # PHP 8.3.x
php -m | grep -E 'mbstring|redis|pdo_mysql'
```

### 2.5. Composer

```bash
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
composer --version
```

### 2.6. MySQL 8

```bash
sudo apt install -y mysql-server
sudo mysql_secure_installation   # задать пароль root, убрать test-DB
```

Создать БД и пользователя приложения:

```bash
sudo mysql <<'SQL'
CREATE DATABASE perfumer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'perfumer'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD_CHANGE_ME';
GRANT ALL PRIVILEGES ON perfumer.* TO 'perfumer'@'localhost';
FLUSH PRIVILEGES;
SQL
```

Небольшой тюнинг для 8 ГБ сервера (`/etc/mysql/mysql.conf.d/mysqld.cnf`):

```ini
[mysqld]
innodb_buffer_pool_size = 1G
innodb_log_file_size    = 256M
max_connections         = 100
default_authentication_plugin = mysql_native_password
```

```bash
sudo systemctl restart mysql
```

### 2.7. Redis

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server

# привязать к localhost и включить supervised systemd
sudo sed -i 's/^supervised no/supervised systemd/' /etc/redis/redis.conf
sudo sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
sudo systemctl restart redis-server
redis-cli ping   # → PONG
```

### 2.8. Node.js 22 + npm + pm2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
pm2 startup systemd -u deploy --hp /home/deploy
```

### 2.9. Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

### 2.10. Supervisor (для queue worker)

```bash
sudo apt install -y supervisor
sudo systemctl enable --now supervisor
```

---

## 3) Размещение кода

Договариваемся про путь `/var/www/perfumer-by`.

```bash
sudo mkdir -p /var/www/perfumer-by
sudo chown -R deploy:deploy /var/www/perfumer-by
cd /var/www
git clone git@github.com:<org>/perfumer-by.git
cd perfumer-by
```

---

## 4) Backend

### 4.1. Установка зависимостей

```bash
cd /var/www/perfumer-by/backend
php -d memory_limit=512M /usr/local/bin/composer install \
    --no-dev --optimize-autoloader --no-interaction
```

### 4.2. `.env`

```bash
cp .env.example .env
nano .env
```

Минимум для прода:

```dotenv
APP_NAME=Perfumer
APP_ENV=production
APP_KEY=                # заполнит php artisan key:generate
APP_DEBUG=false
APP_URL=https://perfumer.by

AUTH_MODEL="Modules\\Users\\Models\\User"

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=perfumer
DB_USERNAME=perfumer
DB_PASSWORD=STRONG_PASSWORD_CHANGE_ME

CACHE_STORE=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis

REDIS_CLIENT=phpredis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null

LOG_CHANNEL=daily
LOG_LEVEL=warning

TELEGRAM_BOT_TOKEN=       # опционально, для уведомлений
TELEGRAM_CHAT_ID=
```

### 4.3. Инициализация

```bash
php artisan key:generate
php artisan storage:link
php artisan migrate --force
php artisan db:seed --class="Modules\\Catalog\\Database\\Seeders\\CatalogDatabaseSeeder"   # если нужен базовый каталог
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
```

### 4.4. Права на storage

```bash
sudo chown -R deploy:www-data storage bootstrap/cache
sudo chmod -R 775 storage bootstrap/cache
```

---

## 5) Frontend

> Процесс `perfumer-frontend` декларативно описан в
> `frontend/ecosystem.config.cjs` (CWD, `NODE_ENV=production`, `max_memory_restart: 700M`,
> логи в `/var/log/pm2/...`). Эти же настройки используются и в release-стиле деплое (§13),
> именно поэтому файл лежит рядом с приложением — pm2 подхватывает его по реальному
> пути и корректно работает после переключения симлинка `current`.


### 5.1. `.env.local`

```bash
cd /var/www/perfumer-by/frontend
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=https://perfumer.by/api
NEXT_ALLOWED_DEV_ORIGINS=https://perfumer.by
EOF
```

### 5.2. Установка и билд

```bash
npm ci
npm run build
```

### 5.3. Запуск через pm2

```bash
sudo mkdir -p /var/log/pm2 && sudo chown deploy:deploy /var/log/pm2

cd /var/www/perfumer-by/frontend
pm2 start ecosystem.config.cjs
pm2 save
```

`ecosystem.config.cjs` уже включает `max_memory_restart: 700M` — спасает от ситуации, когда `next-server` за сутки распухает до 3+ ГБ и кладёт 4-гиговый сервер в swap.

После каждого нового билда (в in-place режиме) достаточно:

```bash
pm2 reload perfumer-frontend --update-env
```

---

## 6) Nginx

Сайт слушает `80/443`, проксирует `/api` и `/storage` в PHP, всё остальное — в Next.js на `127.0.0.1:3000`.

`/etc/nginx/sites-available/perfumer.by`:

```nginx
upstream perfumer_next {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name perfumer.by www.perfumer.by;

    # certbot подложит challenge сюда
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name perfumer.by www.perfumer.by;

    # ssl_certificate / ssl_certificate_key — выдаст certbot, см. ниже
    # include snippets/ssl-perfumer.conf;

    client_max_body_size 32M;

    # Статика Laravel (картинки товаров, storage/app/public)
    location ^~ /storage/ {
        alias /var/www/perfumer-by/backend/storage/app/public/;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # API и админ-API через PHP-FPM
    location ^~ /api/ {
        root /var/www/perfumer-by/backend/public;
        try_files $uri /index.php?$query_string;

        location ~ \.php$ {
            include snippets/fastcgi-php.conf;
            fastcgi_pass unix:/run/php/php8.3-fpm.sock;
            fastcgi_param SCRIPT_FILENAME $document_root/index.php;
            fastcgi_read_timeout 120s;
        }
    }

    # health
    location = /up {
        root /var/www/perfumer-by/backend/public;
        try_files $uri /index.php?$query_string;
        location ~ \.php$ {
            include snippets/fastcgi-php.conf;
            fastcgi_pass unix:/run/php/php8.3-fpm.sock;
            fastcgi_param SCRIPT_FILENAME $document_root/index.php;
        }
    }

    # Next.js static (_next/*, /public, /favicon и т.д.)
    location /_next/static/ {
        proxy_cache_bypass $http_upgrade;
        proxy_pass http://perfumer_next;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection "";
        expires 1y;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    # SSR + клиент Next.js
    location / {
        proxy_pass http://perfumer_next;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

Активация:

```bash
sudo ln -s /etc/nginx/sites-available/perfumer.by /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 6.1. SSL (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo mkdir -p /var/www/letsencrypt
sudo certbot --nginx -d perfumer.by -d www.perfumer.by \
    --redirect --non-interactive --agree-tos -m admin@perfumer.by
```

Certbot допишет `ssl_certificate` прямо в ваш конфиг.

### 6.2. PHP-FPM под нагрузку (4 GB RAM)

`/etc/php/8.3/fpm/pool.d/www.conf`:

```ini
pm = dynamic
pm.max_children = 8
pm.start_servers = 2
pm.min_spare_servers = 2
pm.max_spare_servers = 4
pm.max_requests = 500
```

```bash
sudo systemctl reload php8.3-fpm
```

---

## 7) Queue worker через supervisor

`/etc/supervisor/conf.d/perfumer-queue.conf`:

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

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl status perfumer-queue:*
```

> `--tries=1` намеренно: импорт-джобы идемпотентны и восстанавливаются через
> `php artisan catalog:vanille-queue resume`, а автоперезапуски воркеров только
> сбивали статус. См. `README-dev.md §8`.
>
> `--memory=256` — страховка на 4-ГБ сервере. Если PHP-процесс воркера
> разрастается (бывает на тяжёлых XLSX-импортах), Laravel корректно завершает
> его после текущего джоба, а supervisor поднимает свежий. Без этого флага
> PhpSpreadsheet легко съедает 1.5–2 ГБ RSS и кладёт систему в swap.

---

## 8) Cron / Laravel scheduler (опционально)

Если появятся scheduled tasks:

```bash
sudo crontab -u www-data -e
```

```cron
* * * * * cd /var/www/perfumer-by/backend && /usr/bin/php artisan schedule:run >> /dev/null 2>&1
```

---

## 9) Скрипт деплоя

Создаём `scripts/deploy.sh` в корне репозитория — тот, что вы будете запускать при каждом релизе.

```bash
# в репозитории:
ls scripts/deploy.sh
# на сервере:
cd /var/www/perfumer-by
./scripts/deploy.sh
```

Скрипт уже лежит в репозитории и делает:

1. `git pull --ff-only`
2. Включает maintenance-режим Laravel (`php artisan down`).
3. `composer install --no-dev --optimize-autoloader`.
4. `php artisan migrate --force`.
5. `php artisan config:cache && route:cache && view:cache`.
6. `npm ci` + `next build` в `frontend/`.
7. `pm2 reload perfumer-frontend`.
8. `sudo supervisorctl restart perfumer-queue:*`.
9. `php artisan up`.

Если что-то падает — скрипт прервётся и выйдет с `artisan down` (решать вручную).

> При небольших сбойных откатах достаточно:
>
> ```bash
> cd /var/www/perfumer-by && git reset --hard HEAD^
> ./scripts/deploy.sh
> ```

---

## 10) Health-check и диагностика

- `curl -fsSL https://perfumer.by/up` — должен вернуть 200.
- `pm2 list` — `perfumer-frontend` online, restarts = 0/низко.
- `sudo supervisorctl status perfumer-queue:*` — `RUNNING`.
- `php artisan catalog:vanille-queue status` — последние джобы парсинга.
- `free -m` / `df -h` — ресурсы.

Подробнее про troubleshooting (OOM, queue worker, resume Vanille) — в `README-dev.md §§7–8`.

---

## 11) Бэкапы (минимум)

Простой вариант с `cron`:

```bash
sudo mkdir -p /var/backups/perfumer
sudo chown deploy:deploy /var/backups/perfumer
crontab -e
```

```cron
# Ежедневный дамп БД в 03:15, хранить 14 дней
15 3 * * * mysqldump --single-transaction --quick --routines perfumer | gzip > /var/backups/perfumer/db-$(date +\%F).sql.gz
30 3 * * * find /var/backups/perfumer -type f -mtime +14 -delete
```

Отдельно — `backend/storage/app/public/imports` (парсинг-дампы) синхронизируем `rsync` / S3 раз в неделю.

---

## 13) Release-style деплой (Capistrano / Deployer-подобный)

Альтернатива «in-place» деплою (§9): релизы лежат в отдельных директориях,
активный выбирается симлинком. Плюсы — атомарное переключение и быстрый откат.
Минус — диск расходуется х2/х3 (зависит от `KEEP_RELEASES`).

### 13.1. Раскладка

```
/var/www/perfumer-by/
├── current -> releases/20260418-123000        (symlink, атомарно переключается)
├── releases/
│   ├── 20260418-123000/                       (полный git checkout)
│   └── 20260418-100000/                       (прошлый релиз — для быстрого rollback)
└── shared/
    ├── backend/
    │   ├── .env                               (реальный файл, общий на все релизы)
    │   └── storage/                           (логи, cache, public uploads)
    └── frontend/
        └── .env.local
```

Каждый релиз получает симлинки:

- `releases/<ts>/backend/.env`       → `shared/backend/.env`
- `releases/<ts>/backend/storage`    → `shared/backend/storage`
- `releases/<ts>/frontend/.env.local` → `shared/frontend/.env.local`

### 13.2. Миграция с in-place на release-стиль (один раз)

Допустим, у вас уже работает in-place деплой по §9. Чтобы перейти:

```bash
cd /var/www/perfumer-by

# 1) Забрать .env, .env.local, storage/ в shared/
./scripts/bootstrap-shared.sh /var/www/perfumer-by

# 2) Временно переименовать текущий чекаут, чтобы не мешался
sudo mv backend backend.old
sudo mv frontend frontend.old

# 3) Первый релиз (скрипт сам клонирует репо в releases/<ts>/)
REPO_URL=git@github.com:<org>/perfumer-by.git ./scripts/release.sh

# 4) Убедиться, что сайт ок, и удалить старые папки
sudo rm -rf backend.old frontend.old
```

> Если подмены `backend.old` сделать не хочется — можно временно перенести исходники в любое
> другое место. `release.sh` работает только с `releases/`, `shared/` и `current`.

### 13.3. Nginx: перенацеливаем на `current/`

В `/etc/nginx/sites-available/perfumer.by` меняем `root` в блоках `/api/`, `/storage/`, `/up`:

```diff
 location ^~ /storage/ {
-    alias /var/www/perfumer-by/backend/storage/app/public/;
+    alias /var/www/perfumer-by/current/backend/storage/app/public/;
     ...
 }

 location ^~ /api/ {
-    root /var/www/perfumer-by/backend/public;
+    root /var/www/perfumer-by/current/backend/public;
     try_files $uri /index.php?$query_string;
     ...
 }
```

Nginx → `current/...` — симлинк разворачивается на лету, ресет не нужен при релизе.

### 13.4. Supervisor: queue worker через `current/`

`/etc/supervisor/conf.d/perfumer-queue.conf`:

```ini
[program:perfumer-queue]
command=/usr/bin/php /var/www/perfumer-by/current/backend/artisan queue:work redis --tries=1 --timeout=65 --sleep=1 --max-jobs=500 --max-time=3600
...
```

```bash
sudo supervisorctl reread
sudo supervisorctl update
```

`release.sh` сам вызывает `supervisorctl restart perfumer-queue:*` — воркер подхватит новый код.

### 13.5. Обычный релиз

```bash
cd /var/www/perfumer-by
./scripts/release.sh                   # main (по умолчанию)
GIT_REF=v1.2.3 ./scripts/release.sh    # релиз на тег/ветку
KEEP_RELEASES=10 ./scripts/release.sh  # хранить больше истории
```

Что делает `scripts/release.sh`:

1. Клонирует `GIT_REF` в `releases/<timestamp>`.
2. Прокидывает симлинки в `shared/`.
3. `composer install --no-dev --optimize-autoloader` (с `memory_limit=512M`).
4. `php artisan down` на текущем релизе, `migrate --force` на новом.
5. `config:cache`, `route:cache`, `view:cache`.
6. `npm ci` + `next build` в `frontend/`.
7. Атомарно `ln -sfnT releases/<ts> current`.
8. `pm2 reload perfumer-frontend` + `supervisorctl restart perfumer-queue:*`.
9. `php artisan up`.
10. Удаляет релизы старше `KEEP_RELEASES` (по умолчанию 5), не трогая текущий.

При ошибке на любом шаге — `current` не переключается, новый релиз остаётся в `releases/<ts>` для отладки; скрипт снимает maintenance с **старого** релиза.

### 13.6. Откат

```bash
./scripts/rollback.sh                   # на предыдущий релиз
./scripts/rollback.sh 20260418-100000   # на конкретный
```

Скрипт:

1. Переключает `current` на указанный релиз.
2. `pm2 reload` + `supervisorctl restart`.
3. Пересобирает кэши Laravel в откаченном релизе.
4. `php artisan up`.

> **ВАЖНО про БД:** миграции автоматически **не откатываются**. Если релиз, с которого
> откатываемся, добавлял новые миграции — схема БД останется «вперёдней» кода.
> Это нормально ровно пока новые колонки/таблицы только «добавляются» и старый код их
> просто не использует. Если миграция что-то удаляла/переименовывала — разбираемся
> вручную (`php artisan migrate:rollback --step=N`) или чинимся «вперёд» новым хотфиксом.

### 13.7. Makefile-ярлыки

```bash
make release          # = scripts/release.sh
make rollback         # = scripts/rollback.sh
make bootstrap-shared # = scripts/bootstrap-shared.sh (один раз)
```

---

## 14) Проверочный чек-лист перед «launch»

- [ ] DNS: A/AAAA записи `perfumer.by` и `www.perfumer.by` указывают на IP сервера.
- [ ] `https://perfumer.by/up` → 200.
- [ ] `https://perfumer.by/api/catalog/products?per_page=1` → 200 с JSON.
- [ ] Главная открывается, карточка товара рендерится.
- [ ] Админка доступна и логинится (с админским пользователем).
- [ ] `pm2 startup` и `pm2 save` выполнены — PM2 поднимется после ребута.
- [ ] `supervisorctl status` — queue worker RUNNING.
- [ ] `certbot renew --dry-run` → успех.
- [ ] Бэкап БД запускался хотя бы один раз успешно.
- [ ] В `.env` `APP_DEBUG=false`, `APP_ENV=production`.
