# GeoWorthy Brand System

## Brand idea

GeoWorthy means “worthy of being found and recommended.” The identity combines a confident editorial wordmark with a compact `G` monogram. It is designed to work for both a GEO service company and a future autonomous AI visibility agent.

## Logo

**Mark — "Answer Pin"（答案定位针）**

A location-pin silhouette with a pair of quotation marks knocked out of it. Three readings in one shape:

1. **Geo** — the pin is the universal "you are here" symbol, reinforcing the name.
2. **Cited** — the quotation marks mean "you got quoted", which is exactly what GEO delivers.
3. **Answer** — the rounded head with a tapering point also reads as a speech bubble.

- The counter is a true `fill-rule="evenodd"` knockout, not a filled shape. The mark therefore
  works on any background without a light/dark variant.
- Files: `assets/logo.svg` (gradient), `assets/logo-mono.svg` (`currentColor`),
  `favicon.svg`, `favicon.ico` (16/32/48), `apple-touch-icon.png` (180), `assets/icon-tile.svg`.
- Lockup: mark + `GeoWorthy` wordmark + descriptor (`被AI推荐 · AI VISIBILITY` / `AI VISIBILITY`).
- Minimum digital size: 16 px for the mark alone; 120 px for the complete lockup.
  Legibility was verified at 16 / 24 / 48 / 96 px before adoption.
- Clear space: at least half the mark width on every side.
- Do not use emoji, add drop shadows beyond the current `drop-shadow` glow, fill the quotation
  counters with a solid colour, or substitute another icon.

## Color systems

### Global / local-business site

- Forest: `#116149`
- Lime signal: `#DFF36A`
- Warm paper: `#F7F4EB`
- Ink: `#10231D`
- Orange alert: `#FF7D45`

### Chinese / professional-services site

- Deep navy: `#0A0E1A`
- Signal blue: `#5B8CFF`
- Violet: `#7C5CFF`
- Success green: `#2ECC8F`
- Main text: `#E8ECF5`

## Typography

- Wordmark and interface: system sans-serif, extra-bold, tight tracking (-0.035em).
- Editorial headlines on the English page: Georgia or a compatible serif.
- The mark is pure geometry, no typeface dependency.

## Motion

- Animate.css 4.1.1 is used for restrained fade-in and upward reveal transitions.
- Motion runs once when content enters the viewport.
- `prefers-reduced-motion` is respected; no animation is forced for users who disable motion.
