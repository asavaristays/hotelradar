# Radar v3

Enterprise AI Revenue Intelligence foundation for multi-market hotels.

## What is included

- Deterministic intelligence engines with explicit weights
- Mobile-first responsive dashboard (desktop/tablet/mobile)
- Token-based authentication + role-based access control
- Admin management endpoints for states/cities/season profiles/calibration
- Security engine (API key validation, replay protection, recalc rate limiting)
- Compression, narrative, performance, and audit engines
- Frozen dashboard API contract

## Stack

- Backend: Node.js, Express, PostgreSQL (`pg`)
- Frontend: React + Vite
- Tests: Jest + supertest

## Project structure

```text
src/
  config/
  controllers/
  middleware/
  repositories/
  routes/
  services/
    intelligence-engine/
frontend/src/
  components/
  pages/
db/
  migrations/
  seeds/
tests/
```

## Environment

Copy `.env.example` to `.env`:

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql:///radar_light
JWT_SECRET=change-me
AUTH_SECRET=
AUTH_PEPPER=change-me
LOG_LEVEL=info
TOKEN_TTL_MINUTES=720
CORS_ORIGINS=http://localhost:5173
TRUST_PROXY=false
REQUEST_BODY_LIMIT=1mb
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=240
ENABLE_CONSOLE_LOGS=true
LOG_DIR=logs
REQUIRE_API_KEY=false
INTERNAL_API_KEY=radar-internal-key
SCHEMA_CHECK_STRICT=false
MIGRATION_BASELINE_EXISTING=true
RECALC_QUEUE_POLL_MS=2000
RECALC_QUEUE_MAX_ATTEMPTS=3
RECALC_QUEUE_RETRY_BASE_SECONDS=20
RECALC_QUEUE_RETRY_MAX_SECONDS=300
```

## Setup

```bash
cd /Users/manishpurohit/Documents/radar_light
npm install
createdb radar_light
DATABASE_URL=postgresql:///radar_light npm run db:migrate
DATABASE_URL=postgresql:///radar_light npm run db:seed
```

## Run

Backend:

```bash
cd /Users/manishpurohit/Documents/radar_light
npm run dev
```

Queue worker (recommended for beta scale):

```bash
cd /Users/manishpurohit/Documents/radar_light
npm run worker:recalc
```

Frontend:

```bash
cd /Users/manishpurohit/Documents/radar_light/frontend
npm install
npm start
```

Open [http://localhost:5173](http://localhost:5173)

## Health checks

- `GET /health` -> `{ "status": "ok" }`
- `GET /ready` -> DB + calibration + migration readiness

## Production deploy

```bash
cd /Users/manishpurohit/Documents/radar_light
./deploy.sh main
```

This runs pull, install, tests, migrations, frontend build, and PM2 reload. See `PRODUCTION_CHECKLIST.md` for full VPS setup, rollback, and monitoring.

Enable pre-commit checks:

```bash
npm run hooks:install
```

## Seeded login users

- `super_admin@radar.ai` / `Admin@123`
- `admin@radar.ai` / `Admin@123`
- `rohet@radar.ai` / `Hotel@123`
- `mayagarh@radar.ai` / `Hotel@123`
- `jwild@radar.ai` / `Hotel@123`

## API endpoints

Auth:

- `POST /auth/login`
- `POST /auth/forgot-password`
- `GET /auth/me`

Hotel intelligence:

- `GET /hotels`
- `GET /hotel/:id/dashboard`
- `GET /hotel/:id/performance`
- `GET /hotel/:id/competitive-grid`
- `GET /hotel/:id/ota-parity`
- `GET /hotel/:id/data-health`
- `GET /hotel/:id/recalculate-jobs/:jobId`
- `GET /hotel/:id/alerts`
- `POST /hotel/:id/recalculate`
- `POST /webhook/hotel/:id/recalculate`
- `GET /api/executiveInsights`
- `POST /intelligence/normalize-rates`
- `POST /intelligence/market-confidence`
- `POST /intelligence/position-analysis`

Admin (admin/super_admin only):

- `GET /admin/states`
- `GET /admin/cities`
- `GET /admin/season-profiles`
- `GET /admin/holiday-calendars`
- `GET /admin/hotels`
- `POST /admin/states`
- `POST /admin/season-profiles`
- `POST /admin/cities`
- `POST /admin/hotels`
- `PATCH /admin/hotels/:id`
- `PATCH /admin/hotels/:id/user`
- `DELETE /admin/hotels/:id` (super_admin only)
- `PATCH /admin/hotels/:id/subscription`
- `GET /admin/usage`
- `GET /admin/password-reset-requests`
- `POST /admin/password-reset-requests/:id/resolve`
- `GET /admin/calibration`
- `PUT /admin/calibration`
- `POST /admin/calibration/outcomes-csv` (CSV ingest for real outcomes)
- `POST /admin/alerts/:id/feedback` (label alert as useful/noise/ignore)
- `POST /admin/calibration/run-city` (deterministic city calibration + governed canary rollout)
- `POST /admin/calibration/run-nightly` (run governed calibration for all active cities)
- `GET /admin/calibration/runs` (calibration run history)
- `GET /admin/calibration/canary-hotels` (current canary overrides)
- `PATCH /admin/calibration/canary-hotels/:id` (manual per-hotel canary override)
- `GET /admin/audit-logs`

## Frozen dashboard contract

`GET /hotel/:id/dashboard`

```json
{
  "hotelId": "55555555-5555-4555-8555-555555555555",
  "city": "Jodhpur",
  "seasonProfile": "Heritage Desert",
  "demandScore": 59.31,
  "demandLevel": "Moderate",
  "confidence": { "level": "High", "score": 91, "factors": ["Strong competitor consistency"] },
  "marketStability": { "status": "Stable", "volatilityScore": 34.9 },
  "compression": {
    "scarcityScore": 72.11,
    "priceDispersion": 12.6,
    "roomsBelowMarketAvgPct": 50,
    "compressionLevel": "High",
    "priceVacuumDetected": true,
    "opportunityBand": { "min": 11500, "max": 12700 },
    "reason": "High compression with 50% inventory below market average."
  },
  "suggestedPricing": {
    "base": 15550,
    "bands": {
      "safe": { "min": 15100, "max": 16000 },
      "aggressive": { "min": 16000, "max": 16800 },
      "premium": { "min": 11200, "max": 12400 }
    },
    "riskLevel": "Medium",
    "marketHeat": 3
  },
  "marketPosition": { "hotelPrice": 17595, "marketAvg": 11811.75, "positionPct": 48.96 },
  "otaParity": {
    "hotelPrice": 17595,
    "parityThresholdPct": 2,
    "alertThresholdPct": 5,
    "summary": { "inParity": 1, "underpriced": 1, "overpriced": 1, "maxAbsGapPct": 7.8, "alertTriggered": true },
    "rows": [
      { "channel": "Booking.com", "otaPrice": 16950, "gapPct": 3.8, "status": "Overpriced vs OTA", "estimated": false, "source": "scraped" }
    ]
  },
  "signalBreakdown": {
    "competitorMomentum": 2.83,
    "holidayImpact": 4.03,
    "airfareImpact": 0.05,
    "seasonImpact": 2.4
  },
  "forwardCurve": [{ "date": "2026-02-25", "score": 61.71 }],
  "narrative": {
    "summary": "Demand is Moderate (59.31) with high compression and stable market stability.",
    "marketStory": "Primary driver is holidayImpact; season profile 'Heritage Desert' is active for the current window.",
    "pricingRationale": "Hotel is 48.96% versus market average. Suggested base price is ₹15550 with risk marked Medium.",
    "actionGuidance": "Prioritize controlled rate correction and monitor pickup response daily."
  },
  "alerts": ["HIGH: Hotel is 48.96% vs market average."],
  "performanceSummary": {
    "directionAccuracy": 0,
    "alertPrecision": 0,
    "positionImprovementPct": 0,
    "rollingAccuracy30d": 0,
    "stabilityDeviation": 0,
    "sampleSize": 0,
    "updatedAt": null
  },
  "viewerRole": "super_admin",
  "lastScrapedAt": "2026-02-26T01:20:10.000Z",
  "lastUpdated": "2026-02-25T18:36:13.000Z"
}
```

## n8n webhook example

```bash
curl -X POST "http://localhost:3000/webhook/hotel/55555555-5555-4555-8555-555555555555/recalculate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: radar-internal-key" \
  -H "x-request-id: recalc-20260226-001" \
  -d '{"trigger":"daily_cron","source":"n8n"}'
```

Async queue behavior:

- `POST /hotel/:id/recalculate` returns `202` with `jobId` by default.
- Poll status via `GET /hotel/:id/recalculate-jobs/:jobId`.
- Use sync fallback only when needed: `POST /hotel/:id/recalculate?sync=true`.

## Deterministic market intelligence utilities

1. Normalize competitor raw rates:

```bash
curl -X POST "http://localhost:3000/intelligence/normalize-rates" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "rows":[
      {
        "hotel_name":"Hotel A",
        "date":"2026-02-25",
        "room_category":"Deluxe",
        "list_of_rates":[{"rate":12000,"includes_tax":true,"tax_percent":12,"rate_type":"BAR"}],
        "cancellation_type":"Free cancellation",
        "source":"booking"
      }
    ]
  }'
```

Response format:

```json
[
  {
    "hotel": "Hotel A",
    "date": "2026-02-25",
    "room_type": "Deluxe",
    "normalized_rate": 10714,
    "source_count": 1,
    "outlier_flag": false
  }
]
```

2. Compute market confidence index:

```bash
curl -X POST "http://localhost:3000/intelligence/market-confidence" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "date":"2026-02-25",
    "normalized_rate":10714,
    "source_count":3,
    "consistency_score":80,
    "cancellation_match":1,
    "freshness_hours":12
  }'
```

Response format:

```json
{
  "date": "2026-02-25",
  "market_confidence": "Medium",
  "confidence_score": 76.75
}
```

3. Position analysis (confidence-adjusted):

```bash
curl -X POST "http://localhost:3000/intelligence/position-analysis" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "hotel":"Hotel A",
    "hotelRates":[{"date":"2026-01-10","rate":100},{"date":"2026-02-10","rate":140}],
    "competitorNormalizedRates":[{"date":"2026-01-10","normalized_rate":100},{"date":"2026-02-10","normalized_rate":100}],
    "marketConfidenceIndex":[{"date":"2026-01-10","market_confidence":"High","confidence_score":90},{"date":"2026-02-10","market_confidence":"Low","confidence_score":40}]
  }'
```

Response format:

```json
{
  "hotel": "Hotel A",
  "date_range": "2026-01-10 to 2026-02-10",
  "position_percent": 20,
  "confidence": "Low",
  "recommendation": "Over market with low confidence. Hold for 24h and reduce 5-8% if parity gap persists.",
  "quarterly_trend": [
    { "quarter": "2026-Q1", "avg_position_percent": 10 }
  ],
  "anomalies": [
    { "date": "2026-02-10", "type": "extreme_position", "message": "Position deviation 40% vs market median." }
  ]
}
```

## Fast-track accuracy workflow

1. Upload outcomes CSV (daily):

```bash
curl -X POST "http://localhost:3000/admin/calibration/outcomes-csv?city=Goa" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: text/csv" \
  --data-binary @outcomes_goa.csv
```

CSV headers supported:
`hotel_id` or `hotel_name`, `city`, `date` (or `outcome_date`), `actual_adr`, `occupancy_pct`, `pickup_rooms`

2. Label alerts (useful/noise):

```bash
curl -X POST "http://localhost:3000/admin/alerts/<alert-id>/feedback" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"feedback":"useful","note":"Aligned with weekend spike."}'
```

3. Run city calibration (manual):

```bash
curl -X POST "http://localhost:3000/admin/calibration/run-city" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"city":"Goa","days":14}'
```

4. Nightly calibration job:

```bash
cd /Users/manishpurohit/Documents/radar_light
npm run calibration:nightly
```

`run-city` now applies calibrated weights only to governed canary hotels and persists a new `model_versions` record.

## Controlled fast-track governance

Fast-track calibration remains nightly and adaptive, but mutations are now guarded:

- Weight delta clamp per run: `calibration.maxWeightDelta` (default `0.05`)
- Minimum validated outcomes gate: `calibration.minOutcomeThreshold` (default `8`)
- Canary-only rollout cap: `calibration.maxCanaryPercentage` (default `0.2`)
- Auto-revert guardrail: `calibration.revertAccuracyDropThreshold` (default `0.05`)

Runtime behavior:

1. Compute `proposed_weights` from deterministic metrics.
2. Clamp each weight delta against current values.
3. Apply only to stable canary hotels in that city (no city-wide auto mutation).
4. Track rolling 7-day directional accuracy.
5. Auto-revert to previous version if drop exceeds threshold.
6. Persist full run logs and model version records.

Model version lifecycle:

- `model_versions.status = canary` when rollout starts
- `model_versions.status = reverted` when guardrail trips
- previous version remains available for deterministic rollback

Example calibration run log payload (stored in `calibration_runs`):

```json
{
  "scope_type": "city",
  "scope_value": "Goa",
  "status": "completed",
  "old_weights": { "competitor_weight": 0.45, "holiday_weight": 0.25, "airfare_weight": 0.2, "season_weight": 0.1 },
  "proposed_weights": { "competitor_weight": 0.472, "holiday_weight": 0.258, "airfare_weight": 0.178, "season_weight": 0.092 },
  "clamped_weights": { "competitor_weight": 0.472, "holiday_weight": 0.258, "airfare_weight": 0.178, "season_weight": 0.092 },
  "applied_weights": { "competitor_weight": 0.472, "holiday_weight": 0.258, "airfare_weight": 0.178, "season_weight": 0.092 },
  "outcome_sample_size": 14,
  "version_created": true,
  "revert_flag": false,
  "accuracy_before": 71.2,
  "accuracy_after": 72.0
}
```

## Mobile responsive design behavior

- Mobile-first stacked layout
- Competitive grid as expandable cards on mobile
- Core metrics first, advanced analytics collapsible
- Responsive chart rendering for 375/480/768/1024/1440 breakpoints

## Premium UI/UX system artifacts

- Color + spacing + typography tokens:
  - `/Users/manishpurohit/Documents/radar_light/frontend/src/theme.tokens.js`
- Component hierarchy:
  - `/Users/manishpurohit/Documents/radar_light/frontend/docs/component-hierarchy.md`
- Storybook blueprint examples:
  - `/Users/manishpurohit/Documents/radar_light/frontend/docs/storybook-examples.md`
  - `/Users/manishpurohit/Documents/radar_light/frontend/src/stories.RadarDashboard.stories.jsx`
- Mock dashboard JSON for design/dev:
  - `/Users/manishpurohit/Documents/radar_light/frontend/docs/dashboard.mock.json`
- Visual snapshot checklist:
  - `/Users/manishpurohit/Documents/radar_light/frontend/docs/ui-visual-test-checklist.md`

## Executive Insights modules (SPI + Revenue Simulation + Forecast Accuracy)

Example mock input data:

```json
{
  "positionPercent": -12.5,
  "confidenceScore": 84,
  "demandScore": 68,
  "volatilityScore": 31,
  "compressionScore": 72,
  "currentADR": 9200,
  "competitorMedian": 9800,
  "demand7": 70,
  "demand14": 65,
  "demand30": 58
}
```

## Property Data Health (role-based rollout)

Data health is now exposed for every hotel and auto-synced during dashboard/recalculate flows.

- Endpoint: `GET /hotel/:id/data-health`
- Hotel user: client-safe summary only (`statuses`, `knownIssues`, `resolvedRecently`, `issueCounts`)
- Admin/super admin: full diagnostics (thresholds, raw metrics, and full issue timeline metadata)

Issue lifecycle is deterministic:

1. Mismatch detected => issue status `open`
2. Subsequent healthy snapshot => issue status `resolved`
3. Future mismatch again => same issue re-opened (`reopen_count` increments)

Tracked dimensions include:

- OTA parity mismatch
- stale competitor scrape
- missing competitor/airfare signal coverage
- low confidence
- low rolling forecast accuracy
- high volatility error

Run migration once before using data health endpoint:

```bash
cd /Users/manishpurohit/Documents/radar_light
DATABASE_URL=postgresql:///radar_light npm run db:migrate
```

API usage:

```bash
curl -G "http://localhost:3000/api/executiveInsights" \
  -H "Authorization: Bearer <TOKEN>" \
  --data-urlencode "positionPercent=-12.5" \
  --data-urlencode "confidenceScore=84" \
  --data-urlencode "demandScore=68" \
  --data-urlencode "volatilityScore=31" \
  --data-urlencode "compressionScore=72" \
  --data-urlencode "currentADR=9200" \
  --data-urlencode "competitorMedian=9800" \
  --data-urlencode "demand7=70" \
  --data-urlencode "demand14=65" \
  --data-urlencode "demand30=58" \
  --data-urlencode "roomNights=120"
```

Response shape:

```json
{
  "spiScore": 77.28,
  "spiCategory": "Strong Advantage",
  "revenueScenarios": [
    {
      "scenario": "Maintain price",
      "projectedADR": 9200,
      "projectedRevenue": 818114.94,
      "volatilityAdjustment": 0.957
    },
    {
      "scenario": "+2% price",
      "projectedADR": 9384,
      "projectedRevenue": 815410.12,
      "volatilityAdjustment": 0.957
    },
    {
      "scenario": "-2% price",
      "projectedADR": 9016,
      "projectedRevenue": 814422.56,
      "volatilityAdjustment": 0.957
    }
  ],
  "forecastAccuracy": {
    "forecastPeriod": "rolling_30d",
    "accuracyPercentage": 66.67,
    "averageError": 13.5,
    "forecastHitRate": 66.67,
    "forecastErrorMargin": 13.5
  }
}
```

## Tests

```bash
cd /Users/manishpurohit/Documents/radar_light
npm test
npm run test:contract
npm run test:coverage
```

`test:contract` is the release gate for the frozen dashboard API response schema.
