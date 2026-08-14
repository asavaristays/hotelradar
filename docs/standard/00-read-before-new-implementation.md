# Read before new implementation

## Product rule

Build HotelRADAR as Market Intelligence for hotels. Do not reduce it to a generic dashboard, generic RMS, or decorative analytics screen.

The product must answer these daily questions:

- What changed in the market?
- Which dates need attention?
- Is the hotel priced correctly versus the market?
- Where is the hotel exposed?
- Which signals are ready, supporting, stale, or missing?
- What action is safe today?
- What should revenue, reservations, sales, and owner/GM do next?

## Current beta truth

- Pilot property: The Ten Resort Siolim Goa.
- Live domain: `https://revenue.hotelradar.in`.
- Production app path: `/opt/radar_light`.
- Local source path: `/Users/manishpurohit/Documents/radar_light`.
- Current scope is advisory. The system does not push rates to PMS, OTA, CRS, or channel manager.
- SMTP delivery is configured through environment variables only.
- Daily Market Intelligence email with PDF attachment is implemented.
- Strong price actions must stay locked unless evidence is ready.

## Non-negotiables

- Missing values stay `null` and must render as `Not captured` or `Unavailable`.
- Never convert missing rate, market price, suggested price, or market position into zero.
- Do not use Goa Tourism CSV as a dependency for intelligence.
- Do not use unverified data as if it is live truth.
- Do not add a second independent scoring system.
- Do not redesign the product every time a data issue appears.
- Do not delete migrations. They are schema history.
- Do not commit secrets.

## Beta implementation checklist

Before changing code:

1. Confirm the exact feature and user outcome.
2. Identify source tables and service contract.
3. Check whether Central Intelligence already covers the decision.
4. Decide whether the change is data, formula, UI, delivery, or operations.
5. Add test coverage for the changed contract.
6. Run focused tests and frontend build if UI is touched.
7. Deploy only `/opt/radar_light`, not other VPS projects.
8. Smoke test `/health`, `/ready`, and `https://revenue.hotelradar.in`.

## Communication standard

When output is client-facing, use “Daily Market Intelligence” or “Revenue Intelligence.” Avoid “brief” as the main product word. The output must be insight-led, not just data-led.
