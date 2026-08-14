# HotelRADAR Central Intelligence Implementation Map

## Objective

HotelRADAR must operate as one subscription-based Hotel Revenue Intelligence and Predictive Market Analysis product. Existing dashboards, services, scripts, and scoring should be kept only when they feed the unified Central Intelligence contract.

## Single Source of Truth

The active decision source is now `Central Intelligence v1`.

Current entry point:

- backend service: `src/services/centralIntelligenceService.js`
- dashboard wrapper: `src/services/marketDemandService.js`
- API route: `GET /api/market-demand`
- UI consumer: `frontend/src/components/MarketDemandCockpit.jsx`

Legacy or side intelligence should not directly produce client-facing revenue decisions unless mapped into this contract.

## Unified Stay-Date Schema

Every stay-date decision returns:

- `stay_date`
- `demand_score`
- `confidence_score`
- `demand_level`
- `pricing_action`
- `price_adjustment_pct`
- `trust_status`
- `central_intelligence`
- `module_scores`
- `product_lock`
- `missing_evidence`
- `contradictory_signals`
- `source_proof`
- `top_drivers`
- `freshness`
- `computed_at`

## Intelligence Modules

Central Intelligence v1 currently maps available data into these modules:

- Hotel Intelligence: hotel rate snapshots and hotel-vs-market position.
- OTA Intelligence: contract placeholder, locked when OTA rows are not captured.
- Competitor Intelligence: competitor rows, comp-set depth, 48h movement, freshness.
- Market Intelligence: airfare and travel-pressure signals where available.
- Event Intelligence: physical events, holidays, Wedding demand, and MICE demand.
- Seasonality Intelligence: weekend/weekday baseline.
- Data Health Intelligence: missing evidence, stale evidence, critical lock issues.

## Current Data Sources Used

- `hotel_rate_snapshots`
- `competitor_rates`
- `city_events`
- `holidays`
- `airfare_data`

Wedding and MICE are classified from event name/category/description. They are not separate final-decision engines; they are segments inside Event Intelligence.

Wedding patterns include:

- wedding;
- shaadi;
- bridal;
- banquet;
- destination wedding;
- wedding season;
- marriage.

MICE patterns include:

- meetings;
- incentives;
- conference;
- convention;
- exhibition;
- expo;
- trade show;
- summit;
- forum;
- corporate;
- B2B.

The current evidence query is `listMarketDemandEvidence()` in `src/repositories/marketDemandRepository.js`.

## Data Sources Still Required For Full Product

- PMS pickup and occupancy.
- OTA coverage by source: Agoda, Booking.com, MakeMyTrip, Goibibo, Google Hotels, Expedia where legally available.
- Official hotel rate proof URL.
- Normalized competitor comp-set table with comparable hotel classification.
- Weather signals.
- Flight capacity and source-market movement.
- Historical outcome table for calibration.

## Product-Lock Rules Implemented

- Confidence below 40: `Need More Data` only.
- Confidence 40-59: `Hold` / `Watch` only.
- Confidence 60-74: `Increase Watch` / `Reduce Watch` allowed.
- Confidence 75 or above: strong actions are still blocked unless required evidence exists.

Strong action requirements:

- current hotel rate;
- three normalized competitors;
- two OTA sources;
- fresh competitor observations;
- valid market price;
- valid normalization;
- no unresolved contradiction.

## Runtime Configuration

Central Intelligence production thresholds are configurable through environment variables:

- `CI_MIN_COMPETITORS`, default `3`
- `CI_MIN_OTA_SOURCES`, default `2`
- `CI_STRONG_ACTION_CONFIDENCE`, default `75`
- `CI_WATCH_ACTION_CONFIDENCE`, default `60`
- `CI_HOLD_ACTION_CONFIDENCE`, default `40`
- `CI_COMPETITOR_FRESH_HOURS`, default `36`
- `CI_HOTEL_RATE_FRESH_HOURS`, default `24`

## Guardrails Implemented

- Missing rates are returned as `null`, not `0`.
- UI displays `Not captured`, not INR 0.
- Missing market movement displays `48h movement not captured`, not `0.0% vs 48h`.
- Legacy/prospecting signals are documented as removed from price action.
- Market Demand Cockpit now uses Central Intelligence vocabulary.

## API Flow

```text
GET /api/market-demand
  -> marketDemandController
  -> marketDemandService
  -> marketDemandRepository.listMarketDemandEvidence
  -> centralIntelligenceService.scoreCentralStayDateSeries
  -> response consumed by MarketDemandCockpit
```

## Dashboard Hierarchy

Recommended final dashboard order:

1. Property selector and stay-date selector.
2. Central Intelligence summary.
3. Recommended action and product-lock status.
4. Confidence and missing evidence.
5. Hotel position versus market.
6. Module score cards.
7. 30/60/90-day stay-date matrix.
8. Realtime signal feed with proof.
9. Data health and freshness.

## Implementation Phases Remaining

### Phase 1: Evidence normalization

Connect OTA and official-rate observations into `listMarketDemandEvidence()` without changing dashboard semantics.

### Phase 2: The Ten Resort live pilot

Capture official rate, Agoda, Google Hotels, and three normalized competitors for selected Goa stay dates.

### Phase 3: Product dashboard

Replace cluttered legacy widgets with Central Intelligence cards and module drilldowns.

### Phase 4: Calibration

Add outcome tracking: predicted action, actual pickup, realized ADR, and forecast error.

### Phase 5: Subscription product hardening

Add onboarding, property setup, data health monitoring, proof retention, and client-ready exports.
