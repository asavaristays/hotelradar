# HotelRADAR Direct VPS Deployment Specification

## 1. Scope

This VPS hosts the new HotelRADAR Direct frontend/backend, database, queue worker and connector service. It does not host, alter, mount or directly access the Revenue Intelligence or Salesman systems unless their owners separately approve an external normal-user/API connection.

## 2. Recommended production topology

```text
Internet
  ↓ HTTPS 443
Reverse proxy (Nginx or Caddy)
  ├─ hotelradar.in → Direct web application
  └─ /api/* → Direct API application

Private VPS network/processes
  ├─ PostgreSQL (Direct-owned data only)
  ├─ Redis (queue/rate limit/cache)
  ├─ Connector worker (Revenue/Salesman approved external calls)
  └─ Scheduler/backup worker
```

Use separate processes/containers for web/API, connector worker, database and cache. Do not expose PostgreSQL or Redis publicly.

## 3. Host baseline

- Supported Linux LTS release, patched before deployment.
- Dedicated non-root deploy/service user.
- SSH key authentication only; disable root login and password login.
- Firewall default-deny inbound. Permit only SSH from approved administration IPs, HTTP/HTTPS public, and no public database/cache ports.
- Automatic security updates where operationally appropriate.
- Time synchronisation enabled; application/server timestamps use Asia/Kolkata or UTC consistently and APIs include offset.
- Disk, memory, CPU and certificate-expiry monitoring enabled.

## 4. Network and domain configuration

| Hostname | Target | Requirement |
|---|---|---|
| `hotelradar.in` | Direct web application | HTTPS, canonical host, redirect HTTP/alternate host |
| `www.hotelradar.in` | Redirect or approved alias | Choose one canonical public host |
| `api.hotelradar.in` or `/api` | Direct API | HTTPS only; choose one API origin and configure CORS narrowly |

- Issue and auto-renew TLS certificates.
- Set HSTS only after HTTPS is fully validated.
- Limit CORS to approved Direct origins; do not use wildcard credentials CORS.
- Configure reverse-proxy request-body size, timeouts and forwarded headers safely.

## 5. Runtime services

| Service | Exposure | Responsibility |
|---|---|---|
| Direct web/API | Reverse proxy only | Traveller pages, operator console, API |
| Connector worker | Private | Queued Revenue/Salesman integration work |
| PostgreSQL | Private localhost/private network | Direct-owned durable data |
| Redis | Private localhost/private network | Queue, rate limit/cache; not source of truth |
| Scheduler | Private | Expiry jobs, retry jobs, backup verification |
| Monitoring/alerts | Restricted | Health, logs, errors, security and capacity |

Use health endpoints that reveal no sensitive data, for example `/healthz` and `/readyz` behind appropriate rate/network controls.

## 6. Database and backup

- Use a dedicated Direct database/user with only required permissions.
- Separate production from staging databases; never use production PII in local development.
- Run automated encrypted daily backups with defined retention.
- Store backups outside the primary VPS where possible.
- Test restore before launch and at a defined operational cadence.
- Apply migrations through versioned deployment process, never ad-hoc production shell edits.

## 7. Deployment process

1. Build/test immutable release artifact in CI or controlled build environment.
2. Scan dependencies and run unit/integration tests.
3. Deploy application and worker with versioned release identifier.
4. Run approved Direct database migrations.
5. Verify health, auth, request form, queue and connector dry-run/test record.
6. Monitor logs/errors after release.
7. Roll back application release if necessary; database rollback requires a pre-approved safe migration plan.

Deploy Direct only. Do not deploy to or restart Revenue/Salesman systems.

## 8. Minimum production monitoring

- HTTPS/certificate validity.
- HTTP error rate and latency.
- Login/OTP abuse and rate-limit events.
- Queue depth, failed jobs, retry age and connector dependency failures.
- Database connection/error rate, backup success and restore readiness.
- Disk, memory and CPU thresholds.
- Unauthorised access attempts and privileged configuration changes.

## 9. VPS readiness checklist

- [ ] DNS and HTTPS working for canonical Direct domain.
- [ ] Non-root service user, key-only SSH and firewall verified.
- [ ] Direct web/API, connector, database and Redis are separately runnable/restartable.
- [ ] Database/Redis have no public ports.
- [ ] Production secrets are injected securely, not stored in repository.
- [ ] Encrypted backup and restore test passed.
- [ ] Monitoring and named alert recipients are active.
- [ ] Revenue/Salesman are reached only through approved external integration endpoints/accounts.
