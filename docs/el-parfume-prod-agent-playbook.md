# Playbook: el-parfume.by → perfumer.by (прод)

Инструкция для агента после выкладки ветки `feature/el-parfume-migration` (или её merge) на **production**.

Цель: один раз прогнать данные и подготовить 301 с el-parfume.by на perfumer.by **без поломки** текущего прода.

Дата подготовки: 2026-10-20. Репетиция уже сделана на dev (`192.168.0.25`, `/var/www/perfumer-by`).

---

## 0. Перед стартом — обязательно уточнить у владельца

Без ответов **не начинать**:

1. Хост прода (SSH) и путь к проекту (ожидаемо `/var/www/perfumer-by`).
2. Код этой ветки **уже задеплоен** на прод? (миграции ещё не гонять, если код не выкатили).
3. Когда переключать DNS el-parfume.by: **сейчас** или только подготовить map/nginx?
4. Есть ли доступ к папке `/image/` старого сайта (FTP/архив)? Нужна для картинок в 7 статьях.
5. Можно ли запускать `php artisan migrate` на проде в этом окне?

Если владелец сказал «только подготовить, DNS не трогать» — **не менять DNS, certbot и live nginx для el-parfume.by** без отдельного ок.

---

## 1. Жёсткие правила безопасности (не ломать прод)

- **Не** делать `migrate:fresh`, `db:wipe`, `schema:drop`, truncate каталога/заказов/пользователей.
- **Не** удалять и не перезаписывать чужие файлы в `storage/` кроме `storage/app/elparfume/` и публичных картинок импорта статей.
- **Не** править `.env` без явного запроса (особенно `APP_URL`, БД, redis, meilisearch).
- **Не** `nginx -s reload` / certbot / DNS, пока владелец не сказал переключать el-parfume.by.
- **Не** скрейпить CheckFresh и не включать старый чекер el-parfume.
- Импорты идемпотентны по дизайну; повторный запуск допустим, но сначала `--dry-run` где есть.
- Все тяжёлые команды — из `backend/`, с `cd` в каталог проекта на сервере.
- Перед опасным шагом: кратко написать владельцу, что именно будет сделано, и дождаться ок, если шаг необратимый (DNS, certbot, live nginx).

Локальные тесты (не на проде):

```bash
cd backend && BROADCAST_CONNECTION=null php artisan test --filter='ElParfume|CatalogLanding|BatchCode|Sitemap'
```

---

## 2. После деплоя кода (один раз)

Рабочий каталог: `/var/www/perfumer-by/backend` (если путь другой — из п.0).

```bash
cd /var/www/perfumer-by/backend
composer dump-autoload
php artisan migrate --force --no-interaction
# Ожидаемые миграции этой ветки (если ещё не Ran):
# - 2026_10_20_120000_create_catalog_landings_table
# - 2026_10_20_130000_create_batch_code_submissions_table
php artisan migrate:status | grep -E 'catalog_landings|batch_code_submissions'
php artisan storage:link --force
```

Проверить симлинк: `public/storage` должен указывать на **этот** проект  
`.../perfumer-by/backend/storage/app/public`, а не на чужой путь вроде `/var/www/backend/...`.

Модуль BatchCode должен быть в `modules_statuses.json` (`"BatchCode": true`) и в `composer.json` autoload — это уже в коде ветки.

Проверка API:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://perfumer.by/api/batch-code/brands
# или локально через Host / 127.0.0.1 по принятому на проде способу
```

Ожидание: `200`.

---

## 3. Данные el-parfume (не в git)

Каталог: `backend/storage/app/elparfume/`.

**Обязательно исключить `storage/app/elparfume/` из деплоя с удалением лишних файлов**, иначе пропадёт `manual_overrides.csv` (на dev так уже случалось). Держать копию:

```bash
cp storage/app/elparfume/manual_overrides.csv /root/elparfume_manual_overrides.backup.csv
```

Положить на сервер (если ещё нет):

| Файл | Назначение |
|---|---|
| `el_parfume_b.sql` | дамп старого сайта |
| `index/gsc_pages.csv` | выгрузка GSC |
| `brand_synonyms.csv` | синонимы брендов (есть в репе/бэкапе с dev) |

С dev можно скопировать готовые артефакты **как черновик**, но **match и импорты всё равно прогнать на продовом каталоге** — товары/бренды отличаются от dev.

---

## 4. Порядок команд (прод, с продовым каталогом)

```bash
cd /var/www/perfumer-by/backend

# 1) URL из дампа + GSC
php artisan elparfume:extract-urls

# 2) Сопоставление → redirect_map.csv + unmatched.csv
php artisan elparfume:match

# 3) Посадочные (сначала dry-run)
php artisan elparfume:import-landings --dry-run
php artisan elparfume:import-landings
# создаёт/обновляет catalog_landings и дописывает manual_overrides.csv

# 4) Статьи (картинки)
# Если есть дерево старого сайта с папкой image/:
#   php artisan elparfume:import-posts --images-from=/path/to/old-site
# Иначе: импорт с remote URL (картинки умрут после отключения el-parfume.by).
# Предпочтительно: скачать нужные /image/... пока старый сайт жив, затем --images-from=.
php artisan elparfume:import-posts --dry-run
php artisan elparfume:import-posts --images-from=/path/to/old-site   # или без флага

# 5) Отзывы
php artisan elparfume:import-reviews --dry-run
php artisan elparfume:import-reviews
# 1–3★ и неодобренные → pending; без товара + 2 store → TYPE_STORE

# 6) Повторный match (подхватить overrides посадочных и коллизий slug)
php artisan elparfume:match
cp storage/app/elparfume/manual_overrides.csv /root/elparfume_manual_overrides.backup.csv

# 7) Nginx map (файлы в storage, ещё не в /etc/nginx)
php artisan elparfume:build-nginx-map
```

Ожидаемые ориентиры (с dev, на проде цифры могут чуть отличаться):

- `old_urls.csv` ≈ 17 500 строк
- посадочные ≈ 53 create + ≈ 14 fallback на `/catalog?gender=...`
- статьи: 7
- отзывы: 34 строки импорта (часть уже могла быть на проде — смотреть `Skipped existing`)
- после overrides: `decision=review` по SEO ≈ 0
- nginx: ~17 800 URI map + ~8 600 args map

---

## 5. Nginx el-parfume.by (без DNS — только подготовка)

Артефакты:

- `storage/app/elparfume/nginx/el-parfume.by.map.conf`
- пример: `scripts/nginx/el-parfume.by.conf.example`

Подготовка на сервере (ещё **без** переключения DNS, если так сказал владелец):

```bash
# map должен подключаться в http {}
sudo cp storage/app/elparfume/nginx/el-parfume.by.map.conf /etc/nginx/el-parfume.by.map.conf
# в nginx.conf или conf.d: include /etc/nginx/el-parfume.by.map.conf;

sudo cp scripts/nginx/el-parfume.by.conf.example /etc/nginx/sites-available/el-parfume.by
# поправить ssl пути после certbot; пока можно только :80 или disabled site
sudo nginx -t
# reload только если владелец разрешил и конфиг не ломает текущие сайты
```

Проверка **до DNS** (IP прода + Host):

```bash
php artisan elparfume:verify-redirects \
  --old-host=https://IP_ИЛИ_ВНУТРЕННИЙ \
  --host-header=el-parfume.by \
  --new-host=https://perfumer.by \
  --only-gsc
```

Ожидание: 301 одним прыжком на `https://perfumer.by{target}`, цель даёт 200. Exit code ≠ 0 только если упали строки с `gsc_impressions > 0`.

---

## 6. День переключения DNS (только по явному ок владельца)

1. Финальный `elparfume:match` + `elparfume:build-nginx-map` на актуальном проде.
2. Обновить `/etc/nginx/el-parfume.by.map.conf`, `nginx -t`, reload.
3. DNS A/AAAA el-parfume.by и www → прод. **MX не трогать / не создавать** (почты на домене нет).
4. `certbot --nginx -d el-parfume.by -d www.el-parfume.by`
5. `elparfume:verify-redirects --only-gsc` уже на боевом хосте.
6. В GSC / Яндекс.Вебмастере: смена адреса / подтверждение нового свойства.
7. Мониторинг: access log, попадания в default `/catalog`, 404. При ошибках — дописать `manual_overrides.csv` → rematch → rebuild map → reload nginx.

---

## 7. Батч-код (уже в коде)

- Страница: `/proverka-batch-coda` (инфо + бета-форма).
- API: `GET /api/batch-code/brands`, `POST /api/batch-code/check`, `POST /api/batch-code/submissions`.
- Таблица `batch_code_submissions` — миграция из п.2.
- Статус «проверено» ни у одного бренда нет (так и задумано).
- Письма поставщикам **не отправлять** без отдельного задания (черновики в `~/.cursor/plans/batch-code-deep-research-report.md` у владельца).

---

## 8. Что не делать / уже решено владельцем

- Ручной разбор ~130 medium/low URL **не трогать** (мало показов GSC; оставлены brand/товар как есть).
- Клиентов, заказы, карты лояльности со старого сайта **не** переносить.
- Старый чекер батч-кода **не** переносить.
- Не обещать «проверку подлинности» в текстах/рекламе.

---

## 9. Чеклист «готово»

- [ ] `migrate:status` — landings + batch_code_submissions = Ran  
- [ ] `storage:link` указывает в этот проект  
- [ ] `elparfume:match` отработал на продовом каталоге; overrides забэкаплены в `/root/`  
- [ ] 53 посадочных (или близко) в БД; API `GET /api/catalog/landings/{slug}` = 200  
- [ ] 7 статей с локальными картинками (если был `--images-from`)  
- [ ] отзывы импортированы; 1–3★ в pending  
- [ ] nginx map собран; `nginx -t` ок  
- [ ] (если DNS день) verify-redirects по GSC зелёный; certbot ок  
- [ ] `/proverka-batch-coda` открывается; check API отвечает  

---

## 10. Откат (если что-то пошло не так)

- **Импорт контента:** записи можно отключить в админке (`is_active`) или удалить точечно; повторный import-posts/reviews пропускает `exists`.
- **Посадочные:** `is_active=false` в админке «Посадочные каталога».
- **Редиректы el-parfume:** убрать/отключить server block el-parfume.by → трафик не пойдёт на map; DNS вернуть назад только владелец.
- **Миграции:** не откатывать без отдельного задания; таблицы новые, на ядро магазина не влияют.

При любом сомнении — остановиться и спросить владельца, не «чинить прод наугад».
