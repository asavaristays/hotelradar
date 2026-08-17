# HotelRADAR backend — Cursor guide

Prisma schema plus the three pieces of logic that are easy to get subtly wrong:
code generation, the money breakup, and the state machine.

Everything here is verified — `npm run verify` runs 30 assertions including
10,000 randomised rounding cases.

## Files

```
prisma/schema.prisma            20 models, all enums, indexes
prisma/schema.additions.prisma  media, travel cache, belt notes, chat, templates

src/lib/codes.ts                OPP codes, check-in codes, invoice numbers
src/lib/money.ts                GST split, commission, payout — integer paise
src/lib/booking-state.ts        transitions, timeouts, 48-hour window
src/lib/invoicing.ts            gapless invoice numbering under row lock
src/lib/rate-engine.ts          season, dow mask, row matching, quoting
src/lib/settlement.ts           dual attestation, UTR, manual vs escrow
src/lib/routing.ts              fan-out scoring, escalation ladder
src/lib/assistant.ts            tool definitions, system prompt, grounding check
src/lib/comms.ts                WhatsApp templates, travel time, taxi estimate

src/lib/verify.ts               money, codes, state machine  (30 assertions)
src/lib/verify-integrations.ts  the above five modules       (52 assertions)
```

```bash
npm run verify      # both suites
```

`invoicing.ts` will show type errors until `npx prisma generate` has run —
the Prisma client does not exist before then. Everything else type-checks
clean under `strict` with no database.

## Settlement: manual now, escrow later

The pilot runs in `direct_to_hotel` mode. The guest pays the hotel, submits the
UTR in chat, the hotel taps "received" on WhatsApp, and both together confirm
the booking. You never touch the money, so no aggregator licensing question
arises. The check-in code proves the stay happened, which is what Monday's
invoice references.

Switching to escrow later is a per-booking flag — `planFor()` in settlement.ts
returns what changes. Nothing migrates.

```ts
const verdict = evaluateAttestation(
  { guestAttestedAt, hotelAttestedAt, utr },
  enteredPendingAt,
);
// "confirm" | "wait" | "raise_exception"
```

Twenty minutes with only one side attesting raises an exception and someone
phones the hotel. In a pilot, a phone call is a feature.

## Setup

```bash
npm i @prisma/client
npm i -D prisma tsx typescript @types/node
npx prisma migrate dev --name init
npm run verify
```

`package.json` must have `"type": "module"` — `verify.ts` uses top-level await.

`.env`:

```
DATABASE_URL="postgresql://user:pass@localhost:5432/hotelradar"
```

## The ₹10,000 booking, verified

```
Room tariff                      ₹8,474.58
GST collected on your behalf     ₹1,525.42
Less commission                  ₹1,016.95
Less GST on commission             ₹183.05
Less payment gateway               ₹200.00
Net transferred                  ₹8,600.00
```

```ts
import { computeBreakup, payoutAdviceLines } from "@/lib/money";

const breakup = computeBreakup({
  grossCollectedPaise: 1_000_000n, // ₹10,000
  roomGstRateBps: hotel.gstRateBps, // per hotel, never hardcoded
  commissionRateBps: hotel.commissionBps,
  gatewayBorneBy: hotel.gatewayBorneBy,
});
```

Write every field of `breakup` onto the Booking row at confirmation. Never
recompute it later — that is what makes a March dispute about a January payout
resolvable in seconds.

## Three things the code enforces that are easy to lose

**Commission is on the base tariff, not the gross.** Charging 12% on the
GST-inclusive amount means charging commission on tax. Hotels will notice.

**Check-in codes carry a Luhn mod-32 check character.** Verified against all 217
single-character substitutions and every adjacent transposition. The code
triggers a payout, so a typo must fail rather than match another booking.
Uniqueness comes from the DB constraint plus `generateUniqueCheckInCode()`, not
from entropy — 6 characters collides at around 50k codes and the test proves it.

**Invoice numbers come from a row-locked sequence inside the invoice
transaction.** Generating them in application code leaves gaps when a
transaction rolls back, and a GST series must be gapless within a financial year.

## Cursor prompts that will match this codebase

> Add a `POST /api/opportunities/:id/route` handler that fans the OPP out to
> 2–3 hotels in the same belt, creating OpportunityHotel rows with route
> `instant_sheet` where `hotel.instantQuoteEnabled` is true and `manual_quote`
> otherwise. Write an `opportunity.routed` Event. Follow the patterns in
> src/lib/invoicing.ts for transactions and event writing.

> Build the rate engine: given an Opportunity and a Hotel, find the active
> RateSheet whose `expiresAt` is in the future, match a RateSheetRow on
> roomType, season, dowMask and advanceHoursMin, and create an Offer with
> `source: rate_sheet` and both rateSheetId and rateSheetRowId set for audit.
> Use grossFromTariff() from src/lib/money.ts. Return null if no row matches —
> the caller falls back to manual quote.

> Write the check-in code redemption endpoint. Parse with parseCheckInCode(),
> return distinct errors for malformed vs checksum failure, increment
> failedAttempts and raise a `code_redemption_failed` Exception at 5. On
> success set redeemedAt, transition the booking to `checked_in` using
> assertTransition(), create the Payout, and create the CommissionEntry.
> Redemption must be idempotent — a second submission returns the original
> result and never triggers a second payout.

> Add a cron that scans BOOKING_TIMEOUTS from src/lib/booking-state.ts and
> raises Exceptions for breaches. `paid_not_confirmed` at 5 minutes is critical
> and must page ops — a guest has paid and does not know if they have a room.

## Not yet built

Deliberately left out because they depend on decisions still open:

- **Payment provider integration.** Split settlement eligibility depends on RBI
  turnover thresholds. The `Payment` and `Payout` models fit either Razorpay
  Route or the booking-fee-only fallback.
- **TCS.** `booking.tcsPaise` exists and `computeBreakup` accepts `tcsBps`, both
  defaulting to zero. Whether the e-commerce operator provisions apply to you is
  a question for a CA, not for this code.
- **Agent vs principal.** `money.ts` assumes agent throughout. If your contracts
  make you a principal, the whole ₹10,000 becomes your turnover and this file is
  wrong.

## Seed data

```ts
await prisma.hotel.create({
  data: {
    code: "MRJ-CASAVERDE",
    legalName: "Casa Verde Hospitality LLP",
    displayName: "Casa Verde Boutique",
    status: "live",
    belt: "morjim",
    lat: 15.6297, lng: 73.7342,
    gstin: "30AABCU9603R1ZM",
    gstRateBps: 1200,
    commissionBps: 1200,
    gatewayBorneBy: "hotel",
    instantQuoteEnabled: true,
    contacts: {
      create: [
        { role: "night_desk", name: "Front desk", phoneE164: "+919812345678",
          activeFromHour: 0, activeToHour: 24, isPrimary: true },
      ],
    },
  },
});
```

Note `gstRateBps: 1200` — this property sits in a different tariff band from an
18% one. Storing it per hotel is why a single hardcoded rate would mis-price
most of your inventory.
