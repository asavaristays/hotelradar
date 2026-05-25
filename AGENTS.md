# HotelRADAR Agent Guide

## Product
HotelRADAR is a demand intelligence and pricing recommendation system for hotels in India. It combines competitor rates, OTA parity, event signals, holidays, airfare, and seasonality into a daily pricing decision.

Current production scope:
- Goa
- Mumbai
- Jaipur

Primary product position:
- AI-assisted pricing recommendation cockpit
- advisory system, not autonomous rate publishing

Primary users:
- hotel owners
- revenue managers
- general managers
- cluster commercial heads
- super admins operating live hotels

## Actual Stack
This repository is not Python/FastAPI.

Use these stack assumptions unless the code proves otherwise:
- Backend: Node.js + Express
- Database: PostgreSQL via `pg`
- Frontend: React + Vite
- Tests: Jest + supertest
- Process manager in production: PM2
- Deployment: VPS release workflow under `/opt/radar_light`

Important repo paths:
- Backend app: `/Users/manishpurohit/Documents/radar_light/src`
- Frontend app: `/Users/manishpurohit/Documents/radar_light/frontend/src`
- DB migrations: `/Users/manishpurohit/Documents/radar_light/db/migrations`
- DB seeds: `/Users/manishpurohit/Documents/radar_light/db/seeds`
- Tests: `/Users/manishpurohit/Documents/radar_light/tests`
- Scripts: `/Users/manishpurohit/Documents/radar_light/src/scripts`

## Current System State
Already built:
- demand score engine
- forward 30-day demand curve
- suggested price + zone presentation
- market position vs market average
- competitor rate grid
- OTA parity panel
- signal breakdown
- risk / heat / confidence scoring
- narrative explanation layer
- data health diagnostics
- alert system
- admin management panel
- event collection + event ingestion pipeline
- recalculation queue and worker flow
- product lock / verify / actionable readiness logic

Known realities:
- active production markets are Goa, Mumbai, and Jaipur only
- OTA data can fall back to estimated mode when scraped rows are missing
- forecast accuracy / rolling accuracy is still calibration-sensitive
- local/VPS drift has already caused production incidents
- shared snapshot files on VPS can override expectations if not cleaned

## Commands
Root checks:
```bash
cd /Users/manishpurohit/Documents/radar_light
ls -la
cat README.md
cat package.json
```

Backend:
```bash
npm install
npm run dev
npm run db:migrate
npm run db:seed
npm test -- --runInBand
```

Targeted tests:
```bash
npm test -- tests/routes/dashboardRoute.test.js --runInBand
npm test -- tests/integration/recalculate.test.js --runInBand
npm test -- tests/engines/eventCollectionService.test.js --runInBand
npm test -- tests/engines/eventIngestionService.test.js --runInBand
```

Frontend:
```bash
cd /Users/manishpurohit/Documents/radar_light/frontend
npm install
npm run build
```

Production-related scripts in repo:
```bash
npm run ingestion:ota
npm run ingestion:events:collect
npm run ingestion:events
npm run worker:recalc
npm run calibration:nightly
```

## Business Rules
Do not violate these:
- No autonomous publishing of rates to channels.
- Goa, Mumbai, and Jaipur are the only operating markets unless explicitly expanded.
- Suggested price should remain within sane bounds relative to current rate.
- Competitor data older than 36h should be treated as stale in user messaging.
- Bad future event dates must be blocked rather than displayed.
- Narrative should explain the top signal drivers, not only the score.
- OTA parity gaps above hotel tolerance are operationally important.

## Coding Rules
Backend:
- stay consistent with existing Node/Express patterns
- use env-driven configuration only
- keep logging structured
- prefer repository/service/controller separation already present in `src/`
- add narrow fixes over large rewrites

Database:
- schema changes go through SQL migrations in `db/migrations`
- prefer upsert patterns for snapshot-driven ingestion data
- do not drop data casually; add cleanup scripts or targeted deletes when needed

Frontend:
- do not add UI with no backend support
- preserve existing visual language unless user asks for redesign
- keep date handling explicit and normalized to `YYYY-MM-DD`
- use existing formatting/util patterns where available

Testing:
- every non-trivial change should update or add tests
- run targeted tests first, then broader tests if the area is stable
- for frontend-only changes, at minimum run a Vite build

## Production Workflow Notes
The VPS deployment has two important constraints:
- local code and VPS code can drift
- shared snapshot files under `/opt/radar_light/shared` can continue feeding bad data even after code fixes

When debugging production issues, verify both:
1. code version actually deployed
2. runtime data files and DB rows actually cleaned

Useful production checks:
- verify live frontend bundle contains expected strings
- verify PM2 restarted the expected service
- verify DB rows match expected dashboard inputs
- verify shared snapshot files are not reintroducing stale data

## Priority Direction
When choosing work, prioritize in this order:
1. correctness of pricing and event data
2. trust and clarity in dashboard output
3. deploy reliability
4. calibration loop improvements
5. automation and expansion features

## Deferred Work
Do not treat these as immediate unless user explicitly overrides priority:
- full PMS integration
- automatic rate publishing
- national rollout beyond Goa, Mumbai, and Jaipur
- mobile app
- enterprise chain benchmarking integrations
- large ML retraining systems without sufficient outcome data

## If You Start Fresh
Use this sequence:
```bash
cd /Users/manishpurohit/Documents/radar_light
ls -la
cat README.md
cat package.json
rg -n "ota|event|calibration|productLock|signalQuality" src frontend/src tests
npm test -- tests/routes/dashboardRoute.test.js --runInBand
npm test -- tests/integration/recalculate.test.js --runInBand
```

## Source of Truth
For technical truth, prefer code over planning prose.
For business scope, prefer this file plus current user instructions.
For production truth, verify the VPS data and deployed bundle rather than assuming local state matches production.
