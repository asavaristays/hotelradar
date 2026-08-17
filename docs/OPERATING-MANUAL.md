# HotelRADAR Direct — Operating Manual (Backend)

**Status:** In design  
**Audience:** Product + eng + hotel ops  
**Model:** Private-offer assistant (not classic OTA inventory sales). Hotels pay commission on completed HotelRADAR-attributed stays; travellers pay hotels directly.

---

## 1. Mental model vs OTA extranet

| OTA extranet | HotelRADAR hotel ops (target) |
|---|---|
| Sell rooms from allotment / ARI | Respond to **private offer requests** (`OPP-…`) |
| Instant book on OTA | Traveller accepts offer → **pays hotel** → hotel confirms |
| OTA is merchant of record | Hotel is MoR; HotelRADAR is attribution + commission |
| Rate plans pushed to channels | Profile + response SLA + private quote per opportunity |
| Booking ID from OTA | **Demand code** `OPP-…` + **Hotel booking ID** after confirm |
| Commission on OTA checkout | Commission on **stay completed** (then invoice / settle) |

HotelRADAR “extranet” = **hotel control desk** for profile, inbound requests, offers, confirmations, and commission — not a full channel manager replacement (Asavari / PMS can stay system of record for rooms).

---

## 2. Actors & systems

| Actor | Tools |
|---|---|
| Traveller | AI assistant chat (web) |
| HotelRADAR desk | `/desk` + future ops console |
| Hotel user | Future **Hotel Extranet** (`/hotel` or subdomain) + WhatsApp (API later) |
| Finance | Commission ledger + settlements |
| Property truth | `asavari_properties` sync / hotel-owned profile |

---

## 3. Hotel onboarding

### 3.1 Stages

| Stage | Meaning | Exit criteria |
|---|---|---|
| `lead` | Interested (pilot form / sales) | Contact + property name + destination |
| `draft` | Profile started | Legal name, destination, address/area |
| `review` | HotelRADAR QC | Photos, location, inclusions truth checked |
| `contracted` | Commercial terms accepted | Commission %, payment cycle, decision maker |
| `live` | Receives `OPP` routing | Login + notify channel (WhatsApp/email) working |
| `paused` / `offboarded` | Stop routing | Explicit flag |

### 3.2 Minimum profile (live)

- Destination: `Goa` \| `Rajasthan`
- Display name, location string, map link
- Photo set (approved URLs only — never invent)
- Decision maker + notify mobile/WhatsApp
- Response SLA (default: **10 minutes** to first private offer or decline)
- Payment methods accepted (for traveller pay-direct)
- Commission terms (see §6)
- Optional: public Direct website rate / OTA reference (display only)

### 3.3 Backend objects (proposed)

```
hotels
  id, slug, destination, status, display_name, location, …
  notify_whatsapp, notify_email
  commission_pct_bps, commission_model, settlement_cycle
  asavari_property_id? (link if partner)
  live_at, paused_at

hotel_users
  hotel_id, role (owner|ops|finance), mobile, email, auth…

hotel_media / hotel_facts
  approved content for assistant “photos / location / more”
```

**Onboarding API (proposed):** desk-only until self-serve.

- `POST /api/v1/desk/hotels` — create draft  
- `PATCH /api/v1/desk/hotels/:id` — profile + commercial  
- `POST /api/v1/desk/hotels/:id/go-live` — status → `live`  
- Later: hotel self-serve under hotel auth  

Pilot shortcut: seed catalog → map each card to a `hotels` row when contracting.

---

## 4. Extranet-style hotel working (ops loop)

### 4.1 Inbound request (hotel view)

When traveller confirms private offer in assistant:

1. Opportunity exists: `OPP-YYYYMMDD-####`  
2. Status → `routed` / `hotel_notified`  
3. Hotel sees **trip + selected property + OTA/Direct reference**  
4. **Traveller mobile hidden** until payment confirmed (`mobile_shared_at` null)

Hotel actions (extranet or WhatsApp structured reply):

| Action | Result |
|---|---|
| Issue private offer | `offers_cache` row; status → `offer_sent`; start **accept 10‑min** clock |
| Need more details | `more_details_needed` |
| Decline | `hotel_declined` |
| Timeout (10 min) | `offer_expired` / no-offer path for traveller |

### 4.2 After traveller accepts

Status → `traveller_accepted`. Hotel receives: accept + **pay-direct instructions** (their UPI/bank/link). Still no full mobile until pay confirmed (desk or hotel marks paid).

### 4.3 Hotel confirms booking

Hotel enters / generates **Hotel booking ID** → status `hotel_confirmed`.  
Then mobile may be shared for stay ops.

### 4.4 Stay → commission

Check-out / desk marks `stay_completed` → `commission_due` → finance `settled`.

### 4.5 Extranet screens (MVP)

1. **Inbox** — open `OPP`s with countdown  
2. **Offer composer** — room, total, inclusions, valid_until  
3. **Accepted** — awaiting payment / confirm booking ID  
4. **Stays** — upcoming / completed  
5. **Commission** — due / settled statements  
6. **Profile** — photos, location, notify channel  

WhatsApp = thin client for inbox + offer until API is live; extranet is source of truth for amounts and booking IDs.

---

## 5. ID generation

### 5.1 Demand / opportunity (exists)

| ID | Format | When |
|---|---|---|
| Opportunity | `OPP-YYYYMMDD-####` (UTC day sequence) | Traveller request created |
| Public token | opaque `public_token` | Traveller URL / chat session bind |
| Offer | `OFR-{OPP}-v{n}` | Each private offer version |

### 5.2 Hotel booking ID (design)

| ID | Format (proposal) | When |
|---|---|---|
| HotelRADAR booking | `HRB-YYYYMMDD-####` **or** hotel’s own PMS ref stored as `hotel_booking_ref` | On `hotel_confirmed` |
| Partner ref | `asavari_booking_ref` | If Asavari/PMS creates stay |

**Rule:** Traveller-facing primary code stays **`OPP-…`** through the journey. **`HRB-…` / hotel PMS ref** is the confirmation number after pay + hotel confirm.

Generation (backend):

```
on hotel.confirm(opportunity_id, hotel_booking_ref?):
  if !hotel_booking_ref: hotel_booking_ref = formatHRB(date, seq)
  set opportunities.hotel_booking_ref / asavari_booking_ref
  status = hotel_confirmed
  event booking.created
  optionally reveal mobile_shared_at = now()
```

---

## 6. Commission

### 6.1 Principles

- Charged on **HotelRADAR-attributed completed stays**, not on OTA checkout  
- Base = agreed private-offer / stay total (define tax treatment in contract)  
- Default model (proposal): **% of stay total** (`commission_pct_bps`, e.g. 1000 = 10%)  
- Trigger: `stay_completed` → ledger line `commission_due`  
- Settlement: weekly/monthly invoice; status → `settled` + `payment.settled` / `commission.booked` events  

### 6.2 Ledger (proposed)

```
commission_entries
  id, opportunity_id, hotel_id
  stay_total_paise, commission_paise, currency
  status: accrued | due | invoiced | settled | void
  period_key, invoice_id?
  created_at, settled_at
```

### 6.3 Edge cases

| Case | Treatment |
|---|---|
| Traveller cancels before stay | No commission (or fee per contract) |
| No-show | Contract clause |
| Offer expired / declined | No commission |
| Dispute | `issue_review`; hold settlement |
| Partner / referral | Separate `referral_code` attribution; does not replace hotel commission |

### 6.4 Finance ops

- Hotel extranet: “Commission” tab (due / settled)  
- Desk: mark stay completed → accrue  
- Export CSV / invoice PDF (phase 2)

---

## 7. Status spine (ops cheat sheet)

```
verification_pending → verified → routed → hotel_notified
  → offer_sent → traveller_accepted → hotel_confirmed
  → stay_completed → commission_due → settled

Branches: more_details_needed | hotel_declined | offer_expired | cancelled | issue_review
```

Timers (product-locked):

- Hotel response: **10 min**  
- Traveller accept: **10 min**  

Persist `offer_request_deadline_at` / `accept_deadline_at` on opportunity (not only client UI).

---

## 8. Privacy (ops)

| Field | Hotel sees before pay | After pay / confirm |
|---|---|---|
| Name | Masked or first name only (TBD) | Full |
| Mobile | **Hidden** | Shared |
| Trip dates / guests / property | Yes | Yes |
| OPP code | Yes | Yes |

Enforce in API serializers for hotel extranet + WhatsApp templates.

---

## 9. Build phases (backend)

| Phase | Scope |
|---|---|
| **A — Design lock** | This manual; commercial defaults (commission %, SLA) |
| **B — Data** | `hotels`, `hotel_users`, `commission_entries`; deadlines + `mobile_shared_at` |
| **C — Desk extranet-lite** | Desk assigns hotel, records offer, confirm booking ID, stay complete |
| **D — Hotel portal MVP** | Inbox + offer + confirm + commission read-only |
| **E — WhatsApp API** | Notify + structured offer reply |
| **F — Finance** | Invoices + settlement workflow |

---

## 10. Open decisions (fill while designing)

1. Default commission **%** and tax on base  
2. Hotel booking ID: always generate `HRB-…` vs allow PMS-only ref  
3. Name visibility to hotel before pay  
4. Who marks “traveller paid”: hotel, desk, or both  
5. Self-serve onboarding vs sales-assisted for Goa/Rajasthan pilot  

---

## Related

- Product locks: `project-reference.md`  
- Spine SQL: `infra/sql/001_spine.sql`  
- Traveller chat: `apps/web/components/assistant/AssistantBookingChat.tsx`  
- Opportunity IDs: `formatOpportunityId` in `packages/shared`  
