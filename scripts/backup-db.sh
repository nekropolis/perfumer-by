#!/usr/bin/env bash
# Nightly database and optional media backup for perfumer-by.
# Sends a Telegram alert on failure.
#
# Configuration:
#   BACKUP_DIR=/var/backups/perfumer
#   KEEP_COUNT=3                       # keep last N local versions
#   BACKUP_MEDIA=false                 # true to archive media
#   MEDIA_PATH=<project>/backend/storage/app/public
#   BACKUP_REMOTE=user@host:/path      # empty disables offsite copy
#   BACKUP_REMOTE_KEEP=1               # keep last N DB dumps on remote
#   BACKUP_REMOTE_PORT=22
#   BACKUP_TRANSPORT=sftp              # sftp (default) | rsync
#   BACKUP_SSH_KEY=/path/to/ed25519    # dedicated key for offsite copy
#   BACKUP_TIMEOUT=60                  # SSH/SFTP connect timeout
#   BACKUP_GPG_RECIPIENT=key-or-email  # encrypt copies sent offsite
#   BACKUP_GROUP=www-data              # group for admin download access
#
# Cron example (run as deploy user):
#   15 3 * * * /var/www/perfumer-by/scripts/backup-db.sh >/dev/null 2>&1
#
# Offsite example (SFTP-only VPS):
#   BACKUP_REMOTE=backup@31.220.42.4:/data
#   BACKUP_SSH_KEY=/home/deploy/.ssh/perfumer-backup-ed25519
#   BACKUP_TRANSPORT=sftp
#   BACKUP_REMOTE_KEEP=1

set -Eeuo pipefail

ROOT="${PROJECT_ROOT:-/var/www/perfumer-by}"
BACKEND="$ROOT/backend"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/perfumer}"
KEEP_COUNT="${KEEP_COUNT:-3}"
BACKUP_MEDIA="${BACKUP_MEDIA:-false}"
MEDIA_PATH="${MEDIA_PATH:-$BACKEND/storage/app/public}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
BACKUP_REMOTE_KEEP="${BACKUP_REMOTE_KEEP:-1}"
BACKUP_REMOTE_PORT="${BACKUP_REMOTE_PORT:-22}"
BACKUP_TRANSPORT="${BACKUP_TRANSPORT:-sftp}"
BACKUP_SSH_KEY="${BACKUP_SSH_KEY:-}"
BACKUP_TIMEOUT="${BACKUP_TIMEOUT:-60}"
BACKUP_GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-}"
BACKUP_GROUP="${BACKUP_GROUP:-www-data}"
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

# Make backup files readable by PHP (admin «Скачать базу»).
secure_share() {
    local path="$1"
    chmod 640 "$path" 2>/dev/null || true
    if getent group "$BACKUP_GROUP" >/dev/null 2>&1; then
        chgrp "$BACKUP_GROUP" "$path" 2>/dev/null || true
    fi
}

# Keep only the newest KEEP_COUNT files matching glob name pattern.
rotate_keep_last() {
    local pattern="$1"
    local keep="$2"
    local -a files=()
    local path

    while IFS= read -r path; do
        [[ -n "$path" ]] || continue
        files+=("$path")
    done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$pattern" -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2-)

    local i
    for ((i = keep; i < ${#files[@]}; i++)); do
        rm -f "${files[$i]}"
    done
}

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
chmod 750 "$BACKUP_DIR" 2>/dev/null || true
if getent group "$BACKUP_GROUP" >/dev/null 2>&1; then
    chgrp "$BACKUP_GROUP" "$BACKUP_DIR" 2>/dev/null || true
fi

DATE_LABEL="$(date +%Y-%m-%d)"
DUMP_FILE="$BACKUP_DIR/db-${DATE_LABEL}.sql"
GZ_FILE="${DUMP_FILE}.gz"
MEDIA_FILE="$BACKUP_DIR/media-${DATE_LABEL}.tar.gz"
ARCHIVES_TO_COPY=()

if [[ -f "$GZ_FILE" ]]; then
    log "Backup already exists: $GZ_FILE"
    secure_share "$GZ_FILE"
    ARCHIVES_TO_COPY+=("$GZ_FILE")
else
    log "Creating database backup: $GZ_FILE"

    umask 027
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
    secure_share "$GZ_FILE"

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
        secure_share "$MEDIA_FILE"
        ARCHIVES_TO_COPY+=("$MEDIA_FILE")
    fi
else
    log "Media backup disabled (set BACKUP_MEDIA=true to enable)"
fi

# Offsite: only the newest DB dump; remote keeps BACKUP_REMOTE_KEEP copies.
# Default transport is SFTP (works on SFTP-only accounts without shell).
if [[ -n "$BACKUP_REMOTE" ]]; then
    LATEST_DB=""
    while IFS= read -r path; do
        [[ -n "$path" ]] || continue
        LATEST_DB="$path"
        break
    done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2-)

    if [[ -z "$LATEST_DB" ]]; then
        fail "No local db-*.sql.gz to copy offsite"
        send_telegram "🚨 *Perfumer backup failed*\n\nNo local DB dump to copy offsite on $(hostname)."
        exit 1
    fi

    OFFSITE_FILE="$LATEST_DB"
    if [[ -n "$BACKUP_GPG_RECIPIENT" ]]; then
        encrypted="${LATEST_DB}.gpg"
        log "Encrypting for offsite copy: $encrypted"
        if ! gpg --batch --yes --recipient "$BACKUP_GPG_RECIPIENT" \
            --output "$encrypted" --encrypt "$LATEST_DB"; then
            rm -f "$encrypted"
            fail "GPG encryption failed"
            send_telegram "🚨 *Perfumer backup failed*\n\nGPG encryption failed on $(hostname) at ${DATE_LABEL}."
            exit 1
        fi
        OFFSITE_FILE="$encrypted"
    fi

    REMOTE_HOST="${BACKUP_REMOTE%%:*}"
    REMOTE_DIR="${BACKUP_REMOTE#*:}"
    REMOTE_DIR="${REMOTE_DIR%/}"
    REMOTE_BASENAME="$(basename "$OFFSITE_FILE")"
    REMOTE_NAME_REGEX='^db-[0-9]{4}-[0-9]{2}-[0-9]{2}\.sql\.gz$'
    if [[ -n "$BACKUP_GPG_RECIPIENT" ]]; then
        REMOTE_NAME_REGEX='^db-[0-9]{4}-[0-9]{2}-[0-9]{2}\.sql\.gz\.gpg$'
    fi

    SSH_BASE_OPTS=(-o ConnectTimeout="$BACKUP_TIMEOUT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
    if [[ -n "$BACKUP_SSH_KEY" ]]; then
        SSH_BASE_OPTS+=(-i "$BACKUP_SSH_KEY" -o IdentitiesOnly=yes)
    fi

    if [[ "$BACKUP_TRANSPORT" == "sftp" ]]; then
        SFTP_BATCH="$(mktemp "${TMPDIR:-/tmp}/perfumer-sftp.XXXXXX")"
        SFTP_LS_OUT="$(mktemp "${TMPDIR:-/tmp}/perfumer-sftp-ls.XXXXXX")"
        cleanup_sftp_tmp() {
            rm -f "$SFTP_BATCH" "$SFTP_LS_OUT"
        }
        trap 'cleanup; cleanup_sftp_tmp' EXIT

        log "Uploading latest DB via SFTP: $OFFSITE_FILE → ${REMOTE_HOST}:${REMOTE_DIR}/"
        {
            printf 'cd %s\n' "$REMOTE_DIR"
            printf 'put %s %s\n' "$OFFSITE_FILE" "$REMOTE_BASENAME"
            printf 'ls\n'
        } > "$SFTP_BATCH"

        if ! sftp -P "$BACKUP_REMOTE_PORT" "${SSH_BASE_OPTS[@]}" -b "$SFTP_BATCH" "$REMOTE_HOST" \
            >"$SFTP_LS_OUT" 2>&1; then
            cat "$SFTP_LS_OUT" >&2 || true
            fail "Offsite SFTP upload failed"
            send_telegram "🚨 *Perfumer backup failed*\n\nOffsite SFTP upload failed on $(hostname) at ${DATE_LABEL}."
            exit 1
        fi

        # Collect remote dump names (basename only), newest first by filename date.
        mapfile -t REMOTE_DUMPS < <(
            grep -Eo 'db-[0-9]{4}-[0-9]{2}-[0-9]{2}\.sql\.gz(\.gpg)?' "$SFTP_LS_OUT" \
                | grep -E "$REMOTE_NAME_REGEX" \
                | sort -u -r
        )

        TO_DELETE=()
        if (( ${#REMOTE_DUMPS[@]} > BACKUP_REMOTE_KEEP )); then
            TO_DELETE=("${REMOTE_DUMPS[@]:BACKUP_REMOTE_KEEP}")
        fi

        if (( ${#TO_DELETE[@]} > 0 )); then
            log "Pruning remote DB backups (keep ${BACKUP_REMOTE_KEEP}): ${TO_DELETE[*]}"
            {
                printf 'cd %s\n' "$REMOTE_DIR"
                for old in "${TO_DELETE[@]}"; do
                    printf 'rm %s\n' "$old"
                done
            } > "$SFTP_BATCH"

            if ! sftp -P "$BACKUP_REMOTE_PORT" "${SSH_BASE_OPTS[@]}" -b "$SFTP_BATCH" "$REMOTE_HOST" >/dev/null 2>&1; then
                fail "Remote SFTP prune failed"
                send_telegram "🚨 *Perfumer backup failed*\n\nRemote SFTP prune failed on $(hostname) at ${DATE_LABEL}."
                exit 1
            fi
        else
            log "Remote prune skipped (≤ ${BACKUP_REMOTE_KEEP} dumps)"
        fi

        cleanup_sftp_tmp
        trap cleanup EXIT
    else
        SSH_CMD=(ssh -p "$BACKUP_REMOTE_PORT" "${SSH_BASE_OPTS[@]}")

        log "Copying latest DB via rsync: $OFFSITE_FILE → $BACKUP_REMOTE"
        if ! rsync --partial --timeout="$BACKUP_TIMEOUT" \
            -e "${SSH_CMD[*]}" \
            -- "$OFFSITE_FILE" "${BACKUP_REMOTE%/}/"; then
            fail "Offsite backup failed"
            send_telegram "🚨 *Perfumer backup failed*\n\nOffsite rsync failed on $(hostname) at ${DATE_LABEL}."
            exit 1
        fi

        REMOTE_PATTERN='db-*.sql.gz'
        if [[ -n "$BACKUP_GPG_RECIPIENT" ]]; then
            REMOTE_PATTERN='db-*.sql.gz.gpg'
        fi
        log "Pruning remote DB backups to last ${BACKUP_REMOTE_KEEP}"
        if ! "${SSH_CMD[@]}" "$REMOTE_HOST" \
            "cd $(printf '%q' "$REMOTE_DIR") && ls -1t ${REMOTE_PATTERN} 2>/dev/null | tail -n +$((BACKUP_REMOTE_KEEP + 1)) | xargs -r rm -f"; then
            fail "Remote prune failed"
            send_telegram "🚨 *Perfumer backup failed*\n\nRemote prune failed on $(hostname) at ${DATE_LABEL}."
            exit 1
        fi
    fi
else
    log "Offsite backup disabled (BACKUP_REMOTE is unset)"
fi

# ---------------------------------------------------------------------------
# Rotate old backups — keep last KEEP_COUNT versions.
# ---------------------------------------------------------------------------
log "Keeping last ${KEEP_COUNT} backup versions"
rotate_keep_last 'db-*.sql.gz' "$KEEP_COUNT"
rotate_keep_last 'media-*.tar.gz' "$KEEP_COUNT"
rotate_keep_last '*.gz.gpg' "$KEEP_COUNT"

log "Backup done"
