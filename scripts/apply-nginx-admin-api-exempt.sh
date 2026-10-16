#!/usr/bin/env bash
# Exempt /api/admin/ from limit_req (admin panel polling must not trip fail2ban).
# Run on server: sudo /var/www/perfumer-by/scripts/apply-nginx-admin-api-exempt.sh

set -Eeuo pipefail

SITE="${SITE:-/etc/nginx/sites-available/perfumer.by}"
STAMP="$(date +%Y%m%d-%H%M%S)"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }

[[ "$EUID" -eq 0 ]] || fail "Run as root: sudo $0"
[[ -f "$SITE" ]] || fail "Missing $SITE"

if grep -q 'location ^~ /api/admin/' "$SITE"; then
  log "Already has /api/admin/ location — nothing to do"
  nginx -t
  exit 0
fi

log "Backup → ${SITE}.bak.${STAMP}"
cp -a "$SITE" "${SITE}.bak.${STAMP}"

python3 - "$SITE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
needle = """    location ^~ /api/ {
        auth_basic off;
        limit_req zone=perfumer_api burst=40 nodelay;
        limit_req_status 429;
        try_files $uri /index.php?$query_string;
    }
"""
insert = """    # Admin API polls many endpoints; do not rate-limit (avoids fail2ban bans of office IPs).
    location ^~ /api/admin/ {
        auth_basic off;
        try_files $uri /index.php?$query_string;
    }

    location ^~ /api/ {
        auth_basic off;
        limit_req zone=perfumer_api burst=40 nodelay;
        limit_req_status 429;
        try_files $uri /index.php?$query_string;
    }
"""
# Prefer HTTPS block (has auth_basic off + limit_req). Fall back to limit_req-only.
if needle not in text:
    needle_alt = """    location ^~ /api/ {
        limit_req zone=perfumer_api burst=40 nodelay;
        limit_req_status 429;
        try_files $uri /index.php?$query_string;
    }
"""
    insert_alt = """    # Admin API polls many endpoints; do not rate-limit (avoids fail2ban bans of office IPs).
    location ^~ /api/admin/ {
        try_files $uri /index.php?$query_string;
    }

    location ^~ /api/ {
        limit_req zone=perfumer_api burst=40 nodelay;
        limit_req_status 429;
        try_files $uri /index.php?$query_string;
    }
"""
    if needle_alt not in text:
        raise SystemExit("Could not find /api/ location with limit_req to patch")
    text = text.replace(needle_alt, insert_alt, 1)
else:
    text = text.replace(needle, insert, 1)

path.write_text(text)
print(f"Patched {path}")
PY

log "nginx -t"
if ! nginx -t; then
  log "Restore backup"
  cp -a "${SITE}.bak.${STAMP}" "$SITE"
  nginx -t || true
  fail "Aborted; config restored"
fi

log "Reload nginx"
systemctl reload nginx

# Unban only nginx-limit-req jail (do NOT touch sshd bans).
if command -v fail2ban-client >/dev/null; then
  banned="$(fail2ban-client status nginx-limit-req 2>/dev/null | sed -n 's/.*Banned IP list:\s*//p' || true)"
  for ip in $banned; do
    log "Unban nginx-limit-req: $ip"
    fail2ban-client set nginx-limit-req unbanip "$ip" || true
  done
fi

log "Done. Backup: ${SITE}.bak.${STAMP}"
