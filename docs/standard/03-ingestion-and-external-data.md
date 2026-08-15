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

## Public market capture before PMS access

For beta hotels, do not require PMS, channel-manager, or booking-engine credentials on day one. Use the public market capture command to feed proof-backed outside-market evidence first:

```bash
npm run ingestion:public-market-capture -- \
  --hotel-name "The Ten Resort Siolim Goa" \
  --city Goa \
  --slug the-ten \
  --base-dir /opt/radar_light/shared/live_sources \
  --start-date 2026-08-15 \
  --horizon-days 15 \
  --tariff-snapshot-file /opt/radar_light/shared/live_sources/the-ten/tariff-snapshot.json \
  --demand-snapshot-file /opt/radar_light/shared/live_sources/the-ten/demand-snapshot.json
```

The command can populate:

- public holiday / long-weekend pressure from Nager.Date;
- 15-day weather support signals from Open-Meteo;
- verified official, OTA, and competitor tariff rows from a tariff snapshot file.
- approved travel/event demand rows such as airline pressure, search pressure, MICE, wedding, and local event signals from a demand snapshot file.

It does not fabricate tariff. A tariff row must have a positive rate and proof URL unless the operator explicitly uses `--allow-unproofed-tariff`, in which case the downstream connector still caps confidence as proof-needed.

Tariff snapshot example:

```json
{
  "rows": [
    {
      "source_type": "official",
      "source_name": "The Ten official booking engine",
      "checkin_date": "2026-08-16",
      "rate": 35400,
      "currency": "INR",
      "proof_url": "https://letsbook.me/booking/994038?checkin=2026-08-16&checkout=2026-08-17&adults=2",
      "observed_at": "2026-08-15T06:30:00.000Z"
    },
    {
      "source_type": "ota",
      "source_name": "Agoda",
      "checkin_date": "2026-08-16",
      "rate": 36750,
      "currency": "INR",
      "proof_url": "https://www.google.com/travel/hotels/...",
      "observed_at": "2026-08-15T06:35:00.000Z"
    },
    {
      "source_type": "competitor",
      "source_name": "Comparable North Goa Resort",
      "checkin_date": "2026-08-16",
      "rate": 28800,
      "currency": "INR",
      "proof_url": "https://www.google.com/travel/hotels/...",
      "observed_at": "2026-08-15T06:40:00.000Z",
      "metadata": {
        "room_basis": "base comparable room",
        "occupancy": 2
      }
    }
  ]
}
```

Demand / travel snapshot example:

```json
{
  "rows": [
    {
      "source_type": "airfare",
      "source_name": "Airport arrivals / flight pressure provider",
      "signal_type": "airfare_trend",
      "checkin_date": "2026-08-16",
      "value_numeric": 74,
      "value_text": "Inbound travel pressure is elevated for Goa weekend arrivals.",
      "proof_url": "https://provider.example/flights/goi/2026-08-16",
      "observed_at": "2026-08-15T06:45:00.000Z",
      "metadata": {
        "airport_code": "GOI",
        "category": "airline_pressure"
      }
    },
    {
      "source_type": "event",
      "source_name": "Venue / wedding market watch",
      "signal_type": "event_signal",
      "checkin_date": "2026-08-16",
      "value_numeric": 78,
      "value_text": "Wedding and private event enquiry pressure reported for North Goa.",
      "proof_url": "https://source.example/goa-events",
      "observed_at": "2026-08-15T06:50:00.000Z",
      "metadata": {
        "category": "wedding"
      }
    }
  ]
}
```

After public capture, import the rows into realtime observations:

```bash
npm run ingestion:realtime-signals
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
