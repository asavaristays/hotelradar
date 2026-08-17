# HotelRADAR Direct Technical Configuration

## 1. Phase 1 stack

| Layer | Recommended technology | Reason |
|---|---|---|
| Web application | Next.js + TypeScript | Public traveller pages and protected operator console in one deployable application |
| API/connector logic | Node.js + TypeScript | Shared types, robust validation and queue integrations |
| Database | PostgreSQL | Transactional Opportunity/audit data |
| Queue/cache/rate limiting | Redis + BullMQ | Durable connector retries and background work |
| Reverse proxy | Nginx or Caddy | TLS termination, routing and security headers |
| Observability | Structured logs + error/uptime monitoring | Operational control during pilot |

Equivalent technologies are acceptable if they preserve the security, auditability and operational requirements in this repository.

## 2. Environment separation

| Environment | Purpose | Rules |
|---|---|---|
| Local | Individual developer work | No production PII or production credentials |
| Staging | Integration/test verification | Test Revenue/Salesman records and separate credentials |
| Production | Live Goa pilot | Restricted access, real traveller data, monitored backups |

Production configuration must never be copied into frontend/browser environment variables.

## 3. Required environment variables

Store actual values in secret management/VPS environment only. Use this documented key list, never commit values.

```text
NODE_ENV=production
APP_URL=https://hotelradar.in
API_BASE_URL=https://hotelradar.in/api/v1
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

AUTH_SECRET=...
OTP_PROVIDER=...
OTP_PROVIDER_API_KEY=...
OTP_SENDER_ID=...

REVENUE_BASE_URL=https://revenue.hotelradar.in
REVENUE_INTEGRATION_AUTH=...
REVENUE_WEBHOOK_SECRET=...

SALESMAN_BASE_URL=https://salesman.hotelradar.in
SALESMAN_INTEGRATION_AUTH=...
SALESMAN_WEBHOOK_SECRET=...

LOG_LEVEL=info
ERROR_MONITORING_DSN=...
BACKUP_ENCRYPTION_KEY=...
```

- Prefix only browser-safe public variables with the framework’s public prefix.
- External-system auth values are connector-only secrets.
- Never log environment variables or include them in API error output.

## 4. Application configuration rules

### Public request limits

Configure conservative initial limits and tune from observed abuse:

| Action | Suggested initial limit |
|---|---|
| Create request | 5 per IP/hour |
| Send OTP | 3 per mobile/hour, 10 per IP/hour |
| Verify OTP | 5 attempts per token/hour |
| Public status/offer read | 60 per token/IP/hour |
| Operator login | 5 failed attempts then temporary lock/step-up process |

### Time and expiry

- OTP expiry: 10 minutes maximum.
- OTP resend cooldown: 30-60 seconds.
- Offer expiry: show only a real Revenue-provided expiry; no invented countdown.
- Connector retry: exponential backoff with capped attempts and operator escalation.
- Session expiry: short idle session with reauthentication for privileged action.

### Data validation

- Validate dates, date order, guest/room counts, phone number, email and INR values server-side.
- All status transitions use a state-machine guard.
- All connector writes use an idempotency key.
- Store money as integer paise; format INR at presentation layer.

## 5. Direct database configuration

Minimum tables/entities:

```text
users, roles, sessions
opportunities, traveller_requests, consent_records
external_references, opportunity_events
offers_cache, support_notes, escalations
connector_jobs, connector_attempts
otp_challenges, audit_events
```

- Index `external_opportunity_id`, `public_token`, status, owner, created/updated times and external reference IDs.
- Use foreign keys and transactions for Opportunity/event/job writes.
- Preserve append-only event history; avoid destructive updates to commercial/audit facts.

## 6. Queue configuration

Queues:

```text
revenue.sync
salesman.sync
notification.send
offer.expiry
connector.retry
maintenance.cleanup
```

- Set bounded concurrency so external systems are not overloaded.
- Use dead-letter/failed-job storage with safe error information.
- Alert when a job exceeds SLA or retry limit.
- Scheduled jobs must be idempotent and safe if executed twice.

## 7. External integration configuration

- Keep each adapter (`revenue`, `salesman`) separate behind a small interface.
- Map external statuses into Direct canonical statuses in configuration/code with tests.
- Feature-flag each integration action until safe test records pass.
- Record `last_synced_at`, external record ID, source version and correlation ID.
- Treat external timeout/unavailability as recoverable pending work, not a traveller-facing system error.
- Use allow-listed base URLs; never accept endpoint URLs from user input.

## 8. Release configuration checklist

- [ ] Staging request → OTP → Revenue test record → offer → completion → Salesman payout path passed.
- [ ] Production settings differ from staging only through reviewed environment/configuration.
- [ ] Security headers, CORS, cookies and rate limits verified.
- [ ] Database migrations are versioned and backup exists before applying.
- [ ] Health checks, logs, monitoring and alerts are live.
- [ ] Feature flags allow connector action to be disabled safely without taking down traveller request capture.
- [ ] No Revenue/Salesman secret, database connection or deployment control is present in Direct configuration.
