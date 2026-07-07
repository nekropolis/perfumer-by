#!/usr/bin/env bash
# Basic health checks for perfumer-by.
# Sends a Telegram alert when something looks wrong.
# Throttles repeated alerts: same problems are reported at most once per hour.
# Sends a recovery message when all problems are gone.
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
ALERT_COOLDOWN_SECONDS=3600

STATE_DIR="/var/lib/perfumer-health-check"
STATE_FILE="$STATE_DIR/last-alert"

# ---------------------------------------------------------------------------
# Utils.
# ---------------------------------------------------------------------------
warn()  { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }

ensure_state_dir() {
    if [[ ! -d "$STATE_DIR" ]]; then
        mkdir -p "$STATE_DIR" 2>/dev/null || STATE_FILE="/tmp/perfumer-health-check-last-alert"
    fi
}

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
# State helpers (throttle repeated alerts).
# ---------------------------------------------------------------------------
read_state() {
    if [[ -f "$STATE_FILE" ]]; then
        cat "$STATE_FILE"
    fi
}

write_state() {
    local alerts_hash="$1"
    local ts
    ts=$(date +%s)
    ensure_state_dir
    printf '%s %s\n' "$ts" "$alerts_hash" > "$STATE_FILE"
}

clear_state() {
    ensure_state_dir
    rm -f "$STATE_FILE"
}

should_send_alert() {
    local current_hash="$1"
    local state
    state="$(read_state)"

    if [[ -z "$state" ]]; then
        return 0
    fi

    local last_ts last_hash now
    last_ts="$(printf '%s' "$state" | awk '{print $1}')"
    last_hash="$(printf '%s' "$state" | awk '{$1=""; print substr($0,2)}')"
    now=$(date +%s)

    if [[ "$last_hash" == "$current_hash" ]] && [[ $(( now - last_ts )) -lt $ALERT_COOLDOWN_SECONDS ]]; then
        return 1
    fi

    return 0
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
    if ! sudo supervisorctl status perfumer-queue:* 2>/dev/null | grep -q RUNNING; then
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
# Send alert or recovery message.
# ---------------------------------------------------------------------------
if [[ ${#ALERTS[@]} -gt 0 ]]; then
    ALERTS_TEXT="$(printf '%s\n' "${ALERTS[@]}")"
    CURRENT_HASH="$(printf '%s' "$ALERTS_TEXT" | md5sum | awk '{print $1}')"

    if should_send_alert "$CURRENT_HASH"; then
        MESSAGE="🚨 *Perfumer health check* on $(hostname) at $(date +'%Y-%m-%d %H:%M')\n\n${ALERTS_TEXT}"
        send_telegram "$MESSAGE"
        write_state "$CURRENT_HASH"
    fi

    printf '%s\n' "${ALERTS[@]}" >&2
    exit 1
else
    if [[ -f "$STATE_FILE" ]]; then
        send_telegram "✅ *Perfumer health check recovered* on $(hostname) at $(date +'%Y-%m-%d %H:%M')\n\nAll checks are OK now."
        clear_state
    fi
fi

exit 0
