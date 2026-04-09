# Perfumer (Laravel + Next.js)

E-commerce проект (замена OpenCart) на стеке:

- Backend: Laravel (API, admin)
- Frontend: Next.js (SSR)
- DB: MySQL
- Cache/Queue: Redis
- Web: Nginx + PHP-FPM
- Process manager: pm2

---

## Структура
/var/www
backend/    # Laravel
frontend/   # Next.js

---

## Требования

- PHP 8.3 + extensions:
    - mbstring, xml, curl, zip, bcmath, gd, intl, mysql, redis
- MySQL 8
- Redis
- Node.js 18+ (рекомендуется 22)
- Composer
- Nginx
- pm2

---

## Backend (Laravel)

## env
APP_URL=

AUTH_MODEL=Modules\\Users\\Models\\User

DB_DATABASE=perfumer
DB_USERNAME=perfumer
DB_PASSWORD=password

CACHE_STORE=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=redis

# Запуск
php artisan migrate
php artisan storage:link
php artisan optimize:clear

# Frontend (Next.js)
cd /var/www/frontend

npm install
npm run build

# Запуск через pm2
pm2 start npm --name perfumer-frontend -- start
pm2 save

# php
memory_limit = 512M
upload_max_filesize = 64M
post_max_size = 64M

# Development & Deployment

## Frontend (Next.js)

## Frontend env
Используются переменные окружения:
`.env.local`:
- `NEXT_PUBLIC_API_URL` — базовый URL backend API
- `NEXT_ALLOWED_DEV_ORIGINS` — список dev origins для Next.js HMR, через запятую

### Development (рекомендуется)

Запуск с авто-пересборкой (hot reload):
make dev

Логи:
make logs-dev

Остановить:
make dev-stop
⸻

### Production
Сборка и запуск:
make prod

Рестарт:
make prod-restart

Логи:
make logs

⸻
### Backend (Laravel)
Очистка кеша:
make backend-clear

Миграции:
make backend-migrate

Сидирование каталога:
make backend-seed

⸻
Общие команды
Статус процессов:
make status

⸻
Важно
•	Dev режим (make dev) — для разработки, без build
•	Prod режим (make prod) — для продакшена
•	Не запускать одновременно dev и prod на одном порту

make dev
make dev-stop
make prod
make prod-restart
make logs
make logs-dev
make backend-clear
make backend-migrate
make backend-seed
