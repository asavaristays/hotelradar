# Developing HotelRADAR Direct (frontend + backend)

Infra is complete. Asavari sync stays **off** until a later phase.

## Stack locations

| Layer | Path |
|---|---|
| Web (Next.js) | `apps/web` |
| API (Express) | `apps/api` |
| Shared types | `packages/shared` |
| Brand kit | `brand/` (see `brand/DIRECT-USAGE.md`) |
| VPS runtime | `/var/www/hotelradar-direct` → `:4100` / `:4101` |

Brand palette: amber `#E0912F`, teal `#14655C`, cream `#FFF7ED`. API: `GET /api/v1/brand`.

## Option A — Local FE/BE against VPS API (recommended on this Mac)

```bash
# terminal 1: tunnel VPS API (+ optional web)
ssh -L 4101:127.0.0.1:4101 -L 4100:127.0.0.1:4100 vps-webtechnosys

# terminal 2: local web (proxies /api → localhost:4101)
cd apps/web
cp .env.example .env.local   # once
npm run dev                  # from repo root: npm run dev:web
```

Open http://localhost:4100  
Browser calls `/api/v1/...` → Next rewrite → VPS API via tunnel.

## Option B — Full local API (needs local Postgres)

```bash
cp .env.example .env
# set DATABASE_URL to local Postgres
npm install
npm run build:shared
npm run migrate
npm run dev:api     # :3000 or PORT
npm run dev:web     # :4100
```

## Option C — VPS-only edit cycle

```bash
./scripts/vps-deploy.sh
# smoke
ssh vps-webtechnosys 'curl -s http://127.0.0.1:4101/api/v1/system'
```

## API contract (traveller + desk v1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` `/readyz` | Infra health |
| GET | `/api/v1/system` | Feature flags + version |
| POST | `/api/v1/opportunities` | Create request (+ best-effort OTP send) |
| POST | `/api/v1/opportunities/by-token/:token/otp/send` | Resend OTP |
| POST | `/api/v1/opportunities/by-token/:token/otp/verify` | Verify OTP → `verified` |
| GET | `/api/v1/opportunities/by-token/:token` | Traveller status + timeline |
| POST | `/api/v1/opportunities/by-token/:token/cancel` | Traveller cancel |
| GET | `/api/v1/opportunities/by-token/:token/offer` | Private offer |
| POST | `/api/v1/opportunities/by-token/:token/offer/demo` | Attach demo offer (`OTP_PROVIDER=dev`) |
| POST | `/api/v1/opportunities/by-token/:token/offer/accept` | Accept → Asavari handoff stub |
| GET | `/api/v1/opportunities/desk/queue` | Desk opportunity list |
| GET | `/api/v1/opportunities/desk/exceptions` | Open exceptions |
| GET | `/api/v1/integrations/asavari/contract` | Integration contract |
| GET | `/api/v1/integrations/asavari/status` | Live `/api/health` + auth/cache |
| GET | `/api/v1/integrations/asavari/properties` | Cached Asavari properties |
| POST | `/api/v1/integrations/asavari/sync` | Pull properties (needs auth) |

## Web routes (testing)

| Path | Purpose |
|---|---|
| `/` | Request form |
| `/request/[token]` | OTP + status + timeline |
| `/offer/[token]` | Private offer shell |
| `/desk` | Exceptions + queue |

## Manual test path

1. Open web → submit request (consent on)
2. On status page, use `dev_code` / Dev OTP → Verify
3. Desk shows exception `verified_awaiting_route` + queue row
4. Status → **Attach demo offer** → open `/offer/[token]` → Accept
5. Asavari sync stays **off**; payment handoff is a stub message

Set on VPS env: `OTP_PROVIDER=dev`, `OTP_REVEAL_DEV_CODE=true`.

Do not enable Asavari sync until onboarding fields (`profile_complete`, decision-maker, response hours) exist on Asavari.
