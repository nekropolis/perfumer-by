# Fresh Production Database Runbook

Порядок подготовки чистой production базы с товарами и картинками.

Запускать на сервере, когда будешь готов полностью пересобрать данные.

## Что получится на выходе

- Чистая база после `migrate:fresh`.
- Импортированные товары Vanille.
- Каталожные изображения Vanille для листинга.
- Legacy product images, если они нужны для уже сопоставленных товаров.
- Сгенерированные WebP-варианты изображений:
  - `full`
  - `card`
  - `listing`
  - `thumb`

## Что этот сценарий не делает

- Не запускает галерею карточек Vanille.
- Не запускает уникализацию описаний.
- Не делает автоматический полный legacy import одной командой: такой команды сейчас нет.
- Не откатывает старую БД. Перед запуском сделай backup.

## 0. Backup

Перед fresh обязательно сделать backup БД и storage.

Пример:

```bash
cd /var/www/perfumer-by/current/backend

php artisan down --render="errors::503" --retry=15

# Пример для MySQL/MariaDB. Подставь свои значения.
mysqldump -u USER -p DATABASE_NAME > ~/perfumer-by-backup-$(date +%Y%m%d-%H%M%S).sql

# Backup storage, если нужно сохранить текущие файлы.
tar -czf ~/perfumer-by-storage-$(date +%Y%m%d-%H%M%S).tar.gz storage/app/public
```

## 1. Fresh база

```bash
cd /var/www/perfumer-by/current/backend

php artisan migrate:fresh --force
php artisan storage:link
php artisan optimize:clear
```

Если нужна полностью чистая папка картинок товаров:

```bash
rm -rf storage/app/public/products
```

Не удаляй весь `storage/app/public`, если там лежат legacy dumps, Vanille JSON или другие import-файлы.

## 2. Vanille: парсинг нового товара

Через админку запусти:

```text
Импорт / Экспорт -> Vanille -> Парсинг нового товара
```

Важно: **парсинг нового товара не включает каталожные фото листинга**.

Он делает только:

1. Парсинг брендов.
2. Сбор ссылок товаров.
3. Парсинг карточек товаров в JSON.

Если queue worker не работает или задача зависла:

```bash
cd /var/www/perfumer-by/current/backend

php artisan catalog:vanille-queue status
php artisan catalog:vanille-queue run-pending
```

## 3. Vanille: импорт спарсенных товаров

После завершения парсинга нового товара через админку запусти:

```text
Импорт / Экспорт -> Vanille -> Импорт спарсенных товаров
```

Если нужно выполнить активную задачу синхронно:

```bash
php artisan catalog:vanille-queue run-pending
```

После этого в базе должны появиться товары, бренды, варианты и supplier products из Vanille.

## 4. Vanille: каталожные изображения листинга

После импорта товаров через админку запусти:

```text
Импорт / Экспорт -> Vanille -> Каталожные изображения
```

Это отдельная задача `parse_catalog_images`.

Она скачивает картинки листинга и кладёт их как `usage_type = catalog`. По новому правилу для них генерируются WebP-варианты:

- `full`
- `card`
- `listing`
- `thumb`

Не запускать пока:

```text
Галерея карточек
Уникализация описаний
```

## 5. Legacy: сопоставление брендов и товаров

Если legacy картинки нужны, сначала нужны map-таблицы.

Запусти dry-run:

```bash
cd /var/www/perfumer-by/current/backend

php artisan legacy:map-brands-by-slug --dry-run
php artisan legacy:map-products-by-slug --dry-run --export-unmatched=storage/app/legacy-unmatched-products.csv
```

Если результат нормальный:

```bash
php artisan legacy:map-brands-by-slug --truncate
php artisan legacy:map-products-by-slug --truncate
```

## 6. Legacy: импорт product images

Сначала dry-run:

```bash
php artisan legacy:import-product-images --dry-run
```

Если результат нормальный:

```bash
php artisan legacy:import-product-images
```

Важно: `legacy:import-product-images` сейчас импортирует исходные legacy файлы и пишет `path`. Он **не создаёт WebP-варианты сам**.

После него обязательно:

```bash
php artisan catalog:regenerate-product-image-variants
```

Для безопасной пакетной проверки можно начать так:

```bash
php artisan catalog:regenerate-product-image-variants --limit=100
```

Для одного товара:

```bash
php artisan catalog:regenerate-product-image-variants --product-id=123
```

## 7. Legacy: дополнительные данные, если нужны

Если нужны клиенты:

```bash
php artisan legacy:import-customers --dry-run
php artisan legacy:import-customers --truncate-map

php artisan legacy:normalize-user-phones --dry-run
php artisan legacy:normalize-user-phones

php artisan users:migrate-name-to-first-name --dry-run
php artisan users:migrate-name-to-first-name
```

Если нужны заказы:

```bash
php artisan legacy:import-orders --dry-run
php artisan legacy:import-orders --truncate-map

php artisan legacy:normalize-order-phones --dry-run
php artisan legacy:normalize-order-phones
```

Если нужны отзывы:

```bash
php artisan legacy:import-reviews --dry-run
php artisan legacy:import-reviews --truncate-map
```

Если нужны legacy статьи/новости:

```bash
php artisan legacy:import-posts
```

## 8. Финализация

После импорта товаров и картинок:

```bash
cd /var/www/perfumer-by/current/backend

php artisan catalog:regenerate-product-image-variants
php artisan catalog:search:reindex

php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache || true

php artisan up
```

Если queue workers работают под Supervisor:

```bash
php artisan queue:restart
sudo supervisorctl restart "perfumer-queue:*"
```

Если frontend уже запущен через PM2 и нужно обновить SSR/кеш окружения:

```bash
pm2 reload perfumer-frontend --update-env
pm2 save
```

## Быстрый порядок команд

Минимальный сценарий для чистой базы с Vanille товарами и картинками:

```bash
cd /var/www/perfumer-by/current/backend

php artisan down --render="errors::503" --retry=15
php artisan migrate:fresh --force
php artisan storage:link
php artisan optimize:clear

# Дальше через админку:
# 1. Парсинг нового товара
# 2. Импорт спарсенных товаров
# 3. Каталожные изображения

# Если нужны legacy product images:
php artisan legacy:map-brands-by-slug --dry-run
php artisan legacy:map-products-by-slug --dry-run --export-unmatched=storage/app/legacy-unmatched-products.csv
php artisan legacy:map-brands-by-slug --truncate
php artisan legacy:map-products-by-slug --truncate
php artisan legacy:import-product-images --dry-run
php artisan legacy:import-product-images

php artisan catalog:regenerate-product-image-variants
php artisan catalog:search:reindex
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache || true
php artisan up
```

## Проверки после запуска

Проверить активные/последние Vanille задачи:

```bash
php artisan catalog:vanille-queue status
```

Проверить, что товары появились:

```bash
php artisan tinker
```

```php
\Modules\Catalog\Models\Product::count();
\Modules\Catalog\Models\ProductImage::count();
\Modules\Catalog\Models\ProductImage::where('usage_type', 'catalog')->count();
\Modules\Catalog\Models\ProductImage::whereNotNull('path_full')->count();
```

Проверить storage:

```bash
find storage/app/public/products -name '*-listing.webp' | head
find storage/app/public/products -name '*-thumb.webp' | head
```

