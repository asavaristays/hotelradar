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

run_with_timeout_and_retry() {
  local timeout_seconds="$1"
  local retries="$2"
  local step_name="$3"
  shift 3

  local max_attempts="$retries"
  if ! [[ "$max_attempts" =~ ^[0-9]+$ ]]; then
    max_attempts=1
  fi
  if [[ "$max_attempts" -lt 1 ]]; then
    max_attempts=1
  fi
  local attempt=1
  local status=1

  while [[ "$attempt" -le "$max_attempts" ]]; do
    if command -v timeout >/dev/null 2>&1; then
      timeout "${timeout_seconds}s" "$@" && status=0 || status=$?
    else
      "$@" && status=0 || status=$?
    fi

    if [[ "$status" -eq 0 ]]; then
      return 0
    fi

    local fail_ts
    fail_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "{\"ts\":\"${fail_ts}\",\"event\":\"rate_cycle_step_failed\",\"step\":\"${step_name}\",\"attempt\":${attempt},\"status\":${status}}" >> "$LOG_FILE"

    if [[ "$attempt" -lt "$max_attempts" ]]; then
      sleep $((attempt * 2))
    fi
    attempt=$((attempt + 1))
  done

  return "$status"
}

LOG_FILE="${RADAR_RATE_CYCLE_LOG:-/opt/radar_light/logs/rate_cycle.jsonl}"
mkdir -p "$(dirname "$LOG_FILE")"

cycle_status="ok"

log_cycle_end() {
  local status="$1"
  local end_ts
  end_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "{\"ts\":\"${end_ts}\",\"event\":\"rate_cycle_end\",\"status\":\"${status}\"}" >> "$LOG_FILE"
}

handle_interrupt() {
  cycle_status="interrupted"
  exit 130
}

trap handle_interrupt INT TERM
trap '[[ "$cycle_status" == "ok" && $? -ne 0 ]] && cycle_status="error"; log_cycle_end "$cycle_status"' EXIT

start_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "{\"ts\":\"${start_ts}\",\"event\":\"rate_cycle_start\"}" >> "$LOG_FILE"

cd "$ROOT_DIR"
if ! run_with_timeout_and_retry "${RADAR_EVENT_COLLECT_TIMEOUT_SEC:-90}" "${RADAR_EVENT_COLLECT_RETRIES:-2}" "event_collect" node src/scripts/runEventCollector.js; then
  cycle_status="partial"
fi
if ! run_with_timeout_and_retry "${RADAR_EVENT_INGEST_TIMEOUT_SEC:-45}" "${RADAR_EVENT_INGEST_RETRIES:-2}" "event_ingest" node src/scripts/runEventIngestion.js; then
  cycle_status="partial"
fi
if ! run_with_timeout_and_retry "${RADAR_OTA_INGEST_TIMEOUT_SEC:-90}" "${RADAR_OTA_INGEST_RETRIES:-2}" "ota_ingest" node src/scripts/runOtaIngestion.js; then
  cycle_status="partial"
fi

OUTCOME_BOOTSTRAP_ENABLED="${RADAR_OUTCOME_BOOTSTRAP_ENABLED:-true}"
if [[ "$OUTCOME_BOOTSTRAP_ENABLED" =~ ^([Tt][Rr][Uu][Ee]|1|[Yy][Ee][Ss]|[Oo][Nn])$ ]]; then
  BOOTSTRAP_STAMP_FILE="${RADAR_OUTCOME_BOOTSTRAP_STAMP_FILE:-/opt/radar_light/shared/.outcome_bootstrap_last_utc_date}"
  mkdir -p "$(dirname "$BOOTSTRAP_STAMP_FILE")"
  today_utc="$(date -u +%Y-%m-%d)"
  last_bootstrap_date="$(cat "$BOOTSTRAP_STAMP_FILE" 2>/dev/null || true)"
  if [[ "$today_utc" != "$last_bootstrap_date" ]]; then
    if run_with_timeout_and_retry "${RADAR_OUTCOME_BOOTSTRAP_TIMEOUT_SEC:-60}" "${RADAR_OUTCOME_BOOTSTRAP_RETRIES:-2}" "outcome_bootstrap" node src/scripts/runOutcomeBootstrap.js; then
      printf '%s\n' "$today_utc" > "$BOOTSTRAP_STAMP_FILE"
    else
      cycle_status="partial"
    fi
  fi
fi

HOTELS=$(PGOPTIONS='-c statement_timeout=10000' psql "$DATABASE_URL" -t -A -c "SELECT id FROM hotels WHERE COALESCE(subscription_status, 'active')='active'")
RECALC_RETRIES="${RADAR_RECALC_RETRIES:-2}"
for hotel_id in $HOTELS; do
  attempt=1
  recalc_ok=0
  while [[ "$attempt" -le "$RECALC_RETRIES" ]]; do
    if curl -s --connect-timeout 3 --max-time "${RADAR_RECALC_CURL_TIMEOUT_SEC:-20}" -X POST "http://127.0.0.1:3000/webhook/hotel/${hotel_id}/recalculate?sync=true" \
      -H "Content-Type: application/json" \
      -d '{"trigger":"cron","source":"rate-cycle"}' >/dev/null; then
      recalc_ok=1
      break
    fi
    if [[ "$attempt" -lt "$RECALC_RETRIES" ]]; then
      sleep $attempt
    fi
    attempt=$((attempt + 1))
  done
  if [[ "$recalc_ok" -ne 1 ]]; then
    cycle_status="partial"
    fail_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "{\"ts\":\"${fail_ts}\",\"event\":\"rate_cycle_step_failed\",\"step\":\"recalculate\",\"hotel_id\":\"${hotel_id}\",\"attempts\":${RECALC_RETRIES}}" >> "$LOG_FILE"
  fi
done
