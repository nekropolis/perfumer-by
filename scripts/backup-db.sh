#!/usr/bin/env bash
# Nightly database backup for perfumer-by.
# Keeps the last 3 daily dumps in /var/backups/perfumer.
# Sends a Telegram alert on failure.
#
# Cron example (run as deploy user):
#   15 3 * * * /var/www/perfumer-by/scripts/backup-db.sh >/dev/null 2>&1

set -Eeuo pipefail

ROOT="${PROJECT_ROOT:-/var/www/perfumer-by}"
BACKEND="$ROOT/backend"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/perfumer}"
KEEP_DAYS=3

# ---------------------------------------------------------------------------
# Utils.
# ---------------------------------------------------------------------------
log()   { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }
fail()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# Load Laravel .env values safely.
# ---------------------------------------------------------------------------
load_env() {
    local key="$1"
    local default="${2:-}"
    if [[ -f "$BACKEND/.env" ]]; then
        grep -E "^${key}=" "$BACKEND/.env" 2>/dev/null | tail -n 1 | sed "s/^${key}=//" | tr -d "'\"" || printf '%s' "$default"
    else
        printf '%s' "$default"
    fi
}

DB_HOST="$(load_env DB_HOST 127.0.0.1)"
DB_PORT="$(load_env DB_PORT 3306)"
DB_DATABASE="$(load_env DB_DATABASE perfumer)"
DB_USERNAME="$(load_env DB_USERNAME perfumer)"
DB_PASSWORD="$(load_env DB_PASSWORD '')"

TELEGRAM_ENABLED="$(load_env TELEGRAM_NOTIFICATIONS_ENABLED true)"
TELEGRAM_TOKEN="$(load_env TELEGRAM_BOT_TOKEN '')"
TELEGRAM_CHAT_ID="$(load_env TELEGRAM_CHAT_ID '')"

# ---------------------------------------------------------------------------
# Telegram alert.
# ---------------------------------------------------------------------------
send_telegram() {
    local text="$1"
    if [[ "$TELEGRAM_ENABLED" != "true" ]] || [[ -z "$TELEGRAM_TOKEN" ]] || [[ -z "$TELEGRAM_CHAT_ID" ]]; then
        warn "Telegram alert skipped (not configured)"
        return 0
    fi

    local payload
    payload=$(printf '{"chat_id":"%s","text":"%s","disable_web_page_preview":true}' "$TELEGRAM_CHAT_ID" "$text")

    curl -fsSL -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "$payload" >/dev/null 2>&1 || warn "Failed to send Telegram alert"
}

# ---------------------------------------------------------------------------
# Backup.
# ---------------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"

DATE_LABEL="$(date +%Y-%m-%d)"
DUMP_FILE="$BACKUP_DIR/db-${DATE_LABEL}.sql"
GZ_FILE="${DUMP_FILE}.gz"

if [[ -f "$GZ_FILE" ]]; then
    log "Backup already exists: $GZ_FILE"
    exit 0
fi

log "Creating database backup: $GZ_FILE"

if ! mysqldump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USERNAME" \
    --password="$DB_PASSWORD" \
    --single-transaction \
    --no-tablespaces \
    --quick \
    --routines \
    "$DB_DATABASE" > "$DUMP_FILE"; then
    rm -f "$DUMP_FILE"
    fail "mysqldump failed"
    send_telegram "🚨 *Perfumer backup failed*\n\nmysqldump exited with error on $(hostname) at ${DATE_LABEL}."
    exit 1
fi

gzip -f "$DUMP_FILE"

DUMP_SIZE="$(stat -c%s "$GZ_FILE" 2>/dev/null || stat -f%z "$GZ_FILE" 2>/dev/null || echo 0)"
if [[ "$DUMP_SIZE" -lt 1024 ]]; then
    rm -f "$GZ_FILE"
    fail "Backup file is too small (${DUMP_SIZE} bytes)"
    send_telegram "🚨 *Perfumer backup failed*\n\nBackup file is suspiciously small (${DUMP_SIZE} bytes) on $(hostname) at ${DATE_LABEL}."
    exit 1
fi

log "Backup created: $GZ_FILE ($(numfmt --to=iec "$DUMP_SIZE" 2>/dev/null || echo "${DUMP_SIZE} bytes"))"

# ---------------------------------------------------------------------------
# Rotate old backups.
# ---------------------------------------------------------------------------
log "Removing backups older than ${KEEP_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

log "Backup done"
