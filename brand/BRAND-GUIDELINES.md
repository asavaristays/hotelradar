# HotelRADAR — brand guidelines

Version 1.0 · Audience: families and mainstream holidaymakers

---

## 1. The idea

A location pin with a house inside it, and a door left open. The pin says *we found it*, the house says *this is somewhere to stay*, and the door says *you're welcome here*. It reads without translation, and a nine-year-old and a grandparent understand it the same way.

The mark carries the warmth so the wordmark doesn't have to shout.

---

## 2. Logo

### Files

| File | Use |
|---|---|
| `hotelradar-lockup-horizontal.svg` | Default. Site headers, email, documents. |
| `hotelradar-lockup-stacked.svg` | Narrow spaces, square placements, print. |
| `*-reversed.svg` | On amber, teal, ink or photography. |
| `*-mono-ink.svg` | Single-colour print, fax, engraving, embroidery. |
| `hotelradar-mark.svg` | Icon-only. Once recognition is established. |
| `hotelradar-mark-micro.svg` | 16–32px only. Chunkier house, no door. |
| `hotelradar-mark-knockout.svg` | One-colour, house knocked out. Foil, stamps, laser. |

The wordmark is **outlined vector paths**, not live text. It will render identically everywhere and needs no font installed. Never retype it.

### Clear space

Leave one pin-width of empty space on all sides of any lockup. Nothing crosses it — no text, no photo edges, no other logos.

### Minimum sizes

- Horizontal lockup: 120px wide on screen, 30mm in print
- Mark alone: 20px
- Below 32px use `hotelradar-mark-micro.svg`; the door disappears by design

### Don't

- Don't recolour the mark outside the palette below
- Don't add shadows, bevels, outlines or gradients
- Don't stretch, rotate or tilt it
- Don't set the wordmark in a different typeface
- Don't place the amber lockup on a busy photo — use the reversed version on a solid or heavily dimmed panel
- Don't put the mark inside another shape (circle, rounded square) except in `02-favicon`, where that's already been handled

---

## 3. Colour

Full values in `03-color/`. Open `swatches.html` in a browser for a visual sheet with live contrast ratios.

| Role | Token | Hex |
|---|---|---|
| Primary | `--hr-amber-500` | `#E0912F` |
| Primary hover | `--hr-amber-600` | `#C4791F` |
| Secondary | `--hr-teal-600` | `#14655C` |
| Secondary deep | `--hr-teal-700` | `#0E4A44` |
| Accent | `--hr-coral-500` | `#D8663A` |
| Surface | `--hr-cream` | `#FFF7ED` |
| Page background | `--hr-sand-50` | `#FAF7F2` |
| Border | `--hr-sand-300` | `#D6CFC4` |
| Body text | `--hr-ink-900` | `#16211F` |
| Muted text | `--hr-slate-500` | `#6E7472` |

### Accessibility

**White text on amber fails contrast.** Amber buttons take ink-900 (`#16211F`) labels, not white. White on teal-600 passes comfortably — use teal for any coloured surface that needs white type.

The neutrals are warm-tinted rather than pure grey. Don't substitute `#000` or `#666`; they go cold against the amber and make the whole palette look cheaper.

### Proportion

Roughly 60% neutral surfaces, 25% teal, 10% amber, 5% coral. Amber is a highlight, not a background. If a screen is mostly amber, something has gone wrong.

---

## 4. Typography

Nunito Sans, shipped in `04-typography/fonts/` under the SIL Open Font Licence — free to use and redistribute commercially.

- Headings: 700
- Body: 400
- No italics in the interface; save them for editorial quotes
- Sentence case for headings and buttons

`typography.css` has ready-made scale variables. If you later license a paid face, look for a humanist sans with open apertures and generous x-height — Greycliff CF or Cera Pro fit. Avoid strict grotesques; they cool the brand down.

---

## 5. The sunny arc

`05-brand-device/sunny-arc.svg` is a secondary device — three warm arcs, the holiday feeling the logo deliberately holds back. Use it for empty states, loading screens, section dividers, banner corners and email headers.

It never touches the logo. It's a companion, not part of the lockup.

---

## 6. Voice

Plain, warm, practical. Speak to a parent planning a week away with two kids and a budget.

- "Find a place everyone's happy with" — not "Optimise your accommodation search"
- Say the price, say the catch, say the distance to the beach
- Never "unlock", "seamless", "curated", "elevate"
- Contractions are fine and preferred

---

## 7. Favicon and app icons

Everything in `02-favicon/` is production-ready. Copy the contents to your web root and paste `head-snippet.html` into `<head>`.

Included: `favicon.ico` (16/32/48), SVG favicon, PNG fallbacks, `apple-touch-icon.png`, Android Chrome icons at 192 and 512, a maskable icon with correct safe-zone padding, and `site.webmanifest`.

---

## 8. Regenerating

The mark is defined by simple geometry, so it can be rebuilt at any size without loss:

- Pin: circle radius 34 at origin, tangent teardrop tip at `(0, 60)`
- Roof: triangle `(0,-21) (21,-4) (-21,-4)`
- Body: rect `(-13,-4)` 26 × 20
- Door: rect `(-5,6)` 10 × 10
- Artboard: 68 × 94
