# Students reference redesign pass

This pass keeps the Students route on the greenfield-style presentation architecture: tokens, UI primitives, feature components, composables, and focused feature CSS. The work is presentation-only. It does not change business endpoints, data loading, permissions, validations, persistence, search, selection semantics, payment behavior, or section behavior.

## Current focus

The current iteration tightens the selected-student workspace against the supplied reference:

- The student list remains the accepted reference for density and vertical allocation.
- `StudentDetails` keeps the real student photo/initials behavior.
- The profile/action card is more compact so `Estado de Cuenta` receives more vertical space.
- The account table row/header/footer rhythm is tuned so multiple concepts remain visible in normal desktop space.
- The bulk-selection dock is more compact and uses non-wrapping actions, especially `Aplicar pago`.

## CSS architecture

- `assets/css/design/students.tokens.css` holds Students design tokens.
- `assets/css/ui/primitives.css` holds reusable button/chip/icon-button presentation used by the Students feature.
- `assets/css/features/students/*.css` is split by feature responsibility: layout, KPIs, filters, list, bulk workspace, section modal, selection dock, motion, responsive rules.
- `assets/css/components/student-details.css` owns the account panel presentation.
- `components/students/*` keep the route decomposed into focused UI components.
- `composables/*` keep selection, section, bulk payment, and workspace scaling behavior outside the page component.

## Override policy

No Students-scope `` declarations are used in this pass. No Students-scope Tailwind important utility classes are used for layout or visual correction. The remaining `` declarations in the repo are pre-existing outside this Students work: global reduced-motion accessibility rules in `assets/css/main.css`, print-page background rules, and legacy rules in `pages/deudores.vue`.
