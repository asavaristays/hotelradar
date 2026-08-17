# HotelRADAR Direct - Frontend Design Specification

**Product:** `hotelradar.in`  
**Audience:** Travellers seeking a direct hotel or villa offer in Goa  
**Phase 1:** Request a private offer, verify the traveller, present hotel offers, and provide Booking Desk support.

## 1. Design direction

The provided HotelRADAR Direct visual is the source of truth. The interface should feel like a trusted local booking desk: premium but uncomplicated, warm but operationally clear, and clearly different from an OTA comparison grid.

### Brand principles

- Lead with the traveller promise: direct hotel confirmation, payment to the hotel, and local Goa support.
- Keep the first interaction brief; ask for detail only after a traveller is engaged.
- Use calm white space and one primary action per section.
- Explain uncertainty plainly. A submitted request is not a confirmed booking.
- Present HotelRADAR as a booking desk that helps, rather than a marketplace that overwhelms.

## 2. Visual system

### Colour tokens

| Token | Value | Use |
|---|---:|---|
| `navy-950` | `#101D3A` | Headlines, body emphasis, icons, footer |
| `navy-700` | `#263654` | Secondary headings, supporting UI |
| `slate-600` | `#60708A` | Body copy, labels, helper text |
| `coral-500` | `#FF4054` | Primary CTA, active states, trust checks, highlights |
| `coral-100` | `#FFF0F1` | Active chip/soft coral surface |
| `warm-50` | `#FFFCF9` | Page canvas |
| `surface` | `#FFFFFF` | Cards, form fields, header |
| `line` | `#E3E7EE` | Borders and dividers |
| `success-500` | `#1FA568` | Confirmed/verified state only |
| `warning-500` | `#DD8A14` | Time-sensitive offer/attention state |
| `danger-500` | `#D84343` | Error/expired/declined state |

Do not introduce gradients, neon colours, dark marketing panels, or multi-colour CTAs. Coral is the action colour; navy is the trust colour.

### Typography

Use **Inter** if available. Fallback: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

| Role | Desktop | Mobile | Weight | Notes |
|---|---:|---:|---:|---|
| Hero H1 | 60px / 1.06 | 40px / 1.1 | 750 | Dark navy; maximum three lines |
| Section H2 | 32px / 1.15 | 26px / 1.2 | 700 | Dark navy |
| Card heading | 16-18px | 16px | 650-700 | Dark navy |
| Body | 16px / 1.5 | 15px / 1.5 | 400-450 | `slate-600` |
| Label/meta | 12-14px | 12-14px | 550-650 | Uppercase only for small eyebrow labels |
| Primary button | 15px | 15px | 700 | White on coral |

### Layout, shape and elevation

- Content width: `min(1240px, calc(100vw - 48px))`; use 20px side padding on mobile.
- Header height: 72px desktop, 64px mobile.
- Cards: white, 16-20px radius, 1px `line` border, soft shadow such as `0 16px 40px rgba(16, 29, 58, .08)`.
- Form controls: 12px radius; minimum 52px interactive height.
- Buttons: 10px radius, 48px height desktop/mobile; no pill-shaped full controls.
- Use thin separators and pale icon circles rather than heavy colour blocks.
- Hero image: Goa coast/villa image aligned to the right, with a light white overlay behind left-side copy to preserve readability.

### Iconography and imagery

- Use one consistent outline icon family (Lucide is suitable), 20-24px, primarily navy or coral.
- Trust-feature icons sit in pale coral circular backgrounds.
- Use authentic Goa accommodation imagery. Do not show a property as bookable unless it is a real approved partner and current imagery is licensed/approved.
- Never make a generated visual imply a specific hotel, room availability, rate, or hotel endorsement.

## 3. Site map and routes

| Route | Page | Phase 1 purpose |
|---|---|---|
| `/` | Direct landing and request form | Capture hotel enquiry / public price evidence |
| `/request` | Full request flow | Mobile-friendly progressive enquiry form |
| `/verify` | OTP verification | Verify traveller contact before hotel routing |
| `/request/[publicToken]` | Traveller request status | Show status, support and offer availability |
| `/offer/[publicToken]` | Private hotel offer | Present one selected hotel offer and hotel payment instruction |
| `/how-it-works` | Trust/explainer page | Explain direct model and no-hidden-markup policy |
| `/for-hotels` | Partner-hotel interest page | Capture hotel pilot interest; no hotel dashboard in Phase 1 |
| `/privacy`, `/terms` | Legal pages | Consent, data use, intermediary position and user terms |

## 4. Homepage specification

### 4.1 Header

Use the supplied design's light header.

- Left: HotelRADAR wordmark, coral `Direct` badge.
- Centre desktop navigation: How it works, Why direct, For hotels, About us, Goa guide.
- Right: coral phone icon and `Goa Booking Desk` phone number.
- Mobile: wordmark, phone icon/link, menu button. The booking CTA remains visible in the first viewport.
- Header is sticky after the traveller scrolls past the hero, with white background and subtle bottom border.

### 4.2 Hero and primary request card

**Hero message**

```text
Get a direct hotel offer for Goa
Share your hotel, dates and public price. HotelRADAR helps you get a private direct offer from the hotel.
```

Trust line with coral check icons:

```text
Direct hotel confirmation · Payment to hotel · Local Goa support
```

Primary action: `Check My Hotel Offer`  
Secondary action: `Speak to Booking Desk`

The request card is the product's core surface. It should start visible on desktop and be immediately reachable on mobile.

| Field | Control | Required in Phase 1 |
|---|---|---|
| Hotel or Goa area | Searchable text/select | Yes |
| Check-in & check-out | Date-range picker | Yes |
| Guests & rooms | Stepper/select | Yes |
| Public price found (INR) | Currency numeric field | No, but strongly encouraged |
| What matters most | Multi-select chips: Best rate, Breakfast, Room upgrade, Flexibility, Other | One selection preferred |
| Traveller name | Text field, requested after form CTA | Yes before final submit |
| Mobile number | International phone input | Yes before final submit |
| Email | Email field | Optional |
| Special request | Text area | Optional |
| Consent | Checkbox with Privacy link | Yes before final submit |

Form rules:

- Do not ask for an account password or payment card.
- Enforce check-out later than check-in and a reasonable date horizon.
- Display INR formatting consistently.
- Save entered values locally in-session so a traveller does not lose their request after OTP verification.
- Submit button label: `Request Private Hotel Offer`.
- Under CTA: lock icon and plain language: “Your details are used only to get your private hotel offer.”

### 4.3 Trust strip

Four evenly spaced benefit items (horizontal desktop, stacked/two-column mobile):

1. Direct hotel confirmation - confirmed by the hotel, not a third party.
2. Private time-bound offers - an offer may expire and shows its validity clearly.
3. Local Goa phone support - real person / booking desk support.
4. No hidden markup - traveller pays hotel directly; use only if commercially and legally accurate.

### 4.4 How it works

Three numbered cards linked with a restrained dotted line on desktop:

1. Share your hotel request.
2. Hotel responds with a direct offer.
3. You confirm directly with the hotel.

Use the qualifier: “Hotel controls availability, final rate and confirmation.”

### 4.5 Partner proof

Until real partner logos/permissions are available, use category labels only: Goa Resort, Beach Villa, Boutique Stay, Partner Hotel, Coastal Retreat. Do not imply a named hotel partnership.

## 5. Traveller journey screens

### 5.1 Request progress

After request submission, show a focused three-step progress state:

```text
1. Verify your number
2. We check your request
3. We send your direct hotel offer
```

The page must display the support phone/WhatsApp link and a request reference, but never expose an internal database ID.

### 5.2 OTP verification

- Use six-digit segmented input or a clearly labelled standard field.
- Show the masked phone number and a change-number action.
- Provide resend countdown and a support fallback.
- Success state routes to `/request/[publicToken]`.
- Error text must be direct: “That code did not match. Try again or request a new code.”

### 5.3 Request-status page

Use a white status card with a coloured status icon and the request summary. It must distinguish:

| Traveller-facing state | Message |
|---|---|
| Verification pending | “Verify your number so we can start checking your request.” |
| Checking request | “Our Goa Booking Desk is checking the best hotel response.” |
| Hotel contacted | “Your request has been shared with selected hotel partners.” |
| Offer ready | “Your private hotel offer is ready.” |
| More details needed | “We need one more detail to find the right offer.” |
| No suitable offer yet | “We could not secure a suitable offer yet. Our desk can help with alternatives.” |
| Expired | “This offer has expired. Send a new request and we will check again.” |

Include: request summary, last updated time in India Standard Time, secure support CTA, and ability to edit/cancel before an offer is accepted.

### 5.4 Private offer page

The offer page must feel confirmed and calm, not like a price-comparison marketplace.

- Hotel name and approved image.
- Stay details, room type, occupancy, total price, INR currency, taxes/fees treatment, inclusions/benefits.
- “Offer valid until” with countdown only if backed by a true hotel hold/expiry.
- Clear “Provided and confirmed by [hotel]” label.
- Direct booking instruction: `Call / WhatsApp hotel` or `Pay hotel directly`, depending on approved workflow.
- Secondary action: `Speak to Booking Desk`.
- Show cancellation terms before the traveller accepts any offer.
- Do not embed payment collection in Phase 1.

## 6. Responsive and accessibility requirements

- Design mobile-first request completion; users should submit comfortably at 360px width.
- Maintain 4.5:1 text contrast minimum; coral text on white is for accents, not long body copy.
- Every control has a persistent text label, not placeholder-only meaning.
- Keyboard focus uses a visible coral outline with enough contrast.
- Date, guest and chip controls have non-gesture alternatives.
- Do not rely on colour alone for request/offer status.
- Respect reduced-motion preferences; no essential information depends on animation.

## 7. Frontend states and copy rules

- Use “request”, “offer”, and “hotel confirmation” precisely. Never use “booking confirmed” until Revenue/hotel has returned confirmation.
- Surface the source of each important fact: hotel-confirmed, traveller-provided, or Booking Desk update.
- Format price as `₹12,000` and state whether it is per night or total stay.
- Display error recovery with action: retry, correct details, or call the desk.
- Use optimistic feedback only for local actions; show a pending state while server confirmation is awaited.

## 8. Phase 1 frontend acceptance criteria

- A traveller can submit and OTP-verify a valid request on mobile and desktop.
- The submission generates a private public token; no personal data appears in the URL.
- Traveller can see a truthful request state and reach support.
- A valid hotel offer from the Direct backend displays all mandatory commercial terms.
- The interface uses the approved HotelRADAR Direct visual system consistently.
- No hotel availability, final rate, payment success, or booking confirmation is claimed without a matching external operational event.
