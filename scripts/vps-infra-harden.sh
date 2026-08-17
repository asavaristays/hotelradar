#!/usr/bin/env bash
# Run ON the VPS as deploy. Completes P0 infra hardening.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/hotelradar-direct}"
ETC_DIR="/etc/hotelradar-direct"
ENV_FILE="$ETC_DIR/env"
BACKUP_DIR="/var/backups/hotelradar-direct"
PROJECT="hotelradar-direct"

cd "$APP_DIR"

# --- docker sock helper + reboot permanence ---
chmod +x "$APP_DIR/scripts/"*.sh
"$APP_DIR/scripts/vps-ensure-docker-sock.sh"

# --- secrets outside app tree ---
sudo /bin/mkdir -p "$ETC_DIR"
sudo /bin/mkdir -p "$BACKUP_DIR"
sudo /bin/chown deploy:deploy "$ETC_DIR"
sudo /bin/chown deploy:deploy "$BACKUP_DIR"
sudo /bin/chmod 700 "$ETC_DIR"
sudo /bin/chmod 700 "$BACKUP_DIR"

if [[ -f "$APP_DIR/.env" && ! -f "$ENV_FILE" ]]; then
  cp "$APP_DIR/.env" "$ENV_FILE"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No env source found at $APP_DIR/.env or $ENV_FILE" >&2
  exit 1
fi

# Ensure backup key exists
if ! grep -q '^BACKUP_ENCRYPTION_KEY=' "$ENV_FILE"; then
  KEY="$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)"
  printf '\nBACKUP_ENCRYPTION_KEY=%s\n' "$KEY" >>"$ENV_FILE"
  echo "Generated BACKUP_ENCRYPTION_KEY"
fi

chmod 600 "$ENV_FILE"

# Replace in-tree .env with a pointer (no secrets in app dir)
cat >"$APP_DIR/.env.README" <<EOF
Secrets live at $ENV_FILE
Use: docker-compose -p $PROJECT --env-file $ENV_FILE ...
EOF
if [[ -f "$APP_DIR/.env" ]]; then
  # keep a private backup once, then remove world-readable app copy
  cp "$APP_DIR/.env" "$ETC_DIR/env.migrated-from-appdir"
  chmod 600 "$ETC_DIR/env.migrated-from-appdir"
  rm -f "$APP_DIR/.env"
fi

# Symlink for convenience (compose still prefers explicit --env-file)
ln -sfn "$ENV_FILE" "$APP_DIR/.env"

# Recreate containers with external env file path
docker-compose -p "$PROJECT" -f "$APP_DIR/docker-compose.yml" --env-file "$ENV_FILE" up -d

# --- cron: docker sock @reboot + daily backup 02:15 UTC ---
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR"
touch "$LOG_DIR/docker-sock.log" "$LOG_DIR/backup.log"
chmod 600 "$LOG_DIR/docker-sock.log" "$LOG_DIR/backup.log"

CRON_DOCKER="@reboot sleep 8 && $APP_DIR/scripts/vps-ensure-docker-sock.sh >>$LOG_DIR/docker-sock.log 2>&1"
CRON_BACKUP="15 2 * * * ENV_FILE=$ENV_FILE APP_DIR=$APP_DIR $APP_DIR/scripts/vps-backup-postgres.sh >>$LOG_DIR/backup.log 2>&1"
CRON_HEALTH="*/5 * * * * APP_DIR=$APP_DIR $APP_DIR/scripts/vps-health-monitor.sh >/dev/null 2>&1"

EXISTING="$(crontab -l 2>/dev/null || true)"
{
  echo "$EXISTING" | grep -v 'vps-ensure-docker-sock' | grep -v 'vps-backup-postgres' | grep -v 'vps-health-monitor' || true
  echo "$CRON_DOCKER"
  echo "$CRON_BACKUP"
  echo "$CRON_HEALTH"
} | crontab -

# --- release tag for rollback ---
mkdir -p "$APP_DIR/releases"
TAG="release-$(date -u +%Y%m%dT%H%M%SZ)"
for img in api worker web; do
  docker tag "${PROJECT}_${img}:latest" "${PROJECT}_${img}:${TAG}" || true
done
echo "$TAG" >"$APP_DIR/releases/current"
echo "$TAG" >>"$APP_DIR/releases/history"
echo "Tagged images as $TAG"

# --- verify ---
curl -fsS http://127.0.0.1:4101/healthz
echo
curl -fsS http://127.0.0.1:4101/readyz
echo

# --- first backup + restore drill into temp validation (dump only; restore is manual) ---
"$APP_DIR/scripts/vps-backup-postgres.sh"
LATEST="$(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'direct-*.gpg' -o -name 'direct-*.enc' \) -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"
if [[ -z "$LATEST" ]]; then
  echo "No backup file found after backup step" >&2
  exit 1
fi
echo "latest_backup=$LATEST"

# Decrypt-only drill (does not wipe DB)
TMP="$(mktemp)"
# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a
if [[ "$LATEST" == *.gpg ]]; then
  gpg --batch --yes --decrypt --passphrase "$BACKUP_ENCRYPTION_KEY" -o "$TMP" "$LATEST"
else
  openssl enc -d -aes-256-cbc -pbkdf2 -pass "pass:$BACKUP_ENCRYPTION_KEY" -in "$LATEST" -out "$TMP"
fi
LINES="$(wc -l <"$TMP")"
rm -f "$TMP"
echo "restore_drill_decrypt_ok lines=$LINES"

echo "infra_harden_ok"
crontab -l
