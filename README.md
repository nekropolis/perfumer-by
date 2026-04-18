# Perfumer (Laravel + Next.js)

E-commerce проект (замена OpenCart) на стеке:

- Backend: Laravel 13 (modular, API + admin)
- Frontend: Next.js 16 (React 19)
- DB: MySQL 8
- Cache / Queue: Redis
- Web: Nginx + PHP-FPM
- Process manager: pm2

---

## Структура проекта

```text
/var/www/perfumer-by
├── backend/   # Laravel API + modules
└── frontend/  # Next.js app
```

---

## Требования

- PHP 8.3
- Composer
- MySQL 8
- Redis
- Node.js 18+ (рекомендуется 22)
- npm
- Nginx
- pm2

### Рекомендуемые PHP extensions

`mbstring`, `xml`, `curl`, `zip`, `bcmath`, `gd`, `intl`, `pdo_mysql`, `redis`

---

## Быстрый старт

### 1) Backend

```bash
cd /var/www/perfumer-by/backend
composer install
cp .env.example .env   # если .env еще не создан
php artisan key:generate
php artisan migrate
php artisan storage:link
php artisan optimize:clear
```

### 2) Frontend

```bash
cd /var/www/perfumer-by/frontend
npm install
npm run build
```

### 3) Запуск frontend через pm2

```bash
cd /var/www/perfumer-by/frontend
pm2 start npm --name perfumer-frontend -- run start
pm2 save
```

---

## Переменные окружения

### Backend `.env`

Минимально важные:

- `APP_URL`
- `AUTH_MODEL=Modules\\Users\\Models\\User`
- `DB_DATABASE`
- `DB_USERNAME`
- `DB_PASSWORD`
- `CACHE_STORE=redis`
- `QUEUE_CONNECTION=redis`
- `SESSION_DRIVER=redis`

### Frontend `.env.local`

- `NEXT_PUBLIC_API_URL` — базовый URL backend API
- `NEXT_ALLOWED_DEV_ORIGINS` — список origins для dev/HMR (через запятую)

---

## Команды Makefile

Корневой `Makefile` рассчитан на деплой в `/var/www/perfumer-by`.

### Frontend

- `make dev` — запуск dev frontend через pm2 (`perfumer-frontend-dev`)
- `make dev-restart` — перезапуск dev
- `make dev-stop` — остановка dev
- `make prod` — `npm install` + `next build` + запуск prod (`perfumer-frontend`)
- `make prod-restart` — перезапуск prod
- `make prod-stop` — остановка prod
- `make logs` — логи prod
- `make logs-dev` — логи dev
- `make status` — список pm2 процессов

### Backend

- `make backend-clear` — `php artisan optimize:clear`
- `make backend-migrate` — миграции + очистка кешей
- `make backend-seed` — сидирование каталога

---

## Полезные artisan-команды

### Vanille: парсинг только карточек

Если `product_links.json` уже собран, можно перезапустить только этап парсинга карточек:

```bash
cd /var/www/perfumer-by/backend
php artisan catalog:parse-vanille-products
```

Опции:

- `--once` — выполнить только один батч
- `--offset=1200` — старт с нужного смещения
- `--limit=20` — размер батча
- `--max-links=500` — ограничение числа ссылок
- `--mode=full|new_only` — режим парсинга
- `--links-path=/abs/path/to/product_links.json` — кастомный файл ссылок

Примеры:

```bash
php artisan catalog:parse-vanille-products --once
php artisan catalog:parse-vanille-products --offset=1200 --limit=10
php artisan catalog:parse-vanille-products --mode=new_only
```

### Импорт sample JSON Vanille

```bash
php artisan catalog:import-vanille-sample /path/to/file.json
```

---

## Seller One: что есть в админке

В блоке импорта Seller One доступны:

- `Новый парсинг` — разбор прайса, обновление/создание строк поставщика
- `Обновить цены` — обновление цен только для уже связанных товаров по коду из прайса
  - обновляет цену и пишет запись в `supplier_price_histories`
  - если код из связанных отсутствует в свежем прайсе — переводит в preorder / нет в наличии
  - пишет запись в `audit_logs`

---

## Troubleshooting

### Permission denied при записи файлов парсинга

Пример:

`file_put_contents(.../storage/app/public/imports/vanille/products/products_006.json): Permission denied`

Проверь права на `backend/storage` и пользователя php-fpm/cli.
После восстановления прав можно продолжать только этап карточек:

```bash
cd /var/www/perfumer-by/backend
php artisan catalog:parse-vanille-products --offset=<нужный_offset>
```

### Не запускать dev и prod одновременно на одном порту

- dev: `make dev`
- prod: `make prod`

Перед переключением останавливай текущий режим (`make dev-stop` или `make prod-stop`).

