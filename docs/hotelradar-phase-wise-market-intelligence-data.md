# HotelRADAR phase-wise market intelligence data plan

## Purpose

HotelRADAR is being built as a Revenue Intelligence system that can onboard any hotel in India and show market-facing revenue signals for that property’s location, segment, and comp set.

The first implementation phase uses structured demo intelligence for one pilot property so that dashboard presentation, formulas, signal classification, opportunity output, and system-health status can be validated before live data contracts are switched on.

## What Phase 1 now provides

Phase 1 creates tagged, auditable pilot evidence with `phase_1_structured_demo` metadata. It does not use the Goa Tourism CSV.

For the pilot property, the seed creates:

- own official booking-engine rate evidence;
- OTA/channel rate evidence;
- competitor/comp-set rate evidence;
- holiday and event pressure;
- MICE/offsite pressure;
- wedding enquiry pressure;
- airfare/search-style demand pressure;
- weather/monsoon risk signal;
- freshness expiry metadata for every observation.

The seed writes through the same production tables used by the realtime capture system:

- `hotel_rate_snapshots`
- `competitor_rates`
- `realtime_signal_observations`
- `city_events`
- `holidays`
- `airfare_data`

This means Dashboard, Opportunity, and System Health can all read one evidence trail.

## Pilot dates included

- 2026-08-15: Independence Day long weekend
- 2026-08-16: Long weekend spillover
- 2026-08-21: Corporate offsite/MICE shoulder
- 2026-08-22: Saturday leisure compression
- 2026-08-28: Raksha Bandhan family travel
- 2026-08-29: Rakhi weekend compression
- 2026-08-30: Sunday departure shoulder

Raksha Bandhan is explicitly treated as a family-travel demand window; MICE and wedding signals are separate event classifications in metadata.

## How to run safely

Preview only:

```bash
npm run seed:phase1-market-intelligence -- --dry-run
```

Seed the selected/default pilot property and recalculate affected stay dates:

```bash
npm run seed:phase1-market-intelligence
```

Seed a specific property:

```bash
npm run seed:phase1-market-intelligence -- --hotel-id "<hotel_uuid>"
```

or:

```bash
npm run seed:phase1-market-intelligence -- --hotel-name "Hotel Name" --city "Goa"
```

Seed without immediate recalculation:

```bash
npm run seed:phase1-market-intelligence -- --skip-recalculate
```

## Phase 2: near-realistic data

Once the dashboard story is accepted, replace Phase 1 values source by source:

1. Official rate adapter: pull from the property’s booking-engine or manual booking-engine snapshot.
2. OTA adapter: structured snapshots from Google Hotels, Agoda, Expedia, MakeMyTrip, Booking.com where allowed.
3. Competitor adapter: configured comp set per hotel, including nearby and aspirational properties.
4. Event adapter: city events, holidays, school calendars, long weekends, conferences, exhibitions, MICE, and wedding calendars.
5. Search/travel adapter: Google Trends or approved search-signal provider, airport/flight demand, and destination interest.
6. Weather/risk adapter: monsoon, heavy rain, road/airport disruption, and abnormal cancellation risk.
7. Validation layer: mark every source as ready, supporting, stale, missing, or blocked.

### Implemented Phase 2 starting point

The product now includes a manual Signal Input workflow for admin/super-admin users. It is intentionally CSV-free.

Supported input types:

- official rate;
- OTA rate;
- competitor rate;
- event/holiday signal;
- MICE signal;
- wedding signal;
- airfare/search pressure;
- weather/risk signal.

API endpoint:

```http
POST /hotel/:id/signals
```

Each saved signal:

1. writes to the appropriate source table where applicable;
2. writes to `realtime_signal_observations`;
3. tags the evidence as `phase_2_manual_input`;
4. recalculates Revenue Intelligence for the affected stay date;
5. refreshes the dashboard view in the UI.

This lets the team operate a real morning workflow before automated collectors are fully connected.

## Phase 3: live Revenue Intelligence

For every onboarded hotel in India:

1. Store hotel location, room positioning, booking-engine URL, OTA links, and comp-set rules.
2. Capture daily and intra-day observations by stay date.
3. Normalize rates by room type, taxes/fees, meal plan, occupancy, cancellation policy, and freshness.
4. Score each signal separately before any recommendation is made.
5. Generate a morning Revenue Intelligence view:
   - what changed;
   - what dates matter;
   - which evidence is ready/supporting/missing;
   - what action is safe;
   - what opportunity sales/revenue teams should follow.

### Implemented working model

The dashboard response now includes `revenueIntelligenceModel`, a single auditable contract for the morning operating model.

It produces:

- executive pricing stance;
- confidence/readiness score;
- trust status;
- evidence contract by signal type;
- missing data actions;
- revenue and sales opportunities;
- WhatsApp-ready morning brief draft;
- activation phase status.

Strong actions remain guarded. The model requires:

- official hotel rate;
- OTA evidence;
- competitor evidence;
- market price/normalization;
- fresh observations.

If these are not ready, the model can still explain demand and sales opportunity, but it downgrades pricing action to watch/hold.

Example output fields:

```json
{
  "revenueIntelligenceModel": {
    "version": "revenue-intelligence-working-model-v1",
    "executiveSummary": {
      "pricingAction": "Close Discount",
      "confidenceScore": 86,
      "trustStatus": "actionable"
    },
    "evidence": [],
    "opportunityRows": [],
    "missingDataActions": [],
    "morningBrief": {
      "whatsappDraft": "HotelRADAR Morning Revenue Intelligence..."
    }
  }
}
```

## Guardrails

- Missing numeric values must remain missing; do not convert missing rates into zero.
- Strong recommendations require own rate, competitor evidence, OTA evidence, freshness, normalization, and no critical data-health issue.
- Demo data must stay tagged so it can be audited or retired.
- Production/live claims should only be made for sources marked verified or freshly captured.

## Phase 4/5: client delivery loop

The product now supports a delivery audit loop for the daily Revenue Intelligence brief.

Supported delivery channels:

- `manual`: generates and stores the brief for operator review.
- `dashboard`: stores the brief for dashboard consumption.
- `api`: stores the brief from an API workflow.
- `email`: sends the brief through SMTP when SMTP environment variables are configured.
- `whatsapp`: queues the brief for a future WhatsApp provider integration.

Email delivery is environment-driven. Secrets must stay in `.env` or deployment secret storage, never in source code.

Required SMTP variables:

```bash
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_REQUIRE_TLS=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
EMAIL_REPLY_TO=
```

Generate and send one property brief:

```bash
npm run briefs:morning -- --hotel-id "<hotel_uuid>" --stay-date "YYYY-MM-DD" --channel email --recipient-email "client@example.com"
```

Every generated/sent/failed brief is stored in `revenue_intelligence_brief_deliveries` with status, recipient, subject, generated time, delivered time, and provider message id when available.
