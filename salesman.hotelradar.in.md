# Salesman - HotelRADAR Direct Integration

## Role

Salesman remains the acquisition resource for HotelRADAR Direct. It owns partner records, referral codes, campaigns, attribution, acquisition ownership and partner payout outcome.

HotelRADAR Direct will use Salesman only through its approved integration/user capabilities. Direct will not change Salesman’s code, database, schema, deployment, configuration, users or workflow.

## Required integration identity

Salesman must accept, store, search and return:

| Field | Requirement |
|---|---|
| `external_opportunity_id` | Required unique Direct key, e.g. `OPP-20260804-0001` |
| `external_source` | Fixed value `hotelradar-direct` |
| `source_partner_id` | Partner ID where attribution is valid |
| `source_campaign_id` | Campaign ID where attribution is valid |
| `last_external_sync_at` | ISO-8601 timestamp |

The same opportunity ID must not produce duplicate partner credit or payout eligibility.

## Salesman → Direct: attribution validation

Before or immediately after a Direct request is created, the connector must be able to validate:

| Data | Required response |
|---|---|
| Referral code | Valid/invalid/expired/conflicted state |
| Partner | Partner ID, name, type, active state, account owner |
| Campaign | Campaign ID/name, active state, validity period |
| Attribution | First-touch/source rule result and reason |
| Economics | Payout model/version, payout basis/cap if applicable |

If Salesman is temporarily unavailable, Direct stores the submitted code as pending. It must not promise source credit or a partner payout until validation succeeds.

## Direct → Salesman: funnel outcome

The connector must create/update the attributed record with:

```json
{
  "external_opportunity_id": "OPP-20260804-0001",
  "external_source": "hotelradar-direct",
  "partner_id": "PARTNER-001",
  "campaign_id": "MUMBAI-CAFE-01",
  "referral_code": "CAFEGOA",
  "funnel": {
    "enquiry_created_at": "2026-08-04T10:00:00+05:30",
    "qualification_status": "qualified",
    "offer_status": "offer_sent",
    "booking_reference": "REV-BOOK-123",
    "booking_status": "hotel_confirmed",
    "stay_status": "stay_completed"
  },
  "economics": {
    "gross_booking_value_inr": 36000,
    "hotelradar_commission_inr": 1440,
    "partner_payout_eligible_inr": 0
  }
}
```

The connector sends the actual Revenue-derived stay/booking outcome. It does not independently declare a booking or calculate Salesman’s source-of-truth payout.

## Required Salesman → Direct outputs

For each attributed `external_opportunity_id`, Salesman must return:

| Group | Minimum fields |
|---|---|
| Attribution | Partner, campaign, referral code, attribution state and source rule/version |
| Funnel | Enquiry, qualified, offer, booking and stay outcome status |
| Payout | Eligible/ineligible/settled status, payout amount, reason and settlement timestamp |
| Audit | Original attribution, correction record/reason, last update time |

## Salesman status mapping

```text
attributed
enquiry_created
qualified
offer_sent
booking_confirmed
stay_completed
payout_eligible
payout_settled
attribution_disputed
payout_ineligible
```

### Controlled attribution and payout rules

- Phase 1 recommendation: first valid tracked referral source wins.
- Preserve original attribution after a booking; any change is an explicit correction event with an actor and reason.
- Duplicate traveller requests must use a documented duplicate-resolution rule.
- Partner payout is not eligible until Revenue reports `stay_completed`.
- Cancellation, no-show, invalid/referral conflict and dispute outcomes must result in an explicit payout state.
- Repeated completion events must not create a second payout record.

## Salesman readiness decisions

The Salesman team must document:

1. Referral validation and expiry rules.
2. Partner/campaign active-state rule.
3. First-touch, last-touch or other attribution rule.
4. Duplicate-traveller/referral-conflict process.
5. Payout formula, cap, tax treatment and settlement timeline.
6. Approval authority for attribution corrections and payout disputes.

## Salesman integration test

Using one safe test partner and campaign:

- [ ] Validate an active referral code.
- [ ] Reject/flag invalid, expired and conflicting codes clearly.
- [ ] Attach valid attribution to one Direct opportunity.
- [ ] Receive qualified, offer, booking and completed-stay outcome updates.
- [ ] Calculate payout eligibility only after completed stay.
- [ ] Prove repeated updates do not create duplicate credit or payout.
- [ ] Return attribution correction and payout-ineligible paths with reasons.

## Handoff package

Provide Direct with the approved integration method, dedicated integration/test user, safe test partner/campaign/referral, field/status map, allowed actions, error/rate-limit rules and named technical/operations owners.

---

## Salesman project upgrade brief

### Objective

Upgrade Salesman so it can operate as the accountable acquisition resource for HotelRADAR Direct. A Salesman user must be able to onboard/activate a last-mile partner, issue a unique tracked code, validate that attribution when a traveller arrives and see the outcome through completed-stay partner payout.

This upgrade is not a request to make Salesman a hotel inventory, booking, payment or traveller-support system. Salesman owns acquisition attribution and partner economics; Revenue owns hotel-side transaction outcome.

### Product user story

> As a Salesman operator, I can issue a partner a reliable tracked code, see every Direct opportunity attributed to that partner, retain the source evidence, and pay only when Revenue confirms a completed stay. I can resolve attribution disputes without rewriting history.

### Required screens/workspaces

#### 1. Direct acquisition dashboard

Add a dashboard/filter or identifiable workspace for `external_source = hotelradar-direct`.

Primary cards:

- Active partners and active referral codes.
- Attributed enquiries today/week.
- Verified/qualified opportunities.
- Offers sent and hotel-confirmed bookings.
- Completed stays.
- Partner payout eligible, disputed and settled amounts.
- Attribution conflicts and connector exceptions.

#### 2. Partner profile

Each partner profile must expose:

| Section | Minimum content |
|---|---|
| Identity | Partner ID, name, type, location, owner, active state |
| Agreement | Start/end dates, approved payout model/version, payment details status |
| Tracking | Issued referral code(s), QR/landing identifier, status/expiry and campaign link |
| Performance | Enquiries, qualified requests, bookings, completed stays, payout outcome |
| Audit | Code issue/change/revocation, attribution corrections and payout decisions |

#### 3. Attributed opportunity detail

For every `external_opportunity_id`, show:

1. Original attribution: partner, campaign, referral code, QR/landing source and time.
2. Traveller funnel: enquiry, verification/qualification, offer sent, hotel-confirmed booking, stay outcome.
3. Financial outcome: gross booking value (where approved for Salesman visibility), payout rule/version, eligible/ineligible/settled status and amount.
4. Evidence/timeline: source of status (Direct/Revenue/Salesman), time, actor and correction/dispute reason.

### Required data upgrade

#### Identity and partner tracking

| Field | Type | Required rule |
|---|---|---|
| `partner_id` | Existing unique ID | Stable and searchable |
| `partner_status` | Enum | prospect, active, paused, inactive, terminated |
| `partner_type` | Enum/text | café, restaurant, corporate, planner, mobility, community, other |
| `owner_id` | User relation | Named Salesman accountable owner |
| `agreement_version` | String | Approved commercial rule reference |
| `referral_code` | String | Unique, case-normalised, status and expiry tracked |
| `campaign_id` | Relation | Optional but stable when used |
| `qr_or_landing_id` | String/null | Identifies physical/digital acquisition asset |

#### Direct opportunity attribution

| Field | Type | Required rule |
|---|---|---|
| `external_opportunity_id` | String | Required; unique per Direct opportunity |
| `external_source` | String | Fixed `hotelradar-direct` |
| `attributed_at` | Timestamp | Original validation/attribution time |
| `attribution_status` | Enum | pending, attributed, invalid, expired, conflicted, corrected |
| `attribution_rule_version` | String | First-touch/approved rule applied |
| `original_partner_id` | String/null | Never overwritten; preserves original decision |
| `correction_partner_id` | String/null | Only populated with audit record |
| `correction_reason` | Text/null | Required for correction |
| `last_external_sync_at` | Timestamp | Connector health/recency |

#### Funnel and payout

| Field | Required rule |
|---|---|
| `enquiry_created_at` | Direct request created |
| `qualification_status` | pending, qualified, rejected, cancelled |
| `offer_status` | not_sent, offer_sent, expired, declined |
| `booking_reference` | Stored only after Revenue hotel confirmation |
| `booking_status` | pending, hotel_confirmed, cancelled, issue_review |
| `stay_status` | pending, completed, cancelled, no_show, issue_review |
| `gross_booking_value` | Optional visibility by policy; source is Revenue |
| `payout_rule_version` | Required before eligibility calculation |
| `payout_amount` | Calculated/output amount, never untracked manual text |
| `payout_status` | pending, ineligible, eligible, approved, settled, disputed |
| `payout_settled_at` | Required when settled |

### Referral validation rules

The Salesman team must implement/document these outcomes for a supplied code:

| Result | Meaning | Direct behaviour |
|---|---|---|
| `valid` | Active partner/campaign/code is eligible | Attach attribution before/at qualification |
| `inactive` | Partner exists but is not currently eligible | Store submitted code; do not credit automatically |
| `expired` | Code validity ended | Mark invalid and retain evidence |
| `unknown` | No matching code | Continue Direct request without attribution |
| `conflicted` | Another valid source already owns request | Hold for defined attribution rule/owner |
| `pending` | Salesman unavailable | Keep submitted code; connector retries; no payout promise |

Phase 1 recommended rule: **first valid tracked source wins**. Any alternative must be explicitly documented before launch.

### Required actions

| Action | Preconditions | Result |
|---|---|---|
| Create/activate partner | Required agreement/owner complete | Partner can receive code |
| Issue/revoke referral code | Active partner, campaign and validity rules | Trackable code with audit history |
| Validate referral | Code supplied by Direct | Deterministic validation response |
| Attach opportunity attribution | Valid source or approved pending path | One attributed record linked to Opportunity ID |
| Receive funnel update | Matching Opportunity ID | Current funnel event stored idempotently |
| Evaluate payout | Revenue `stay_completed` outcome available | Eligible/ineligible amount with rule version |
| Approve/settle payout | Finance/approval permissions | Audited payout decision |
| Correct/dispute attribution | Authorised role and reason mandatory | Original attribution retained; correction event created |

### Status transition matrix

| From | Allowed next states | Required evidence |
|---|---|---|
| `pending` | `attributed`, `invalid`, `expired`, `conflicted` | Referral validation result |
| `attributed` | `enquiry_created`, `qualified`, `cancelled`, `attribution_disputed` | Opportunity ID and source evidence |
| `qualified` | `offer_sent`, `cancelled`, `attribution_disputed` | Direct/Revenue qualifying event |
| `offer_sent` | `booking_confirmed`, `cancelled`, `offer_expired` | Revenue/Direct offer event |
| `booking_confirmed` | `stay_completed`, `cancelled`, `no_show`, `issue_review` | Revenue hotel confirmation |
| `stay_completed` | `payout_eligible`, `payout_ineligible`, `attribution_disputed` | Revenue completed-stay outcome + payout rule |
| `payout_eligible` | `payout_settled`, `attribution_disputed` | Approved payout amount |

No event retry may create additional partner credit or payout eligibility.

### Integration requirements

- Expose code validation, partner/campaign lookup, create/read/permitted-update integration through API, webhook/export or approved user workflow.
- Return stable partner/campaign/internal record IDs and update version/timestamp.
- Support idempotency by Opportunity ID + action/version.
- Return clear business errors: invalid code, inactive partner, expired code, conflict, invalid status, duplicate payout, insufficient permission.
- Let Direct retrieve payout status and settlement time; Salesman remains payout source of truth.
- Use a dedicated least-privilege Direct connector account, never Salesman admin credentials.

### Salesman test script

Run before handoff with a safe test partner/campaign:

1. Create/activate test partner and issue `DIRECT-TEST-01` code.
2. Connector validates code and attaches it to `OPP-TEST-001`.
3. Search finds the exact attributed record by Opportunity ID and partner/code.
4. Connector sends qualified, offer-sent, hotel-confirmed and completed-stay events.
5. Salesman calculates eligible payout only after the completed-stay event.
6. Replay every connector event; verify one attribution and one payout record only.
7. Test expired code, inactive partner, duplicate traveller/referral conflict and corrected attribution.
8. Settle the test payout; verify settlement audit actor/time/rule.

### Salesman handoff acceptance

- [ ] Partner and code records have clear active/expiry/owner/commercial state.
- [ ] Referral validation returns deterministic result to Direct.
- [ ] Original attribution is retained permanently, including corrections.
- [ ] Funnel status links to one Opportunity ID from enquiry through completed stay.
- [ ] Payout cannot become eligible before Revenue's completed-stay outcome.
- [ ] Retry/duplicate tests protect against duplicate credit/payout.
- [ ] Technical, acquisition and finance owners have signed test output.
