# Using the brand kit in HotelRADAR Direct

Canonical kit: this `brand/` folder (v1.0).

## Wired into Direct

| Surface | Path |
|---|---|
| Web CSS tokens | `apps/web/app/globals.css` (`--hr-*`, `--primary` amber, `--secondary` teal, cream surfaces) |
| Web runtime assets | `apps/web/public/brand/*`, favicons, Nunito Sans in `apps/web/public/fonts/` |
| Shared TS tokens | `packages/shared/src/brand.ts` → `HOTELRADAR_BRAND` |
| API | `GET /api/v1/brand` and `brand` block on `GET /api/v1/system` |

## Palette (locked)

- Primary amber `#E0912F` — buttons, pin accent (labels on amber must be ink `#16211F`)
- Teal `#14655C` — door, body emphasis, links, nav icons (white text OK on teal)
- Cream `#FFF7ED` — knockouts / surfaces

## Refreshing from a new kit drop

1. Replace contents of `brand/` with the new kit.
2. Re-copy assets into `apps/web/public/` (favicon, fonts, `brand/`).
3. Sync hex values in `packages/shared/src/brand.ts` and `apps/web/app/globals.css`.
4. Rebuild shared + deploy.
