Refine student KPI refresh motion and value changes

- Preserve the existing cache-first student loading flow and low-signal background sync indicator.
- Remove the prior refresh-layer scale transforms so the KPI refresh treatment no longer creates a perceived UI zoom or shifting card surface.
- Replace scaling movement with a contained background-position gradient wash, keeping card dimensions, layout, hit targets, and visible values stable.
- Smooth the refresh affordance in and out with a longer minimum visible refresh window and opacity-based transitions.
- Add an odometer-style KPI value transition for changed numbers while preserving the current KPI value presentation.
- Add a small non-layout-affecting +/- delta marker when KPI values change, including currency formatting for monthly income.
- Keep interactions unblocked and avoid skeletons, loaders, flashing, route reloads, or hidden KPI values.
- Respect reduced-motion preferences by disabling animated refresh, odometer, and delta motion while preserving a static pending-data cue.

Validation:
- Ran `npm run build` successfully.

Notes:
- The unwanted movement was caused by the previous KPI refresh pseudo-layer using animated `transform: scale(...)` values. The new effect is contained to background-position changes only.
