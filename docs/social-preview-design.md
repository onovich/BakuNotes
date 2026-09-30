# BakuNotes social preview design record

## Evidence

- Mode: build-tested. `npm run lint`, `npx tsc --noEmit`, and `npx expo export --platform web` passed in `app/`.
- `app/App.tsx` supplies the paper/canvas/ink palette, terracotta top rule, half-moon glyph, library column, search field, and writing surface.
- `app/assets/icon.png` is an Expo starter graphic, so it is not treated as BakuNotes branding.
- The visual is an illustration of the implemented interface, not a runtime screenshot. No personal note content is used.

## Promise, proof, exclusion

- Promise: write down a dream and find it again.
- Proof: a paired searchable library and writing surface, following the app's actual layout and colors.
- Exclude: private note content, unsupported format claims, cloud guarantees, signed iOS delivery, invented dreams, badges, and GitHub branding.

## Source route and composition

- Route: code-native SVG reconstructed from `app/App.tsx` visual tokens; no source pixels embedded.
- Interpretation: bounded UI illustration, since a representative screenshot could contain private data.
- Continuity: one contained app surface on the right; typography on the left.
- Regions: brand and task statement at x=86–565; UI illustration at x=620–1210; full background from the app canvas color.
- Material: pale blue-gray canvas, off-white paper, muted teal controls, dark ink, one terracotta top rule.
- Line roles: the top rule separates the app surface; card borders bound UI areas; short strokes stand for text lines inside the illustrated editor and list.
- Canvas: 1280×640, solid background, essential content at least 72 px from the edges.

## Review criteria

- `BakuNotes` and the task statement remain legible at 320×160.
- The library/editor relationship remains recognizable at thumbnail size.
- No text or shapes collide, and the preview works on light and dark surroundings.
- SVG remains editable; PNG is 1280×640 and below 1 MB.

GitHub Social Preview setting upload is outside this asset's scope; the image is embedded in both READMEs.

## Validation result

- Source: `docs/social-preview.svg`; raster: `docs/social-preview.png`.
- Raster: PNG, 1280×640, 16,710 bytes; bundled mechanical validator passed.
- Full-size inspection: passed. The illustrated panel, title, and subtitle have no clipping or collisions.
- 320×160 light/dark review: passed; the name, task statement, and paired library/editor surface remain readable.
- Promoted as the initial BakuNotes cover. No GitHub repository setting was changed.
