# Deploy Notes (Radar Light)

## 1. Runtime Topology

- `frontend`: serves React dashboard (port `5173`)
- `backend`: Express API and intelligence engine (port `3000`)
- `postgres`: state store and seeded pilot data (port `5432`)

## 2. Docker Deployment

```bash
docker compose up --build -d
```

Then run seed once:

```bash
docker compose exec backend sh -lc 'npm run db:seed'
```

## 3. n8n Cron Hook

- Cron: daily run.
- HTTP Request:
  - Method: `POST`
  - URL: `https://<your-host>/webhook/hotel/<hotel-uuid>/recalculate`
  - JSON body:
    ```json
    {"trigger":"daily_cron","source":"n8n"}
    ```

## 4. Logging & Error Handling

- Structured JSON logs from backend (`src/config/logger.js`).
- Error middleware returns normalized API errors.
- Health endpoint: `GET /health`.
- Security headers are enabled in `src/app.js` (no extra library required).

## 5. Scraper Replacement Path

Current scraper is deterministic mock:

- `/Users/manishpurohit/Documents/radar_light/mock/mockScraper.js`

Upgrade path:

1. Add Playwright scraper workers.
2. Persist normalized snapshots into `competitor_rates`.
3. Keep fallback policy:
   - saved snapshot first
   - scraper attempt second
   - neutral signal fallback if both missing

## 6. Add New City

1. Insert city row in `city_weights`.
2. Extend `seasonEngine.js` month profile.
3. Seed airfare + holidays for city.
4. No controller changes needed.
