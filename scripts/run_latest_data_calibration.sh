#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${RADAR_ENV_FILE:-/opt/radar_light/shared/.env}"
LOG_FILE="${RADAR_CALIBRATION_LOG:-/opt/radar_light/logs/latest_data_calibration.jsonl}"
LOCK_FILE="${RADAR_CALIBRATION_LOCK:-/tmp/hotelradar-latest-data-calibration.lock}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

mkdir -p "$(dirname "$LOG_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  printf '{"ts":"%s","event":"calibration_cycle_skipped","reason":"already_running"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG_FILE"
  exit 0
fi

cd "$ROOT_DIR" || exit 1

cycle_status="ok"
completed_steps=0
failed_steps=0
skipped_steps=0

log_event() {
  local event="$1"
  local step="${2:-}"
  local status="${3:-}"
  local detail="${4:-}"
  printf '{"ts":"%s","event":"%s","step":"%s","status":"%s","detail":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$event" "$step" "$status" "$detail" >> "$LOG_FILE"
}

run_step() {
  local step="$1"
  local required="$2"
  local timeout_seconds="$3"
  local retries="$4"
  shift 4

  local attempt=1
  local exit_code=1
  log_event "calibration_step_started" "$step" "running"

  while [[ "$attempt" -le "$retries" ]]; do
    if command -v timeout >/dev/null 2>&1; then
      timeout "${timeout_seconds}s" "$@" && exit_code=0 || exit_code=$?
    else
      "$@" && exit_code=0 || exit_code=$?
    fi

    if [[ "$exit_code" -eq 0 ]]; then
      completed_steps=$((completed_steps + 1))
      log_event "calibration_step_completed" "$step" "ok" "attempt=${attempt}"
      return 0
    fi

    log_event "calibration_step_attempt_failed" "$step" "error" \
      "attempt=${attempt},exit_code=${exit_code}"
    attempt=$((attempt + 1))
  done

  failed_steps=$((failed_steps + 1))
  if [[ "$required" == "required" ]]; then
    cycle_status="failed"
  elif [[ "$cycle_status" == "ok" ]]; then
    cycle_status="partial"
  fi
  log_event "calibration_step_failed" "$step" "$required" "exit_code=${exit_code}"
  return 0
}

skip_step() {
  local step="$1"
  local reason="$2"
  skipped_steps=$((skipped_steps + 1))
  [[ "$cycle_status" == "ok" ]] && cycle_status="partial"
  log_event "calibration_step_skipped" "$step" "skipped" "$reason"
}

log_event "calibration_cycle_started" "all" "running" "real_and_licensed_sources_only"

# Collect current external observations before recalculating derived intelligence.
run_step "event_collection" "optional" "${RADAR_EVENT_COLLECT_TIMEOUT_SEC:-120}" 2 \
  node src/scripts/runEventCollector.js
run_step "event_ingestion" "optional" "${RADAR_EVENT_INGEST_TIMEOUT_SEC:-60}" 2 \
  node src/scripts/runEventIngestion.js
run_step "ota_rate_ingestion" "optional" "${RADAR_OTA_INGEST_TIMEOUT_SEC:-180}" 2 \
  node src/scripts/runOtaIngestion.js
run_step "realtime_signal_capture" "required" "${RADAR_REALTIME_SIGNAL_CAPTURE_TIMEOUT_SEC:-240}" 2 \
  node src/scripts/runRealtimeSignalCapture.js --once

# Property discovery uses the licensed Places connector. Never fall back to a
# tourism registry, CSV import, or synthetic property list.
if [[ -n "${GOOGLE_MAPS_API_KEY:-}" ]]; then
  run_step "independent_property_index" "optional" "${RADAR_PROPERTY_INDEX_TIMEOUT_SEC:-300}" 2 \
    node src/scripts/runMarketHotelIndex.js
else
  skip_step "independent_property_index" "GOOGLE_MAPS_API_KEY_missing"
fi

run_step "market_neighbors" "optional" "${RADAR_NEIGHBOR_INDEX_TIMEOUT_SEC:-180}" 2 \
  node src/scripts/runMarketHotelNeighborIndex.js
run_step "market_intelligence" "required" "${RADAR_MARKET_INTELLIGENCE_TIMEOUT_SEC:-600}" 1 \
  node src/scripts/runDailyMarketIntelligence.js

# Calibrate only from observations already present in the database. Synthetic
# outcome bootstrapping is deliberately excluded from this automation.
run_step "model_calibration" "required" "${RADAR_MODEL_CALIBRATION_TIMEOUT_SEC:-600}" 1 \
  node src/scripts/runNightlyCalibration.js

log_event "calibration_cycle_completed" "all" "$cycle_status" \
  "completed=${completed_steps},failed=${failed_steps},skipped=${skipped_steps}"

[[ "$cycle_status" == "failed" ]] && exit 1
exit 0
