# HotelRADAR Direct Security Specification

## 1. Security objective

Protect traveller data, operational records, connector credentials and audit history while keeping Revenue Intelligence and Salesman isolated, separately owned systems.

Direct must never access either external system database directly or change their infrastructure, schema, configuration, users or workflows.

## 2. Asset classification

| Asset | Classification | Examples |
|---|---|---|
| Authentication secrets | Restricted | Session keys, API credentials, OTP provider secrets, database password |
| Traveller PII | Confidential | Name, mobile, email, stay dates, booking reference |
| Commercial data | Confidential | Hotel offer, gross booking value, commission, payout |
| Internal operations | Internal | Opportunity timeline, support notes, connector logs |
| Public content | Public | Marketing copy, How It Works, terms and privacy pages |

## 3. Identity and access

### Direct roles

| Role | Minimum permission |
|---|---|
| Traveller | Access only to their opaque request/offer token; cannot view internal IDs or other requests. |
| Booking Desk operator | Assigned opportunities, authorised request edits, support notes and approved connector actions. |
| Operations lead | Queue management, reassignment, exception resolution and operational reporting. |
| Finance | Read booking/stay/commission/payout outcome; no traveller request edits. |
| Direct administrator | User/role management, configuration and connector credential rotation. |
| Connector service account | Machine-only, least-privilege external-system calls. |

- Require MFA for Operations Lead, Finance and Administrator.
- Require strong passwords, rate-limited login and secure session expiry.
- Enforce server-side role checks on every action; never rely on hidden UI controls.
- Use separate accounts/credentials for staging and production.
- Do not use Revenue or Salesman administrator accounts for Direct integration.

## 4. Data protection

- TLS 1.2+ for all browser and service traffic; redirect HTTP to HTTPS.
- Encrypt database volumes/backups and use encrypted transport to the database.
- Encrypt or securely protect sensitive application fields where supported.
- Store no payment-card data; payment is made directly to the hotel.
- Mask mobile/email in lists, dashboards and logs; reveal only to authorised roles in an individual record.
- Store consent version, timestamp, source and user-facing purpose.
- Set and document data retention/deletion rules before live launch.
- Do not place traveller PII, booking references, cookies, API tokens or OTPs in URLs.

## 5. Application security

- Validate all input server-side: dates, guest counts, money, phone, email, public token and status transitions.
- Use parameterised database access/ORM; never interpolate user input into queries.
- Use CSRF protection for cookie-authenticated state-changing requests.
- Set secure cookie flags: `HttpOnly`, `Secure`, appropriate `SameSite` and short session TTL.
- Apply security headers: Content-Security-Policy, frame-ancestors policy, HSTS, X-Content-Type-Options, Referrer-Policy and Permissions-Policy.
- Rate-limit public request, OTP-send, OTP-verify, login, token lookup and API endpoints.
- Keep dependencies patched and run vulnerability scanning in CI/release process.
- Sanitize/render internal notes and external response text safely to prevent stored XSS.
- Generate opaque, high-entropy public request/offer tokens; do not expose sequential IDs.

## 6. Connector security

- Connector runs as a separate service/process account from public web application.
- Use dedicated least-privilege integration accounts for Revenue and Salesman.
- Keep credentials only in server-side secret storage/environment; never commit them or expose them to browser JavaScript.
- Allow connector actions only through approved Revenue/Salesman normal-user/API/export capabilities.
- Do not connect to their databases, mount their filesystems or reuse their deployment secrets.
- Sign outbound webhook requests where the receiving system supports it; verify incoming signatures before accepting events.
- Use idempotency keys and a queue to prevent duplicate actions.
- Redact request/response logs; retain only safe correlation IDs and error codes.

## 7. Audit and monitoring

Every material Opportunity event must record:

```text
event ID, Opportunity ID, timestamp, actor type/ID, source system,
previous status, new status, safe action payload reference and result
```

- Audit access to sensitive record views, exports, role changes and configuration changes.
- Keep immutable or append-only event history; corrections are new events.
- Monitor application errors, authentication failures, connector retries/failures, queue backlog, database health, backup success and disk capacity.
- Send security/availability alerts to named Operations and Engineering owners.

## 8. Incident response

1. Contain: disable compromised account/key or public endpoint.
2. Preserve: retain audit logs and safe evidence; do not delete history.
3. Assess: determine affected data, opportunities and external integrations.
4. Recover: rotate credentials, patch issue, re-run safe queued work.
5. Communicate: notify system owner and affected users where legally/contractually required.
6. Learn: document cause, corrective control and owner.

## 9. Pre-launch security checklist

- [ ] Production HTTPS, domain certificates and security headers verified.
- [ ] MFA and role checks tested.
- [ ] Rate limits tested for OTP, public request and login flows.
- [ ] Secrets are outside repository and can be rotated.
- [ ] Revenue/Salesman credentials are least privilege and revocable.
- [ ] Backups succeed and a restore test has passed.
- [ ] Audit logs and connector error alerts are active.
- [ ] Privacy policy, consent language and retention rules are approved.
- [ ] Dependency scan and basic penetration/security review are completed.
