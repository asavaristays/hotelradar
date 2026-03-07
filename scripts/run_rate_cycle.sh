#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${RADAR_ENV_FILE:-/opt/radar_light/shared/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-5}"

run_with_timeout() {
  local timeout_seconds="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "${timeout_seconds}s" "$@" || true
  else
    "$@" || true
  fi
}

LOG_FILE="${RADAR_RATE_CYCLE_LOG:-/opt/radar_light/logs/rate_cycle.jsonl}"
mkdir -p "$(dirname "$LOG_FILE")"

start_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "{\"ts\":\"${start_ts}\",\"event\":\"rate_cycle_start\"}" >> "$LOG_FILE"

cd "$ROOT_DIR"
run_with_timeout "${RADAR_EVENT_COLLECT_TIMEOUT_SEC:-90}" node src/scripts/runEventCollector.js
run_with_timeout "${RADAR_EVENT_INGEST_TIMEOUT_SEC:-45}" node src/scripts/runEventIngestion.js
run_with_timeout "${RADAR_OTA_INGEST_TIMEOUT_SEC:-90}" node src/scripts/runOtaIngestion.js

HOTELS=$(PGOPTIONS='-c statement_timeout=10000' psql "$DATABASE_URL" -t -A -c "SELECT id FROM hotels WHERE COALESCE(subscription_status, 'active')='active'")
for hotel_id in $HOTELS; do
  curl -s --connect-timeout 3 --max-time "${RADAR_RECALC_CURL_TIMEOUT_SEC:-20}" -X POST "http://127.0.0.1:3000/webhook/hotel/${hotel_id}/recalculate?sync=true" \
    -H "Content-Type: application/json" \
    -d '{"trigger":"cron","source":"rate-cycle"}' >/dev/null || true
done

end_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "{\"ts\":\"${end_ts}\",\"event\":\"rate_cycle_end\"}" >> "$LOG_FILE"
