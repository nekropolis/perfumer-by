# Project Commands

Краткий справочник по командам проекта: что делают, где запускать и когда они нужны.

## Root Makefile

Запускать из корня репозитория.

| Command | What it does | When to run |
| --- | --- | --- |
| `make help` | Shows available Make targets. | When you need a quick list of project-level commands. |
| `make install-front` | Runs `npm install` in `frontend/`. | After pulling frontend dependency changes or setting up the project. |
| `make install-back` | Runs `composer install` in `backend/`. | After pulling backend dependency changes or setting up the project. |
| `make build` | Removes `frontend/.next` and runs frontend production build. | Before checking whether the frontend builds cleanly. |
| `make dev-check-api` | Checks that frontend API env points to a reachable API. | Before `make dev`, or when SSR pages hang while fetching API data. |
| `make dev` | Starts frontend dev mode through PM2 when available, otherwise directly. | Local/dev-server frontend development. |
| `make dev-restart` | Stops and starts frontend dev process. | After env changes or when dev server is stuck. |
| `make dev-stop` | Stops frontend dev process and frees port `3000`. | When stopping local/dev frontend. |
| `make prod` | Installs frontend deps, builds frontend, starts prod PM2 process. | Simple production frontend start/restart without full deploy script. |
| `make prod-restart` | Restarts prod frontend PM2 process. | After env/process changes that do not require rebuild. |
| `make prod-stop` | Stops prod frontend PM2 process. | Maintenance or replacing frontend process. |
| `make logs` | Shows prod frontend PM2 logs. | Debugging production frontend runtime. |
| `make logs-dev` | Shows dev frontend PM2 logs. | Debugging frontend dev server. |
| `make status` | Runs `pm2 list`. | Checking running frontend processes. |
| `make backend-clear` | Runs `php artisan optimize:clear`. | After backend env/config/route/view changes, or when cache looks stale. |
| `make backend-migrate` | Runs migrations and then clears Laravel cache. | After pulling backend migrations on dev/staging. |
| `make backend-seed` | Runs `CatalogDatabaseSeeder`. | When resetting or filling catalog seed data. |
| `make deploy` | Runs `scripts/deploy.sh`. | In-place production deploy. |
| `make release` | Runs `scripts/release.sh`. | Capistrano-style production release. |
| `make rollback` | Runs `scripts/rollback.sh`. | Roll back `current` symlink to previous release. |
| `make bootstrap-shared` | Runs `scripts/bootstrap-shared.sh`. | One-time migration from in-place deploy to `shared/` + `releases/` layout. |

## Backend Composer

Run from `backend/`.

| Command | What it does | When to run |
| --- | --- | --- |
| `composer install` | Installs exact dependencies from `composer.lock`. | Normal setup/deploy after lock file is committed. |
| `composer install --no-dev --optimize-autoloader` | Installs production dependencies and optimized autoload. | Production deploy. |
| `composer update vendor/package -W` | Updates one package and related dependencies in `composer.lock`. | When adding/updating a backend package, for example `composer update intervention/image -W`. |
| `composer dump-autoload` | Rebuilds Composer autoload files. | After adding/moving classes or module autoload mappings without changing dependencies. |
| `composer run dev` | Runs Laravel server, queue listener, logs, and Vite concurrently. | Full backend-oriented local development, if frontend is served by backend Vite flow. |
| `composer run test` | Clears config and runs Laravel tests. | Before backend commits or after backend changes. |
| `composer run setup` | Installs deps, creates `.env`, generates key, migrates, installs npm deps, builds. | Fresh backend skeleton setup; use carefully on existing environments. |

## Backend NPM

Run from `backend/`. These are Laravel Vite/module asset commands, not the Next.js storefront commands.

| Command | What it does | When to run |
| --- | --- | --- |
| `npm run dev` | Starts Vite dev server for backend/module assets. | Only when working with backend-rendered Vite assets. |
| `npm run build` | Builds backend/module Vite assets. | Before deploy if backend-rendered assets changed. |

The module package files under `backend/Modules/*/package.json` expose the same `npm run dev` and `npm run build` Vite scripts. Use them only when intentionally working inside a specific Laravel module asset pipeline.

## Frontend Next.js

Run from `frontend/`.

| Command | What it does | When to run |
| --- | --- | --- |
| `npm install` | Installs frontend dependencies. | Local setup or after `package.json`/lock changes. |
| `npm ci` | Clean install from lock file. | CI/production deploy, or when `node_modules` is corrupted. |
| `npm run dev` | Starts Next.js dev server on port `3000` with webpack. | Storefront/admin frontend development. |
| `npm run build` | Builds the Next.js production bundle. | Before deploy or before merging frontend changes. |
| `npm run start` | Starts the built Next.js app. | Production runtime after `npm run build`. |
| `npm run lint` | Runs ESLint. | Before committing frontend changes. |

## Deploy Scripts

Run from the server unless noted otherwise.

| Command | What it does | When to run |
| --- | --- | --- |
| `./scripts/deploy-dev.sh` | Dev-server deploy: Composer install with dev deps, clear caches, migrate, optional frontend install/build/reload. | On dev server after files are synced by SFTP. |
| `./scripts/deploy-dev.sh --seed` | Same as dev deploy plus `php artisan db:seed --force`. | When dev data needs to be reseeded. |
| `./scripts/deploy-dev.sh --build` | Dev deploy plus frontend production build. | When you need to verify/build frontend on dev server. |
| `./scripts/deploy-dev.sh --no-build` | Explicitly skips frontend build. | Default lightweight dev deploy. |
| `./scripts/deploy-dev.sh --only-backend` | Runs backend part only. | Backend-only change. |
| `./scripts/deploy-dev.sh --only-frontend` | Runs frontend part only. | Frontend-only change. |
| `./scripts/deploy-dev.sh --logs` | Tails logs after dev deploy. | Debugging immediately after deploy. |
| `./scripts/deploy-dev.sh --npm-ci` | Uses `npm ci` instead of `npm install`. | When frontend dependencies need a clean reinstall. |
| `./scripts/deploy.sh` | In-place production deploy: `git pull`, maintenance mode, Composer install, migrate, cache, frontend build, PM2 reload, queue restart. | Production deploy for in-place checkout. |
| `./scripts/release.sh` | Capistrano-style release into `releases/<timestamp>`, switches `current` symlink atomically. | Preferred production deploy when server uses `current/`, `releases/`, `shared/`. |
| `GIT_REF=v1.2.3 ./scripts/release.sh` | Releases a specific branch/tag/ref. | Deploying a tagged release or non-default branch. |
| `./scripts/rollback.sh` | Switches `current` to previous release and reloads services. | Fast rollback after a bad release. |
| `./scripts/rollback.sh 20260418-100000` | Switches to a specific release directory. | Rollback to a known good release. |
| `./scripts/bootstrap-shared.sh /var/www/perfumer-by` | Creates `shared/` from an existing in-place checkout. | One-time server migration to release-based deploy. |

## Common Laravel Artisan

Run from `backend/`.

| Command | What it does | When to run |
| --- | --- | --- |
| `php artisan serve` | Starts Laravel dev HTTP server. | Local API development. |
| `php artisan migrate` | Runs pending migrations. | Local/dev after pulling schema changes. |
| `php artisan migrate --force` | Runs migrations without interactive prompt. | Deploy scripts and production. |
| `php artisan optimize:clear` | Clears config, route, view, event and app caches. | After env/config/routes/views change or deploy troubleshooting. |
| `php artisan config:cache` | Builds config cache. | Production deploy after env is stable. |
| `php artisan route:cache` | Builds route cache. | Production deploy. |
| `php artisan view:cache` | Precompiles Blade views. | Production deploy; safe to skip if it fails in scripts. |
| `php artisan queue:listen --tries=1 --timeout=0` | Runs a local queue listener. | Local development where jobs should execute immediately. |
| `php artisan queue:restart` | Signals queue workers to restart after current job. | After backend deploy when workers run under Supervisor. |
| `php artisan pail --timeout=0` | Streams Laravel logs. | Local/dev debugging. |
| `php artisan test` | Runs backend tests. | Before backend commits/deploys. |
| `php artisan down --render=\"errors::503\" --retry=15` | Enables maintenance mode. | Production deploy or manual maintenance. |
| `php artisan up` | Disables maintenance mode. | After deploy/maintenance, or if deploy failed while app is down. |
| `php artisan storage:link` | Creates public storage symlink. | First deploy/setup or after public storage link was removed. |

## Catalog Commands

Run from `backend/`.

| Command | What it does | When to run |
| --- | --- | --- |
| `php artisan catalog:regenerate-product-image-variants` | Generates `full`, `card`, `listing`, `thumb` WebP variants for product images missing variant paths. | After deploying image variants migration, or after importing legacy images. |
| `php artisan catalog:regenerate-product-image-variants --product-id=123` | Regenerates variants for one product. | Testing/fixing a specific product. |
| `php artisan catalog:regenerate-product-image-variants --limit=100` | Processes only first N matching images. | Safe batch processing on production. |
| `php artisan catalog:regenerate-product-image-variants --force` | Regenerates even existing variants and deletes old variant files. | Only when image sizes/quality rules changed or variants are corrupted. |
| `php artisan catalog:search:reindex` | Rebuilds full product index in Meilisearch. | After search mapping/indexing changes or large catalog imports. |
| `php artisan catalog:search:reindex --chunk=500` | Reindexes with custom batch size. | Tune for server resources; allowed range is clamped in command. |
| `php artisan catalog:prune-brands-without-products` | Shows brands without products and asks whether to delete them. | Catalog cleanup after imports. |
| `php artisan catalog:import-vanille-sample path/to/file.json` | Imports parsed Vanille sample JSON. | Testing Vanille import logic on a fixture/sample file. |
| `php artisan catalog:parse-vanille-products` | Parses Vanille product pages from existing `product_links.json`. | Running product page parsing manually. |
| `php artisan catalog:parse-vanille-products --once --limit=20` | Runs one parsing batch. | Debugging parser or running controlled batches. |
| `php artisan catalog:parse-vanille-products --mode=new_only` | Parses only new products mode. | Incremental Vanille parsing. |
| `php artisan catalog:parse-vanille-products --links-path=/path/file.json` | Uses a custom links file. | Testing or running from an alternate input. |
| `php artisan catalog:vanille-queue status` | Shows queue/job status for Vanille import. | Diagnosing stuck Vanille import jobs. |
| `php artisan catalog:vanille-queue run-pending` | Runs pending Vanille import jobs manually. | When queue workers are unavailable or you need a sync run. |
| `php artisan catalog:vanille-queue resume --job-id=123` | Resumes a specific Vanille job. | Recovering a failed/stuck import job. |

## Legacy Import Commands

Run from `backend/`. These commands are for one-time or occasional legacy migration work. Prefer `--dry-run` first when available.

| Command | What it does | When to run |
| --- | --- | --- |
| `php artisan legacy:map-brands-by-slug --dry-run` | Matches legacy manufacturers to current brands by slug without writing. | Before writing legacy brand map. |
| `php artisan legacy:map-brands-by-slug --truncate` | Rebuilds `legacy_map_brands`. | During legacy migration after validating dry run. |
| `php artisan legacy:map-products-by-slug --dry-run` | Matches legacy products to current products by slug without writing. | Before importing product-related legacy data. |
| `php artisan legacy:map-products-by-slug --truncate` | Rebuilds `legacy_map_products`. | During legacy migration after validating matches. |
| `php artisan legacy:map-products-by-slug --sync-fields` | Syncs description/meta fields into matched products. | Only when intentionally copying legacy SEO/content fields. |
| `php artisan legacy:map-products-by-slug --export-unmatched=storage/app/unmatched.csv` | Exports unmatched legacy products. | Auditing migration gaps. |
| `php artisan legacy:import-customers --dry-run` | Parses legacy customers without writing users/maps. | Before customer migration. |
| `php artisan legacy:import-customers --truncate-map` | Imports customers and resets legacy customer map. | Re-running customer migration from scratch. |
| `php artisan legacy:import-orders --dry-run` | Parses legacy orders without writing. | Before order migration. |
| `php artisan legacy:import-orders --truncate-map` | Imports orders and resets legacy order map. | Re-running order migration from scratch. |
| `php artisan legacy:import-reviews --dry-run` | Parses legacy reviews without writing. | Before review migration. |
| `php artisan legacy:import-reviews --truncate-map` | Imports reviews and resets legacy review map. | Re-running review migration from scratch. |
| `php artisan legacy:import-product-images --dry-run` | Parses/imports legacy product image data without DB writes. | Before image migration. |
| `php artisan legacy:import-product-images --repair-existing` | Normalizes already imported legacy paths. | Fixing old `product_images` paths after migration. |
| `php artisan legacy:import-product-images --debug-missing` | Prints missing source path samples/candidates. | Debugging missing legacy image files. |
| `php artisan legacy:import-posts` | Imports legacy news/articles into `cms_posts`. | One-time pages/posts migration. |
| `php artisan legacy:import-posts --truncate` | Clears `cms_posts` before import. | Re-running post migration from scratch. |
| `php artisan legacy:import-posts --report-skips` | Prints skipped rows and reasons. | Debugging post import coverage. |
| `php artisan legacy:normalize-user-phones --dry-run` | Shows phone normalization changes for users. | Before normalizing imported user phones. |
| `php artisan legacy:normalize-user-phones` | Normalizes `users.phone` to digits only. | After import, once conflicts are reviewed. |
| `php artisan legacy:normalize-order-phones --dry-run` | Shows phone normalization changes for orders. | Before normalizing imported order phones. |
| `php artisan legacy:normalize-order-phones` | Normalizes `orders.phone` to digits only. | After import, once output is checked. |

Most legacy commands accept `--dump=storage/app/public/perfumer_db.sql` to override the default SQL dump path.

## Users And Settlements

Run from `backend/`.

| Command | What it does | When to run |
| --- | --- | --- |
| `php artisan users:migrate-name-to-first-name --dry-run` | Shows users where `name` would be copied to empty `first_name`. | Before user name migration. |
| `php artisan users:migrate-name-to-first-name` | Copies `users.name` into empty `users.first_name`. | One-time data migration after reviewing dry run. |
| `php artisan settlements:import-belarus` | Imports Belarus settlements from `storage/app/public/imports/belarus-settlements.json`. | After updating settlements source JSON. |

## Recommended Flows

### Local frontend change

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run build
```

### Local backend change

```bash
cd backend
composer install
php artisan migrate
php artisan optimize:clear
php artisan test
```

### After image variant deploy

```bash
cd backend
composer install
php artisan migrate
php artisan catalog:regenerate-product-image-variants --limit=100
php artisan catalog:regenerate-product-image-variants
```

### Production in-place deploy

```bash
cd /var/www/perfumer-by
./scripts/deploy.sh
```

### Production release deploy

```bash
cd /var/www/perfumer-by
./scripts/release.sh
```

