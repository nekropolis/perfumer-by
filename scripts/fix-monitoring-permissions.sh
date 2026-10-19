#!/usr/bin/env bash
# Allow cron (deploy) and php-fpm (www-data) to write LogErrorTracker state.
# Run: sudo /var/www/perfumer-by/scripts/fix-monitoring-permissions.sh

set -Eeuo pipefail

DIR=/var/www/perfumer-by/backend/storage/app/monitoring
FILE="$DIR/log-error-state.json"

[[ "$EUID" -eq 0 ]] || { echo "Run as root: sudo $0" >&2; exit 1; }

mkdir -p "$DIR"
chown -R www-data:www-data "$DIR"
chmod 2775 "$DIR"
[[ -f "$FILE" ]] && chmod 664 "$FILE"
usermod -aG www-data deploy 2>/dev/null || true

# Immediate ACL so deploy can write without re-login.
if command -v setfacl >/dev/null; then
  setfacl -m u:deploy:rwx "$DIR"
  setfacl -d -m u:deploy:rwx "$DIR"
  [[ -f "$FILE" ]] && setfacl -m u:deploy:rw "$FILE"
fi

# Smoke as deploy
sudo -u deploy bash -c "echo test > '$DIR/.write_test' && rm -f '$DIR/.write_test'" \
  && echo "OK: deploy can write $DIR" \
  || echo "WARN: deploy still cannot write (new login may be needed for group www-data)"

ls -la "$DIR"
