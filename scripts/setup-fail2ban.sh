#!/usr/bin/env bash
# Setup fail2ban for SSH and nginx on Ubuntu.
# Run on server: sudo /var/www/perfumer-by/scripts/setup-fail2ban.sh

set -Eeuo pipefail

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }

if [[ "$EUID" -ne 0 ]]; then
    warn "This script must be run as root (or with sudo)"
    exit 1
fi

log "Installing fail2ban"
apt-get update >/dev/null
apt-get install -y fail2ban >/dev/null

log "Creating jail configuration"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
# 3 failures in 10 minutes -> ban for 1 hour
findtime  = 10m
maxretry  = 3
bantime   = 1h
backend   = systemd

[sshd]
enabled   = true
port      = ssh
filter    = sshd
logpath   = /var/log/auth.log

[nginx-limit-req]
enabled   = true
port      = http,https
filter    = nginx-limit-req
logpath   = /var/log/nginx/error.log
maxretry  = 10

[nginx-auth]
enabled   = true
port      = http,https
filter    = nginx-auth
logpath   = /var/log/nginx/error.log
maxretry  = 5
EOF

log "Creating nginx-auth filter"
cat > /etc/fail2ban/filter.d/nginx-auth.conf <<'EOF'
[Definition]
failregex = ^ \[error\] \d+#\d+: \*\d+ user "\S+": password mismatch, client: <HOST>,
            ^ \[error\] \d+#\d+: \*\d+ no user/password was provided for basic authentication, client: <HOST>,
ignoreregex =
EOF

log "Restarting fail2ban"
systemctl enable fail2ban
systemctl restart fail2ban

log "Status"
fail2ban-client status

log "Done"
