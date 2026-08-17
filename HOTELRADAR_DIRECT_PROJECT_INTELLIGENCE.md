# HotelRADAR Direct - Project Intelligence Brief

**Purpose:** Working implementation context for every product, engineering, connector and operational decision.  
**Source priority:** Approved project documents and current system-owner decisions override this brief. This brief turns the investor narrative into executable product guardrails.

## 1. Product in one sentence

HotelRADAR Direct makes existing last-mile hotel referrals accountable: it verifies traveller intent, attributes the acquisition source, routes a structured opportunity to a hotel, records the hotel-controlled offer and tracks the outcome through completed-stay commission and partner payout.

## 2. The problem being solved

Search and hotel transaction infrastructure already exist. The missing layer is last-mile referral: cafés, drivers, planners, community operators and local desks influence where a traveller stays, but the referral is normally informal, unauditable and difficult to reward fairly.

The system must make this channel:

- **Attributable:** prove which partner/source introduced a traveller.
- **Accountable:** retain the request, offer, changes and outcome as evidence.
- **Disciplined:** ensure the hotel controls a clear final offer instead of informal rate improvisation.
- **Repeatable:** allow a partner and hotel to reuse a verified, tracked operating flow.

## 3. Product boundary - non-negotiable

HotelRADAR Direct is a verified opportunity layer, not an OTA.

### Direct is

- A traveller-intent, OTP verification and duplicate-control layer.
- A routing and private, time-bound hotel-offer mechanism.
- A local Goa booking desk supported by real people.
- A performance-based commission model on completed stays.
- An audit trail built around one shared Opportunity ID.

### Direct is not

- A public hotel marketplace or rate-comparison product.
- Merchant of record or payment collector.
- Inventory holder, allotment manager, hotel booking-engine replacement or rate-parity authority.
- The contracting party for the hotel stay.

The traveller and hotel remain the contracting parties. The hotel owns availability, final rate, confirmation, payment and stay delivery.

## 4. Operating architecture

```text
Traveller
  ↓
hotelradar.in / HotelRADAR Direct
  - request, consent, OTP, support, traveller offer experience
  - Opportunity ID and cross-system audit timeline
  ↓                         ↓
Revenue Intelligence         Salesman
  - hotel data               - partner/referral/campaign
  - routing and offers       - acquisition attribution
  - booking/stay             - partner payout outcome
  - HotelRADAR commission
```

### System ownership

| Data/domain | Owner |
|---|---|
| Traveller request, consent, verification, Direct support history | HotelRADAR Direct |
| Hotel, route, offer, booking reference, stay completion, HotelRADAR commission outcome | Revenue Intelligence |
| Partner, campaign, referral code, attribution and partner payout outcome | Salesman |
| Shared link | `external_opportunity_id`, created by Direct and retained everywhere |

Revenue and Salesman are independent protected systems. Direct uses only their approved normal-user/API/export capabilities and never changes their code, schemas, databases, deployments, configuration, users or workflows.

## 5. The Opportunity ID rule

Every material activity must attach to a single immutable `external_opportunity_id`.

```text
OPP-YYYYMMDD-sequence
Example: OPP-20260804-0001
```

The ID is present in Direct, Revenue and Salesman records, connector jobs, event logs, hotel offers, booking outcomes and partner-payout outcomes. Never reconcile records by traveller name alone.

## 6. Phase 1 traveller-to-stay workflow

1. Traveller submits area/property, dates, guests/rooms, public price evidence and preference.
2. Direct captures consent and verifies mobile OTP.
3. Direct checks duplicate/intent quality and creates a qualified Opportunity.
4. Salesman validates referral/campaign attribution where supplied.
5. Revenue receives the structured qualified Opportunity and routes it to selected hotel decision-maker(s).
6. Hotel accepts, counters or declines through the Revenue-controlled workflow.
7. Direct shows a private offer only when Revenue has returned complete, current offer terms.
8. Traveller accepts the offer and pays the hotel directly under the approved hotel flow.
9. Revenue records hotel booking confirmation, completed stay/cancellation/no-show and HotelRADAR commission state.
10. Direct sends the final valid outcome to Salesman; Salesman determines partner payout eligibility/settlement.

## 7. Canonical lifecycle

```text
draft → verification_pending → verified → qualified → routed
→ hotel_notified → offer_received → offer_sent → traveller_accepted
→ hotel_confirmed → stay_completed → commission_due → settled
```

Exception states: `more_details_needed`, `hotel_declined`, `offer_expired`, `cancelled`, `issue_review`, `connector_failed`.

### Lifecycle guards

- Only Revenue-approved outcome can produce `hotel_confirmed`, `stay_completed`, `commission_due` or `settled`.
- Partner payout is eligible only after `stay_completed`.
- A changed offer requires clear versioning; traveller must re-accept a material change.
- An event has timestamp, actor, source, prior status, new status and idempotency key.
- Events are never silently overwritten or deleted; corrections are new events.

## 8. Commercial intelligence

The investor model uses an illustrative average booking of ₹20,000:

| Item | Illustrative amount |
|---|---:|
| OTA commission at 20% | ₹4,000 |
| HotelRADAR Direct commission at 3.5% | ₹700 |
| Last-mile partner payout | ₹250 |
| HotelRADAR net contribution before desk/platform cost | ₹450 |
| Incremental value retained by hotel versus 20% OTA | ₹3,300 |

These are planning assumptions, not guaranteed customer outcomes. Product copy must not present them as promised savings unless a current hotel commercial agreement supports the statement.

## 9. Pilot intelligence

Pilot thesis: prove density in the Mumbai-to-Goa corridor before geographic expansion.

- Primary destination: Goa.
- Acquisition source market: Mumbai.
- Property clusters: Candolim, Baga, Assagao, Morjim, Cavelossim and Palolem.
- Accommodation mix: resorts, boutique stays and private villas.
- Initial distribution channels: cafés/restaurants, corporate travel desks, wedding/event planners, mobility/transfers, residential communities and community operators.
- Investor target scale: 50 properties, 1,000 rooms, then repeat the source-market-to-destination corridor model.

Claims such as number of signed properties, rooms, volume and capture rate must be marked internally as **verified operating fact**, **approved target**, or **illustrative model**. Never treat a deck target as a live system fact.

## 10. Phase 1 implementation priorities

### Build now

- Traveller request form and OTP verification.
- Consent capture, duplicate control and request-status page.
- Shared Opportunity ID, audit timeline and operator queue.
- Approved connector actions with Revenue and Salesman.
- Hotel offer presentation with full commercial terms and clear expiry.
- Human escalation and retry queue.
- Booking/stay/commission/payout traceability.

### Do not build in Phase 1

- Public hotel search/ranking marketplace.
- Payment checkout or payment-card storage.
- Inventory/allotment management.
- Automated price setting, parity enforcement or unverified rate scraping.
- Sophisticated AI routing or a self-service hotel/partner portal.
- Multi-destination expansion.

The operating principle is manual fallback at every critical stage until the pilot proves reliable.

## 11. Metrics that matter

Measure weekly by source, hotel cluster and operator:

| Metric | Why it matters |
|---|---|
| Verified requests | Genuine demand, not raw lead count |
| Duplicate/fraud rejection rate | Intent quality and abuse control |
| Hotel notification and response rate | Hotel partner usability |
| Median first-response time | Traveller trust and SLA performance |
| Useful-offer rate | Offers that meet request and can be sent |
| Traveller offer acceptance | Offer relevance/value |
| Hotel-confirmed bookings | Conversion into real hotel commitments |
| Completed stays | Commission and payout eligibility truth |
| Gross booking value | Commercial throughput paid directly to hotels |
| HotelRADAR commission due/settled | Direct business economics |
| Partner payout eligible/settled | Acquisition accountability |
| Cancellation, no-show and issue rate | Reliability and policy gaps |
| Connector failure/retry rate | Integration health |

## 12. Decision rules for product work

When choosing between features or implementation shortcuts:

1. Prefer a truthful, auditable manual workflow over unsupported automation.
2. Prefer a hotel-controlled decision over Direct guessing availability, rate or confirmation.
3. Prefer a verified request over lead volume.
4. Prefer completed-stay economics over booked-but-unverified revenue.
5. Preserve original source attribution and record corrections openly.
6. Do not show the traveller an offer that cannot be supported by current Revenue data.
7. Do not expose sensitive traveller information beyond the minimum role/need.
8. Never solve an integration gap by modifying Revenue or Salesman; handle it in Direct operations until their owners expand their approved capabilities.

## 13. Build-ready questions that require an owner decision

- Exact hotel-response SLA and after-hours escalation.
- Maximum number of hotels per traveller request.
- Required fields that make an offer traveller-visible.
- Offer-hold/expiry policy and whether Direct can show a live countdown.
- What constitutes hotel booking confirmation and completed-stay evidence.
- Commission basis, invoice timing, tax treatment and dispute window.
- Partner attribution rule, payout formula and duplicate-referral policy.
- Direct consent/privacy retention period and customer support escalation policy.

Until these are decided, implement a visible operations exception, not an invented automated rule.
