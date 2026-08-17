# Revenue Intelligence - HotelRADAR Direct Integration

## Role

Revenue Intelligence remains the hotel-side operational resource for HotelRADAR Direct. It owns property information, hotel routing, offer responses, booking confirmation, stay outcome and HotelRADAR commission outcome.

HotelRADAR Direct will use Revenue through the approved integration/user capabilities made ready by the Revenue team. Direct will not change Revenue’s code, database, schema, deployment, configuration, users or workflow.

## Required integration identity

Revenue must accept, store, search and return:

| Field | Requirement |
|---|---|
| `external_opportunity_id` | Required unique Direct key, e.g. `OPP-20260804-0001` |
| `external_source` | Fixed value `hotelradar-direct` |
| `source_partner_id` | Nullable Salesman partner ID |
| `source_campaign_id` | Nullable Salesman campaign ID |
| `last_external_sync_at` | ISO-8601 timestamp |

Repeated upsert with the same `external_opportunity_id` must update or return the existing Revenue record, not create a duplicate.

## Direct → Revenue: qualified request

After traveller OTP verification and Direct qualification, the connector needs to create/update a Revenue opportunity with:

```json
{
  "external_opportunity_id": "OPP-20260804-0001",
  "external_source": "hotelradar-direct",
  "traveller": {
    "name": "Traveller name",
    "verified_mobile": "+91...",
    "email": "optional@example.com"
  },
  "stay": {
    "area": "North Goa",
    "requested_property": "optional",
    "check_in": "2026-09-10",
    "check_out": "2026-09-13",
    "rooms": 1,
    "adults": 2,
    "children": 0
  },
  "commercial_context": {
    "budget_inr": 12000,
    "public_rate_inr": 12000,
    "preferences": ["breakfast", "flexibility"]
  },
  "source": {
    "partner_id": "optional",
    "campaign_id": "optional",
    "referral_code": "optional"
  },
  "consent_at": "2026-08-04T10:00:00+05:30"
}
```

## Revenue → Direct: required data

The connector must retrieve by `external_opportunity_id`:

| Group | Minimum fields |
|---|---|
| Record | Revenue internal ID, latest update time, current mapped status |
| Route | Property ID/name, route/notified time, response deadline, response state |
| Offer | Offer ID, room type, occupancy, currency, rate/total, tax/fee treatment, inclusions, benefit, cancellation terms, validity/hold expiry |
| Booking | Hotel booking reference, hotel confirmation timestamp/state, payment-to-hotel indicator |
| Stay | Completed/cancelled/no-show/issue state, completion timestamp |
| Commission | Gross booking value, commission basis/percentage, commission amount, due/settled state |
| Audit | Event time, actor/source and meaningful status reason |

## Revenue status mapping

Revenue may preserve its own labels but must expose an agreed mapping to:

```text
qualified
routed
hotel_notified
offer_received
hotel_declined
offer_expired
traveller_accepted
hotel_confirmed
cancelled
issue_review
stay_completed
commission_due
commission_settled
```

### Controlled state rules

- A hotel offer may be traveller-visible only if room/type, price, validity, inclusions and cancellation terms are present.
- `hotel_confirmed` requires a hotel booking reference and confirmation evidence.
- `stay_completed` requires a Revenue-confirmed completion outcome.
- A cancellation, no-show or issue must include a usable reason/status for Direct operations.
- Commission becomes due only under Revenue’s configured completed-stay rule.

## Revenue readiness decisions

The Revenue team must document:

1. Hotel response SLA and expiry action.
2. Maximum hotels per request and routing rule.
3. Required offer fields and offer amendment rule.
4. Booking confirmation evidence and payment-to-hotel process.
5. Completed-stay verification process.
6. Cancellation/no-show/dispute handling.
7. Commission formula, tax basis, invoice timing and settlement workflow.

## Revenue integration test

Using one safe test hotel/property:

- [ ] Create a valid Direct opportunity and return Revenue internal ID.
- [ ] Route to a hotel and expose hotel-notified status.
- [ ] Record a complete offer and make it readable by Direct.
- [ ] Return decline, expiry and cancellation paths.
- [ ] Return confirmed booking with a booking reference.
- [ ] Return completed stay, gross booking value and commission state.
- [ ] Prove repeat calls do not duplicate opportunity, offer or commission records.

## Handoff package

Provide Direct with the approved integration method, test credentials, test-record process, field/status map, allowed actions, error/rate-limit rules and named technical/operations owners.

---

## Revenue project upgrade brief

### Objective

Upgrade Revenue Intelligence so it can operate as the controlled hotel-side resource for HotelRADAR Direct's Goa pilot. A Revenue user must be able to receive a verified opportunity, route it to the correct hotel decision-maker, collect a valid hotel response, record the booking/stay outcome and expose the final commission result to Direct.

This upgrade is not a request to turn Revenue into an OTA, public marketplace, payment system or new CRM. Keep Revenue's current product identity and add only the capabilities needed to operate a Direct opportunity safely.

### Product user story

> As a Revenue operator, I receive a verified Direct request with complete stay intent and source context. I can select/reach the right hotel contact, record the hotel's actual response and return a controlled offer. When the hotel confirms booking and later stay completion, the same record produces an auditable commission result.

### Required screens/workspaces

#### 1. Direct opportunities queue

Add a queue/filter or clearly identifiable view for records where `external_source = hotelradar-direct`.

Required columns:

| Field | Purpose |
|---|---|
| Opportunity ID | Primary cross-system lookup and support reference |
| Traveller summary | Name and masked mobile; no unnecessary PII exposure |
| Stay dates / guests / rooms | Immediate hotel-fit assessment |
| Requested area/property | Routing context |
| Public price / budget | Commercial context, not a rate mandate |
| Preferences | Rate, breakfast, upgrade, flexibility, other |
| Status and SLA | Current state and time to hotel response deadline |
| Routed hotel(s) | Hotel name and response state |
| Booking/stay outcome | Confirmation and completion visibility |
| Last updated / owner | Operator accountability |

Required filters: current status, arrival date, stay area, routed hotel, SLA risk, owner, source partner/campaign and date created. Search must support `external_opportunity_id` and booking reference.

#### 2. Opportunity detail page

The detail page should have these sections, tabs or equivalent workflow areas:

1. **Request summary:** Direct-provided traveller requirement, verified-contact flag, stay details, public rate evidence and preferences.
2. **Hotel routing:** selected property/properties, named decision-maker, preferred contact channel, notified time and response deadline.
3. **Hotel response and offer:** accept/counter/decline, price, room, taxes, inclusions, cancellation terms, expiry/hold and operator/hotel note.
4. **Booking and stay:** booking reference, hotel confirmation, payment-to-hotel confirmation, check-in/check-out, cancellation/no-show/issue and completed-stay evidence.
5. **Commission:** gross booking value, basis, agreed percentage, calculated amount, invoice/due/settled state and finance note.
6. **Event history:** append-only material events with actor, timestamp, previous/new status and source.

### Required data upgrade

Implement or expose the following fields. Field labels can fit Revenue conventions, but mapping must be documented.

#### Identity and linkage

| Field | Type | Required rule |
|---|---|---|
| `external_opportunity_id` | String | Required and unique for Direct records; indexed/searchable |
| `external_source` | Enum/string | Required; `hotelradar-direct` |
| `source_partner_id` | String/null | Immutable original attribution unless corrected through audit path |
| `source_campaign_id` | String/null | Campaign attribution |
| `revenue_record_id` | Existing internal ID | Returned to Direct |
| `last_external_sync_at` | Timestamp | Last successfully applied connector update |

#### Hotel routing

| Field | Type | Required rule |
|---|---|---|
| `property_id` / `property_name` | Existing relation | Every route identifies one property |
| `hotel_decision_maker` | Contact/relation | Named primary contact plus escalation contact |
| `notification_channel` | Enum | WhatsApp, email, phone, internal supported channel |
| `routed_at` / `notified_at` | Timestamp | Required for SLA measurement |
| `response_due_at` | Timestamp | Explicit deadline |
| `route_status` | Enum | pending, notified, responded, expired, escalated |

#### Offer

| Field | Type | Required before offer can be sent to traveller |
|---|---|---|
| `offer_id` | String | Yes |
| `response_type` | Enum | accept, counter, decline |
| `room_type` / `occupancy` | Text | Yes for accept/counter |
| `total_amount` / `currency` | Money | Yes; INR for Goa pilot unless explicitly supported otherwise |
| `rate_basis` | Enum/text | total stay/per night, include nights and rooms |
| `tax_fee_treatment` | Text | Yes; clarify included/excluded |
| `inclusions` / `benefits` | List/text | Yes, may be empty explicitly |
| `cancellation_terms` | Text | Yes |
| `valid_until` | Timestamp/null | Required if time-bound/hold applies |
| `hold_reference` | String/null | Required when a room hold exists |
| `decline_reason` | Enum/text | Required for decline where practical |

#### Booking, stay and commission

| Field | Required rule |
|---|---|
| `hotel_booking_reference` | Required before `hotel_confirmed` |
| `hotel_confirmed_at` | Required before `hotel_confirmed` |
| `payment_to_hotel_status` | Explicit yes/no/pending; Direct does not collect payment |
| `stay_outcome` | completed, cancelled, no_show, issue_review, pending |
| `stay_outcome_at` | Required for final outcome |
| `gross_booking_value` | Required for commission calculation |
| `commission_basis` | Documented: eligible room value vs. other agreed basis |
| `commission_rate` / `commission_amount` | Versioned commercial result |
| `commission_status` | not_eligible, pending, due, invoiced, settled, disputed |

### Required actions

The Revenue team must make these normal-user/API actions available according to its existing security model:

| Action | Preconditions | Result |
|---|---|---|
| Create/import Direct opportunity | Valid Opportunity ID and request payload | One Revenue record; return internal ID |
| Update permitted request context | Not after hotel confirmation unless audited | Updated request event |
| Route to hotel | Eligible property/contact selected | Route status, deadline and notification event |
| Record hotel response | Route exists | Complete offer or declined outcome |
| Amend offer | Offer not accepted, or revised approval path | New offer version; prior version retained |
| Record traveller acceptance | Direct sends approved acceptance | Await hotel confirmation |
| Record hotel confirmation | Hotel booking reference available | Confirmed booking outcome |
| Record stay outcome | After intended stay dates / hotel evidence | Completed/cancelled/no-show/issue outcome |
| Reconcile commission | Completed-stay rule met | Due/invoiced/settled/disputed result |

### Status transition matrix

| From | Allowed next states | Required evidence |
|---|---|---|
| `qualified` | `routed`, `more_details_needed`, `cancelled` | Valid traveller/stay request |
| `routed` | `hotel_notified`, `cancelled` | Property/contact selected |
| `hotel_notified` | `offer_received`, `hotel_declined`, `issue_review`, `offer_expired` | Hotel response or SLA expiry |
| `offer_received` | `traveller_accepted`, `offer_expired`, `cancelled`, revised offer | Full offer fields present |
| `traveller_accepted` | `hotel_confirmed`, `cancelled`, `issue_review` | Acceptance recorded |
| `hotel_confirmed` | `stay_completed`, `cancelled`, `no_show`, `issue_review` | Booking reference and hotel evidence |
| `stay_completed` | `commission_due`, `issue_review` | Completion evidence and GBV |
| `commission_due` | `commission_settled`, `issue_review` | Approved commission calculation |

No state may silently move backwards. Corrections create a new event and preserve prior evidence.

### Integration requirements

- Expose create/read/permitted-update capability through documented API, webhook/export or approved user flow.
- Return stable Revenue internal ID and current `updated_at`/version on every response.
- Support idempotency with `external_opportunity_id` and action/version key.
- Send or make available updates for route, offer, booking, stay and commission state.
- Return safe business errors: unknown property, invalid date, invalid state, duplicate record, missing offer term, unauthorised action.
- Keep Direct connector access least privilege and separate from Revenue administrators.

### Revenue test script

Run this test before handoff using a safe test property:

1. Connector creates `OPP-TEST-001` with traveller/stay data.
2. Search retrieves exactly one Revenue record by Opportunity ID.
3. Operator routes it to test property and records notification/SLA.
4. Operator records a complete counter-offer with all traveller-visible terms.
5. Connector reads it; Revenue amends it once and prior version remains visible.
6. Connector records traveller acceptance; operator records booking reference and hotel confirmation.
7. Operator records completed stay, ₹20,000 eligible GBV and 3.5% commission outcome.
8. Replay all connector calls; verify no duplicate record, offer, booking or commission exists.
9. Repeat cancellation/no-response/decline scenarios and verify explicit status/reason.

### Revenue handoff acceptance

- [ ] A Direct opportunity flows from qualified request through commission status.
- [ ] All mandatory fields are accessible through the approved integration method.
- [ ] Operator screens make SLA, route, offer and booking next actions clear.
- [ ] Price/terms/offer versioning is auditable.
- [ ] Direct cannot create unsupported final states or access Revenue administration.
- [ ] Technical and business owners have signed test output.
