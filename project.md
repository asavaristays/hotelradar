# HotelRADAR Project Brief

## Product Objective

HotelRADAR should give a subscribing hotel a bird's-eye view of its own revenue position, OTA activity, competitor behaviour, destination demand, future opportunities, risk, and the strength of available evidence.

For every future stay date, the platform must answer four questions:

- What is happening?
- Why is it happening?
- How does it affect this hotel?
- What should the hotel do?

The final client-facing output must stay simple:

- Hold
- Watch
- Increase Watch
- Reduce Watch
- Increase
- Reduce
- Close Discount
- Minimum Stay
- Need More Data

## Product Architecture

HotelRADAR should be built as separate intelligence engines feeding one central decision layer.

## Single Intelligence Rule

HotelRADAR must not run two competing intelligence systems. Any existing feature, dashboard metric, service, script, or calculation that does not support the unified Central Intelligence architecture should be set aside until it can be audited and mapped cleanly.

This prevents the product from showing nil, random, duplicated, or contradictory results. The platform must have one source of truth for every stay-date decision.

Rules:

- keep only intelligence outputs that can be traced to verified data;
- do not mix legacy scoring with the new Central Intelligence scoring;
- park old or unsupported widgets instead of forcing them into the dashboard;
- convert useful existing work into module inputs only after validation;
- never display artificial values such as INR 0, 0% versus market, or fake averages when data is missing;
- show Not captured, Unavailable, or Insufficient evidence when proof is not available;
- every dashboard action must come from the unified Central Intelligence output schema.

Implementation principle: if an existing component helps Central Intelligence, integrate it. If it confuses the decision layer, set it aside.

### Central Intelligence

Central Intelligence is the brain of the platform. It should not collect raw data itself. It receives outputs from all other engines and converts them into one stay-date decision.

Responsibilities:

- combine signals;
- assign signal weights;
- check freshness;
- check source reliability;
- calculate confidence;
- detect contradictions;
- apply product lock;
- produce the final action;
- explain the reason;
- identify missing evidence.

Core question: is the available evidence strong enough to support a revenue action?

### Hotel Intelligence

Hotel Intelligence represents what is happening inside the hotel.

Inputs:

- current room prices;
- room inventory;
- occupancy;
- booking pace;
- cancellations;
- ADR;
- RevPAR;
- lead time;
- booking source;
- direct bookings;
- previous rate changes;
- room-type availability;
- minimum-stay restrictions.

Outputs:

- hotel booking strength;
- hotel pickup trend;
- occupancy pressure;
- inventory risk;
- price response;
- cancellation pressure;
- hotel-specific demand score.

### OTA Intelligence

OTA Intelligence tracks how the hotel and market appear across booking channels.

Inputs:

- Agoda;
- Booking.com;
- MakeMyTrip;
- Goibibo;
- Expedia;
- Google Hotels;
- other relevant channels.

Capture requirements:

- hotel OTA price;
- direct-versus-OTA parity;
- room availability;
- competitor prices;
- discounts;
- mobile rates;
- member rates;
- cancellation policies;
- meal plans;
- tax inclusion;
- sold-out status;
- movement over time.

Outputs:

- OTA parity score;
- OTA price movement;
- OTA availability pressure;
- competitor momentum;
- channel inconsistency;
- rate leakage;
- market median price.

### Market Intelligence

Market Intelligence explains what is happening in the wider destination.

Inputs:

- destination search activity;
- airfare movement;
- flight capacity;
- rail availability indicators;
- road movement where available;
- public holidays;
- long weekends;
- weather;
- city events;
- festivals;
- weddings;
- conferences;
- historical tourist traffic;
- seasonal patterns;
- market hotel availability.

Outputs:

- destination demand score;
- market heat;
- event impact;
- travel pressure;
- holiday compression;
- market scarcity;
- market volatility;
- source-market opportunity.

### Competitor Intelligence

Competitor Intelligence should be separate from general OTA intelligence. It compares the hotel only with relevant properties.

Comp-set criteria:

- location;
- price segment;
- category;
- room quality;
- guest rating;
- inventory size;
- facilities;
- customer profile;
- demand pattern.

Outputs:

- competitor average;
- competitor median;
- competitor price movement;
- availability compression;
- sold-out ratio;
- hotel position versus market;
- competitor consistency;
- comp-set confidence.

### Event and Opportunity Intelligence

This engine identifies demand opportunities that hotels commonly miss.

Inputs:

- festivals;
- weddings;
- exhibitions;
- conferences;
- concerts;
- sports events;
- school holidays;
- religious events;
- destination celebrations;
- corporate meetings;
- local commercial activity.

Outputs:

- affected stay dates;
- expected demand uplift;
- event distance;
- event size;
- likely source markets;
- recommended marketing opportunity;
- pricing opportunity.

### Data Health Intelligence

Data Health is essential for trust. It must be allowed to block Central Intelligence from issuing a strong recommendation.

It monitors:

- missing sources;
- stale observations;
- failed captures;
- inconsistent room mapping;
- duplicate observations;
- low-quality competitor matches;
- unavailable booking data;
- insufficient historical outcomes.

Outputs:

- data completeness;
- source freshness;
- source reliability;
- observation consistency;
- decision readiness;
- missing evidence.

## Engine Flow

The intelligence workflow should be:

```text
Raw Data Capture
  -> Validation
  -> Normalization
  -> Individual Intelligence Engines
  -> Central Intelligence
  -> Confidence and Product Lock
  -> Hotel Action
  -> Outcome Tracking
  -> Model Calibration
```

## Stay-Date Context

Every future stay date must be treated separately.

Example context:

- Hotel: The Ten Resort
- Stay date: 15 August 2026
- Occupancy: 2 adults
- Room type: base comparable room
- Length of stay: 1 night

The system should calculate intelligence for this exact context, not as a generic hotel-level summary.

## Core Algorithm

Each intelligence engine returns a score from 0 to 100.

Example:

| Engine | Score |
| --- | ---: |
| Hotel Intelligence | 68 |
| OTA Intelligence | 72 |
| Competitor Intelligence | 76 |
| Market Intelligence | 81 |
| Event Intelligence | 70 |
| Data Health | 65 |

Each engine must also return:

- confidence;
- freshness;
- top reasons;
- contradictory signals;
- missing data.

## Source Quality

Every source gets a quality score. A signal should not have the same influence merely because it exists.

| Source | Quality |
| --- | ---: |
| PMS data | 0.95 |
| Official booking engine | 0.95 |
| OTA observed rate | 0.85 |
| Google Hotels | 0.80 |
| Competitor website | 0.85 |
| Airfare API | 0.80 |
| Event feed | 0.70 |
| Government historical data | 0.75 |
| Manual observation | 0.60 |

## Freshness

Suggested freshness logic:

| Freshness | Weight |
| --- | ---: |
| Captured within 30 minutes | 1.00 |
| Within 2 hours | 0.90 |
| Within 6 hours | 0.75 |
| Within 24 hours | 0.50 |
| Older than 24 hours | 0.20 |
| Expired | 0.00 |

Effective signal weight:

```text
Effective Weight = Base Weight x Source Quality x Freshness x Data Completeness
```

## Central Demand Intelligence

Initial weighting can be:

| Engine | Weight |
| --- | ---: |
| Hotel Intelligence | 25% |
| OTA Intelligence | 15% |
| Competitor Intelligence | 20% |
| Market Intelligence | 20% |
| Event Intelligence | 10% |
| Historical / Seasonal | 10% |

Formula:

```text
Central Demand Score =
Hotel Score x 0.25
+ OTA Score x 0.15
+ Competitor Score x 0.20
+ Market Score x 0.20
+ Event Score x 0.10
+ Season Score x 0.10
```

These weights should later be calibrated using actual booking outcomes.

## Price Position

```text
Hotel Price Position = Hotel Normalized Price / Competitor Median Price
```

Interpretation:

| Position | Meaning |
| --- | --- |
| Below 90% | Possible underpricing |
| 90%-97% | Slightly below market |
| 97%-103% | Near market |
| 103%-110% | Premium |
| Above 110% | High premium |

This interpretation must also consider hotel quality and brand position.

## Confidence

Confidence should not be decorative. Suggested formula:

```text
Confidence =
Data Completeness x 30%
+ Source Reliability x 25%
+ Freshness x 20%
+ Signal Consistency x 15%
+ Historical Validation x 10%
```

## Contradiction Detection

The system should lower confidence when signals disagree.

Example contradictions:

- search demand rising but hotel pickup falling;
- competitors increasing rates but market availability remains high;
- event impact strong but weather severe;
- hotel occupancy high but cancellations increasing;
- airfare rising but flight capacity also expanding.

## Product Lock

Decision rules:

| Confidence | Allowed Output |
| --- | --- |
| Below 40 | Need More Data |
| 40-59 | Hold / Watch only |
| 60-74 | Increase Watch or Reduce Watch |
| 75+ | Increase, Reduce, Minimum Stay, or Close Discount permitted |

Mandatory conditions for price action:

- own hotel price available;
- minimum competitor count captured;
- minimum OTA coverage achieved;
- observations are fresh;
- no major normalization issue;
- no unresolved critical data-health issue.

## Decision Logic

### Increase

Use when demand score is high, confidence is high, hotel is below or near market, competitor rates are rising, availability is tightening, and booking pace is healthy.

### Increase Watch

Use when demand is strengthening, hotel appears underpriced, external signals are positive, but one important data source is missing.

### Reduce

Use when demand is weak, hotel is materially above market, booking pace is behind, competitor availability is high, and no major event or compression exists.

### Reduce Watch

Use when demand is slowing and hotel is above market, but booking pickup or competitor evidence is incomplete.

### Minimum Stay

Use when compression is high, demand spans multiple adjacent dates, weekend or event demand is strong, and short stays may block higher-value bookings.

### Close Discount

Use when demand is strong, occupancy is healthy, hotel is selling below market, and discounted plans are no longer required.

### Hold

Use when current price is aligned, demand is stable, and there is no urgent movement.

### Need More Data

Use when hotel price is unavailable, comp-set is incomplete, OTA feed is stale, or confidence is too low.

## Outcome Learning

The system should store every recommendation and subsequent outcome.

Example:

- Recommended action: Increase by 7%
- Action taken: Increase by 5%
- Bookings received: 4
- ADR movement: +INR 1,800
- Occupancy movement: +8%
- Revenue impact: +INR 27,000

This allows the model to learn:

- which signals accurately predicted demand;
- how price-sensitive the property is;
- which events matter;
- how different source markets behave;
- which recommendation generated the best result.

This is how HotelRADAR becomes predictive instead of remaining rule-based.

## Dashboard Direction

The design should feel like a premium aviation or financial intelligence cockpit.

Main navigation direction:

- Overview
- Hotel Intelligence
- OTA Intelligence
- Market Intelligence
- Competitor Intelligence
- Opportunities
- Forecast
- Alerts
- Data Health
- Settings

When collapsed, only icons should remain visible.

The first screen should show:

- top summary;
- selected property;
- stay date;
- demand status;
- recommended action;
- confidence;
- last updated;
- central intelligence card;
- intelligence sliders;
- market timeline;
- realtime signal feed.

## Design Language

Recommended visual direction:

- clean white and soft grey background;
- deep navy text;
- blue/cyan intelligence accents;
- amber for caution;
- red only for genuine risk;
- green for confirmed opportunity;
- rounded but professional cards;
- subtle shadows;
- strong spacing;
- minimal borders;
- premium typography.

Recommended fonts:

- Inter;
- Manrope;
- Plus Jakarta Sans;
- DM Sans.

Use no more than two font families.

Avoid excessive gauges. Prefer:

- score rings;
- timelines;
- heat maps;
- comparison bars;
- trend lines;
- confidence indicators;
- compact data tables.

## Recommended Development Order

### Phase 1

Build the intelligence framework:

- Central Intelligence;
- Hotel Intelligence;
- OTA Intelligence;
- Competitor Intelligence;
- Market Intelligence;
- Data Health Intelligence.

Use rule-based calculations initially.

### Phase 2

Connect live data for The Ten Resort:

- official rate;
- Agoda;
- Google Hotels;
- three competitors;
- events;
- airfare;
- weather.

### Phase 3

Implement:

- confidence model;
- product lock;
- contradiction detection;
- stay-date decision engine.

### Phase 4

Add:

- PMS data;
- booking pickup;
- occupancy;
- outcomes;
- model calibration.

### Phase 5

Build premium dashboard and subscription onboarding.

## Guiding Principle

The design should follow the intelligence architecture, not the other way around.
