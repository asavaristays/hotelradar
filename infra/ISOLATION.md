# Runtime isolation rules

Compose project: `hotelradar-direct`

## Allowed to share on the VPS

- Host Linux kernel, Docker engine, Cloudflare origin certs
- Nginx as reverse proxy only

## Never share with Asavari or website.hotelradar

- Docker volumes (`direct_postgres`, `direct_redis`)
- Upload / static asset directories
- `.env` / secrets
- Postgres database or role
- Redis instance
- Container network `direct_internal` (no attach from other projects)

## Connectivity to Asavari

HTTPS JSON only (`ASAVARI_BASE_URL`). No bind mounts, no shared DB, no shared Redis.

## Ports (localhost bind)

| Port | Service |
|---:|---|
| 4100 | web |
| 4101 | api |

Nginx `hotelradar.in` must point here — not to `/var/www/website.hotelradar.in` or `/var/www/hotelradar`.

## Secrets & backups (P0)

| Item | Path |
|---|---|
| Env / secrets | `/etc/hotelradar-direct/env` (mode 600; app `.env` is a symlink) |
| Encrypted DB backups | `/var/backups/hotelradar-direct/*.sql.gpg` |
| Backup / sock logs | `/var/www/hotelradar-direct/logs/` |
| Release tags | `/var/www/hotelradar-direct/releases/current` |

Cron (deploy user): `@reboot` docker.sock restore; daily `02:15` UTC `pg_dump` + gpg.
Permanent Docker fix (root once): `usermod -aG docker deploy`.
