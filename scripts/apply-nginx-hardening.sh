#!/usr/bin/env bash
# Apply nginx security headers + API rate limit + dotfile deny, and
# set fail2ban nginx-limit-req bantime to 15m.
#
# On server (as root):
#   sudo /var/www/perfumer-by/scripts/apply-nginx-hardening.sh
#
# Aborts and restores the site backup if nginx -t fails.

set -Eeuo pipefail

ROOT="${PROJECT_ROOT:-/var/www/perfumer-by}"
SITE="${SITE:-/etc/nginx/sites-available/perfumer.by}"
HARDENED="$ROOT/scripts/nginx/perfumer.by.hardened.conf"
HEADERS_SRC="$ROOT/scripts/nginx/security-headers.conf.example"
RATE_SRC="$ROOT/scripts/nginx/rate-limit.conf.example"
STAMP="$(date +%Y%m%d-%H%M%S)"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }

[[ "$EUID" -eq 0 ]] || fail "Run as root: sudo $0"
[[ -f "$HARDENED" ]] || fail "Missing $HARDENED — update the repo on the server first"
[[ -f "$SITE" ]] || fail "Missing live site $SITE"
[[ -f "$HEADERS_SRC" && -f "$RATE_SRC" ]] || fail "Missing nginx example snippets under $ROOT/scripts/nginx"

log "Backup live site → ${SITE}.bak.${STAMP}"
cp -a "$SITE" "${SITE}.bak.${STAMP}"

log "Install snippets"
install -m 0644 "$HEADERS_SRC" /etc/nginx/snippets/perfumer-security-headers.conf
install -m 0644 "$RATE_SRC" /etc/nginx/conf.d/perfumer-rate-limit.conf

log "Install hardened site config (preserves basic auth / SSL from live snapshot)"
install -m 0644 "$HARDENED" "$SITE"

log "nginx -t"
if ! nginx -t; then
  log "Test failed — restoring ${SITE}.bak.${STAMP}"
  cp -a "${SITE}.bak.${STAMP}" "$SITE"
  nginx -t || true
  fail "Aborted; previous site config restored"
fi

log "Reload nginx"
systemctl reload nginx

log "fail2ban: ensure nginx-limit-req filter + bantime 15m"
install -m 0644 /dev/stdin /etc/fail2ban/filter.d/nginx-limit-req.conf <<'EOF'
[Definition]
failregex = ^.*limiting requests, excess:.* by zone "perfumer_api", client: <HOST>,
ignoreregex =
EOF

if [[ -f /etc/fail2ban/jail.local ]]; then
  cp -a /etc/fail2ban/jail.local "/etc/fail2ban/jail.local.bak.${STAMP}"
fi

python3 - <<'PY'
from pathlib import Path
import re

p = Path("/etc/fail2ban/jail.local")
text = p.read_text() if p.exists() else ""
block = """[nginx-limit-req]
enabled   = true
port      = http,https
filter    = nginx-limit-req
logpath   = /var/log/nginx/error.log
maxretry  = 10
bantime   = 15m
"""
if "[nginx-limit-req]" not in text:
    text = text.rstrip() + "\n\n" + block
else:
    text = re.sub(
        r"\[nginx-limit-req\][^\[]*",
        block + "\n",
        text,
        count=1,
    )
p.write_text(text)
print("jail.local: nginx-limit-req bantime=15m")
PY

systemctl reload fail2ban 2>/dev/null || systemctl restart fail2ban
fail2ban-client status nginx-limit-req || fail2ban-client status

log "Local smoke (Host: prod.mobiz.by)"
curl -skI --max-time 5 -H "Host: prod.mobiz.by" https://127.0.0.1/up | head -8 || true
echo "---"
curl -skI --max-time 5 -H "Host: prod.mobiz.by" https://127.0.0.1/.env | head -8 || true

log "Done. Backups: ${SITE}.bak.${STAMP} and jail.local.bak.${STAMP} (if jail existed)"
