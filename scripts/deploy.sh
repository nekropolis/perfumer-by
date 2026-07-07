#!/usr/bin/env bash
# Production deploy script for perfumer-by.
# Run on server:  cd /var/www/perfumer-by && ./scripts/deploy.sh
# See PRODUCTION.md for the full setup story.
#
# Order matters:
#   1. Build frontend while the current backend is still live (Next.js SSR
#      needs reachable API during prerender).
#   2. Only then put Laravel into maintenance mode, run migrations and caches.
#   3. Reload services and bring the site back up.

set -Eeuo pipefail

ROOT="${PROJECT_ROOT:-/var/www/perfumer-by}"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

PHP_BIN="${PHP_BIN:-php}"
COMPOSER_BIN="${COMPOSER_BIN:-/usr/local/bin/composer}"
NPM_BIN="${NPM_BIN:-npm}"
PM2_BIN="${PM2_BIN:-pm2}"

FRONT_PROD_NAME="${FRONT_PROD_NAME:-perfumer-frontend}"
QUEUE_GROUP="${QUEUE_GROUP:-perfumer-queue:*}"root
COMPOSER_MEMORY_LIMIT="${COMPOSER_MEMORY_LIMIT:-512M}"

MAINT_DOWN=0
trap 'on_error $?' ERR

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }

on_error() {
    local code="$1"
    if [[ $MAINT_DOWN -eq 1 ]]; then
        warn "Deploy failed (exit $code). Backend will stay in maintenance mode."
        warn "Fix the issue and either re-run ./scripts/deploy.sh or 'php artisan up' manually."
    else
        warn "Deploy failed (exit $code). Backend was NOT put into maintenance mode."
    fi
    exit "$code"
}

require_dir() {
    if [[ ! -d "$1" ]]; then
        warn "Expected directory not found: $1"
        exit 1
    fi
}

require_service() {
    local name="$1"
    local unit="${2:-$name}"
    if systemctl is-active --quiet "$unit" 2>/dev/null; then
        return 0
    fi
    warn "$unit is not running — attempting to start it"
    if command -v sudo >/dev/null 2>&1; then
        sudo systemctl start "$unit" || warn "Failed to start $unit"
    else
        systemctl start "$unit" || warn "Failed to start $unit"
    fi
    systemctl is-active --quiet "$unit" 2>/dev/null || warn "$unit is still not running — next build may fail"
}

require_dir "$BACKEND"
require_dir "$FRONTEND"

log "Project root: $ROOT"
cd "$ROOT"

log "git pull --ff-only"
git pull --ff-only

# If deploy.sh itself was updated, restart with the new version.
# Otherwise bash keeps executing the old copy that is already loaded in memory.
if [[ -n "$(git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -Fx "scripts/deploy.sh")" ]]; then
    log "deploy.sh was updated — restarting with the new version"
    exec "$0" "$@"
fi

log "composer install --no-dev --optimize-autoloader"
export COMPOSER_ALLOW_SUPERUSER=1
(cd "$BACKEND" && "$PHP_BIN" -d memory_limit="$COMPOSER_MEMORY_LIMIT" "$COMPOSER_BIN" install \
    --no-dev --optimize-autoloader --no-interaction --prefer-dist)

log "Ensuring web services are running before frontend build"
require_service "nginx"
require_service "php8.3-fpm" "php8.3-fpm"

log "npm ci (frontend)"
(cd "$FRONTEND" && "$NPM_BIN" ci --no-audit --no-fund)

log "next build"
(cd "$FRONTEND" && rm -rf .next && "$NPM_BIN" run build)

# ---------------------------------------------------------------------------
# From here on the site goes down briefly for backend-only updates.
# ---------------------------------------------------------------------------

log "Switching Laravel into maintenance mode"
(cd "$BACKEND" && "$PHP_BIN" artisan down --render="errors::503" --retry=15 || true)
MAINT_DOWN=1

log "artisan migrate --force"
(cd "$BACKEND" && "$PHP_BIN" artisan migrate --force)

log "Rebuilding Laravel caches"
(cd "$BACKEND" && "$PHP_BIN" artisan optimize:clear)
(cd "$BACKEND" && "$PHP_BIN" artisan config:cache)
(cd "$BACKEND" && "$PHP_BIN" artisan route:cache)
(cd "$BACKEND" && "$PHP_BIN" artisan view:cache || true)

log "Reloading PM2 process: $FRONT_PROD_NAME"
if "$PM2_BIN" describe "$FRONT_PROD_NAME" >/dev/null 2>&1; then
    "$PM2_BIN" reload "$FRONT_PROD_NAME" --update-env
else
    (cd "$FRONTEND" && "$PM2_BIN" start npm --name "$FRONT_PROD_NAME" -- run start)
    "$PM2_BIN" restart "$FRONT_PROD_NAME" --max-memory-restart 700M
fi
"$PM2_BIN" save >/dev/null || true

log "Restarting queue workers: $QUEUE_GROUP"
if command -v supervisorctl >/dev/null 2>&1; then
    sudo supervisorctl restart "$QUEUE_GROUP" || warn "supervisorctl restart failed — check manually"
else
    warn "supervisorctl not found — skipping queue worker restart"
fi

log "Leaving maintenance mode"
(cd "$BACKEND" && "$PHP_BIN" artisan up)
MAINT_DOWN=0

log "Done. Current state:"
"$PM2_BIN" list || true
(cd "$BACKEND" && "$PHP_BIN" artisan --version)
