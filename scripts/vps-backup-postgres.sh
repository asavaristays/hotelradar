#!/usr/bin/env bash
# Encrypted logical backup of hotelradar-direct Postgres.
# Writes to BACKUP_DIR (default /var/backups/hotelradar-direct).
set -euo pipefail

PROJECT="${COMPOSE_PROJECT:-hotelradar-direct}"
APP_DIR="${APP_DIR:-/var/www/hotelradar-direct}"
ENV_FILE="${ENV_FILE:-/etc/hotelradar-direct/env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/hotelradar-direct}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  echo "BACKUP_ENCRYPTION_KEY not set in $ENV_FILE" >&2
  exit 1
fi

"$APP_DIR/scripts/vps-ensure-docker-sock.sh"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RAW="$BACKUP_DIR/direct-${STAMP}.sql"
ENC="$RAW.gpg"

# Prefer gpg symmetric; fallback to openssl enc
docker-compose -p "$PROJECT" -f "$APP_DIR/docker-compose.yml" --env-file "$ENV_FILE" \
  exec -T postgres pg_dump -U "${POSTGRES_USER:-direct}" -d "${POSTGRES_DB:-hotelradar_direct}" \
  --clean --if-exists --no-owner >"$RAW"

if command -v gpg >/dev/null 2>&1; then
  gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase "$BACKUP_ENCRYPTION_KEY" \
    -o "$ENC" "$RAW"
else
  ENC="$RAW.enc"
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -pass "pass:$BACKUP_ENCRYPTION_KEY" \
    -in "$RAW" -out "$ENC"
fi

rm -f "$RAW"
chmod 600 "$ENC"

# prune
find "$BACKUP_DIR" -type f \( -name '*.gpg' -o -name '*.enc' \) -mtime +"$RETENTION_DAYS" -delete

echo "backup_ok file=$ENC size=$(wc -c <"$ENC")"
