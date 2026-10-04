# IECS–IEDIS identity in Aurora

Source: institutional identity folder supplied by the owner, reviewed 2026-10-04:
https://drive.google.com/drive/folders/1uHBOlvyIqVFlrD-GC8yY3b-x5pFVY7zq

## Reviewed references

- **Sistema de Color Institucional IECS–IEDIS 25–26.pdf**, file `1yI9ZBZzBwp7BxQ2tBPRTaepC7BM8tMVU`: both institutions' primary, secondary, tertiary and support palettes. The document itself dates its last update to November 2024; the folder upload is August 2026. Use the printed hex values for screens, rather than guessing from compressed image pixels.
- **IMAGOTIPO-IECS-IEDIS-24-25.png**, file `1lqagkqE1apIYRHNBhW3AowKa6tWqN08O`: official combined house/puzzle and person/book/globe mark, including the institution wordmarks. Preserve composition and proportions.
- **BG-IECS-IEDIS-PATTERN.jpg**, file `1K-BIsAInTsspHqWLMLbB52ybn4Luaom4` (canonical source URL below): green-to-teal field with puzzle pieces, concentric arcs, diagonals and chevrons.
- **BACKGROUND-PATTERN-GRADIENT.png**, file `1MkHWKPfcq7V6nd6EDyCoQoMQNUTvQYix`: neutral geometric grid containing literal fingerprints, puzzle pieces, concentric arcs, leaves and diagonals. The sidebar uses this official artwork as a quiet repeating texture.
- **EMBLEMA INSTITUCIONAL-COLOR.png**, file `1uwCiY36bY3MOwuqNTGTAorIRumYxSUET`: newer combined IECS–IEDIS crest with tree, globe, book, hands and laurels. The sidebar uses a proportion-preserving derivative, replacing the separate institution marks.
- **GRADIENT-FINGERPRINT-IECS-IEDIS.png** and **FRONTPAGE-IECS-IEDIS-26-27.jpg**: the paired green/teal identity, white marks and expressive arc/chevron language.
- **TIPOGRAFIAS INSTITUCIONALES**: Montserrat Regular/Medium/Bold/ExtraBold and Fredoka One. Aurora already uses Montserrat and Fredoka; preserve the established families and readable body weights.
- Inspected the logos/identifiers and ambassadors inventories. The application retains its existing group-specific masks; a new mascot or educational-level color must not replace the semantic meaning of financial status or grade identification.

Pattern source: https://drive.google.com/file/d/1K-BIsAInTsspHqWLMLbB52ybn4Luaom4/view

## Color roles

| Role | IECS | IEDIS |
| --- | --- | --- |
| Primary | `#618B2F` | `#007F92` |
| Secondary | `#00692F` | `#00497B` |
| Tertiary | `#6D5F24` | `#762728` |
| Shared gray | `#50535A` | `#86888C` |

Educational accents in the guide: daycare `#8EC152`, preschool `#E83F4B`, elementary `#FCBF2C`, middle `#66A8D8`. These are available as tokens, not a remapping of existing grade/status colors. Light primary IECS has insufficient contrast for small white labels; filled primary actions use the guide’s exact secondary green `#00692F`, while the Aurora mark and primary green accents use exact primary `#618B2F`. Hover uses official secondary blue `#00497B`. Do not invent an intermediate olive green.

## Implementation rules

Shared Tailwind colors and global primary buttons use the printed palette. `assets/css/design/institutional.css` centralizes these tokens. Filled primary CTAs share solid `--action-primary: #00692F`; small white labels have sufficient contrast. The combined official crest, classic Aurora mark in flat primary green/teal, official fingerprint texture and restrained teal accents represent both institutions. Keep the approved pale sidebar background. No animated color wash or gradient logo is used.

The collapsed sidebar is a 72px rail with transparent navigation icons and a single clear active surface. Expanded navigation, role permissions, plantel switching, persistence and all routes remain. Decorative texture sits behind navigation, away from reading and transaction surfaces. Original `UiGroupIcon` sigils and the grade-to-photo animation are preserved in both student workspaces.

`public/brand/institutional-emblem.webp` and `institutional-fingerprint.webp` are optimized, proportion-preserving derivatives of the official Drive artwork. Assets load locally without a Drive dependency at runtime.

## Preserved interaction and density milestones

Alumnos uses the original Todos, Con adeudo, grade and group **pills at every width**. The unauthorized responsive selects and the rule hiding pills below 1600px are removed. Selecting a grade exposes the original group pills; Todos clears grade/group/debt. Horizontal pill scrolling preserves the dense workspace without substituting controls.

Control Escolar retains its five clickable KPI categories, familiar medallions, counts and volume bars, with compact spacing and restrained institutional accents. Student name, metadata, group artwork and photo remain in a compact header. The default record view puts identity fields ahead of the repeated status cards, while the persistent header still shows record completeness and its first pending issue. All seven record tabs are siblings of the scrolling body, so scrolling fields cannot hide section navigation. The save/discard footer remains fixed; all fields, actions and financial/grade meanings are preserved. No backend, authorization or schema change accompanies this presentation update.

Local browser verification covers six viewport sizes, original pill interactions, photo loading/animation, retained group artwork, fixed record navigation, all seven desktop/mobile tabs, edit/discard/return, consistent filled CTA color, sidebar permissions/persistence and existing account workflows. Use `scripts/verify-student-workspace-ui.mjs` with the development-only visual lab; its browser-intercepted fixture never submits records.


## Aurora product logo v2

Generated with the built-in image-generation tool, transparent alpha, October 2026. The official institutional identifiers were not regenerated or modified. Runtime asset: `public/brand/aurora-logo-v2.webp`, a tightly cropped 900px derivative with alpha preserved. The previous asset remains available for rollback.

Final prompt (built-in image-generation mode):

> Use case: logo-brand. Create a polished new Aurora application logo for the shared IECS and IEDIS school network. Asset: a single horizontal transparent-background logo for a compact sidebar, wide composition, tightly framed with modest clear padding. Text verbatim: 'Aurora' in clean confident rounded geometric sans lettering, readable at small UI sizes. To the left, an original flowing A-shaped symbol made from two interwoven luminous aurora ribbons: equally balanced IECS leaf green (#618B2F, #8EC152, #00692F) and IEDIS teal-to-deep-blue (#007F92, #00497B, #66A8D8). The ribbons rise and arc elegantly, expressing education, connection and an aurora borealis; subtle smooth gradients, refined curves, friendly but mature. Wordmark dark deep blue/teal with a restrained green-to-teal accent. Beautiful professional identity, crisp clean edges, strong silhouette, vector-friendly aesthetic rendered as raster. No slogan, no extra text, no mockup, no enclosing tile, no white rectangle, no watermark, no scenery, no excessive glow. Actual alpha transparency. Both institutions must feel equally represented. This is the Aurora product logo; do not invent or reproduce institutional logos.

## Classic Aurora restoration (2026-10-04)

`public/brand/aurora-logo-classic.webp` restores the original triangular A, orbit and star in a transparent, high-resolution, semi-minimal horizontal mark. This prior restoration asset remains available for rollback. The newer institutional-color edition below is used by sidebar and login. Built-in image generation used the original `public/aurora-logo.png` as the edit target: preserve the A/orbit/star and AURORA wordmark, clean sharp edges, flat olive green and deep teal, remove gradients/shadows and baked checkerboard, omit the small tagline for compact readability. The result is stored as lossless WebP, 2172×724; the source and previous assets are preserved.

## Exact-color classic Aurora edition (2026-10-04)

Image generation refined the classic A/orbit/star and wordmark while preserving its composition, alpha and flat shapes. `aurora-logo-institutional.webp` stores that source. Image generation approximates colors, so `aurora-logo-institutional.svg` embeds the source and maps its two flat color regions to the palette’s exact `#618B2F` and `#007F92` through an sRGB SVG filter with literal palette-color floods. The filter corrects the generated interior’s unintended near-opaque alpha while retaining transparent edges. Sidebar and login use the same self-contained SVG. No gradients, external image dependencies or institutional-logo regeneration are involved.
