#!/usr/bin/env bash
set -Eeuo pipefail

RADAR_PUBLIC_MARKET_APP_DIR="${RADAR_PUBLIC_MARKET_APP_DIR:-/opt/radar_light}"
RADAR_PUBLIC_MARKET_HOTEL_NAME="${RADAR_PUBLIC_MARKET_HOTEL_NAME:-The Ten Resort Siolim Goa}"
RADAR_PUBLIC_MARKET_CITY="${RADAR_PUBLIC_MARKET_CITY:-Goa}"
RADAR_PUBLIC_MARKET_SLUG="${RADAR_PUBLIC_MARKET_SLUG:-the-ten}"
RADAR_PUBLIC_MARKET_ALL_HOTELS="${RADAR_PUBLIC_MARKET_ALL_HOTELS:-true}"
RADAR_PUBLIC_MARKET_LIMIT="${RADAR_PUBLIC_MARKET_LIMIT:-}"
RADAR_PUBLIC_MARKET_BASE_DIR="${RADAR_PUBLIC_MARKET_BASE_DIR:-/opt/radar_light/shared/live_sources}"
RADAR_PUBLIC_MARKET_HORIZON_DAYS="${RADAR_PUBLIC_MARKET_HORIZON_DAYS:-15}"
RADAR_PUBLIC_MARKET_START_DATE="${RADAR_PUBLIC_MARKET_START_DATE:-$(TZ=Asia/Kolkata date +%F)}"
RADAR_PUBLIC_MARKET_LOCK_FILE="${RADAR_PUBLIC_MARKET_LOCK_FILE:-/tmp/hotelradar-public-market-daily.lock}"

cd "$RADAR_PUBLIC_MARKET_APP_DIR"

mkdir -p logs "$RADAR_PUBLIC_MARKET_BASE_DIR"

exec 9>"$RADAR_PUBLIC_MARKET_LOCK_FILE"
if ! flock -n 9; then
  echo "public_market_daily_skipped: another run is active"
  exit 0
fi

echo "public_market_daily_started $(date -u +%FT%TZ)"
echo "all_hotels=$RADAR_PUBLIC_MARKET_ALL_HOTELS hotel=$RADAR_PUBLIC_MARKET_HOTEL_NAME city=$RADAR_PUBLIC_MARKET_CITY start_date=$RADAR_PUBLIC_MARKET_START_DATE horizon_days=$RADAR_PUBLIC_MARKET_HORIZON_DAYS"

capture_args=(
  --base-dir "$RADAR_PUBLIC_MARKET_BASE_DIR"
  --start-date "$RADAR_PUBLIC_MARKET_START_DATE"
  --horizon-days "$RADAR_PUBLIC_MARKET_HORIZON_DAYS"
)

if [[ "$RADAR_PUBLIC_MARKET_ALL_HOTELS" == "true" || "$RADAR_PUBLIC_MARKET_ALL_HOTELS" == "1" || "$RADAR_PUBLIC_MARKET_ALL_HOTELS" == "yes" ]]; then
  capture_args+=(--all-hotels)
  if [[ -n "$RADAR_PUBLIC_MARKET_LIMIT" ]]; then
    capture_args+=(--limit "$RADAR_PUBLIC_MARKET_LIMIT")
  fi
else
  mkdir -p "$RADAR_PUBLIC_MARKET_BASE_DIR/$RADAR_PUBLIC_MARKET_SLUG"
  npm run sources:provision-feed-pack -- \
    --hotel-name "$RADAR_PUBLIC_MARKET_HOTEL_NAME" \
    --city "$RADAR_PUBLIC_MARKET_CITY" \
    --slug "$RADAR_PUBLIC_MARKET_SLUG" \
    --base-dir "$RADAR_PUBLIC_MARKET_BASE_DIR"

  capture_args+=(
    --hotel-name "$RADAR_PUBLIC_MARKET_HOTEL_NAME"
    --city "$RADAR_PUBLIC_MARKET_CITY"
    --slug "$RADAR_PUBLIC_MARKET_SLUG"
  )

  tariff_snapshot="$RADAR_PUBLIC_MARKET_BASE_DIR/$RADAR_PUBLIC_MARKET_SLUG/tariff-snapshot.json"
  demand_snapshot="$RADAR_PUBLIC_MARKET_BASE_DIR/$RADAR_PUBLIC_MARKET_SLUG/demand-snapshot.json"

  if [[ -s "$tariff_snapshot" ]]; then
    capture_args+=(--tariff-snapshot-file "$tariff_snapshot")
  fi

  if [[ -s "$demand_snapshot" ]]; then
    capture_args+=(--demand-snapshot-file "$demand_snapshot")
  fi
fi

npm run ingestion:public-market-capture -- "${capture_args[@]}"
npm run ingestion:realtime-signals -- --force-sources

echo "public_market_daily_completed $(date -u +%FT%TZ)"
