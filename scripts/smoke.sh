#!/usr/bin/env bash
set -euo pipefail
API="${API_BASE:-http://127.0.0.1:4101}"

echo "== healthz =="
curl -fsS "$API/healthz" | tee /tmp/direct-health.json
echo
echo "== readyz =="
curl -fsS "$API/readyz" | tee /tmp/direct-ready.json
echo
echo "== create opportunity =="
CREATE=$(curl -fsS -X POST "$API/api/v1/opportunities" \
  -H 'content-type: application/json' \
  -d '{
    "name": "Smoke Traveller",
    "mobile": "+919800011122",
    "consent_version": "2026-08-08",
    "consent": true,
    "requested_area": "Candolim",
    "check_in": "2026-09-10",
    "check_out": "2026-09-13",
    "rooms": 1,
    "adults": 2,
    "children": 0,
    "public_rate_paise": 1200000,
    "referral_code": "DIRECT-TEST-01"
  }')
echo "$CREATE" | tee /tmp/direct-create.json
TOKEN=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["public_token"])' <<<"$CREATE")
OPP=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["external_opportunity_id"])' <<<"$CREATE")
echo
echo "== fetch by token =="
curl -fsS "$API/api/v1/opportunities/by-token/$TOKEN" | tee /tmp/direct-by-token.json
echo
echo "== asavari contract =="
curl -fsS "$API/api/v1/integrations/asavari/contract" | tee /tmp/direct-asavari.json
echo
echo "OK opportunity=$OPP token=$TOKEN"
