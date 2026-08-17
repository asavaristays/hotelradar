# HotelRADAR brand kit v1.0

Start with `BRAND-GUIDELINES.md`.

```
01-logo/            SVG lockups and marks (wordmark already outlined) + PNG exports
02-favicon/         Drop-in favicon set, app icons, webmanifest, <head> snippet
03-color/           palette.css / .scss / .json / tailwind.colors.js + swatches.html
04-typography/      Nunito Sans woff2 (SIL OFL) + typography.css scale
05-brand-device/    The sunny arc, a secondary graphic device
```

## Quickest wins

1. Copy everything inside `02-favicon/` to your web root, paste `head-snippet.html` into `<head>`.
2. Import `03-color/palette.css` and `04-typography/typography.css`.
3. Use `01-logo/hotelradar-lockup-horizontal.svg` in your header at 160px wide.

## Two things to remember

- Amber buttons need dark (`#16211F`) labels, not white. White on amber fails contrast.
- Below 32px, swap to `01-logo/hotelradar-mark-micro.svg`.

Nunito Sans is licensed under the SIL Open Font Licence (see `04-typography/fonts/`), free for commercial use and redistribution. All logo artwork here is yours.
