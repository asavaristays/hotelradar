# HotelRADAR Direct — build review

Twelve admin screens reviewed against the agreed model: 48-hour window,
`direct_to_hotel` settlement, 12% commission, check-in code as proof of stay.

The build is substantially correct. Four items contradict the settlement
decision and one is a disclosure risk. Everything else is additive.

---

## Fix first — before any real guest data

### 1. OPP codes are enumerable · **security**

`OPP-20260808-0001`, `-0002`, `-0003`. Sequential.

Anyone holding one code can read every other request by incrementing the last
four digits — traveller names, dates, destinations, and whatever else the
lookup returns. Today the rows are test data. The day a real guest verifies by
OTP, this becomes a personal-data disclosure rather than a bug.

Codes must come from a CSPRNG. `generateOppCode()` in `codes.ts` already does
this: `OPP-26H-4K7M2`, Crockford base32 with no O/I/L ambiguity so it survives
being read down a phone line.

```ts
import { isEnumerableOppCode } from "./lib/guards";
// fails CI while any sequential code remains
```

Migration keeps the old value in `legacyOppCode` so support can still find a
request by what a guest quotes.

### 2. Payouts screen contradicts the settlement model · **correctness**

The screen reads *"Created on check-in code redemption. Manual NEFT settle
until Razorpay Route / Cashfree is wired."*

In `direct_to_hotel` mode there is nothing to settle. The guest paid the hotel.
Creating Payout rows and NEFT-ing money to hotels means you are holding guest
funds and remitting them — the exact activity you decided not to do until an
aggregator is in place, and the reason manual mode was chosen at all.

In this mode the money flows the other way: the hotel owes **you** commission,
which is an Invoice.

```ts
assertPayoutAllowed(mode);              // throws in direct_to_hotel
payoutsScreenCopy("direct_to_hotel");
// "No payouts in direct-to-hotel mode — the guest pays the hotel.
//  Commission is collected via weekly invoice."
```

Keep the screen — relabel it "Payouts (escrow mode)" and show an empty state
explaining why. It becomes live the day an aggregator is wired.

### 3. Exceptions are being used as an activity log · **operational**

`offer_accepted_handoff` and `verified_awaiting_route` are both normal
progress. The dashboard therefore reads "2 open exceptions" while nothing is
wrong.

A tile that cries wolf gets ignored within a fortnight — which is exactly when
a real `paid_not_confirmed` lands in it. That one means a guest has paid and
does not know whether they have a room, and it must never sit in a list
alongside routine handoffs.

Both belong in `Event`. `EXCEPTION_CLEANUP_SQL` moves them.

### 4. Statuses have drifted from the state machine

The admin emits `verification_pending` and `traveller_accepted`; neither is in
`OppStatus`. `status-map.ts` maps and migrates them.

`traveller_accepted` deserves attention: it should mean a Booking now exists
and the Opportunity is `converted`. If it is being used as a resting state,
there are accepted offers with no booking behind them, and the Commission
screen will never see those stays. The migration file includes the query to
check.

### 5. Rajasthan is in the pipeline

With no hotels there it can only become `no_offers`, quietly dragging down the
coverage percentage the pilot is judged on. Capture out-of-scope requests, do
not route them, exclude them from coverage, and tell the guest honestly.

---

## Add

### Attestation queue · the missing daily screen

The dashboard counts "Attestation open" and "Paid · not confirmed" but there is
nowhere to work them. In manual settlement this is the most important
operational screen in the product.

`ATTESTATION_QUEUE_SQL` returns each pending booking with which side is
outstanding, how long it has been waiting, and the desk phone number to call.
Sort by age. Twenty minutes on one side raises an exception.

### Two dashboard tiles that decide the pilot

Coverage and median response are absent, and they are the only numbers that
matter before December.

| Tile | Target | Why |
|---|---|---|
| Offer coverage, 7d | ≥78% | Below this, no demand spend is justified |
| Median hotel response, 7d | <4 min | Your key supply-quality signal |
| Silent hotels, 7d | 0 | Which partners to visit this week |

`TILES` in `metrics.ts` has the SQL for all three plus revised definitions for
the existing tiles.

### Rate sheet management

Hotels has no sheet UI, yet the sheet is what enables instant quoting, removes
the ten-minute wait, and solves nights. Without it every request needs a human,
which the unit economics do not support.

Needs: create a sheet, add rows by room type and season, an explicit expiry, a
stop-sell toggle reachable from WhatsApp, and a "supersede" action that
versions rather than edits. `Live hotels with a rate sheet` should read all of
them.

### Go-live checklist on the hotel record

`canGoLive()` blocks a hotel going live without: a routable belt, GSTIN,
coordinates, a night desk contact, and an active rate sheet.

The New hotel form currently defaults belt to `other` — a hotel in `other`
never earns the belt score or the night sheet bonus, so it gets routed last for
its entire life and nobody notices. Make belt required, remove `other` from the
dropdown, and note that the night desk number is not the owner's mobile.

### Smaller gaps

- **Guests screen.** Nothing shows repeat travellers, which is where the hop
  loop and the day-1 message pay off.
- **Response time column on Opportunities.** Per-hotel, not just per-request.
- **Guest payment receipt.** You issue a receipt; the hotel issues the tax
  invoice for the full tariff. Neither is in the UI.
- **Booking window guard.** 48 hours is in config but the Opportunities list
  shows stays 30+ days out. Enforce at creation.
- **System prompt should be read-only and versioned.** An editable box means an
  untracked change breaks grounding at 11 PM with no diff to look at.

---

## Keep as is

- The four-step process strip on the dashboard. Clear and honest about mode.
- Redeem code screen — idempotent, correct. Change the copy from "returns the
  original payout" to "returns the original result"; in manual mode redemption
  proves the stay and accrues commission, it does not pay anyone.
- Comms template list with explicit Meta states. Submit all seven this week —
  approval takes days and 0/7 approved blocks every out-of-session message.
- Invoices with the gapless HR/FY note.
- Assistant tool-runner. Being able to run `search_hotels` directly is exactly
  how you debug grounding.

---

## Order

| # | Item | Effort |
|---|---|---|
| 1 | Regenerate OPP codes | 1 hour |
| 2 | Payout guard + screen copy | 1 hour |
| 3 | Exception cleanup + type guard | 2 hours |
| 4 | Status migration | 2 hours |
| 5 | Attestation queue screen | 1 day |
| 6 | Coverage + response tiles | half day |
| 7 | Rate sheet UI | 2–3 days |
| 8 | Go-live checklist | half day |

Items 1–4 are corrections and should land before any hotel is onboarded.
Items 5–8 are what the pilot needs to actually run.
