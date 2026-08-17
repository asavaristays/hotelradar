# HotelRADAR Direct

Isolated opportunity stack for the Goa pilot.

- **Direct** owns demand, OTP/consent, private offers, commission spine, desk queue
- **Asavari Stays** owns property truth, booking, and payment (separate system)
- **No shared Docker volumes** with `website.hotelradar.in` or Asavari

Compose project name: `hotelradar-direct`

## Stack

| Service | Role | Local bind |
|---|---|---|
| `web` | Next.js traveller / desk shell | `127.0.0.1:4100` |
| `api` | Express API + migrations | `127.0.0.1:4101` |
| `worker` | Connector job poller | internal |
| `postgres` | Direct DB (`direct_postgres`) | internal |
| `redis` | Queue / cache (`direct_redis`) | internal |

## Status

**Infra layer complete** for FE/BE work. Asavari sync remains disabled.

See [DEV.md](./DEV.md) to start frontend/backend development.

## Quick start (Docker)

```bash
cp .env.example .env
# install Docker Desktop / Colima first
docker compose --env-file .env up -d --build
curl -s http://127.0.0.1:4101/healthz
curl -s http://127.0.0.1:4101/readyz
```

Create a synthetic opportunity:

```bash
curl -s -X POST http://127.0.0.1:4101/api/v1/opportunities \
  -H 'content-type: application/json' \
  -d '{
    "name": "Test Traveller",
    "mobile": "+919876543210",
    "consent_version": "2026-08-08",
    "consent": true,
    "requested_area": "Candolim",
    "check_in": "2026-09-10",
    "check_out": "2026-09-13",
    "rooms": 1,
    "adults": 2,
    "children": 0,
    "public_rate_paise": 1200000,
    "referral_code": "DIRECT-TEST-01"
  }'
```

## Local Node (without Docker)

Requires Postgres. Redis optional for Phase 0 API.

```bash
cp .env.example .env
# point DATABASE_URL at local Postgres, create DB hotelradar_direct
npm install
npm run build:shared
npm run migrate
npm run dev:api
```

## VPS (live Phase 0)

| Item | Value |
|---|---|
| Path | `/var/www/hotelradar-direct` |
| Compose project | `hotelradar-direct` |
| API | `http://127.0.0.1:4101` |
| Web | `http://127.0.0.1:4100` |
| Volumes | `hotelradar-direct_direct_postgres`, `hotelradar-direct_direct_redis` |
| Asavari sync | off |
| `hotelradar.in` nginx | **unchanged** (still 301 → website) |

Redeploy from laptop:

```bash
cp .env.example .env.deploy   # once; keep secrets local
./scripts/vps-deploy.sh
```

After VPS reboot, if `docker ps` fails for `deploy`, restore socket group (docker group is empty on this host):

```bash
sudo chown root:www-data /var/run/docker.sock && sudo chmod 660 /var/run/docker.sock
```

Prefer permanently: root runs `usermod -aG docker deploy`.

Cut over public DNS/nginx only after OTP + offer flow exist — use `infra/nginx/hotelradar.in.conf`.

## Infra hardening (P0)

On VPS as `deploy`:

```bash
# after code sync
bash /var/www/hotelradar-direct/scripts/vps-infra-harden.sh
```

This:
- moves secrets to `/etc/hotelradar-direct/env` (mode 600)
- installs `@reboot` docker.sock restore + daily 02:15 UTC encrypted DB backup
- tags compose images for rollback (`releases/current`)
- runs a decrypt-only restore drill on the newest backup

Deploy / rollback from laptop:

```bash
./scripts/vps-deploy.sh
ROLLBACK_TAG=release-... ./scripts/vps-deploy.sh --rollback
```

## Phase 0 delivered

- Opportunity ID (`OPP-YYYYMMDD-####`) + append-only events
- Traveller request table + public token
- Desk exceptions table + connector jobs
- Asavari contract endpoint (stub, HTTPS-only policy)
- Isolated compose network/volumes

## Next

1. OTP verify flow
2. Booking desk UI on web
3. Asavari `profile_complete` snapshot adapter
4. Private offer + book handoff carrying Opportunity ID
