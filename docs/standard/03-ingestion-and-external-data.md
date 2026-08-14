# Ingestion and external data strategy

## Purpose

HotelRADAR should ingest market evidence from outside the hotel, verify it, normalize it, and present it as Daily Market Intelligence.

The product should never show “random data.” Every row should have:

- source type;
- source name;
- stay date or observation date;
- captured timestamp;
- freshness expiry;
- confidence;
- normalized value where applicable;
- raw value where useful;
- status: ready, supporting, stale, missing, blocked.

## Source categories

### 1. Own hotel evidence

Required for strong revenue action:

- official website / booking engine rate;
- PMS pickup and occupancy, when integrated;
- cancellation and lead-time pattern;
- inventory exposure;
- direct channel conversion.

### 2. OTA and metasearch evidence

Required for strong revenue action:

- Google Hotels;
- Agoda;
- Booking.com;
- Expedia;
- MakeMyTrip / Goibibo;
- official-site price where visible;
- room plan, meal plan, taxes/fees, cancellation policy.

### 3. Competitor evidence

Required for strong revenue action:

- configured comp set;
- nearby comparable hotels;
- aspirational hotels;
- room-category normalized rate;
- freshness and scrape timestamp;
- competitor average, median, high/low, movement versus 48h.

### 4. Demand pressure

Used to explain why a date matters:

- holidays;
- long weekends;
- local festivals;
- concerts and public events;
- school breaks;
- destination demand spikes;
- MICE / corporate offsite events;
- wedding demand windows;
- weekend compression.

### 5. Travel and search pressure

Useful support signals:

- Google Trends or approved search intent source;
- airfare trend;
- airport/flight demand;
- map/search activity when available;
- destination-level search lift.

### 6. Digital asset intelligence

Beta expansion:

- Google Business Profile completeness;
- review velocity and rating trend;
- website speed and mobile readiness;
- booking-engine friction;
- direct rate visibility;
- metasearch parity;
- social/search demand;
- website chatbot or enquiry gap;
- direct booking leakage.

## Ingestion lifecycle

1. Discover source.
2. Capture raw observation.
3. Store with timestamp and source metadata.
4. Normalize to stay date and comparable unit.
5. Validate completeness and freshness.
6. Mark as ready/supporting/stale/missing/blocked.
7. Recalculate Central Intelligence.
8. Update dashboard, System Health, Opportunity, and Daily Market Intelligence output.

## Manual capture

Manual verified signal capture is currently implemented for beta operations. It allows the team to add:

- official rate;
- OTA rate;
- competitor rate;
- event/holiday signal;
- MICE signal;
- wedding signal;
- airfare/search pressure;
- weather/risk signal.

Command:

```bash
npm run signals:capture
```

API:

```http
POST /hotel/:id/signals
```

## Live source adapter rule

When adding a live adapter:

- store raw data and normalized data;
- never overwrite evidence without trace;
- include source freshness;
- include failure reason;
- expose status in System Health;
- never claim “live” if the source is snapshot/manual.

## Data quality standard

A strong pricing recommendation needs:

- own hotel rate;
- sufficient competitor evidence;
- sufficient OTA evidence;
- fresh observations;
- valid normalization;
- no critical data-health issue.

If any required item is missing, the output should still provide insight, but pricing action must downgrade to watch/hold.
