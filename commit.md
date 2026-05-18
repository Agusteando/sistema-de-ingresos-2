Refine KPI background-sync affordance

- Keep the cache-first student loading and subtle sidebar sync indicator intact.
- Make the KPI updating state more perceptible while background sync is active by combining a soft text-color pulse on KPI labels/values with a gentle moving gradient wash inside the KPI cards.
- Preserve visible KPI values, card dimensions, filters, selection, workspace state, scroll, and interaction while fresh data is fetched and applied.
- Avoid skeletons, blocking loaders, flashing, alert-like styling, layout shift, or route reload behavior.
- Respect reduced-motion preferences by disabling KPI animations and keeping a static low-signal pending-data tint.

Validation:
- Ran `npm ci --ignore-scripts` to install dependencies in the sandbox.
- Ran `npm run build` successfully.

Notes:
- `npm ci` reported the existing dependency audit status: 3 vulnerabilities from the current lockfile dependency tree.
