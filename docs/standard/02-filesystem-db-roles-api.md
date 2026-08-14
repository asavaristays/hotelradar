# File system, database, roles, permissions, and API

## Source locations

Local source:

```text
/Users/manishpurohit/Documents/radar_light
```

Production source:

```text
/opt/radar_light
```

Production URL:

```text
https://revenue.hotelradar.in
```

## Important folders

```text
src/
  app.js
  config/
  controllers/
  middleware/
  repositories/
  routes/
  scripts/
  services/

frontend/
  src/
  dist/

db/
  migrations/
  seeds/

docs/
  standard/

tests/
```

## Important services

- `src/services/centralIntelligenceService.js`: approved action and confidence contract.
- `src/services/marketDemandService.js`: compatibility wrapper; should not make independent final decisions.
- `src/services/revenueIntelligenceWorkingModelService.js`: client-facing Revenue Intelligence model.
- `src/services/revenueIntelligenceInsightNarrativeService.js`: market read, hotel gap, commercial action, digital asset watch narrative.
- `src/services/revenueIntelligenceDeliveryService.js`: delivery orchestration.
- `src/services/revenueIntelligencePdfService.js`: PDF generation.
- `src/services/emailDeliveryService.js`: SMTP email sending.
- `src/services/manualSignalInputService.js`: manual verified signal capture.
- `src/services/phaseOneMarketIntelligenceSeed.js`: pilot signal seed.

## Database migration rules

- Do not delete migration files.
- Add schema changes through new numbered migration files only.
- Use additive changes for beta when possible.
- Preserve historical delivery rows and observations.
- Use cleanup scripts for targeted data retirement, not manual broad deletes.

Recent important migrations:

- `044_property_research.sql`
- `045_realtime_signal_capture.sql`
- `046_central_intelligence_action_contract.sql`
- `047_revenue_intelligence_delivery_loop.sql`
- `048_revenue_intelligence_email_delivery.sql`

## Core tables

Indicative table areas:

- hotels and hotel users;
- cities, states, season profiles;
- hotel rate snapshots;
- competitor rates;
- OTA / channel observations;
- realtime signal observations;
- city events and holidays;
- airfare/search-style data;
- market hotels and market signals;
- revenue intelligence delivery rows;
- feedback/status rows.

## Roles

Defined roles:

- `super_admin`
- `admin`
- `hotel_user`

## Permission model

Authentication:

- bearer token through `requireAuth`;
- beta legal acceptance through `requireBetaAcceptance`;
- role checks through `requireRole`;
- hotel scope through `requireHotelScope`.

General access:

- `super_admin`: full product/admin scope.
- `admin`: operational/admin scope.
- `hotel_user`: only linked hotel scope.

## Important API groups

Authentication:

- `POST /auth/login`
- `GET /auth/me`

Hotel list:

- `GET /hotels`

Dashboard:

- `GET /hotel/:id/dashboard`
- `POST /hotel/:id/recalculate`
- `POST /hotel/:id/signals`

Daily Market Intelligence delivery:

- `POST /hotel/:id/revenue-intelligence/brief`
- `GET /hotel/:id/revenue-intelligence/briefs`
- `POST /api/intelligence/revenue-briefs/daily`
- `GET /api/intelligence/revenue-briefs`
- `PATCH /api/intelligence/revenue-briefs/:deliveryId/status`
- `POST /api/intelligence/revenue-briefs/:deliveryId/feedback`

Intelligence:

- `GET /api/intelligence/today`
- `GET /api/intelligence/opportunities`
- `GET /api/intelligence/demand-forecast`
- `GET /api/intelligence/market-position`
- `GET /api/intelligence/competitors`
- `GET /api/intelligence/alerts`
- `GET /api/intelligence/morning-brief`

Health:

- `GET /health`
- `GET /ready`
- `GET /api/debug/system-status`

## Secret handling

Secrets live only in environment variables or server secret storage.

Examples of secret names:

- `DATABASE_URL`
- `JWT_SECRET`
- `AUTH_PEPPER`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`

Do not write secret values into markdown, tests, source code, or commit history.
