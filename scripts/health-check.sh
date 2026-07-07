#!/usr/bin/env bash
# Basic health checks for perfumer-by.
# Sends a Telegram alert when something looks wrong.
#
# Cron example (run as deploy user every 5 minutes):
#   */5 * * * * /var/www/perfumer-by/scripts/health-check.sh >/dev/null 2>&1

set -Eeuo pipefail

ROOT="${PROJECT_ROOT:-/var/www/perfumer-by}"
BACKEND="$ROOT/backend"

SITE_URL="${SITE_URL:-https://prod.mobiz.by}"
DISK_THRESHOLD=85
RAM_MIN_AVAILABLE_MB=500
SWAP_WARN_MB=100

# ---------------------------------------------------------------------------
# Utils.
# ---------------------------------------------------------------------------
warn()  { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# Load Telegram config from Laravel .env.
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

TELEGRAM_ENABLED="$(load_env TELEGRAM_NOTIFICATIONS_ENABLED true)"
TELEGRAM_TOKEN="$(load_env TELEGRAM_BOT_TOKEN '')"
TELEGRAM_CHAT_ID="$(load_env TELEGRAM_CHAT_ID '')"

# ---------------------------------------------------------------------------
# Telegram alert.
# ---------------------------------------------------------------------------
send_telegram() {
    local text="$1"
    if [[ "$TELEGRAM_ENABLED" != "true" ]] || [[ -z "$TELEGRAM_TOKEN" ]] || [[ -z "$TELEGRAM_CHAT_ID" ]]; then
        return 0
    fi

    local payload
    payload=$(printf '{"chat_id":"%s","text":"%s","disable_web_page_preview":true}' "$TELEGRAM_CHAT_ID" "$text")

    curl -fsSL -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "$payload" >/dev/null 2>&1 || warn "Failed to send Telegram alert"
}

# ---------------------------------------------------------------------------
# Checks.
# ---------------------------------------------------------------------------
ALERTS=()

# 1. Disk usage.
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
if [[ "$DISK_USAGE" -ge "$DISK_THRESHOLD" ]]; then
    ALERTS+=("💾 Disk usage is ${DISK_USAGE}% (threshold ${DISK_THRESHOLD}%)")
fi

# 2. Available RAM.
RAM_AVAILABLE_MB=$(free -m | awk '/^Mem:/ {print $7}')
if [[ "$RAM_AVAILABLE_MB" -lt "$RAM_MIN_AVAILABLE_MB" ]]; then
    ALERTS+=("🧠 Available RAM is ${RAM_AVAILABLE_MB} MB (threshold ${RAM_MIN_AVAILABLE_MB} MB)")
fi

# 3. Swap usage.
SWAP_USED_MB=$(free -m | awk '/^Swap:/ {print $3}')
if [[ "$SWAP_USED_MB" -gt "$SWAP_WARN_MB" ]]; then
    ALERTS+=("🐌 Swap usage is ${SWAP_USED_MB} MB")
fi

# 4. Queue worker status.
if command -v supervisorctl >/dev/null 2>&1; then
    if ! supervisorctl status perfumer-queue:* 2>/dev/null | grep -q RUNNING; then
        ALERTS+=("⚙️ Queue worker perfumer-queue is not RUNNING")
    fi
fi

# 5. Site health check.
if command -v curl >/dev/null 2>&1; then
    if ! curl -fsSL -o /dev/null -w '%{http_code}' "$SITE_URL/up" 2>/dev/null | grep -q '^200$'; then
        ALERTS+=("🌐 Health check $SITE_URL/up failed")
    fi
fi

# ---------------------------------------------------------------------------
# Send one combined alert if any check failed.
# ---------------------------------------------------------------------------
if [[ ${#ALERTS[@]} -gt 0 ]]; then
    MESSAGE="🚨 *Perfumer health check* on $(hostname) at $(date +'%Y-%m-%d %H:%M')\n\n$(printf '%s\n' "${ALERTS[@]}")"
    send_telegram "$MESSAGE"
    printf '%s\n' "${ALERTS[@]}" >&2
    exit 1
fi

exit 0
