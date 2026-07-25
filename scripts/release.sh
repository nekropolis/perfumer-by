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
# Staging: FRONT_PROD_NAME=frontend-staging ./scripts/release.sh

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

RELEASES_DIR="$PROJECT_ROOT/releases"
SHARED_DIR="$PROJECT_ROOT/shared"
CURRENT="$PROJECT_ROOT/current"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
NEW_RELEASE="$RELEASES_DIR/$TIMESTAMP"
DEPLOY_STARTED_AT="$(date +%s)"
BUILD_STARTED_AT=0
BUILD_FINISHED_AT=0
RELEASE_SHA=""

MAINT_DIR=""
NGINX_MAINT=0
MAINT_FLAG="$SHARED_DIR/maintenance.on"
SWITCHED=0
PREV_TARGET=""
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

# Probe Next directly (bypass nginx) so we drop maintenance.on only when
# upstream is up — otherwise visitors get 502 instead of branded 503.
probe_next_url() {
    local url="$1"
    local code
    # New TCP connection each time — avoid keepalive hitting one healthy worker only.
    code="$(curl -sS --http1.1 -H 'Connection: close' -o /dev/null -w '%{http_code}' \
        --max-time 3 "$url" 2>/dev/null || echo "000")"
    [[ "$code" =~ ^(200|301|302|307|308)$ ]]
}

wait_for_frontend() {
    local url="${STOREFRONT_HEALTH_URL:-http://127.0.0.1:3000/}"
    local attempts="${1:-30}"
    local i=1

    log "Waiting for Next.js ($url, up to ${attempts}s)"
    while (( i <= attempts )); do
        if probe_next_url "$url"; then
            log "Next.js ready"
            return 0
        fi
        sleep 1
        i=$((i + 1))
    done
    warn "Next.js not ready after ${attempts}s"
    return 1
}

# After PM2 cluster reload one worker can answer while another is still starting.
# Require several consecutive OK probes on / and /admin/orders before dropping 503.
wait_for_frontend_stable() {
    local attempts="${1:-45}"
    local need="${FRONTEND_STABLE_SUCCESSES:-5}"
    local base="${STOREFRONT_HEALTH_URL:-http://127.0.0.1:3000}"
    base="${base%/}"
    local home_url="$base/"
    local admin_url="$base/admin/orders"
    local ok=0
    local i=1

    log "Waiting for Next.js stable ($home_url + $admin_url, ${need} consecutive OK, up to ${attempts}s)"
    while (( i <= attempts )); do
        if probe_next_url "$home_url" && probe_next_url "$admin_url"; then
            ok=$((ok + 1))
            if (( ok >= need )); then
                log "Next.js stable (${ok} consecutive OK)"
                return 0
            fi
        else
            ok=0
        fi
        sleep 1
        i=$((i + 1))
    done
    warn "Next.js not stable after ${attempts}s (consecutive OK=${ok}/${need})"
    return 1
}

pm2_online_count() {
    FRONT_PROD_NAME="$FRONT_PROD_NAME" "$PM2_BIN" jlist 2>/dev/null | "$PHP_BIN" -r '
        $apps = json_decode(stream_get_contents(STDIN), true);
        if (!is_array($apps)) { echo 0; exit; }
        $name = getenv("FRONT_PROD_NAME") ?: "perfumer-frontend";
        $n = 0;
        foreach ($apps as $app) {
            if (($app["name"] ?? "") !== $name) { continue; }
            if (($app["pm2_env"]["status"] ?? "") === "online") { $n++; }
        }
        echo $n;
    ' 2>/dev/null || echo 0
}

pm2_restart_fingerprint() {
    # One line: id:pid:restarts,... — empty if app missing.
    FRONT_PROD_NAME="$FRONT_PROD_NAME" "$PM2_BIN" jlist 2>/dev/null | "$PHP_BIN" -r '
        $apps = json_decode(stream_get_contents(STDIN), true);
        if (!is_array($apps)) { exit(1); }
        $name = getenv("FRONT_PROD_NAME") ?: "perfumer-frontend";
        $rows = [];
        foreach ($apps as $app) {
            if (($app["name"] ?? "") !== $name) { continue; }
            $rows[] = sprintf(
                "%s:%s:%s",
                $app["pm_id"] ?? "?",
                $app["pid"] ?? 0,
                $app["pm2_env"]["restart_time"] ?? 0
            );
        }
        sort($rows);
        echo implode(",", $rows);
    ' 2>/dev/null || true
}

wait_for_pm2_stable() {
    local attempts="${1:-20}"
    local settle_secs="${PM2_STABLE_SECS:-8}"
    local i=1
    local before=""
    local after=""
    local online_count=0

    log "Waiting for PM2 $FRONT_PROD_NAME online (need 2 instances, up to ${attempts}s)"
    while (( i <= attempts )); do
        online_count="$(pm2_online_count)"
        if [[ "$online_count" -ge 2 ]]; then
            break
        fi
        sleep 1
        i=$((i + 1))
    done

    if [[ "$online_count" -lt 2 ]]; then
        warn "PM2 $FRONT_PROD_NAME not online enough after ${attempts}s (online=${online_count})"
        return 1
    fi

    before="$(pm2_restart_fingerprint)"
    log "PM2 online — settling ${settle_secs}s (fingerprint=$before)"
    sleep "$settle_secs"
    after="$(pm2_restart_fingerprint)"
    online_count="$(pm2_online_count)"

    if [[ "$online_count" -ge 2 && -n "$before" && "$before" == "$after" ]]; then
        log "PM2 stable ($online_count online, fingerprint=$before)"
        return 0
    fi

    warn "PM2 $FRONT_PROD_NAME restarted during settle (before=$before after=$after online=${online_count})"
    return 1
}

load_env() {
    local key="$1"
    local default="${2:-}"
    if [[ -f "$SHARED_DIR/backend/.env" ]]; then
        grep -E "^${key}=" "$SHARED_DIR/backend/.env" 2>/dev/null | tail -n 1 | sed "s/^${key}=//" | tr -d "'\"" || printf '%s' "$default"
    else
        printf '%s' "$default"
    fi
}

backend_health_url() {
    local url="${BACKEND_HEALTH_URL:-}"
    if [[ -n "$url" ]]; then
        printf '%s' "$url"
        return 0
    fi

    local base_url
    base_url="$(load_env APP_URL 'https://perfumer.by')"
    # http APP_URL часто 301 → https; проверяем сразу по https.
    if [[ "$base_url" == http://* ]]; then
        base_url="https://${base_url#http://}"
    fi
    printf '%s/up' "${base_url%/}"
}

wait_for_backend() {
    local url
    url="$(backend_health_url)"
    local attempts="${1:-30}"
    local code="000"
    local i

    log "Waiting for Laravel ($url, up to ${attempts}s)"
    for ((i = 1; i <= attempts; i++)); do
        # -L: follow http→https (и прочие) redirects, как в health-check.sh
        code="$(curl -sSL -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || echo "000")"
        if [[ "$code" == "200" ]]; then
            log "Laravel ready (HTTP 200)"
            return 0
        fi
        sleep 1
    done
    warn "Laravel not ready after ${attempts}s (last HTTP ${code})"
    return 1
}

wait_for_public_storefront() {
    local base_url
    base_url="$(load_env APP_URL 'https://perfumer.by')"
    if [[ "$base_url" == http://* ]]; then
        base_url="https://${base_url#http://}"
    fi
    local url="${PUBLIC_STOREFRONT_HEALTH_URL:-${base_url%/}/}"
    local attempts="${1:-15}"
    local code="000"
    local i

    log "Waiting for public storefront ($url, up to ${attempts}s)"
    for ((i = 1; i <= attempts; i++)); do
        code="$(curl -sSL -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || echo "000")"
        # 401 на staging с basic auth — сайт жив, просто закрыт паролем
        if [[ "$code" =~ ^(200|301|302|307|308|401)$ ]]; then
            log "Public storefront ready (HTTP $code)"
            return 0
        fi
        sleep 1
    done
    warn "Public storefront not ready after ${attempts}s (last HTTP ${code})"
    return 1
}

wait_for_queue() {
    local attempts="${1:-30}"
    local status=""
    local i

    for ((i = 1; i <= attempts; i++)); do
        status="$(sudo supervisorctl status "$QUEUE_GROUP" 2>/dev/null || true)"
        if printf '%s\n' "$status" | awk '
            NF { seen = 1; if ($2 != "RUNNING") bad = 1 }
            END { exit (!seen || bad) }
        '; then
            printf '%s\n' "$status"
            return 0
        fi
        sleep 1
    done

    warn "Queue workers are not RUNNING after ${attempts}s"
    printf '%s\n' "$status" >&2
    return 1
}

on_error() {
    local code="$1"
    local rollback_failed=0
    local keep_maintenance=0
    trap - ERR
    set +e
    warn "Release failed (exit $code). New release lives at: $NEW_RELEASE"

    if [[ $SWITCHED -eq 1 && -n "$PREV_TARGET" && -d "$PREV_TARGET" ]]; then
        if [[ $NGINX_MAINT -eq 0 ]]; then
            enable_nginx_maintenance
        fi
        warn "Rolling back current -> $PREV_TARGET"
        ln -snfT "$PREV_TARGET" "$CURRENT" || rollback_failed=1
        "$PM2_BIN" startOrReload "$CURRENT/frontend/ecosystem.config.cjs" \
            --only "$FRONT_PROD_NAME" --update-env || rollback_failed=1
        if command -v supervisorctl >/dev/null 2>&1; then
            sudo supervisorctl restart "$QUEUE_GROUP" || rollback_failed=1
        fi
        (cd "$CURRENT/backend" && "$PHP_BIN" artisan up) || rollback_failed=1
        wait_for_backend 30 || rollback_failed=1
        wait_for_frontend 30 || rollback_failed=1
        if [[ $rollback_failed -eq 0 ]]; then
            warn "Previous release restored."
        else
            keep_maintenance=1
            warn "Automatic rollback failed; nginx maintenance will remain enabled."
        fi
    elif [[ $SWITCHED -eq 0 ]]; then
        warn "\`current\` not switched — старый релиз остаётся активным."
    else
        keep_maintenance=1
        warn "Previous release is unavailable; automatic rollback skipped."
    fi

    if [[ -n "$MAINT_DIR" ]]; then
        warn "Снимаю maintenance с $MAINT_DIR"
        (cd "$MAINT_DIR/backend" && "$PHP_BIN" artisan up || true) || true
    fi
    if [[ $NGINX_MAINT -eq 1 ]]; then
        if [[ $keep_maintenance -eq 1 ]]; then
            warn "Fix manually, then remove: $MAINT_FLAG"
        else
            warn "Снимаю nginx maintenance flag"
            rm -f "$MAINT_FLAG" || true
            NGINX_MAINT=0
        fi
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
RELEASE_SHA="$(git -C "$NEW_RELEASE" rev-parse --short=12 HEAD)"
log "Release commit: $RELEASE_SHA"

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

# --- frontend build ---------------------------------------------------------

BUILD_STARTED_AT="$(date +%s)"
log "npm ci (frontend)"
(cd "$NEW_RELEASE/frontend" && "$NPM_BIN" ci --no-audit --no-fund)

log "next build"
(cd "$NEW_RELEASE/frontend" && rm -rf .next && "$NPM_BIN" run build)
BUILD_FINISHED_AT="$(date +%s)"

sync_503_html "$NEW_RELEASE"

# --- short maintenance window + migrate ------------------------------------

enable_nginx_maintenance

if [[ -L "$CURRENT" ]]; then
    log "artisan down (on current)"
    MAINT_DIR="$CURRENT"
    (cd "$CURRENT/backend" && "$PHP_BIN" artisan down --render="errors::503" --retry=15)
fi

log "artisan migrate --force (from new release)"
(cd "$NEW_RELEASE/backend" && "$PHP_BIN" artisan migrate --force)

log "Пересобираю кэши Laravel"
(cd "$NEW_RELEASE/backend" && "$PHP_BIN" artisan optimize:clear)
(cd "$NEW_RELEASE/backend" && "$PHP_BIN" artisan config:cache)
(cd "$NEW_RELEASE/backend" && "$PHP_BIN" artisan route:cache)
(cd "$NEW_RELEASE/backend" && "$PHP_BIN" artisan view:cache || true)

# --- atomic switch ----------------------------------------------------------

if [[ -L "$CURRENT" ]]; then
    PREV_TARGET="$(readlink -f "$CURRENT")"
fi

log "Переключаю symlink: current -> $NEW_RELEASE"
ln -snfT "$NEW_RELEASE" "$CURRENT"
SWITCHED=1

# --- pm2 + supervisor -------------------------------------------------------

log "Reload pm2 ($FRONT_PROD_NAME)"
"$PM2_BIN" startOrReload "$CURRENT/frontend/ecosystem.config.cjs" \
    --only "$FRONT_PROD_NAME" --update-env
"$PM2_BIN" save >/dev/null || true

log "artisan up"
(cd "$CURRENT/backend" && "$PHP_BIN" artisan up)
MAINT_DIR=""

# Keep nginx 503 until API is up and Next is stably answering — avoids 502 after flag drop.
wait_for_backend 30
wait_for_pm2_stable 20
wait_for_frontend_stable 45
disable_nginx_maintenance
wait_for_public_storefront 15

if command -v supervisorctl >/dev/null 2>&1; then
    log "supervisorctl restart $QUEUE_GROUP"
    sudo supervisorctl restart "$QUEUE_GROUP"
    wait_for_queue 30
else
    warn "supervisorctl не найден — невозможно подтвердить queue worker"
    false
fi

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
echo "Commit         : $RELEASE_SHA"
echo "Build duration : $((BUILD_FINISHED_AT - BUILD_STARTED_AT))s"
echo "Total duration : $(( $(date +%s) - DEPLOY_STARTED_AT ))s"
"$PM2_BIN" list || true
