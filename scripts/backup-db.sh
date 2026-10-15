#!/usr/bin/env bash
# Nightly database and optional media backup for perfumer-by.
# Sends a Telegram alert on failure.
#
# Configuration:
#   BACKUP_DIR=/var/backups/perfumer
#   KEEP_DAYS=14
#   BACKUP_MEDIA=false                 # true to archive media
#   MEDIA_PATH=<project>/backend/storage/app/public
#   BACKUP_REMOTE=user@host:/path      # empty disables offsite copy
#   BACKUP_TIMEOUT=60                  # rsync I/O and SSH connect timeout
#   BACKUP_GPG_RECIPIENT=key-or-email  # encrypt copies sent offsite
#
# Cron example (run as deploy user):
#   15 3 * * * /var/www/perfumer-by/scripts/backup-db.sh >/dev/null 2>&1

set -Eeuo pipefail

ROOT="${PROJECT_ROOT:-/var/www/perfumer-by}"
BACKEND="$ROOT/backend"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/perfumer}"
KEEP_DAYS="${KEEP_DAYS:-14}"
BACKUP_MEDIA="${BACKUP_MEDIA:-false}"
MEDIA_PATH="${MEDIA_PATH:-$BACKEND/storage/app/public}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
BACKUP_TIMEOUT="${BACKUP_TIMEOUT:-60}"
BACKUP_GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-}"
MYSQL_DEFAULTS_FILE=""

cleanup() {
    if [[ -n "$MYSQL_DEFAULTS_FILE" ]]; then
        rm -f "$MYSQL_DEFAULTS_FILE"
    fi
}
trap cleanup EXIT

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
MEDIA_FILE="$BACKUP_DIR/media-${DATE_LABEL}.tar.gz"
ARCHIVES_TO_COPY=()

if [[ -f "$GZ_FILE" ]]; then
    log "Backup already exists: $GZ_FILE"
    ARCHIVES_TO_COPY+=("$GZ_FILE")
else
    log "Creating database backup: $GZ_FILE"

    umask 077
    MYSQL_DEFAULTS_FILE="$(mktemp "${TMPDIR:-/tmp}/perfumer-mysql.XXXXXX.cnf")"
    chmod 600 "$MYSQL_DEFAULTS_FILE"
    escaped_password="${DB_PASSWORD//\\/\\\\}"
    escaped_password="${escaped_password//\"/\\\"}"
    cat > "$MYSQL_DEFAULTS_FILE" <<EOF
[client]
host=$DB_HOST
port=$DB_PORT
user=$DB_USERNAME
password="$escaped_password"
EOF

    if ! mysqldump \
        --defaults-extra-file="$MYSQL_DEFAULTS_FILE" \
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

    rm -f "$MYSQL_DEFAULTS_FILE"
    MYSQL_DEFAULTS_FILE=""
    gzip -f "$DUMP_FILE"

    DUMP_SIZE="$(stat -c%s "$GZ_FILE" 2>/dev/null || stat -f%z "$GZ_FILE" 2>/dev/null || echo 0)"
    if [[ "$DUMP_SIZE" -lt 1024 ]]; then
        rm -f "$GZ_FILE"
        fail "Backup file is too small (${DUMP_SIZE} bytes)"
        send_telegram "🚨 *Perfumer backup failed*\n\nBackup file is suspiciously small (${DUMP_SIZE} bytes) on $(hostname) at ${DATE_LABEL}."
        exit 1
    fi

    log "Backup created: $GZ_FILE ($(numfmt --to=iec "$DUMP_SIZE" 2>/dev/null || echo "${DUMP_SIZE} bytes"))"
    ARCHIVES_TO_COPY+=("$GZ_FILE")
fi

if [[ "$BACKUP_MEDIA" == "true" ]]; then
    if [[ -f "$MEDIA_FILE" ]]; then
        log "Media backup already exists: $MEDIA_FILE"
        ARCHIVES_TO_COPY+=("$MEDIA_FILE")
    elif [[ ! -d "$MEDIA_PATH" ]]; then
        fail "Media path does not exist: $MEDIA_PATH"
        send_telegram "🚨 *Perfumer backup failed*\n\nMedia path does not exist on $(hostname): ${MEDIA_PATH}"
        exit 1
    else
        log "Creating media backup: $MEDIA_FILE"
        if ! tar -czf "$MEDIA_FILE" -C "$(dirname "$MEDIA_PATH")" "$(basename "$MEDIA_PATH")"; then
            rm -f "$MEDIA_FILE"
            fail "Media backup failed"
            send_telegram "🚨 *Perfumer backup failed*\n\nMedia archive failed on $(hostname) at ${DATE_LABEL}."
            exit 1
        fi
        ARCHIVES_TO_COPY+=("$MEDIA_FILE")
    fi
else
    log "Media backup disabled (set BACKUP_MEDIA=true to enable)"
fi

if [[ -n "$BACKUP_REMOTE" ]] && (( ${#ARCHIVES_TO_COPY[@]} > 0 )); then
    OFFSITE_ARCHIVES=()
    for archive in "${ARCHIVES_TO_COPY[@]}"; do
        if [[ -n "$BACKUP_GPG_RECIPIENT" ]]; then
            encrypted="${archive}.gpg"
            log "Encrypting for offsite copy: $encrypted"
            if ! gpg --batch --yes --recipient "$BACKUP_GPG_RECIPIENT" \
                --output "$encrypted" --encrypt "$archive"; then
                rm -f "$encrypted"
                fail "GPG encryption failed"
                send_telegram "🚨 *Perfumer backup failed*\n\nGPG encryption failed on $(hostname) at ${DATE_LABEL}."
                exit 1
            fi
            OFFSITE_ARCHIVES+=("$encrypted")
        else
            OFFSITE_ARCHIVES+=("$archive")
        fi
    done

    log "Copying today's archives offsite: $BACKUP_REMOTE"
    if ! rsync --partial --timeout="$BACKUP_TIMEOUT" \
        -e "ssh -o ConnectTimeout=$BACKUP_TIMEOUT" \
        -- "${OFFSITE_ARCHIVES[@]}" "${BACKUP_REMOTE%/}/"; then
        fail "Offsite backup failed"
        send_telegram "🚨 *Perfumer backup failed*\n\nOffsite rsync failed on $(hostname) at ${DATE_LABEL}."
        exit 1
    fi
elif [[ -z "$BACKUP_REMOTE" ]]; then
    log "Offsite backup disabled (BACKUP_REMOTE is unset)"
else
    log "No archives to copy offsite"
fi

# ---------------------------------------------------------------------------
# Rotate old backups.
# ---------------------------------------------------------------------------
log "Removing backups older than ${KEEP_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'media-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.gz.gpg' -mtime +"$KEEP_DAYS" -delete

log "Backup done"
