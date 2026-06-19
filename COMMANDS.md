# Команды проекта

Справочник: что делает каждая команда, откуда запускать.  
**Сверху — то, что нужно чаще всего.** Редкие legacy-команды — внизу.

Все `php artisan` — из каталога `backend/`.  
Make/npm — из корня или `frontend/`, как указано.

---

## 1. Ежедневная разработка

| Команда | Что делает |
| --- | --- |
| `make dev` | Запускает фронт (Next.js) через PM2 или напрямую. |
| `make dev-stop` | Останавливает dev-фронт, освобождает порт 3000. |
| `make dev-restart` | Перезапуск dev-фронта после смены env. |
| `make dev-check-api` | Проверяет, что API из env фронта доступен. |
| `cd frontend && npm run dev` | Next.js dev на :3000 (без make). |
| `cd frontend && npm run build` | Сборка фронта перед деплоем/мержем. |
| `cd frontend && npm run lint` | ESLint по фронту. |
| `cd backend && php artisan migrate` | Применить миграции локально. |
| `cd backend && php artisan optimize:clear` | Сброс кэша Laravel (config, routes, views). |
| `cd backend && php artisan test` | Тесты бэкенда. |
| `make backend-clear` | То же, что `optimize:clear`, из корня. |
| `make backend-migrate` | Миграции + очистка кэша. |
| `make install-front` / `make install-back` | `npm install` / `composer install`. |

---

## 2. Vanille — импорт и починка каталога

**Главный контур:** собрать ссылки → спарсить карточки → импортировать в БД → починить данные.

### Очередь и полный пайплайн

| Команда | Что делает | Когда |
| --- | --- | --- |
| `php artisan catalog:vanille-queue status` | Статус задач импорта Vanille в очереди. | Завис импорт в админке. |
| `php artisan catalog:vanille-queue run-pending` | Выполнить ожидающие задачи вручную (без воркера). | Нет queue worker на сервере. |
| `php artisan catalog:vanille-queue resume --job-id=123` | Продолжить конкретную задачу. | После ошибки в job. |
| `php artisan catalog:vanille-sync` | Полный цикл: бренды → ссылки → `products_*.json`. | Массовое обновление с Vanille. |
| `php artisan catalog:vanille-brand {slug}` | Сбор ссылок и парсинг **одного** бренда (без 7-часового пайплайна). | Добавили/обновили один бренд. |

### Парсинг и импорт карточек

| Команда | Что делает | Когда |
| --- | --- | --- |
| `php artisan catalog:parse-vanille-products` | Качает HTML карточек по `product_links.json` → `products_*.json`. | После сбора ссылок. |
| `php artisan catalog:parse-vanille-products --once --limit=20` | Одна пачка парсинга. | Отладка / контролируемый прогон. |
| `php artisan catalog:parse-vanille-products --mode=new_only` | Только новые URL (ещё не в manifest). | Инкрементальный парсинг. |
| `php artisan catalog:parse-vanille-products --mode=errors_only` | Повтор URL из `parse_errors.json`. | После сетевых ошибок. |
| `php artisan catalog:import-vanille-sample path/to.json` | Импорт одного JSON-файла в каталог (тест). | Проверка логики на образце. |

Импорт спарсенных JSON в БД — через **админку** (Import Export → Vanille) или `catalog:vanille-queue`.

**Одиночный импорт** («Спарсить и импортировать товар»): если бренда нет в `brands.json`, он **добавляется автоматически** из карточки (slug берётся из URL, напр. `lartisan-parfumeur`).

### Починка после импорта (важно)

| Команда | Что делает | Когда |
| --- | --- | --- |
| `php artisan catalog:vanille-repair-product-names --dry-run --limit=200` | **Превью:** восстановить регистр `name`/`h1` из H1 и поля «Аромат» (было `encens et lavande` → `Encens Et Lavande`). | После импорта с lowercase slug. |
| `php artisan catalog:vanille-repair-product-names --limit=200 --from-payload` | Применить исправления имён (без HTTP к Vanille). | ~800 товаров, есть payload. |
| `php artisan catalog:vanille-repair-product-names --limit=20 --reparse --log-skips` | Reparse с сайта, если в payload нет H1/«Аромат». | Оставшиеся «stuck» после dry-run. |
| `php artisan catalog:vanille-repair-variants --scope=missing` | Добавить недостающие варианты (объём, концентрация, штрих-коды). | Товар без вариантов после импорта. |
| `php artisan catalog:vanille-repair-variants --scope=all --limit=20` | То же для всех связанных Vanille-товаров, пачками. | Массовый backfill вариантов. |
| `php artisan catalog:vanille-repair-variants --target=json --from-payload` | Обновить `offers` в `products_*.json` без импорта в БД. | Устарели offers в JSON. |
| `php artisan catalog:repair-vanille-catalog-image-order` | Поменять местами перепутанные фото каталога (-1/-2). | Неверный порядок фото. |

### Сверка и диагностика Vanille

| Команда | Что делает |
| --- | --- |
| `php artisan catalog:vanille-brendyi-total` | Сумма счётчиков на vanille.by/brendyi — сверка с `product_links.json`. |

### Очистка каталога после импорта

| Команда | Что делает | Когда |
| --- | --- | --- |
| `php artisan catalog:prune-products-without-vanille --dry-run` | Список товаров без связи с Vanille или пустых (0 вариантов, 0 атрибутов). | Перед чисткой мусора. |
| `php artisan catalog:prune-products-without-vanille --force` | Удалить такие товары и их `supplier_products`. | После проверки dry-run. |
| `php artisan catalog:prune-brands-without-products` | Показать и (по подтверждению) удалить бренды без товаров. | После prune товаров. |
| `php artisan catalog:merge-duplicate-brands --dry-run` | Найти дубли брендов (разные slug, одно имя). | Дубли типа apieu / a-pieu. |

---

## 3. Seller One — прайс поставщика

| Команда | Что делает | Когда |
| --- | --- | --- |
| `php artisan seller-one:reset-links` | Сбросить связки прайса с каталогом (варианты остаются в БД). | Перед повторным матчингом. |
| `php artisan seller-one:purge` | **Полная** очистка данных Seller One (строки, офферы, история цен). | Чистый перезапуск импорта прайса. |

Импорт и матчинг прайса — в **админке** (Import Export → Seller One).

### Логика парсинга строки прайса

Класс: `SellerOneVariantMatcher` (`backend/Modules/ImportExport/.../SellerOneVariantMatcher.php`).

**1. Разделение строки**

По первому встреченному маркеру (слева направо): `vial`, `test|tester|тестер`, `\d+ ml`, `extrait de parfum`.

- До маркера — **название** (бренд + линия).
- После — **хвост варианта** (объём, концентрация, тестер, пробник).

Строки с `***` в названии не парсятся.

**2. Поля варианта из хвоста**

| Маркер | Значение в каталоге |
| --- | --- |
| `2ml`, `10 ml` | `volume_ml` |
| `edp`, `edt`, `edc` | код концентрации |
| `extrait de parfum` в хвосте | `extrait de parfum` |
| `parfum` / `parfume` / `parfums` в хвосте | `parfum` (духи) |
| `test`, `tester`, `тестер` | `is_tester = true` |
| `vial` | `is_vial = true` (Пробник) |

Неизвестные слова в хвосте (`set`, `viak`, «с крышкой») → 95% (без автосвязки).

**3. Правила имени линии**

- `(L)` / `(M)` / `(U)` — пол; каскад female → unisex при матче.
- Trailing `Parfum` / `Parfume` в названии линии (не `de Parfum`) → линия без суффикса, концентрация **parfum** (духи); перекрывает `edp`/`edt` в хвосте поставщика.
- `L.E.`, `Edition Limitee`, combo-объёмы (`20ml edp+20ml edp`) — особые правила / блок автолинка.

**4. Скоринг и автосвязка**

| Уровень | % | Автосвязка |
| --- | --- | --- |
| Имя exact + вариант full | 100 | да |
| Имя exact + лишние слова в хвосте | 95 | нет |
| Имя exact, вариант не найден | 90 | нет |
| Имя partial | 70 | нет |
| Имя catalog_extra | 50 | нет (вариант может подобраться) |

Справочник вариантов: уникальность `(volume_ml, concentration_code, is_tester, is_vial)`.

После правил матчера — **re-parse** прайса или `seller-one:purge` + импорт заново (старые подтверждённые связки не пересчитываются сами).

### «Обновить цены» — счётчики в Telegram / админке

У поставщика в файле только **код, название, цена** — отдельного «наличия» нет.

| Счётчик | Значение |
| --- | --- |
| **Пропали из прайса** | Связанный код отсутствует в новом файле — оффер деактивируется, вариант снимается с витрины по каналу поставщика |
| **Появились на витрине** | Код в файле, связка активна — вариант стал доступен для продажи по прайсу |

Пока код есть в прайсе и связка с вариантом активна, вариант **не снимается** с витрины.

---

## 4. Каталог — поиск, имена, картинки

| Команда | Что делает | Когда |
| --- | --- | --- |
| `php artisan catalog:search:reindex` | Полная переиндексация товаров в Meilisearch. | После массового импорта/правок имён. |
| `php artisan catalog:search:reindex --chunk=500` | То же, другой размер пачки. | Настройка под память сервера. |
| `php artisan catalog:products:strip-brand-from-names --dry-run` | Убрать бренд из `products.name` (отчёт). | Legacy: имя = «Dior Sauvage». |
| `php artisan catalog:products:strip-brand-from-names` | Применить очистку имён. | После dry-run. |
| `php artisan catalog:regenerate-product-image-variants` | WebP-варианты фото: full, card, listing, thumb. | После миграции/импорта картинок. |
| `php artisan catalog:regenerate-product-image-variants --product-id=123` | Для одного товара. | Точечный фикс. |
| `php artisan catalog:regenerate-product-image-variants --limit=100` | Пачками на проде. | Большой каталог. |

---

## 5. Деплой и сервер

### Make (из корня)

| Команда | Что делает |
| --- | --- |
| `make deploy` | In-place деплой (`scripts/deploy.sh`). |
| `make release` | Capistrano-релиз: `releases/` + symlink `current`. |
| `make rollback` | Откат на предыдущий релиз. |
| `make prod` | Сборка и запуск prod-фронта (PM2). |
| `make prod-restart` / `make prod-stop` | Перезапуск / остановка prod-фронта. |
| `make logs` / `make logs-dev` | Логи PM2 (prod / dev). |
| `make status` | `pm2 list`. |

### Скрипты на сервере

| Команда | Что делает |
| --- | --- |
| `./scripts/deploy-dev.sh` | Dev-сервер: composer, migrate, опционально фронт. |
| `./scripts/deploy-dev.sh --only-backend` | Только бэкенд. |
| `./scripts/deploy-dev.sh --only-frontend` | Только фронт. |
| `./scripts/deploy.sh` | Prod in-place: pull, migrate, cache, build, queue restart. |
| `./scripts/release.sh` | Prod release deploy. |
| `./scripts/rollback.sh` | Откат релиза. |

### Laravel на проде

| Команда | Что делает |
| --- | --- |
| `php artisan migrate --force` | Миграции без вопросов (в deploy-скриптах). |
| `php artisan config:cache` | Кэш конфига. |
| `php artisan route:cache` | Кэш маршрутов. |
| `php artisan queue:restart` | Перезапуск воркеров после деплоя. |
| `php artisan down` / `php artisan up` | Режим обслуживания. |
| `php artisan storage:link` | Симлинк `public/storage` (первый деплой). |
| `php artisan server:health-report` | Проверка сервера + алерт в Telegram при проблемах. |

---

## 6. Laravel — общее (локально)

| Команда | Что делает |
| --- | --- |
| `php artisan serve` | Dev HTTP-сервер API. |
| `php artisan queue:listen --tries=1` | Локальный обработчик очереди. |
| `php artisan pail` | Поток логов в терминале. |
| `composer run test` | `optimize:clear` + тесты. |
| `composer install` | Зависимости PHP. |
| `composer update vendor/pkg -W` | Обновить один пакет в lock. |

---

## 7. Справочники и пользователи

| Команда | Что делает |
| --- | --- |
| `php artisan settlements:import-belarus` | Импорт населённых пунктов РБ из JSON (доставка/чекаут). |
| `php artisan users:migrate-name-to-first-name --dry-run` | Перенос `name` → `first_name`, если пусто. |

---

## 8. Legacy — миграция со старого магазина

Редко. **Сначала всегда `--dry-run`.**

| Команда | Что делает |
| --- | --- |
| `php artisan legacy:map-brands-by-slug --dry-run` | Сопоставление legacy-брендов по slug. |
| `php artisan legacy:map-products-by-slug --dry-run` | Сопоставление legacy-товаров по slug. |
| `php artisan legacy:map-products-by-slug --sync-fields` | + описания, SEO, нормализация name/h1. |
| `php artisan legacy:import-customers --dry-run` | Клиенты из OpenCart. |
| `php artisan legacy:import-orders --dry-run` | Заказы. |
| `php artisan legacy:import-reviews --dry-run` | Отзывы. |
| `php artisan legacy:import-product-images --dry-run` | Картинки товаров. |
| `php artisan legacy:import-posts` | Статьи/новости в CMS. |
| `php artisan legacy:normalize-user-phones --dry-run` | Телефоны пользователей → только цифры. |
| `php artisan legacy:normalize-order-phones --dry-run` | Телефоны в заказах → только цифры. |

Путь к дампу по умолчанию: `storage/app/public/perfumer_db.sql`  
(переопределение: `--dump=...`).

---

## Типовые сценарии

### Исправить lowercase-имена после Vanille (~800 товаров)

```bash
cd backend
php artisan catalog:vanille-repair-product-names --dry-run --limit=200
php artisan catalog:vanille-repair-product-names --limit=200 --from-payload
php artisan catalog:search:reindex
```

### Новый бренд с Vanille

```bash
cd backend
php artisan catalog:vanille-brand serge-lutens
# далее импорт через админку или vanille-queue
```

### Локальная разработка фронта

```bash
make dev
# или
cd frontend && npm run dev
```

### Деплой на прод (release)

```bash
cd /var/www/perfumer-by
./scripts/release.sh
```

### После деплоя с картинками

```bash
cd backend
php artisan migrate --force
php artisan catalog:regenerate-product-image-variants --limit=100
```
