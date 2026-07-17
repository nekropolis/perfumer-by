#!/usr/bin/env bash
# Capistrano-style release for perfumer-by.
#
# Раскладка на сервере:
#   /var/www/perfumer-by/
#     ├── current -> releases/20260418-123000       (symlink)
#     ├── releases/
#     │     ├── 20260418-123000/                    (полный git checkout)
#     │     └── 20260418-100000/                    (предыдущий релиз)
#     └── shared/
#           ├── backend/.env
#           ├── backend/storage/
#           └── frontend/.env.local
#
# Каждый новый релиз:
#   1) клонирует репозиторий в releases/<timestamp>;
#   2) прокидывает симлинки в shared/;
#   3) ставит composer/npm зависимости, собирает next;
#   4) гоняет миграции;
#   5) атомарно переключает `current` на новый релиз;
#   6) pm2 reload + supervisor restart;
#   7) чистит старые релизы (храним KEEP_RELEASES штук).
#
# Откат: ./scripts/rollback.sh [<release-dir>]
#
# Запуск (с сервера):
#   cd /var/www/perfumer-by && ./scripts/release.sh
#   или   GIT_REF=v1.2.3 ./scripts/release.sh

set -Eeuo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/var/www/perfumer-by}"
REPO_URL="${REPO_URL:-}"
GIT_REF="${GIT_REF:-main}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

PHP_BIN="${PHP_BIN:-php}"
COMPOSER_BIN="${COMPOSER_BIN:-/usr/local/bin/composer}"
NPM_BIN="${NPM_BIN:-npm}"
PM2_BIN="${PM2_BIN:-pm2}"
COMPOSER_MEMORY_LIMIT="${COMPOSER_MEMORY_LIMIT:-512M}"

FRONT_PROD_NAME="${FRONT_PROD_NAME:-perfumer-frontend}"
QUEUE_GROUP="${QUEUE_GROUP:-perfumer-queue:*}"
PM2_MAX_MEMORY="${PM2_MAX_MEMORY:-700M}"

RELEASES_DIR="$PROJECT_ROOT/releases"
SHARED_DIR="$PROJECT_ROOT/shared"
CURRENT="$PROJECT_ROOT/current"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
NEW_RELEASE="$RELEASES_DIR/$TIMESTAMP"

MAINT_DIR=""
NGINX_MAINT=0
MAINT_FLAG="$SHARED_DIR/maintenance.on"
trap 'on_error $?' ERR

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }

sync_503_html() {
    local release_root="${1:-$NEW_RELEASE}"
    mkdir -p "$SHARED_DIR" 2>/dev/null || true
    local src=""
    if [[ -f "$release_root/frontend/public/503.html" ]]; then
        src="$release_root/frontend/public/503.html"
    elif [[ -f "$release_root/scripts/nginx/503.html" ]]; then
        src="$release_root/scripts/nginx/503.html"
    elif [[ -f "$PROJECT_ROOT/scripts/nginx/503.html" ]]; then
        src="$PROJECT_ROOT/scripts/nginx/503.html"
    fi
    if [[ -z "$src" ]]; then
        warn "503.html not found — nginx maintenance page may be missing"
        return 0
    fi
    if cp "$src" "$SHARED_DIR/503.html" 2>/dev/null; then
        log "Synced 503.html -> $SHARED_DIR/503.html"
    else
        warn "Cannot write $SHARED_DIR/503.html (permission denied). Fix once:"
        warn "  sudo chown -R deploy:deploy $SHARED_DIR && sudo chmod 775 $SHARED_DIR"
        warn "  sudo cp $src $SHARED_DIR/503.html && sudo chown deploy:deploy $SHARED_DIR/503.html"
    fi
}

enable_nginx_maintenance() {
    mkdir -p "$SHARED_DIR" 2>/dev/null || true
    if touch "$MAINT_FLAG" 2>/dev/null; then
        NGINX_MAINT=1
        log "nginx maintenance flag on: $MAINT_FLAG"
    else
        warn "Cannot create $MAINT_FLAG (permission denied) — release continues without nginx 503 flag"
        warn "  sudo chown -R deploy:deploy $SHARED_DIR && sudo chmod 775 $SHARED_DIR"
        NGINX_MAINT=0
    fi
}

disable_nginx_maintenance() {
    if [[ $NGINX_MAINT -eq 1 ]]; then
        rm -f "$MAINT_FLAG" 2>/dev/null || warn "Cannot remove $MAINT_FLAG — remove manually if present"
        NGINX_MAINT=0
        log "nginx maintenance flag off"
    fi
}

on_error() {
    local code="$1"
    warn "Release failed (exit $code). New release lives at: $NEW_RELEASE"
    warn "`current` not switched — старый релиз остаётся активным."
    if [[ -n "$MAINT_DIR" ]]; then
        warn "Снимаю maintenance с $MAINT_DIR"
        (cd "$MAINT_DIR/backend" && "$PHP_BIN" artisan up || true) || true
    fi
    if [[ $NGINX_MAINT -eq 1 ]]; then
        warn "Снимаю nginx maintenance flag"
        rm -f "$MAINT_FLAG" || true
        NGINX_MAINT=0
    fi
    exit "$code"
}

# --- auto-detect REPO_URL ---------------------------------------------------

if [[ -z "$REPO_URL" ]]; then
    if [[ -L "$CURRENT" && -d "$CURRENT/.git" ]]; then
        REPO_URL="$(git -C "$CURRENT" remote get-url origin)"
    elif [[ -d "$PROJECT_ROOT/.git" ]]; then
        REPO_URL="$(git -C "$PROJECT_ROOT" remote get-url origin)"
    fi
fi

if [[ -z "$REPO_URL" ]]; then
    warn "REPO_URL не задан и не удалось определить автоматически."
    warn "Запустите так:  REPO_URL=git@github.com:org/perfumer-by.git ./scripts/release.sh"
    exit 1
fi

# --- pre-flight -------------------------------------------------------------

if [[ ! -d "$SHARED_DIR/backend" ]]; then
    warn "Нет $SHARED_DIR — сначала запустите ./scripts/bootstrap-shared.sh"
    exit 1
fi
if [[ ! -f "$SHARED_DIR/backend/.env" ]]; then
    warn "Нет $SHARED_DIR/backend/.env — создайте прод-конфиг перед релизом."
    exit 1
fi

mkdir -p "$RELEASES_DIR"

log "Создаю релиз $TIMESTAMP"
log "  repo : $REPO_URL"
log "  ref  : $GIT_REF"
log "  path : $NEW_RELEASE"

# --- checkout ---------------------------------------------------------------

log "git clone (depth=1, ref=$GIT_REF)"
git clone --depth 1 --branch "$GIT_REF" "$REPO_URL" "$NEW_RELEASE"

# --- symlinks to shared/ ----------------------------------------------------

log "Прокидываю симлинки из shared/"
ln -snf "$SHARED_DIR/backend/.env" "$NEW_RELEASE/backend/.env"
rm -rf "$NEW_RELEASE/backend/storage"
ln -snf "$SHARED_DIR/backend/storage" "$NEW_RELEASE/backend/storage"
ln -snf "$SHARED_DIR/frontend/.env.local" "$NEW_RELEASE/frontend/.env.local"

# --- backend build ----------------------------------------------------------

log "composer install --no-dev --optimize-autoloader"
export COMPOSER_ALLOW_SUPERUSER=1
(cd "$NEW_RELEASE/backend" && "$PHP_BIN" -d memory_limit="$COMPOSER_MEMORY_LIMIT" \
    "$COMPOSER_BIN" install --no-dev --optimize-autoloader --no-interaction --prefer-dist)

# storage:link нужен всего один раз, но для свежего релиза безопасно повторить
(cd "$NEW_RELEASE/backend" && "$PHP_BIN" artisan storage:link || true)

# --- maintenance on current + migrate ---------------------------------------

if [[ -L "$CURRENT" ]]; then
    log "artisan down (on current)"
    MAINT_DIR="$CURRENT"
    (cd "$CURRENT/backend" && "$PHP_BIN" artisan down --render="errors::503" --retry=15 || true)
fi

log "artisan migrate --force (from new release)"
(cd "$NEW_RELEASE/backend" && "$PHP_BIN" artisan migrate --force)

log "Пересобираю кэши Laravel"
(cd "$NEW_RELEASE/backend" && "$PHP_BIN" artisan optimize:clear)
(cd "$NEW_RELEASE/backend" && "$PHP_BIN" artisan config:cache)
(cd "$NEW_RELEASE/backend" && "$PHP_BIN" artisan route:cache)
(cd "$NEW_RELEASE/backend" && "$PHP_BIN" artisan view:cache || true)

# --- frontend build ---------------------------------------------------------

log "npm ci (frontend)"
(cd "$NEW_RELEASE/frontend" && "$NPM_BIN" ci --no-audit --no-fund)

log "next build"
(cd "$NEW_RELEASE/frontend" && rm -rf .next && "$NPM_BIN" run build)

sync_503_html "$NEW_RELEASE"

# --- atomic switch ----------------------------------------------------------

PREV_TARGET=""
if [[ -L "$CURRENT" ]]; then
    PREV_TARGET="$(readlink "$CURRENT")"
fi

enable_nginx_maintenance

log "Переключаю symlink: current -> $NEW_RELEASE"
ln -snfT "$NEW_RELEASE" "$CURRENT"

# --- pm2 + supervisor -------------------------------------------------------

log "Reload pm2 ($FRONT_PROD_NAME)"
if "$PM2_BIN" describe "$FRONT_PROD_NAME" >/dev/null 2>&1; then
    "$PM2_BIN" reload "$FRONT_PROD_NAME" --update-env
else
    "$PM2_BIN" start "$CURRENT/frontend/ecosystem.config.cjs" --only "$FRONT_PROD_NAME"
    "$PM2_BIN" restart "$FRONT_PROD_NAME" --max-memory-restart "$PM2_MAX_MEMORY"
fi
"$PM2_BIN" save >/dev/null || true

sleep 2
disable_nginx_maintenance

if command -v supervisorctl >/dev/null 2>&1; then
    log "supervisorctl restart $QUEUE_GROUP"
    sudo supervisorctl restart "$QUEUE_GROUP" || warn "supervisorctl restart не удался"
else
    warn "supervisorctl не найден — пропускаю рестарт воркера"
fi

log "artisan up"
(cd "$CURRENT/backend" && "$PHP_BIN" artisan up)
MAINT_DIR=""

# --- prune old releases -----------------------------------------------------

log "Оставляю $KEEP_RELEASES последних релизов"
CURRENT_TARGET_BASE="$(basename "$(readlink "$CURRENT")")"
(
    cd "$RELEASES_DIR"
    # Сортировка по имени директории (у нас это timestamp — лексикографически = хронологически).
    # Берём всё старше KEEP_RELEASES и удаляем, КРОМЕ текущего релиза (на всякий случай).
    ls -1d */ 2>/dev/null | sed 's:/$::' | sort | while IFS= read -r rel; do
        echo "$rel"
    done | tac | awk "NR>$KEEP_RELEASES" | while IFS= read -r old; do
        if [[ "$old" != "$CURRENT_TARGET_BASE" ]]; then
            echo "  - удаляю $old"
            rm -rf -- "$old"
        fi
    done
) || warn "Не смог почистить старые релизы — проверьте вручную"

# --- summary ----------------------------------------------------------------

log "Готово."
echo "Active release : $TIMESTAMP"
echo "Previous       : ${PREV_TARGET:-<none>}"
"$PM2_BIN" list || true
