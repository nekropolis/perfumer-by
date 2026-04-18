#!/usr/bin/env bash
# One-time bootstrap: create the shared/ tree out of an existing in-place checkout.
#
# Сценарий:
#   На сервере сейчас живёт in-place деплой: /var/www/perfumer-by/{backend,frontend,...}
#   Хотим перейти на capistrano-style (releases/ + current/ + shared/).
#
# После этого скрипта вы:
#   1) Удаляете или переносите текущий in-place checkout.
#   2) Запускаете ./scripts/release.sh — он создаёт первый релиз в releases/<ts>
#      и переключает current -> releases/<ts>.
#
# Запуск:
#   sudo -u deploy ./scripts/bootstrap-shared.sh /var/www/perfumer-by

set -Eeuo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/var/www/perfumer-by}"
SRC="${1:-$PROJECT_ROOT}"
SHARED_DIR="$PROJECT_ROOT/shared"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }

if [[ ! -d "$SRC" ]]; then
    warn "Source checkout not found: $SRC"
    exit 1
fi

log "Создаю shared/ в: $SHARED_DIR (источник: $SRC)"
mkdir -p "$SHARED_DIR/backend" "$SHARED_DIR/frontend"

if [[ -f "$SRC/backend/.env" ]]; then
    log "Копирую backend/.env -> shared/backend/.env"
    cp -n "$SRC/backend/.env" "$SHARED_DIR/backend/.env"
else
    warn "backend/.env не найден в $SRC — создайте его вручную в $SHARED_DIR/backend/.env"
fi

if [[ -f "$SRC/frontend/.env.local" ]]; then
    log "Копирую frontend/.env.local -> shared/frontend/.env.local"
    cp -n "$SRC/frontend/.env.local" "$SHARED_DIR/frontend/.env.local"
else
    warn "frontend/.env.local не найден в $SRC — создайте его вручную"
fi

if [[ -d "$SRC/backend/storage" && ! -L "$SRC/backend/storage" ]]; then
    if [[ -d "$SHARED_DIR/backend/storage" ]]; then
        log "shared/backend/storage уже существует — пропускаю перенос"
    else
        log "Переношу backend/storage -> shared/backend/storage"
        mv "$SRC/backend/storage" "$SHARED_DIR/backend/storage"
    fi
fi

log "Гарантирую дефолтную структуру storage/"
mkdir -p "$SHARED_DIR/backend/storage/app/public"
mkdir -p "$SHARED_DIR/backend/storage/framework/cache"
mkdir -p "$SHARED_DIR/backend/storage/framework/sessions"
mkdir -p "$SHARED_DIR/backend/storage/framework/views"
mkdir -p "$SHARED_DIR/backend/storage/logs"

chmod -R 775 "$SHARED_DIR/backend/storage" || true

log "Готово. Содержимое shared/:"
ls -la "$SHARED_DIR" "$SHARED_DIR/backend" "$SHARED_DIR/frontend" 2>/dev/null || true

cat <<EOF

Что дальше:

  1) Проверьте, что в $SHARED_DIR/backend/.env всё корректно (APP_ENV=production, БД, Redis).
  2) Обновите права, если приложение работает не под deploy:
         sudo chown -R deploy:www-data "$SHARED_DIR/backend/storage"
         sudo chmod -R 775 "$SHARED_DIR/backend/storage"
  3) Обновите supervisor, чтобы queue worker читал artisan из current/:
         command=/usr/bin/php $PROJECT_ROOT/current/backend/artisan queue:work redis ...
  4) Запустите первый релиз:
         ./scripts/release.sh
EOF
