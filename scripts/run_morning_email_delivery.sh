#!/usr/bin/env bash
set -Eeuo pipefail

RADAR_EMAIL_APP_DIR="${RADAR_EMAIL_APP_DIR:-/opt/radar_light}"
RADAR_EMAIL_STAY_DATE="${RADAR_EMAIL_STAY_DATE:-$(TZ=Asia/Kolkata date +%F)}"
RADAR_EMAIL_LIMIT="${RADAR_EMAIL_LIMIT:-500}"
RADAR_EMAIL_LOCK_FILE="${RADAR_EMAIL_LOCK_FILE:-/tmp/hotelradar-morning-email-delivery.lock}"

cd "$RADAR_EMAIL_APP_DIR"
mkdir -p logs

exec 9>"$RADAR_EMAIL_LOCK_FILE"
if ! flock -n 9; then
  echo "morning_email_delivery_skipped: another run is active"
  exit 0
fi

echo "morning_email_delivery_started $(date -u +%FT%TZ)"
echo "stay_date=$RADAR_EMAIL_STAY_DATE limit=$RADAR_EMAIL_LIMIT"

npm run briefs:morning -- \
  --channel email \
  --stay-date "$RADAR_EMAIL_STAY_DATE" \
  --limit "$RADAR_EMAIL_LIMIT"

echo "morning_email_delivery_completed $(date -u +%FT%TZ)"
