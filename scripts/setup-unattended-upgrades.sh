#!/usr/bin/env bash
# Setup unattended security upgrades on Ubuntu.
# Run on server: sudo /var/www/perfumer-by/scripts/setup-unattended-upgrades.sh

set -Eeuo pipefail

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }

if [[ "$EUID" -ne 0 ]]; then
    warn "This script must be run as root (or with sudo)"
    exit 1
fi

log "Installing unattended-upgrades"
apt-get update >/dev/null
apt-get install -y unattended-upgrades apt-listchanges >/dev/null

log "Enabling automatic security updates"
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Package-Blacklist {
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::InstallOnShutdown "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
Unattended-Upgrade::Verbose "0";
Unattended-Upgrade::SyslogEnable "true";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

log "Restarting unattended-upgrades"
systemctl enable unattended-upgrades
systemctl restart unattended-upgrades

log "Dry-run unattended-upgrade"
unattended-upgrade --dry-run

log "Done"
