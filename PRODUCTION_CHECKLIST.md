# Production Checklist - Radar Light

## 1) Required Environment Variables
Set these on VPS before starting PM2:

- `NODE_ENV=production`
- `PORT=3000`
- `DATABASE_URL=postgresql://<user>:<password>@<host>:5432/radar_light`
- `JWT_SECRET=<strong-random-secret>`
- `AUTH_PEPPER=<strong-random-secret>`
- `TOKEN_TTL_MINUTES=720`
- `CORS_ORIGINS=https://revenue.hotelradar.in`
- `LOG_LEVEL=info`
- `LOG_DIR=logs`
- `ENABLE_CONSOLE_LOGS=false`
- `REQUEST_BODY_LIMIT=1mb`
- `RATE_LIMIT_WINDOW_MS=60000`
- `RATE_LIMIT_MAX=240`
- `REQUIRE_API_KEY=true` (recommended for webhook endpoints)
- `INTERNAL_API_KEY=<strong-random-secret>`

## 2) First-Time VPS Setup
1. Install Node.js 18+ and npm.
2. Install PostgreSQL client tools (`psql`).
3. Install PM2 globally:
   - `npm i -g pm2`
4. Clone repository on VPS.
5. Configure environment variables (systemd, shell profile, or PM2 ecosystem env).
6. Run migration and seed (seed optional for non-demo):
   - `npm ci`
   - `npm run db:migrate`
7. Build frontend:
   - `npm --prefix frontend ci`
   - `npm --prefix frontend run build`
8. Start services with PM2:
   - `pm2 start ecosystem.config.cjs --env production`
   - `pm2 save`

## 3) Deployment Process
Use:

```bash
./deploy.sh main
```

Deploy flow:
- pull latest git
- install dependencies
- run tests
- run migrations
- build frontend
- reload PM2

## 3.1) Revenue Subdomain Setup
For `revenue.hotelradar.in`, keep the frontend and API on the same origin:
- point DNS for `revenue.hotelradar.in` to the VPS
- terminate HTTPS at the reverse proxy
- proxy all app traffic to the Node process on `127.0.0.1:3000`
- serve `frontend/dist` through the backend or the reverse proxy
- keep SPA fallback enabled so `/dashboard`, `/admin`, `/leadradar`, and `/legal/*` open correctly on refresh

If tests fail, deployment stops automatically.

## 4) Migration Safety
- Migrations are tracked in `schema_migrations`.
- Migration runner skips already-applied files.
- App startup validates schema version; in production startup fails when migrations are pending.

## 5) Rollback Process
1. Checkout previous stable git commit/tag.
2. Restore previous environment values if changed.
3. If schema rollback is needed, apply a dedicated rollback migration (never manual table drops in production).
4. Rebuild and restart:
   - `npm ci`
   - `npm --prefix frontend ci`
   - `npm --prefix frontend run build`
   - `pm2 startOrReload ecosystem.config.cjs --env production`

## 6) Monitoring Recommendations
- Use `/health` for liveness checks.
- Use `/ready` for readiness checks (DB + calibration + migration state).
- Ship `logs/app-error.log` and `logs/app-info.log` to centralized logging (ELK/Datadog/CloudWatch).
- Alert on:
  - `/ready` != ready
  - repeated 5xx rate spikes
  - migration failures
  - worker backlog growth (`recalc_jobs` pending/retrying)

## 7) Security Baseline
- Keep `helmet` enabled.
- Restrict CORS origins to exact production domains.
- Enforce API key for webhook recalculation endpoints.
- Rotate secrets quarterly.
- Use HTTPS termination at load balancer or reverse proxy (Nginx/Caddy/ALB).
