# HotelRADAR Direct - Backend and Operator Console Design Specification

**Product:** HotelRADAR Direct operational backend  
**Audience:** HotelRADAR Booking Desk operators, operations lead and limited administrators  
**Phase 1 role:** Securely track the traveller request and orchestrate approved resource use in Revenue Intelligence and Salesman. Revenue and Salesman remain independent external systems.

## 1. Purpose and boundary

The Direct backend is the operational record for traveller requests, consent, verification, support work, connector activity and the shared Opportunity timeline. It is not a replacement for Revenue Intelligence or Salesman.

| System | Direct backend may do | Direct backend must not do |
|---|---|---|
| Revenue Intelligence | Create/read/update only through its approved integration/user capabilities; display synced hotel and booking outcome | Change Revenue code, schema, deployment, configuration, users or internal workflow |
| Salesman | Validate/read/write approved attribution and funnel outcome through its approved integration/user capabilities | Change Salesman code, schema, deployment, configuration, users or internal workflow |
| HotelRADAR Direct | Store Direct-owned data, run connector queues, manage support tasks and present controlled traveller pages | Directly change either external database |

## 2. Internal visual direction

The operator console must use the same HotelRADAR Direct design language as the public site, but optimise for scanning and reliable daily work.

- **Canvas:** `#FFFCF9` warm white.
- **Navigation:** deep navy `#101D3A` side rail on desktop; compact top bar on mobile/tablet.
- **Cards/tables:** white surfaces, `#E3E7EE` borders, 12-16px corners.
- **Primary action:** coral `#FF4054`; never use red as a destructive action without a confirmation step.
- **Text:** Inter, navy headings, slate secondary content.
- **Status colours:** navy/grey for neutral, coral for active attention, green for verified/completed, amber for SLA risk, red only for error/decline/blocked.
- **Density:** 14px table content, 16px card titles, minimum 44px clickable targets.
- **Avoid:** generic dark admin templates, overly dense spreadsheets, gradient dashboards, colour-coded data without labels.

## 3. Operator console information architecture

```text
Overview
Opportunities
  - Active queue
  - Needs attention
  - Completed / archive
Offers
Connector activity
Partners & attribution (read/sync view)
Hotels (read/sync view)
Reports
Settings (administrators only)
```

### 3.1 Overview dashboard

Top metrics are operational, not vanity metrics:

- New verified requests today.
- Requests waiting for first action.
- Hotels awaiting response / SLA-risk count.
- Offers ready to send.
- Booking confirmations pending.
- Stays awaiting completion confirmation.
- Connector failures requiring intervention.

Use a “Needs attention” list as the central dashboard element. Each row links directly to an Opportunity and shows: priority, time waiting, current status, owner and next required action.

### 3.2 Opportunity queue

Default columns:

| Column | Purpose |
|---|---|
| Priority / SLA | Deadline and overdue indicator |
| Opportunity ID | Internal reference plus copy action |
| Traveller | Masked contact in list; reveal only inside authorised record |
| Stay | Date range, nights, guests/rooms |
| Requested area/property | Intent at a glance |
| Source | Partner/campaign/referral, where valid |
| Status | Current canonical Direct status |
| Hotel progress | Routed count, offers received, last hotel event |
| Owner | Named operator |
| Updated | Latest material event time |

Filters: status, urgency, stay date, area, owner, source partner, hotel, connector exception. Search by opportunity ID, booking reference, phone (permission-controlled) and hotel name.

### 3.3 Opportunity detail workspace

Header:

- Opportunity ID, status badge, priority, assigned operator and quick actions.
- Traveller request summary.
- Consent and OTP verification state.
- Source attribution state and Salesman link/reference.
- Revenue link/reference.

Tabs or stacked sections:

1. **Timeline** - immutable chronological events with actor, source system and retry/audit metadata.
2. **Traveller request** - editable Direct-owned request details; every post-verification change creates a timeline event.
3. **Hotel & offers** - Revenue-synced route/offer information; show source and last sync time. Only invoke actions permitted by Revenue integration.
4. **Booking & stay** - Revenue-synced booking reference, confirmation, cancellation, completion and commission state.
5. **Attribution** - Salesman-synced partner/campaign/referral and partner-payout outcome.
6. **Support notes** - internal notes, customer-contact attempts and escalation owner. Notes are never sent to external systems unless explicitly selected and permitted.
7. **Connector activity** - request/event history, successful syncs, retries and error remediation.

### 3.4 Quick actions

Only expose actions that the operator is authorised to perform. Examples:

- Verify/correct traveller request.
- Assign owner and priority.
- Send to Revenue / retry approved sync.
- Request traveller clarification.
- Send an approved offer to traveller.
- Mark support contact attempt.
- Escalate issue.
- Cancel Direct request before a hotel confirmation.

Actions that change external system state must display the target system, exact status transition and a confirmation summary before execution.

## 4. Opportunity data model

### 4.1 Direct-owned core object

```text
Opportunity
  id                       internal UUID
  external_opportunity_id  public cross-system ID, unique
  public_token             opaque traveller-status/offer token, unique
  status                   canonical Direct status
  owner_id                 Direct operator
  priority                 normal | urgent | SLA risk
  created_at / updated_at

TravellerRequest
  opportunity_id
  name, mobile, email
  otp_verified_at
  consent_version, consented_at
  requested_area, requested_property
  check_in, check_out, rooms, adults, children
  budget_inr, public_rate_inr, public_rate_evidence
  preferences, special_request

ExternalReference
  opportunity_id
  system                   revenue | salesman
  external_record_id
  external_url
  last_synced_at
  sync_version

OpportunityEvent
  id, opportunity_id, event_type, occurred_at
  actor_type, actor_id, source_system
  previous_status, new_status
  idempotency_key, payload_reference

ConnectorJob
  id, opportunity_id, target_system, action
  idempotency_key, attempt_count, next_attempt_at
  status, error_code, safe_error_message
```

### 4.2 Privacy rules

- Store the minimum personally identifiable information needed for offer fulfilment.
- Encrypt sensitive fields at rest and use TLS for all connectors.
- Mask phone/email in queue lists and logs.
- Audit any privileged reveal/export of traveller contact data.
- Do not store payment-card data. Payment is made directly to the hotel.
- Retain consent version, timestamp and source.

## 5. Canonical lifecycle and state control

The Direct backend owns the canonical cross-system status. External system labels map into this lifecycle; their original values are preserved in event payloads.

```text
draft
  -> verification_pending
  -> verified
  -> qualified
  -> routed
  -> hotel_notified
  -> offer_received
  -> offer_sent
  -> traveller_accepted
  -> hotel_confirmed
  -> stay_completed
  -> commission_due
  -> settled
```

Side states: `more_details_needed`, `hotel_declined`, `offer_expired`, `cancelled`, `issue_review`, `connector_failed`.

Rules:

- Every transition requires actor, timestamp, source and previous/new status.
- `hotel_confirmed` can only be entered from an approved Revenue confirmation outcome.
- `stay_completed`, `commission_due` and `settled` are based on Revenue outcomes, not traveller/operator assumption.
- `payout_eligible` is displayed from Salesman only after a completed stay.
- A state change received twice must be safe and represented only once in the visible timeline.
- No operator can delete timeline events; corrections are new events.

## 6. Connector design

### 6.1 Responsibilities

The connector service bridges Direct with approved Revenue and Salesman capabilities. It runs separately from the browser-facing web application.

| Connector action | Direction | Purpose |
|---|---|---|
| Create/update qualified opportunity | Direct → Revenue | Begin hotel-side workflow |
| Retrieve route, offer, booking, stay and commission state | Revenue → Direct | Keep traveller/operator state truthful |
| Validate referral/partner/campaign | Salesman → Direct | Attribute valid acquisition source |
| Send funnel and completed-stay outcome | Direct → Salesman | Maintain source and payout workflow |
| Retrieve payout eligibility/settlement | Salesman → Direct | Show operational status; do not calculate separate payout truth |

### 6.2 Reliability controls

- Each request uses an idempotency key derived from opportunity ID + action + source version.
- Queue outbound work; do not block traveller form submission on an external system response.
- Retry temporary failures with exponential backoff and a bounded maximum.
- Move exhausted jobs to a visible exception queue with manual retry.
- Record request metadata and response codes; never log passwords, tokens or unmasked personal data.
- Use a dedicated least-privilege integration user for each external system.
- Do not connect directly to Revenue or Salesman databases.

### 6.3 Handling unavailable systems

| Failure | Direct behaviour |
|---|---|
| Revenue unavailable when request is verified | Keep request as `qualified`; create retry job; show traveller “We are checking your request.” |
| Salesman unavailable during referral validation | Preserve referral submission; mark attribution pending; do not promise a partner reward. |
| Offer sync failure | Do not show an unverified offer to traveller; flag operator task. |
| Booking/stay sync failure | Keep last known status, show “awaiting operational confirmation” internally, escalate. |
| Duplicate external response | Match idempotency key/record version and ignore duplicate visible transition. |

## 7. Roles and permissions

| Role | Permissions |
|---|---|
| Booking Desk operator | View assigned opportunities; update Direct request/support notes; trigger approved connector actions; send approved traveller messages. |
| Operations lead | All operator abilities; reassign, prioritise, resolve exceptions and view reporting. |
| Finance/reconciliation | Read booking/stay/commission/payout data; add reconciliation notes; no traveller request edits. |
| Administrator | Manage Direct users/roles, templates, connector credentials and security settings. |
| Connector service account | Machine-only least-privilege access to approved external system functions. |

Require MFA for Operations Lead and Administrator. Every permission-sensitive action is audited.

## 8. Backend user experience acceptance criteria

- A verified traveller request becomes a searchable Opportunity with a unique cross-system ID.
- An operator can see the next action and SLA risk without searching multiple systems manually.
- Revenue and Salesman sync state shows last successful sync time and clear failure handling.
- Sensitive traveller data is masked outside the authorised record view.
- The same visual language as the public site is used: navy trust, coral action, warm canvas, clean white cards and Inter typography.
- A completed stay can be traced from original traveller request through Revenue outcome and Salesman attribution/payout outcome.
- No action in the Direct console changes Revenue or Salesman except through the explicitly approved normal-user/API capabilities made available at handoff.
