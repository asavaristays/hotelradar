# HotelRADAR Direct — Project Reference

Locked product and vendor decisions for HotelRADAR Direct. Update this file when a decision changes.

---

## SMS / OTP vendor (locked)

| Item | Decision |
|---|---|
| **Vendor** | **MSG91** |
| **Use** | Transactional SMS OTP for traveller mobile verification |
| **Status** | Opted — integrate when Auth Key + DLT template + Sender ID are ready |
| **Alternatives considered** | Gupshup (runner-up / WhatsApp later), Kaleyra/Exotel, Twilio (not primary for India cost) |

### MSG91 services to opt

| Service | Opt |
|---|---|
| Transactional SMS / SendOTP | **Yes** |
| DLT registration + OTP template | **Yes** |
| Sender ID (e.g. `HRADAR`) | **Yes** |
| WhatsApp API | Later (phase 2) |
| Promotional SMS | No (for now) |
| Voice OTP | Optional fallback only |
| Email OTP as primary | No |

### Cost (indicative India)

- ~**₹0.15 – ₹0.25** per OTP SMS (+ GST)
- Pilot wallet: **₹1,000 – ₹2,000** to start
- Resend = additional SMS charge

### Env (when wired)

```bash
OTP_PROVIDER=msg91
MSG91_AUTH_KEY=
MSG91_SENDER_ID=
MSG91_TEMPLATE_ID=
OTP_REVEAL_DEV_CODE=false   # production
```

Until live: keep `OTP_PROVIDER=dev` for testing.

### Integration point

- API: `apps/api/src/services/otp.ts` (`sendOtp` / `verifyOtp`)
- Config: `apps/api/src/config.ts` + `/etc/hotelradar-direct/env` on VPS
- Planned client: `apps/api/src/services/sms/msg91.ts` (not yet implemented)

---

## OTP product flow (locked)

1. Traveller **explores** site (destination, stay intent) — no rates required yet  
2. On **Get private offer** / before hotel offer unlock → collect **mobile + consent**  
3. Send **SMS OTP** via MSG91  
4. On verify → opportunity is verified; desk/hotel routing and offers unlock  

Rationale: filter fake numbers without OTP-gating the entire homepage.

| Setting | Value |
|---|---|
| OTP TTL | 600s (10 min) |
| Resend cooldown | 45s |
| Max attempts | 5 |
| Primary channel (phase 1) | SMS (MSG91) |
| Phase 2 (optional) | WhatsApp Authentication + SMS fallback |

---

## Destinations (locked)

Traveller market focus stored on requests: **`Goa` | `Rajasthan`** (`traveller_requests.destination`).

---

## Chat assistant → private offer (locked product model)

**Aim:** HotelRADAR is a **booking AI Assistant**. Traveller stays in the **assistant chat window** end-to-end: trip → hotel shortlist → questions → private offer → accept → pay hotel → hotel confirms. Internally attributed as a **HotelRADAR booking** (`OPP-…`).

### Journey (locked — chat only)

1. **Trip** — destination, dates, guests  
2. **Hotel list** — matched hotels with **OTA tariff (reference)**, **Direct available online**, and **location**  
3. **Select hotel**  
4. **Ask more** — photos, location, other facts (from verified hotel data only)  
5. **Confirm** — “Should we get a private offer from this hotel?”  
6. **Code + OTP** — every query gets `OPP-…`; WhatsApp for delivery; OTP verify  
7. **10‑min hotel clock** — wait for private offer (target under 10 min). If none: no-offer state or **call HotelRADAR**  
8. **Accept / decline** — second **10‑min clock** to accept the private offer or decline  
9. **Pay hotel directly** — not HotelRADAR  
10. **Hotel confirms stay** and handles check-in  

### Hard rules

| Rule | Decision |
|---|---|
| Surface | **All** steps in AI assistant chat window only |
| Booking code | Every booking query → `OPP-YYYYMMDD-####` |
| Traveller mobile | **Hidden from hotel** until traveller **pays**; delivery/OTP only inside HotelRADAR |
| OTA / Direct online rates | Reference only — **not** the bookable private offer |
| Payment | Hotel direct — HotelRADAR is not MoR |
| Hotel ↔ HotelRADAR | WhatsApp (API later); desk/manual until then |
| Invented facts | Never invent rates, photos, or reviews |

### Timers (locked)

| Clock | Duration | Meaning |
|---|---|---|
| Hotel response | **10 minutes** | Wait for private offer after confirm |
| Traveller accept | **10 minutes** | Accept or decline the private offer |

### Home (designer — locked)

1. Chat-shaped input accepts plain-language trip; parser seeds destination/dates/party  
2. One primary CTA: **Get hotel offers**  
3. Quiet footer: how booking works · list property · Goa & Rajasthan · 100+ hotels · ~10 min  

### Build phases

| Phase | Scope |
|---|---|
| **Now** | Chat journey UI; seed hotel shortlist; OPP + OTP; dual 10‑min clocks; mobile withheld note |
| **Next** | Live property KB / Asavari rates; hotel WhatsApp notify |
| **Then** | WhatsApp API (HotelRADAR ↔ hotel); MSG91 prod OTP; accept→pay handoff automation |

### Offer UI (locked)

- Component: `apps/web/components/assistant/AssistantBookingChat.tsx` (chat-native)  
- Legacy Typeform flow: `HotelRadarFlow.tsx` (deprecated for primary path)  
- Demo hotel catalog: `apps/web/lib/hotels-catalog.ts` until live inventory sync

---

## Backend ops (in design)

| Doc | Topic |
|---|---|
| `docs/OPERATING-MANUAL.md` | Hotel onboarding · extranet ops · IDs · commission |
| `docs/SUPER-ADMIN.md` | **Super Admin only** UI · username/password · `/admin` |

**S1–S5 live:** `/admin` Super Admin (login, dashboard, opportunities, hotels, commission, exceptions). `/desk` redirects to `/admin/opportunities`; desk APIs require admin session.

---

## Related docs

| Doc | Purpose |
|---|---|
| `docs/OPERATING-MANUAL.md` | Hotel onboarding · extranet ops · IDs · commission (design) |
| `DEV.md` | Local/VPS develop & deploy |
| `brand/DIRECT-USAGE.md` | Brand kit wiring |
| `.env.example` | Env template including `OTP_*` |
