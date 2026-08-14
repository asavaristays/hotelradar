# Marketing Phase 1 — deploy notes

Phase 1 rebuilds `hotelradar.in` marketing in `public/` (Option C — rebuilt from live site patterns).

## Files added/updated

- `public/index.html` — company homepage (radar hero, process, solutions, products, case studies)
- `public/assets/marketing.css` — shared design system (light default, dark via `data-theme`)
- `public/assets/marketing.js` — theme toggle, mobile nav, product selector, demo modal
- `public/login.html` — routes users to `https://revenue.hotelradar.in/` for app sign-in

## NGINX / Cloudflare redirects (defaults)

### socialfrog.in → hotelradar.in

```nginx
server {
  listen 443 ssl http2;
  server_name socialfrog.in www.socialfrog.in;
  return 301 https://hotelradar.in$request_uri;
}
```

### Apex dashboard paths → revenue app

```nginx
location = /dashboard {
  return 302 https://revenue.hotelradar.in/dashboard;
}
location = /admin {
  return 302 https://revenue.hotelradar.in/admin;
}
location = /leadradar {
  return 302 https://revenue.hotelradar.in/leadradar;
}
```

### Static marketing root

Ensure `hotelradar.in` document root serves `public/` (or synced copy), with:

```nginx
index index.html;
try_files $uri $uri/ /index.html;
```

Do **not** serve the React `frontend/dist` index on `hotelradar.in` apex if marketing `index.html` should show.

## Deploy checklist

1. Sync `public/` to VPS marketing web root.
2. Purge Cloudflare cache for `/`, `/assets/*`, `/login.html`.
3. Verify `https://hotelradar.in/` shows new homepage.
4. Verify theme toggle persists (localStorage key: `hotelradar-theme`).
5. Apply socialfrog 301 and `/dashboard` redirects.
6. Confirm `https://revenue.hotelradar.in/` still serves API + React app.

## Product page cache bust

Update `marketing.css` query string on `public/ai-bot/index.html` and `public/whatsapp-automation/index.html` when deploying shared CSS changes.
