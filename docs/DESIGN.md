# ClauseBridge design

## Art direction
ClauseBridge's look merges four reference styles into one paper-craft system:

| Reference style | Where it lives in ClauseBridge |
| --- | --- |
| Torn-paper collage (paper textures, masking tape, kraft footer, a googly-eyed paper character) | Landing hero, paper cards with torn edges across the app, kraft sidebar and footer |
| Greyscale pixel art (a person reclining with a laptop) | The pixel reader in the hero, the "Built on Univer" section and every loading state |
| Pixel scene on a couch with coffee, chunky pixel type | The 404 page: an original contract-page character on a couch, "ERROR 404 / Clause not found" |
| Distressed vintage packaging with a crest | The ClauseBridge box of four highlighter pens (hero, "four markers" section, sign-in) |

All artwork is original and drawn in code: SVG shapes with turbulence filters for torn edges and wear
(`components/art/`), and pixel maps rasterised from simple shapes (`components/art/pixel-maps.ts`). No
third-party characters, logos or trade dress are used.

## Tokens
- Paper `#ECE6DA`, sheet `#F8F5EE`, ink `#262321`, kraft `#B68B5E`, with a subtle SVG grain (`--grain`).
- The four markers are the four obligation kinds, used everywhere a kind appears:
  deliverable denim `#3F6EA5`, payment mustard `#D9A520`, deadline red `#B23A2B`, responsibility sage `#5F7F4A`.
- Type: Bricolage Grotesque (display and UI), Source Serif 4 (contract text and quotes), Courier Prime
  (references such as OB-001 and Clause 3.2, sidebar navigation), Silkscreen (404 only).
- Torn edges are clip paths generated once into `app/torn.css` (`--torn-a/b/c`, `--torn-right`, `--torn-top`).

## Motion
One orchestrated load in the hero (collage pieces settle in, the highlighter sweeps over clause 3.2), eyes
that follow the cursor, and hover responses that show what is interactive: paper cards lift and straighten,
tape shifts, buttons rise off their printed shadow, rows fill with highlighter, quotes highlight on hover.
Loading states use the bobbing pixel reader. `prefers-reduced-motion` turns all of it off.
