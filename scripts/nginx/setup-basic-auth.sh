#!/usr/bin/env bash
# Create htpasswd file for nginx basic auth.
#
# Run on server:
#   sudo ./scripts/nginx/setup-basic-auth.sh
#   sudo USERNAME=deploy ./scripts/nginx/setup-basic-auth.sh
#
# Then add the printed nginx snippet to your site config and reload nginx.

set -Eeuo pipefail

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }

HTPASSWD_FILE="${HTPASSWD_FILE:-/etc/nginx/.htpasswd}"
REALM="${REALM:-Restricted}"
USERNAME="${USERNAME:-}"

if [[ "$EUID" -ne 0 ]]; then
    warn "Run as root: sudo $0"
    exit 1
fi

if ! command -v htpasswd >/dev/null 2>&1; then
    log "Installing apache2-utils (htpasswd)"
    apt-get update -qq
    apt-get install -y apache2-utils
fi

if [[ -z "$USERNAME" ]]; then
    read -r -p "Username for basic auth: " USERNAME
fi

if [[ -z "$USERNAME" ]]; then
    warn "Username is required."
    exit 1
fi

touch "$HTPASSWD_FILE"
chmod 640 "$HTPASSWD_FILE"
chown root:www-data "$HTPASSWD_FILE"

if grep -q "^${USERNAME}:" "$HTPASSWD_FILE" 2>/dev/null; then
    log "Updating password for user: ${USERNAME}"
    htpasswd "$HTPASSWD_FILE" "$USERNAME"
else
    log "Creating password for user: ${USERNAME}"
    if [[ -s "$HTPASSWD_FILE" ]]; then
        htpasswd "$HTPASSWD_FILE" "$USERNAME"
    else
        htpasswd -c "$HTPASSWD_FILE" "$USERNAME"
    fi
fi

log "Password file: ${HTPASSWD_FILE}"
log "Add this inside server { } (listen 443), after server_name:"

cat <<EOF

    # Basic auth (loopback без пароля — для SSR/API с 127.0.0.1)
    set \$auth_basic_realm "${REALM}";
    if (\$remote_addr = 127.0.0.1) { set \$auth_basic_realm off; }
    if (\$remote_addr = "::1") { set \$auth_basic_realm off; }
    auth_basic \$auth_basic_realm;
    auth_basic_user_file ${HTPASSWD_FILE};

    # Исключения (добавьте auth_basic off; в существующие location):
    #   location ^~ /.well-known/acme-challenge/ { auth_basic off; ... }
    #   location = /up { auth_basic off; ... }

EOF

log "Then: sudo nginx -t && sudo systemctl reload nginx"
log "To add another user later: sudo htpasswd ${HTPASSWD_FILE} OTHER_USER"
log "To remove auth: delete the auth_basic* lines from nginx config and reload."
