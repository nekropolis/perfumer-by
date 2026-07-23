#!/usr/bin/env bash
# Production deploy script for perfumer-by.
# Run on server:  cd /var/www/perfumer-by && ./scripts/deploy.sh
# Staging:        FRONT_PROD_NAME=frontend-staging ./scripts/deploy.sh
# See PRODUCTION.md for the full setup story.
#
# Order matters:
#   1. Build frontend while the current backend is still live (Next.js SSR
#      needs reachable API during prerender).
#   2. Only then put Laravel into maintenance mode, run migrations and caches.
#   3. Reload services, artisan up, wait until Next answers, then drop nginx 503.

set -Eeuo pipefail

ROOT="${PROJECT_ROOT:-/var/www/perfumer-by}"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

PHP_BIN="${PHP_BIN:-php}"
COMPOSER_BIN="${COMPOSER_BIN:-/usr/local/bin/composer}"
NPM_BIN="${NPM_BIN:-npm}"
PM2_BIN="${PM2_BIN:-pm2}"

FRONT_PROD_NAME="${FRONT_PROD_NAME:-perfumer-frontend}"
QUEUE_GROUP="${QUEUE_GROUP:-perfumer-queue:*}"
COMPOSER_MEMORY_LIMIT="${COMPOSER_MEMORY_LIMIT:-512M}"

SHARED_DIR="${SHARED_DIR:-$ROOT/shared}"
MAINT_FLAG="$SHARED_DIR/maintenance.on"
NGINX_MAINT=0

SUPERVISORCTL=""
if command -v supervisorctl >/dev/null 2>&1; then
    SUPERVISORCTL="$(command -v supervisorctl)"
elif [[ -x /usr/bin/supervisorctl ]]; then
    SUPERVISORCTL="/usr/bin/supervisorctl"
fi

MAINT_DOWN=0
DEPLOY_ERROR_LOCK="${TMPDIR:-/tmp}/perfumer-deploy-error-$$"
trap 'on_error $?' ERR

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }

sync_503_html() {
    mkdir -p "$SHARED_DIR" 2>/dev/null || true
    local src=""
    if [[ -f "$FRONTEND/public/503.html" ]]; then
        src="$FRONTEND/public/503.html"
    elif [[ -f "$ROOT/scripts/nginx/503.html" ]]; then
        src="$ROOT/scripts/nginx/503.html"
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
        warn "Cannot create $MAINT_FLAG (permission denied) — deploy continues without nginx 503 flag"
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

# Probe Next directly (bypass nginx) so we drop maintenance.on only when
# upstream is up — otherwise visitors get 502 instead of branded 503.
wait_for_frontend() {
    local url="${STOREFRONT_HEALTH_URL:-http://127.0.0.1:3000/}"
    local attempts="${1:-30}"
    local i=1
    local code="000"

    log "Waiting for Next.js ($url, up to ${attempts}s)"
    while (( i <= attempts )); do
        code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || echo "000")"
        if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
            log "Next.js ready (HTTP $code)"
            return 0
        fi
        sleep 1
        i=$((i + 1))
    done
    warn "Next.js not ready after ${attempts}s (last HTTP ${code}) — dropping nginx flag anyway"
}

load_env() {
    local key="$1"
    local default="${2:-}"
    if [[ -f "$BACKEND/.env" ]]; then
        grep -E "^${key}=" "$BACKEND/.env" 2>/dev/null | tail -n 1 | sed "s/^${key}=//" | tr -d "'\"" || printf '%s' "$default"
    else
        printf '%s' "$default"
    fi
}

send_telegram() {
    local text="$1"
    local enabled token chat_id
    enabled="$(load_env TELEGRAM_NOTIFICATIONS_ENABLED true)"
    token="$(load_env TELEGRAM_BOT_TOKEN '')"
    chat_id="$(load_env TELEGRAM_CHAT_ID '')"

    if [[ "$enabled" != "true" ]] || [[ -z "$token" ]] || [[ -z "$chat_id" ]]; then
        return 0
    fi

    local payload
    payload=$(printf '{"chat_id":"%s","text":"%s","disable_web_page_preview":true}' "$chat_id" "$text")
    curl -fsSL -X POST "https://api.telegram.org/bot${token}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "$payload" >/dev/null 2>&1 || warn "Failed to send Telegram alert"
}

on_error() {
    local code="$1"

    # set -E inherits ERR trap into subshells; failed `(cd … && cmd)` can fire twice.
    if [[ -f "$DEPLOY_ERROR_LOCK" ]]; then
        exit "$code"
    fi
    : > "$DEPLOY_ERROR_LOCK"

    if [[ $MAINT_DOWN -eq 1 ]]; then
        warn "Deploy failed (exit $code). Backend will stay in maintenance mode."
        warn "Fix the issue and either re-run ./scripts/deploy.sh or 'php artisan up' manually."
        send_telegram "🚨 *Deploy failed* on $(hostname) at $(date +'%Y-%m-%d %H:%M')\n\nExit code: ${code}\nBackend is in maintenance mode."
    else
        warn "Deploy failed (exit $code). Backend was NOT put into maintenance mode."
        send_telegram "🚨 *Deploy failed* on $(hostname) at $(date +'%Y-%m-%d %H:%M')\n\nExit code: ${code}\nBackend is NOT in maintenance mode."
    fi
    if [[ $NGINX_MAINT -eq 1 ]]; then
        warn "Снимаю nginx maintenance flag"
        rm -f "$MAINT_FLAG" || true
        NGINX_MAINT=0
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

ensure_meilisearch() {
    local enabled
    enabled="$(load_env CATALOG_SEARCH_ENABLED false)"
    if [[ "$enabled" != "true" ]]; then
        log "Meilisearch is disabled in .env (CATALOG_SEARCH_ENABLED != true) — skipping"
        return 0
    fi

    local unit_path="/etc/systemd/system/meilisearch.service"
    local source_unit="$ROOT/scripts/systemd/meilisearch.service"

    if [[ ! -f "$unit_path" ]] && [[ -f "$source_unit" ]]; then
        log "Installing meilisearch systemd unit"
        if command -v sudo >/dev/null 2>&1; then
            sudo cp "$source_unit" "$unit_path" || warn "Failed to copy meilisearch unit"
            sudo systemctl daemon-reload || warn "Failed to daemon-reload"
            sudo systemctl enable meilisearch || warn "Failed to enable meilisearch"
        else
            cp "$source_unit" "$unit_path" || warn "Failed to copy meilisearch unit"
            systemctl daemon-reload || warn "Failed to daemon-reload"
            systemctl enable meilisearch || warn "Failed to enable meilisearch"
        fi
    fi

    if [[ -f "$unit_path" ]]; then
        require_service "meilisearch"
    else
        warn "meilisearch.service not found — skipping"
    fi
}

require_dir "$BACKEND"
require_dir "$FRONTEND"

log "Project root: $ROOT"
cd "$ROOT"

log "git pull --ff-only"
DEPLOY_HASH_BEFORE=$(md5sum "$0" | awk '{print $1}')
git pull --ff-only
DEPLOY_HASH_AFTER=$(md5sum "$0" | awk '{print $1}')

# If deploy.sh itself was updated, restart with the new version.
# Otherwise bash keeps executing the old copy that is already loaded in memory.
if [[ "$DEPLOY_HASH_BEFORE" != "$DEPLOY_HASH_AFTER" ]]; then
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
ensure_meilisearch

# In-place deploy deletes .next while the live process still serves from it —
# put nginx on 503 first so visitors see branded maintenance, not a blank error.
sync_503_html
enable_nginx_maintenance

log "npm ci (frontend)"
(cd "$FRONTEND" && "$NPM_BIN" ci --no-audit --no-fund)

log "next build"
(cd "$FRONTEND" && rm -rf .next && "$NPM_BIN" run build)

# ---------------------------------------------------------------------------
# Backend updates while storefront stays on nginx 503.
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
    (cd "$FRONTEND" && "$PM2_BIN" start ecosystem.config.cjs --only "$FRONT_PROD_NAME")
    "$PM2_BIN" restart "$FRONT_PROD_NAME" --max-memory-restart 700M
fi
"$PM2_BIN" save >/dev/null || true

log "Restarting queue workers: $QUEUE_GROUP"
if [[ -n "$SUPERVISORCTL" ]]; then
    sudo "$SUPERVISORCTL" reread || warn "supervisorctl reread failed"
    sudo "$SUPERVISORCTL" update || warn "supervisorctl update failed"

    # Мягкий перезапуск через queue:restart — worker завершит текущий job и выйдет,
    # supervisor с autorestart=true поднимет его заново с новым кодом.
    (cd "$BACKEND" && "$PHP_BIN" artisan queue:restart) || warn "queue:restart failed"
    sleep 5

    # Если worker не RUNNING после queue:restart — стартуем вручную
    if ! sudo "$SUPERVISORCTL" status "$QUEUE_GROUP" 2>/dev/null | grep -q RUNNING; then
        sudo "$SUPERVISORCTL" start "$QUEUE_GROUP" || warn "supervisorctl start failed — check manually"
    fi
    sleep 2
    sudo "$SUPERVISORCTL" status "$QUEUE_GROUP" || true
else
    warn "supervisorctl not found — skipping queue worker restart"
fi

log "Leaving maintenance mode"
(cd "$BACKEND" && "$PHP_BIN" artisan up)
MAINT_DOWN=0

# Keep nginx 503 until API is up and Next answers — avoids 502 after flag drop.
wait_for_frontend
disable_nginx_maintenance

log "Warming catalog cache"
(cd "$BACKEND" && "$PHP_BIN" artisan catalog:warm-cache) || warn "catalog:warm-cache failed — site is up, warm manually"

log "Done. Current state:"
"$PM2_BIN" list || true
(cd "$BACKEND" && "$PHP_BIN" artisan --version)
