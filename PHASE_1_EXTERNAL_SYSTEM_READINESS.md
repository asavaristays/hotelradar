# HotelRADAR Direct - Phase 1 External System Readiness Specification

**Version:** 1.0  
**Purpose:** Prepare Revenue Intelligence and Salesman for use by HotelRADAR Direct without HotelRADAR Direct changing either system after handoff.  
**Scope:** Goa pilot, controlled launch, 10-15 properties and a limited set of acquisition partners.

## 1. Architecture and ownership

HotelRADAR Direct is a new traveller-facing application and a separate operational backend. It uses the existing Revenue Intelligence and Salesman capabilities as external, independently managed systems.

```text
Traveller
    |
    v
hotelradar.in / HotelRADAR Direct
    |  creates shared Opportunity ID
    |  captures consent, intent and operator history
    |
    +----------------------> Revenue Intelligence
    |                         hotel matching, offers, booking,
    |                         stay and HotelRADAR commission outcome
    |
    +----------------------> Salesman
                              partner, referral, campaign attribution
                              and partner payout outcome
```

### System of record

| Domain | System of record | Notes |
|---|---|---|
| Traveller enquiry, consent, verification, Direct support timeline | HotelRADAR Direct | Direct owns the original request and its audit timeline. |
| Hotel/property profile, hotel response, offer, booking, stay, HotelRADAR commission | Revenue Intelligence | Direct must not replace hotel-side operational truth. |
| Partner, referral code, campaign, acquisition owner, partner payout | Salesman | Attribution must remain stable after a booking completes. |
| Cross-system identifier | HotelRADAR Direct creates it; all systems retain it | `external_opportunity_id` is mandatory for every linked record. |

### Non-negotiable boundary

After this readiness handoff, the HotelRADAR Direct team will not change Revenue Intelligence or Salesman code, data schema, deployment, configuration, users, or workflows. Those teams retain ownership of their systems. Direct connects through the approved user/API/export capabilities provided at handoff.

## 2. Shared integration contract

### 2.1 Common identifier

Both systems must store and return the following values on every Direct-created or Direct-linked record.

| Field | Type | Rule |
|---|---|---|
| `external_opportunity_id` | string | Required; unique per traveller opportunity; supplied by Direct. Example: `OPP-20260804-0001`. |
| `external_source` | string | Required; fixed value `hotelradar-direct`. |
| `source_partner_id` | string/null | Salesman partner identifier if attributed. |
| `source_campaign_id` | string/null | Salesman campaign identifier if attributed. |
| `direct_status` | string | Latest mapped Direct lifecycle status. |
| `direct_record_url` | string/null | Optional protected deep link to Direct record. |
| `last_external_sync_at` | ISO-8601 datetime | Last accepted connector update. |

`external_opportunity_id` must be searchable in both systems and must not be re-used for another traveller request.

### 2.2 Required integration method

Provide one supported, documented method for each system.

1. **Preferred:** authenticated HTTPS JSON API for create, read and permitted updates.
2. **Acceptable fallback:** authenticated webhook receiver plus scheduled authenticated CSV/JSON export.
3. **Last resort:** a stable, documented operator workflow that a connector user can perform in the existing UI. This should not be the sole long-term production integration method.

The integration method must state the authentication mechanism, request/response examples, rate limits, pagination, date/time zone format, field validations, error codes and support owner.

### 2.3 Idempotency and update rule

For create/upsert operations:

- Key requests by `external_opportunity_id`.
- A retry of the same request must not create a duplicate record, offer, booking or payout.
- Return the system internal ID and the current version/update timestamp.
- Reject a request that attempts to change a completed booking into a different traveller/hotel without an explicit issue workflow.
- Retain the source data and audit history when an attribution correction is made.

### 2.4 Event envelope

If either system supports webhooks/events, use this minimum event envelope:

```json
{
  "event_id": "evt_01...",
  "event_type": "hotel.offer_received",
  "occurred_at": "2026-08-04T10:15:00+05:30",
  "external_opportunity_id": "OPP-20260804-0001",
  "system_record_id": "REV-12345",
  "actor_type": "hotel_user",
  "actor_id": "hotel-contact-17",
  "previous_status": "hotel_notified",
  "new_status": "offer_received",
  "payload": {},
  "idempotency_key": "..."
}
```

Events must be retained for audit and replay. Direct will acknowledge/retry safely; source systems should treat duplicate event delivery as normal.

## 3. Revenue Intelligence readiness

Revenue Intelligence is the hotel and transaction-control resource. It must enable Direct to create a qualified request, follow hotel response, present a confirmed offer, and determine the completed-stay commission outcome.

### 3.1 Required inputs to Revenue

| Group | Fields |
|---|---|
| Linkage | `external_opportunity_id`, `external_source`, source partner/campaign IDs, Direct creation timestamp |
| Traveller | name, verified mobile number, email if supplied, preferred contact channel |
| Stay requirement | destination/area, requested property if any, check-in, check-out, nights, rooms, adults, children |
| Commercial context | budget, public price evidence and currency if known, desired benefits, urgency/readiness-to-book |
| Request context | special requirements, source/referral code, consent timestamp, internal operator note |

Only collect and transmit data necessary for the hotel to price and fulfil the request.

### 3.2 Required outputs from Revenue

Direct must be able to retrieve, by `external_opportunity_id`:

| Group | Fields |
|---|---|
| Linkage | Revenue internal ID, `external_opportunity_id`, latest update timestamp |
| Hotel routing | property ID/name, route status, notified timestamp, contact channel, response deadline |
| Offer | offer ID, room type, occupancy, nightly/total price, currency, tax/fee treatment, inclusions, benefits, cancellation terms, validity/hold expiry |
| Booking | booking reference, confirmation timestamp, hotel confirmation state, payment-to-hotel indicator |
| Stay | check-in/out, completed/cancelled/no-show/issue state, completion confirmation timestamp |
| Commercial outcome | gross booking value, commission percentage/basis, commission amount, commission due/paid state |
| Audit | last actor, latest note or status reason, event/update history where supported |

### 3.3 Revenue status map

Revenue may keep its own internal labels, but it must publish a deterministic mapping to these Direct statuses.

| Direct status | Meaning |
|---|---|
| `qualified` | Operator/validation has accepted the request for hotel routing. |
| `routed` | At least one eligible hotel was selected. |
| `hotel_notified` | Hotel received a response request. |
| `offer_received` | At least one usable hotel offer is recorded. |
| `hotel_declined` | A routed hotel declined; reason should be retained where possible. |
| `offer_expired` | Offer or room hold expired before traveller acceptance. |
| `traveller_accepted` | Traveller selected an offer. |
| `hotel_confirmed` | Hotel has confirmed the booking and provided reference. |
| `cancelled` | Booking/request cancelled; retain initiator and reason. |
| `issue_review` | Price, service, attribution, cancellation or fulfilment issue requires human owner. |
| `stay_completed` | Stay completion is confirmed. |
| `commission_due` | Commission is payable according to agreed rule. |
| `commission_settled` | HotelRADAR commission was reconciled/settled. |

### 3.4 Revenue business rules to configure/document

- Hotel response SLA and the exact expiry action when no response is received.
- Whether one request can be routed to multiple hotels and maximum routing count.
- Required offer fields before an offer becomes traveller-visible.
- Who may amend a confirmed offer and whether the traveller must re-accept after an amendment.
- Valid booking confirmation evidence: hotel confirmation number plus documented source/channel.
- Completed-stay evidence and review window before commission becomes due.
- Cancellation/no-show rules and whether commission/payout becomes ineligible or disputed.
- Commission basis: gross room amount vs. total payable amount, tax treatment, percentage, invoice timing and payment status.

### 3.5 Revenue acceptance tests

Use a non-production test hotel/property to demonstrate:

1. Direct can create one valid opportunity and Revenue returns its internal ID.
2. A Revenue user can route the request, record an offer and Direct can read it.
3. A change from offer to confirmed booking is visible to Direct exactly once.
4. Cancellation and hotel non-response are returned with usable reason/status.
5. Completed stay produces gross booking value and commission outcome.
6. Repeating a connector request does not produce a second opportunity, offer or commission record.

## 4. Salesman readiness

Salesman is the acquisition and partner-economics resource. It must enable Direct to validate attribution at enquiry time and return the partner payout outcome only after the hotel-side stay result is known.

### 4.1 Required inputs to Salesman

| Group | Fields |
|---|---|
| Linkage | `external_opportunity_id`, `external_source`, external creation timestamp |
| Attribution | referral code, partner ID, campaign ID, acquisition owner, landing-page/QR identifier if present |
| Funnel outcome | enquiry created, qualification state, offer sent, booking reference, booking confirmation, stay outcome |
| Economics | gross booking value, HotelRADAR commission amount, partner payout eligible amount, payout status |
| Exceptions | duplicate/referral conflict flag, cancellation/no-show/issue reason, dispute note |

### 4.2 Required outputs from Salesman

Direct must be able to retrieve and validate:

| Group | Fields |
|---|---|
| Partner | partner ID, name, type, active/inactive state, assigned owner |
| Attribution | referral code, campaign ID/name, QR/landing identifier, attribution validity dates |
| Economics | payout model/version, payout calculation basis, payout cap if any |
| Record state | external opportunity ID, attribution state, funnel outcome, payout eligibility, payout settlement state |
| Audit | original attribution, correction record/reason, last update timestamp |

### 4.3 Salesman status map

| Direct status | Meaning |
|---|---|
| `attributed` | An active partner/campaign/referral is validly attached. |
| `enquiry_created` | Direct enquiry is recorded against attribution. |
| `qualified` | Valid intent passed to Revenue/hotel workflow. |
| `offer_sent` | A usable offer was sent to traveller. |
| `booking_confirmed` | Revenue/hotel booking confirmation was received. |
| `stay_completed` | Revenue confirms completed stay. |
| `payout_eligible` | Payout rule has been evaluated and is eligible. |
| `payout_settled` | Payout was reconciled/paid. |
| `attribution_disputed` | A human must resolve source credit before payout. |
| `payout_ineligible` | Cancellation, no-show, invalid attribution or other documented exception. |

### 4.4 Salesman business rules to configure/document

- Referral-code validation and expiry rules.
- First-touch vs. last-touch attribution rule; Phase 1 recommendation is first valid tracked source wins.
- How duplicate traveller requests are detected and which source receives credit.
- Partner payout basis and calculation version.
- Explicit condition that payout is not eligible until Revenue reports `stay_completed`.
- Who can correct attribution and the required audit reason.
- Dispute window and final payout settlement workflow.

### 4.5 Salesman acceptance tests

Use one non-production partner and campaign to demonstrate:

1. Direct validates an active referral code before creating attributed opportunity.
2. The referral is attached to the correct `external_opportunity_id`.
3. Direct sends booking and completed-stay outcomes to the same record.
4. Salesman calculates payout only once after `stay_completed`.
5. Duplicate notification does not create duplicate credit or payout.
6. An invalid, expired or conflicting referral has an explicit outcome and cannot silently claim credit.

## 5. Direct connector constraints

The Direct connector is a separate service. It will:

- use dedicated minimum-privilege integration users;
- maintain a private cross-system mapping store and event log;
- queue retries with idempotency keys;
- never directly access or alter the Revenue/Salesman databases;
- never impersonate an administrator;
- surface a human exception queue when an action cannot be synchronised;
- redact/minimise traveller data in logs;
- treat Revenue and Salesman as authoritative only for their allocated domains.

## 6. Access handoff package

Before Direct development begins, provide the following for **each** system.

- Dedicated integration/test user and authentication method.
- Test/staging URL if available; otherwise an approved safe test record protocol.
- API specification, export specification, or documented approved user workflow.
- Allowed actions: create, read, update, status changes and fields that cannot be changed.
- Rate limits, IP allow-list requirements, session expiry behaviour and error handling.
- Current field map and status map to this specification.
- Named technical owner and operations owner for integration incidents.
- One test hotel/property in Revenue and one test partner/campaign in Salesman.

## 7. Handoff sign-off

Revenue and Salesman are ready only when all of the following are true.

- [ ] `external_opportunity_id` works as a searchable, unique cross-system key.
- [ ] Field/status map is agreed and documented.
- [ ] Connector access is available without administrator privilege.
- [ ] Revenue acceptance tests pass.
- [ ] Salesman acceptance tests pass.
- [ ] Duplicate/retry behaviour is proven safe.
- [ ] Cancellation, no-show, attribution dispute and non-response paths are documented.
- [ ] Commercial formulas for HotelRADAR commission and partner payout are approved.
- [ ] Named owners are available for business, engineering and daily operations exceptions.

Once signed off, HotelRADAR Direct can be built against the documented contract while Revenue Intelligence and Salesman remain separate, protected systems.
