#!/usr/bin/env bash
# Restore an encrypted Direct Postgres dump into the running compose DB.
# Usage: vps-restore-postgres.sh /var/backups/hotelradar-direct/direct-XXXX.sql.gpg
set -euo pipefail

ENC_FILE="${1:-}"
PROJECT="${COMPOSE_PROJECT:-hotelradar-direct}"
APP_DIR="${APP_DIR:-/var/www/hotelradar-direct}"
ENV_FILE="${ENV_FILE:-/etc/hotelradar-direct/env}"

if [[ -z "$ENC_FILE" || ! -f "$ENC_FILE" ]]; then
  echo "Usage: $0 <encrypted-dump.gpg|.enc>" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  echo "BACKUP_ENCRYPTION_KEY not set" >&2
  exit 1
fi

"$APP_DIR/scripts/vps-ensure-docker-sock.sh"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if [[ "$ENC_FILE" == *.gpg ]]; then
  gpg --batch --yes --decrypt --passphrase "$BACKUP_ENCRYPTION_KEY" -o "$TMP" "$ENC_FILE"
else
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -pass "pass:$BACKUP_ENCRYPTION_KEY" \
    -in "$ENC_FILE" -out "$TMP"
fi

echo "Restoring into ${POSTGRES_DB:-hotelradar_direct} (destructive for that DB)..."
docker-compose -p "$PROJECT" -f "$APP_DIR/docker-compose.yml" --env-file "$ENV_FILE" \
  exec -T postgres psql -U "${POSTGRES_USER:-direct}" -d "${POSTGRES_DB:-hotelradar_direct}" <"$TMP"

echo "restore_ok"
curl -fsS http://127.0.0.1:4101/readyz
echo
