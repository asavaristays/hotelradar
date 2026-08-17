# HotelRADAR Direct API Specification

## 1. API principles

- Base path: `/api/v1`.
- JSON request/response; UTF-8; timestamps in ISO-8601 with offset.
- INR monetary values are integer paise or documented integer rupees consistently; Phase 1 recommendation: paise for storage/API.
- Browser-facing APIs use secure session/public token authentication. Internal APIs use service credentials.
- Every mutation returns a correlation ID and writes an Opportunity event.
- No API exposes Revenue or Salesman credentials or direct database access.

## 2. Authentication categories

| API consumer | Authentication |
|---|---|
| Traveller public flow | Opaque public token plus OTP/session where required |
| Direct operator console | Secure authenticated role-based session |
| Connector worker | Internal service credential, network-restricted |
| Revenue/Salesman inbound event | Signed webhook/service credential and idempotency key |

## 3. Shared response envelope

```json
{
  "data": {},
  "meta": {
    "request_id": "req_...",
    "timestamp": "2026-08-04T10:15:00+05:30"
  }
}
```

Error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check-out must be after check-in.",
    "fields": { "check_out": "Must be after check-in" }
  },
  "meta": { "request_id": "req_..." }
}
```

## 4. Traveller endpoints

| Method/path | Purpose | Auth |
|---|---|---|
| `POST /requests` | Create draft traveller request | Public, rate limited |
| `POST /requests/{token}/otp/send` | Send OTP | Public token, rate limited |
| `POST /requests/{token}/otp/verify` | Verify OTP and qualify for processing | OTP/session, rate limited |
| `GET /requests/{token}` | Read safe traveller request status | Public token + verification session where required |
| `PATCH /requests/{token}` | Update allowed pre-confirmation traveller fields | Public token + verification session |
| `POST /requests/{token}/cancel` | Cancel eligible request | Public token + verification session |
| `GET /offers/{token}` | Retrieve current private offer only | Public token + verified session |
| `POST /offers/{token}/accept` | Record traveller acceptance; does not collect payment | Public token + verified session |

### Create request: minimum payload

```json
{
  "area": "Candolim",
  "requested_property": null,
  "check_in": "2026-09-10",
  "check_out": "2026-09-13",
  "rooms": 1,
  "adults": 2,
  "children": 0,
  "public_rate_paise": 1200000,
  "preferences": ["best_rate", "breakfast"],
  "name": "Traveller name",
  "mobile": "+91...",
  "email": null,
  "referral_code": "optional",
  "consent_version": "2026-08-04",
  "consent": true
}
```

Response includes opaque `public_token`, safe request summary and `verification_pending` status. It must not include internal user/contact data beyond the current traveller request.

## 5. Operator endpoints

| Method/path | Purpose |
|---|---|
| `GET /opportunities` | Filtered paginated operator queue |
| `GET /opportunities/{id}` | Full authorised record/workspace |
| `PATCH /opportunities/{id}` | Update Direct-owned fields, owner or priority |
| `POST /opportunities/{id}/qualify` | Move valid verified request to qualified |
| `POST /opportunities/{id}/sync/revenue` | Queue approved Revenue action/retry |
| `POST /opportunities/{id}/sync/salesman` | Queue approved Salesman action/retry |
| `POST /opportunities/{id}/offer/send` | Send currently approved offer to traveller |
| `POST /opportunities/{id}/notes` | Add internal support note |
| `POST /opportunities/{id}/escalations` | Create issue/owner/escalation |
| `GET /connector/jobs` | View connector queue/errors by permission |

All state-changing endpoints require CSRF/session checks, role authorisation, audit event and idempotency key.

## 6. External event endpoints

| Method/path | Purpose |
|---|---|
| `POST /integrations/revenue/events` | Receive approved Revenue events if inbound webhook is supported |
| `POST /integrations/salesman/events` | Receive approved Salesman events if inbound webhook is supported |

Required event properties:

```json
{
  "event_id": "evt_...",
  "event_type": "hotel.offer_received",
  "occurred_at": "2026-08-04T10:15:00+05:30",
  "external_opportunity_id": "OPP-20260804-0001",
  "system_record_id": "REV-12345",
  "previous_status": "hotel_notified",
  "new_status": "offer_received",
  "idempotency_key": "...",
  "payload": {}
}
```

Reject unsigned/unauthenticated events, unknown Opportunity IDs and invalid status transitions. Accept safe duplicate delivery with a successful idempotent response.

## 7. API status codes

| Code | Meaning |
|---:|---|
| 200/201 | Request succeeded / resource created |
| 202 | Connector action accepted and queued |
| 400 | Malformed request |
| 401/403 | Authentication/authorisation failure |
| 404 | Resource/token not found |
| 409 | Conflict or invalid state transition |
| 422 | Field validation failed |
| 429 | Rate limit reached |
| 500 | Unexpected Direct error |
| 502/503 | External dependency unavailable; do not expose raw vendor error |

## 8. API release tests

- [ ] Public request/OTP flow cannot enumerate or leak other traveller records.
- [ ] Invalid dates, money values, consent and OTP attempts fail safely.
- [ ] Operator role cannot execute administrator-only action.
- [ ] External event retry does not duplicate timeline, offer, booking or payout.
- [ ] A Revenue-confirmed offer is the only offer that can be published.
- [ ] API error output never includes secret, stack trace or unmasked third-party credentials.
