# IECS–IEDIS identity in Aurora

Source: institutional identity folder supplied by the owner, reviewed 2026-10-03:
https://drive.google.com/drive/folders/1uHBOlvyIqVFlrD-GC8yY3b-x5pFVY7zq

## Reviewed references

- **Sistema de Color Institucional IECS–IEDIS 25–26.pdf**, file `1yI9ZBZzBwp7BxQ2tBPRTaepC7BM8tMVU`: both institutions' primary, secondary, tertiary and support palettes. The document itself dates its last update to November 2024; the folder upload is August 2026. Use the printed hex values for screens, rather than guessing from compressed image pixels.
- **IMAGOTIPO-IECS-IEDIS-24-25.png**, file `1lqagkqE1apIYRHNBhW3AowKa6tWqN08O`: official combined house/puzzle and person/book/globe mark, including the institution wordmarks. Preserve composition and proportions.
- **BG-IECS-IEDIS-PATTERN.jpg**, file `1K-BIsAInTsspHqWLMLbB52ybn4Luaom4` (canonical source URL below): green-to-teal field with puzzle pieces, concentric arcs, diagonals and chevrons.
- **BACKGROUND-PATTERN-GRADIENT.png**: neutral pattern fading toward white, supporting low-contrast use away from reading surfaces.
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

Educational accents in the guide: daycare `#8EC152`, preschool `#E83F4B`, elementary `#FCBF2C`, middle `#66A8D8`. These are available as tokens, not a remapping of existing grade/status colors. Light primary IECS has insufficient contrast for small white labels; filled actions darken toward `#507728`, while small green text uses secondary `#00692F`.

## Implementation rules

Shared Tailwind brand colors and global primary/secondary buttons use the same palette, with darker fills for white-label contrast. `assets/css/design/institutional.css` centralizes the verified screen palette and shared shell treatment. The official pattern appears behind sidebar navigation at 20% opacity; white data surfaces preserve text contrast. A thin green-to-teal header border links the two identities without spending vertical workspace. The generated Aurora ribbon mark sits beside the larger official combined institution mark. Shared chrome and filled actions drift between IECS greens and IEDIS blues over 72 seconds; reduced motion freezes a balanced midpoint. Data, status and grade colors retain their meanings.

The two WebP assets under `public/brand` are proportion-preserving, optimized derivatives of the above logo and pattern. Load them locally; no Drive or external institutional server is needed at runtime. Decorative group masks remain the original `UiGroupIcon` assets, with no extra row height, pointer interaction or accessibility noise. Do not place decorative textures over transaction values, inputs or financial status indicators.


## Aurora product logo v2

Generated with the built-in image-generation tool, transparent alpha, October 2026. The official institutional identifiers were not regenerated or modified. Runtime asset: `public/brand/aurora-logo-v2.webp`, a tightly cropped 900px derivative with alpha preserved. The previous asset remains available for rollback.

Final prompt (built-in image-generation mode):

> Use case: logo-brand. Create a polished new Aurora application logo for the shared IECS and IEDIS school network. Asset: a single horizontal transparent-background logo for a compact sidebar, wide composition, tightly framed with modest clear padding. Text verbatim: 'Aurora' in clean confident rounded geometric sans lettering, readable at small UI sizes. To the left, an original flowing A-shaped symbol made from two interwoven luminous aurora ribbons: equally balanced IECS leaf green (#618B2F, #8EC152, #00692F) and IEDIS teal-to-deep-blue (#007F92, #00497B, #66A8D8). The ribbons rise and arc elegantly, expressing education, connection and an aurora borealis; subtle smooth gradients, refined curves, friendly but mature. Wordmark dark deep blue/teal with a restrained green-to-teal accent. Beautiful professional identity, crisp clean edges, strong silhouette, vector-friendly aesthetic rendered as raster. No slogan, no extra text, no mockup, no enclosing tile, no white rectangle, no watermark, no scenery, no excessive glow. Actual alpha transparency. Both institutions must feel equally represented. This is the Aurora product logo; do not invent or reproduce institutional logos.
