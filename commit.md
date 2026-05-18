Refine students KPI refresh state without changing base design

Implement a contained, design-preserving KPI refresh treatment for the cache-first students background sync flow.

Changes:
- Preserved the restored original KPI layout, colors, icon styling, spacing, and resting visual design.
- Added an `isRefreshing` state to the KPI summary that only activates while usable student data is being refreshed in the background.
- Added a contained pseudo-element background wash using opacity and background-position only; no scaling, card transforms, or layout-affecting motion.
- Added a restrained label/value color-breathe effect while syncing so the refresh state is perceptible without reading as an alert or loading failure.
- Added a short minimum visible refresh window so fast background syncs do not blink too quickly to notice.
- Added a conservative KPI value roll/fade transition for changed numbers without adding delta badges or changing typography.
- Preserved reduced-motion support by disabling moving/pulsing animation and keeping a static low-signal pending tint.

Validation:
- npm ci --ignore-scripts
- npm run build

Notes:
- The existing lockfile still reports 3 npm audit vulnerabilities.
- The KPI treatment is intentionally limited to the synced-data state and does not modify student classification logic, filtering, field design, or cache behavior.
