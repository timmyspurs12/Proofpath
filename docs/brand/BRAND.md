# ProofPath brand identity

Premium identity built around **evidence, clarity, direction and progress**. The symbol is a
continuous monoline that draws the letter **P**, then extends into a rising path ending in an
integral forward arrowhead — verified information becoming actionable.

A visual presentation of everything in this document is in
[`brand-presentation.html`](./brand-presentation.html) (open in a browser) and its rendered
snapshot [`brand-presentation.png`](./brand-presentation.png).

## Concept and construction

- One unbroken stroke builds the P: a grounded vertical stem plus a structured bowl that holds
  the evidence.
- The upper arc leaves the letterform and terminates in an integral arrowhead; the arrow is part
  of the path, not a separate badge — no magnifier, check-in-circle, shield, pin, or document glyph.
- 32×32 grid, 3.7-unit stroke with round line caps/joins. Round terminals keep the mark human;
  the stroke weight keeps it legible at 16px.
- The React component and every standalone SVG share the exact same path data
  ([`src/components/Logo.tsx`](../../src/components/Logo.tsx),
  [`scripts/brand/generate-brand-assets.py`](../../scripts/brand/generate-brand-assets.py)).

## Palette

| Token                 | Hex       | Role                                                                                        |
| --------------------- | --------- | ------------------------------------------------------------------------------------------- |
| Primary teal          | `#0EA5A7` | Symbol, dark-surface type, icon tiles, favicon background                                   |
| Deep interaction teal | `#0C7E80` | AA-passing teal for text, links and solid controls on light surfaces (white on it = 4.87:1) |
| Deep ink              | `#0B0F17` | Headlines, primary text, dark surfaces and the "New plan" control                           |
| Warm ivory            | `#FAF9F6` | Page background; inverse type on ink                                                        |
| Neutral gray          | `#6B7280` | Palette neutral; lockup tagline on ivory (4.59:1)                                           |
| AA text gray          | `#5F6772` | Small app text on tinted surfaces (≥ 4.96:1 everywhere)                                     |

Primary teal is intentionally a bright accent (2.87:1 on ivory) and is never used for small text
or thin icons that need to convey information; those use the deep teal or AA text gray. Teal on ink
is 6.36:1. CSS variables live at the top of [`src/index.css`](../../src/index.css) under the
`--brand-*` and legacy-compatible `--teal*`/`--ink`/`--muted` names.

## Wordmark

- **DM Sans 700**, tracking −0.02em, with a two-tone split: **Proof** in deep ink, **Path** in
  deep teal (on light) or primary teal (on dark). No letter modifications beyond tracking.
- Tagline **Evidence to action** in DM Sans 500, 0.12–0.14em tracking, neutral gray.
- Standalone SVG lockups contain outlined glyph paths (shaped with HarfBuzz from the bundled
  DM Sans WOFF2 files), so they render identically without the web font.

## Asset inventory

All vector and raster assets are in [`public/brand/`](../../public/brand):

| File                                                                                         | Use                                          |
| -------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `proofpath-symbol.svg`                                                                       | Standalone teal symbol (ivory surfaces)      |
| `proofpath-symbol-ivory.svg`                                                                 | Ivory symbol for ink surfaces                |
| `proofpath-symbol-ink.svg`                                                                   | Ink monochrome symbol                        |
| `proofpath-logo-light.svg`                                                                   | Primary horizontal lockup, ivory tile        |
| `proofpath-logo-dark.svg`                                                                    | Horizontal lockup for ink surfaces           |
| `proofpath-logo-mono.svg`                                                                    | Monochrome horizontal lockup                 |
| `favicon-ink-tile.svg`                                                                       | Ink-tile favicon alternative                 |
| `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `maskable-512.png` | Tab, iOS and PWA raster icons                |
| `symbol-teal-512.png`                                                                        | Transparent standalone mark for decks/social |

The canonical browser favicon is [`public/favicon.svg`](../../public/favicon.svg) (teal tile,
ivory mark, 14/64 corner radius), with PNG and manifest fallbacks wired in
[`index.html`](../../index.html) and [`public/manifest.webmanifest`](../../public/manifest.webmanifest).

## Application touchpoints

- Header lockup (full on desktop ≥ breakpoint, wordmark-only on mobile) and compact footer mark:
  `Logo` / `BrandMark` in [`src/components/Logo.tsx`](../../src/components/Logo.tsx).
- Landing-page hero lockup in [`src/pages/HomePage.tsx`](../../src/pages/HomePage.tsx).
- Favicon, apple-touch-icon, web manifest and Open Graph image metadata in `index.html`.
- The product has no authentication screen, so there is no sign-in brand surface.

## Regenerating the assets

```bash
# Vector assets and favicon (requires fonttools, brotli, uharfbuzz)
python3 scripts/brand/generate-brand-assets.py
# Raster icons (uses the project's Playwright Chromium; honors CHROMIUM_EXECUTABLE_PATH)
node scripts/brand/generate-brand-pngs.mjs
```

Change the symbol once, in both the generator's `SYMBOL_PATHS`/`SYMBOL_ARROW` constants and
`Logo.tsx` (they intentionally duplicate the same geometry rather than importing across the
Python/JS boundary).

## Usage rules

- Minimum symbol size: 16px in UI. Keep clear space equal to roughly twice the stem width.
- Do not rotate, gradient-ize, shadow, stretch, or recolor the mark outside this palette.
- On photography or busy surfaces use the teal/ink tile favicon versions, never the bare symbol.
- The compact navigation lockup is symbol-only; never crop the arrowhead.
- Preserve the contrast discipline: bright teal for the mark and large accents only; deep teal
  and AA text gray for information-bearing text.
