#!/usr/bin/env bash
# Cron-friendly health check for hotelradar-direct.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/hotelradar-direct}"
LOG="${APP_DIR}/logs/health-monitor.log"
API_HEALTH="${API_HEALTH:-http://127.0.0.1:4101/healthz}"
API_READY="${API_READY:-http://127.0.0.1:4101/readyz}"
WEB_HEALTH="${WEB_HEALTH:-http://127.0.0.1:4100/}"

mkdir -p "$(dirname "$LOG")"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

fail() {
  echo "$ts FAIL $*" | tee -a "$LOG" >&2
  exit 1
}

"$APP_DIR/scripts/vps-ensure-docker-sock.sh" >/dev/null 2>&1 || true

curl -fsS "$API_HEALTH" >/dev/null || fail "api_healthz"
curl -fsS "$API_READY" >/dev/null || fail "api_readyz"
curl -fsS -o /dev/null "$WEB_HEALTH" || fail "web"

# container presence
if ! docker-compose -p hotelradar-direct -f "$APP_DIR/docker-compose.yml" \
  --env-file /etc/hotelradar-direct/env ps | grep -q "Up"; then
  fail "compose_not_up"
fi

echo "$ts OK api+web" >>"$LOG"
# keep log small
tail -n 500 "$LOG" >"${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
exit 0
