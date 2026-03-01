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

LOG_FILE="${RADAR_RATE_CYCLE_LOG:-/opt/radar_light/logs/rate_cycle.jsonl}"
mkdir -p "$(dirname "$LOG_FILE")"

start_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "{\"ts\":\"${start_ts}\",\"event\":\"rate_cycle_start\"}" >> "$LOG_FILE"

cd "$ROOT_DIR"
node src/scripts/runOtaIngestion.js || true

HOTELS=$(psql "$DATABASE_URL" -t -A -c "SELECT id FROM hotels WHERE COALESCE(subscription_status, 'active')='active'")
for hotel_id in $HOTELS; do
  curl -s -X POST "http://127.0.0.1:3000/webhook/hotel/${hotel_id}/recalculate?sync=true" \
    -H "Content-Type: application/json" \
    -d '{"trigger":"cron","source":"rate-cycle"}' >/dev/null || true
done

end_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "{\"ts\":\"${end_ts}\",\"event\":\"rate_cycle_end\"}" >> "$LOG_FILE"

