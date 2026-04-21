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

Для OTP (Viber + SMS + manual fallback) также добавь:

- `OTP_VIBER_FIRST=true`
- `VIBER_OTP_ENABLED=true`
- `VIBER_OTP_DRIVER=mock` (`mock` или `http`)
- `VIBER_OTP_ENDPOINT=...`
- `VIBER_OTP_TOKEN=...`
- `VIBER_OTP_SENDER=Perfumer`
- `VIBER_OTP_TIMEOUT=5`
- `VIBER_MOCK_REGISTRATION_MODE=all` (`all|none|list`)
- `VIBER_MOCK_REGISTERED_PHONES=37529XXXXXXX,37544XXXXXXX`
- `SMS_OTP_ENABLED=true`
- `SMS_OTP_DRIVER=mock` (`mock` или `http`)
- `SMS_OTP_ENDPOINT=...`
- `SMS_OTP_TOKEN=...`
- `SMS_OTP_SENDER=Perfumer`
- `SMS_OTP_TIMEOUT=5`
- `AUTH_OTP_CAPTCHA_ENABLED=false`
- `AUTH_OTP_CAPTCHA_TRIGGER_IP_ATTEMPTS=3`
- `AUTH_OTP_CAPTCHA_TRIGGER_IP_PHONE_ATTEMPTS=2`
- `RECAPTCHA_SECRET_KEY=...`
- `RECAPTCHA_MIN_SCORE=0.5`

### Frontend `.env.local`

- `NEXT_PUBLIC_API_URL` — базовый URL backend API
- `NEXT_ALLOWED_DEV_ORIGINS` — список origins для dev/HMR (через запятую)
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` — site key для Google reCAPTCHA v3

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

### OTP: как пошагово подключить Viber + SMS

Сейчас в проекте уже заложена цепочка:

1. `Viber` (первый канал),
2. `SMS` (fallback),
3. `manual fallback` (если оба канала недоступны, код возвращается в ответе `request-code` и вводится вручную).

Шаги подключения реального провайдера:

1) **Привести backend в актуальное состояние**

```bash
cd /var/www/perfumer-by/backend
composer install
composer dump-autoload
php artisan optimize:clear
php artisan migrate
```

2) **Проверить, что модуль Communications включен**

Файл `backend/modules_statuses.json`:

```json
{
  "Communications": true
}
```

Если временно выключен — включи и снова выполни `composer dump-autoload` + `php artisan optimize:clear`.

3) **Настроить `.env` под реальный провайдер**

Минимально для production:

```dotenv
OTP_VIBER_FIRST=true

VIBER_OTP_ENABLED=true
VIBER_OTP_DRIVER=http
VIBER_OTP_ENDPOINT=https://<provider>/viber/send
VIBER_OTP_TOKEN=...
VIBER_OTP_SENDER=Perfumer
VIBER_OTP_TIMEOUT=5

SMS_OTP_ENABLED=true
SMS_OTP_DRIVER=http
SMS_OTP_ENDPOINT=https://<provider>/sms/send
SMS_OTP_TOKEN=...
SMS_OTP_SENDER=Perfumer
SMS_OTP_TIMEOUT=5

AUTH_OTP_CAPTCHA_ENABLED=true
AUTH_OTP_CAPTCHA_TRIGGER_IP_ATTEMPTS=3
AUTH_OTP_CAPTCHA_TRIGGER_IP_PHONE_ATTEMPTS=2
RECAPTCHA_SECRET_KEY=...
RECAPTCHA_MIN_SCORE=0.5
```

4) **Проверить API контракт провайдера**

Сейчас отправка в `http` драйвере идет с payload:

- `to`
- `sender`
- `message`

Если у провайдера другие поля/заголовки/подпись, адаптируй маппинг в `backend/Modules/Communications/app/Services/OtpDeliveryService.php`.

5) **Проверить миграции таблицы верификаций**

В `phone_verifications` должны быть поля доставки:

- `delivery_channel`
- `delivery_status`
- `delivery_provider_message_id`
- `delivery_error`
- `delivered_at`

6) **Сделать smoke-тест**

- вызвать `POST /auth/request-code` с валидным телефоном;
- проверить, что ответ содержит `delivery_channel`;
- проверить успешный `POST /auth/verify-code`.

7) **Временный безопасный режим**

Если провайдер недоступен или неверные креды:

- Viber не доставил -> пробуем SMS;
- SMS не доставил -> возвращаем `manual` код (не блокируем вход пользователей).

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

