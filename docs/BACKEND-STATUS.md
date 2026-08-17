# Backend domain — implementation status

Source packs: `Downloads/files-5` + `Downloads/files-6` + `Downloads/files-7`.
Runtime: SQL migrations + Express. Prisma client is wired for selected reads; SQL files remain the schema source of truth (do not `prisma migrate` against prod).

## Live (wired)

| Area | Status |
|------|--------|
| Codes / money / booking-state | shared + verify |
| Rate engine / routing score / settlement / comms / assistant tools | shared + API |
| Migrations 007–016 | money, domain, files-6, chat, TCS, files-7, receipts, hotel UPI, North Goa KB |
| TCS + agent/principal commercial mode | money lib + hotel UI + confirm snapshots |
| Prisma client runtime | invoices + WA templates via Prisma |
| files-7 guards / status-map / metrics | shared + verify-review |
| Attestation queue | Admin `/admin/attestation` |
| Pilot tiles (coverage / median / silent) | Dashboard |
| Go-live checklist (`canGoLive`) | Hotel detail + API |
| Rate sheets | Multi-season, expiry, supersede, stop-sell |
| Guests | Admin `/admin/guests` + lifetime on confirm |
| OPP response times | List column + dashboard median tile |
| Guest payment receipt | `HRD-RCP/…` on confirm |
| Guest pay path (no PSP) | Offer page UTR submit + hotel UPI + hotel attest link |
| Copy WhatsApp messages | OPP detail copy / wa.me (manual until Meta send) |
| Check-in code to guest | Request status + offer page after confirm |
| Assistant prompt | Versioned, read-only |
| Escalation ack | Mark step done on OPP |
| Outside 48h window | Flagged on OPP list + copy pack |
| Payouts screen | Escrow-only copy; direct_to_hotel creates no payouts |
| Travel ETA | Haversine (Mapbox optional later) |
| North Goa belt KB | Migration 016 + Admin Comms; `get_area_notes` all 8 belts |
| Guest catalog | North Goa belts only (morjim→baga) for beta chat |

## Remaining — deliberate only

| Item | Why |
|------|-----|
| Razorpay / Cashfree PSP + webhooks | RBI / aggregator licensing decision |
| Live Meta WhatsApp send | Needs WABA credentials + approved templates |

Defaults: **agent** + **TCS off**. Flip per hotel after CA/counsel sign-off.

Guest market for pilot UX: **North Goa** (API destination enum remains `Goa` | `Rajasthan`).

Deferred by design (not blockers): hotel self-service extranet logins, Mapbox provider, 2FA.

## Process UI

Verify → Route → Quote → Accept → Pay (guest UTR + hotel attest) → Confirm → Redeem (proof of stay) → Settle (weekly invoice).
