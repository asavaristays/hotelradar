# Automation and beta operations

## Production process

Production app:

```bash
cd /opt/radar_light
```

Common operations:

```bash
npm run db:migrate
npm --prefix frontend run build
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save
```

Smoke checks:

```bash
curl -I https://revenue.hotelradar.in
curl https://revenue.hotelradar.in/health
curl https://revenue.hotelradar.in/ready
pm2 list
pm2 logs radar-light-api --lines 100
```

## Daily Market Intelligence email

Generate and send one hotel email:

```bash
npm run briefs:morning -- \
  --hotel-id "<hotel_uuid>" \
  --stay-date "YYYY-MM-DD" \
  --channel email \
  --recipient-email "recipient@example.com"
```

Generate without sending:

```bash
npm run briefs:morning -- \
  --hotel-id "<hotel_uuid>" \
  --stay-date "YYYY-MM-DD" \
  --channel manual
```

## SMTP configuration

Configured through `.env` only:

```bash
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_REQUIRE_TLS=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
EMAIL_REPLY_TO=
```

If a password includes `#`, spaces, or shell-sensitive characters, quote it in `.env`.

Example format only:

```bash
SMTP_PASS="value-with-special-characters"
```

Never store real values in documentation.

## Suggested automation schedule

For beta:

- 06:00: capture OTA/competitor snapshots.
- 06:15: capture event, holiday, search, airfare, weather signals.
- 06:30: run normalization and Central Intelligence.
- 06:45: generate System Health.
- 07:00: send Daily Market Intelligence email/PDF.
- 10:30: optional rate freshness refresh.
- 16:00: optional evening watch update for high-pressure dates.

## Cron example

Use only after source adapters are stable:

```cron
0 7 * * * cd /opt/radar_light && npm run briefs:morning -- --channel email --limit 25 >> /opt/radar_light/logs/daily-market-intelligence.log 2>&1
```

For now, prefer explicit hotel-level commands during beta until all recipients and source readiness are verified.

## Backup and cleanup policy

Keep:

- latest clean source rollback backup;
- previous milestone backup;
- database backup before destructive data work.

Remove:

- old huge duplicate source archives;
- local `coverage`;
- stale frontend build output if rebuilt;
- old temporary PDF/output folders;
- macOS `._*` metadata files on VPS.

Do not remove:

- `db/migrations`;
- `.env`;
- `shared`;
- current `frontend/dist` on production;
- source files used by active services;
- production DB rows without targeted reason.

## Beta reliability priorities

1. Make dashboard and email fast enough for daily use.
2. Keep source freshness visible.
3. Record every failed source with reason.
4. Prevent stale data from generating strong action.
5. Keep logs inspectable.
6. Reduce old dead files that confuse operators.
7. Do not touch unrelated VPS projects.

## Current known risks

- Some npm audit warnings remain and should be reviewed separately.
- Frontend bundle is large and should be code-split later.
- Live adapters are not all connected yet.
- PMS pickup, review velocity, and digital asset scoring remain expansion work.
- Hostinger SMTP secrets are server-side only and must remain out of code/docs.
