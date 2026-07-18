#!/usr/bin/env bash
# Rollback: переключить current-симлинк на предыдущий (или указанный) релиз.
#
# Запуск:
#   ./scripts/rollback.sh                # на предыдущий релиз
#   ./scripts/rollback.sh 20260418-100000  # на конкретный релиз в releases/
#
# ВАЖНО: миграции БД автоматически НЕ откатываются. Если в отменяемом релизе
# были новые миграции, схема БД останется «вперёдней» кода. Если это страшно —
# вручную `php artisan migrate:rollback --step=N` после переключения.

set -Eeuo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/var/www/perfumer-by}"
RELEASES_DIR="$PROJECT_ROOT/releases"
CURRENT="$PROJECT_ROOT/current"

PHP_BIN="${PHP_BIN:-php}"
PM2_BIN="${PM2_BIN:-pm2}"
# Staging: FRONT_PROD_NAME=frontend-staging
FRONT_PROD_NAME="${FRONT_PROD_NAME:-perfumer-frontend}"
QUEUE_GROUP="${QUEUE_GROUP:-perfumer-queue:*}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }

if [[ ! -L "$CURRENT" ]]; then
    warn "$CURRENT — не симлинк. Релизной структуры нет, откатывать нечего."
    exit 1
fi

TARGET="${1:-}"
CURRENT_TARGET_BASE="$(basename "$(readlink "$CURRENT")")"

if [[ -z "$TARGET" ]]; then
    TARGET="$(
        cd "$RELEASES_DIR"
        ls -1d */ 2>/dev/null | sed 's:/$::' | sort | grep -v "^$CURRENT_TARGET_BASE$" | tail -n1
    )"
fi

if [[ -z "$TARGET" || ! -d "$RELEASES_DIR/$TARGET" ]]; then
    warn "Не нашёл релиза для отката. Доступные релизы:"
    ls -1d "$RELEASES_DIR"/*/ 2>/dev/null || true
    exit 1
fi

if [[ "$TARGET" == "$CURRENT_TARGET_BASE" ]]; then
    warn "Запрошенный релиз уже активен: $TARGET"
    exit 1
fi

log "Откат: $CURRENT_TARGET_BASE → $TARGET"

ln -snfT "$RELEASES_DIR/$TARGET" "$CURRENT"

log "Reload pm2"
if "$PM2_BIN" describe "$FRONT_PROD_NAME" >/dev/null 2>&1; then
    "$PM2_BIN" reload "$FRONT_PROD_NAME" --update-env || warn "pm2 reload failed"
else
    "$PM2_BIN" start "$CURRENT/frontend/ecosystem.config.cjs" --only "$FRONT_PROD_NAME" || true
fi
"$PM2_BIN" save >/dev/null || true

if command -v supervisorctl >/dev/null 2>&1; then
    log "supervisorctl restart $QUEUE_GROUP"
    sudo supervisorctl restart "$QUEUE_GROUP" || warn "supervisorctl restart не удался"
fi

log "Пересобираю кэши Laravel в релизе отката"
(cd "$CURRENT/backend" && "$PHP_BIN" artisan optimize:clear)
(cd "$CURRENT/backend" && "$PHP_BIN" artisan config:cache)
(cd "$CURRENT/backend" && "$PHP_BIN" artisan route:cache)
(cd "$CURRENT/backend" && "$PHP_BIN" artisan up || true)

log "Готово. Активный релиз: $TARGET"
warn "Миграции БД не откатывались автоматически. Если отменяемый релиз их добавлял —"
warn "решайте вручную: либо совместимо, либо  php artisan migrate:rollback --step=N"
