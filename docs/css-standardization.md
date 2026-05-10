# CSS and Students page standardization

This pass uses the pass-3 repo as the base and moves the Students area toward the target architecture: design tokens, reusable UI primitives, feature components, composables, and route-level orchestration.

## Objective

Preserve the existing Students route visual look 1:1 while removing the giant single-file ownership model. The page should read like production code: the route coordinates data and flow, feature components render UI sections, composables own stateful behavior, shared utilities own pure presentation logic, and CSS is organized by design responsibility.

## Current architecture

- `pages/index.vue` is the Students route orchestration layer.
- `components/students/` contains feature UI slices.
- `components/ui/` contains reusable UI primitives introduced in this pass:
  - `UiButton.vue`
  - `UiChip.vue`
  - `UiIconButton.vue`
- `composables/` contains stateful feature behavior:
  - `useStudentSelection.ts`
  - `useStudentSections.ts`
  - `useStudentBulkPayments.ts`
  - `useStudentsWorkspaceScale.ts`
- `shared/utils/studentPresentation.ts` contains pure display helpers.

## CSS structure

The Students entrypoint is intentionally small:

- `assets/css/pages/students.css`

It imports explicit layers of responsibility:

- `assets/css/design/students.tokens.css`
- `assets/css/ui/primitives.css`
- `assets/css/features/students/layout.css`
- `assets/css/features/students/filters.css`
- `assets/css/features/students/kpis.css`
- `assets/css/features/students/student-list.css`
- `assets/css/features/students/bulk-workspace.css`
- `assets/css/features/students/section-modal.css`
- `assets/css/features/students/selection-dock.css`
- `assets/css/features/students/motion.css`
- `assets/css/features/students/responsive.css`

The feature styles are split by responsibility instead of being kept as one opaque monolithic stylesheet.

## Validation

- Nuxt production build completed successfully with `npm run build`.
- CSS parsed through Vite/PostCSS during the production build.
- Production builds are used as the current validation gate in this environment.

## Audit notes

This is no longer a rescue-only layout. It has the shape expected from a clean implementation: primitives, feature components, composables, tokens, and CSS modules. The remaining exact-measurement rules exist to protect the required 1:1 visual lock.
