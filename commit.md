Refine student KPI refresh visibility

- Keep the existing cache-first students flow and low-signal sync indicator intact.
- Make the KPI refresh state reliably perceptible by holding the visual updating state for a short minimum window when a background sync starts with usable student data already on screen.
- Increase the KPI updating affordance without changing layout: KPI labels and values now use a restrained color pulse, and each card gets a gentle moving gradient wash above the card background.
- Preserve visible KPI values, filters, selection, open workspaces, scroll, pagination, and interaction while fresh data is fetched and applied.
- Avoid skeletons, blocking loaders, flashing, alert styling, layout shift, route reload behavior, hardcoded resolution fixes, override layers, and `!important`.
- Respect reduced-motion preferences by disabling the animations and leaving a static low-signal pending-data tint.

Validation:
- Ran `npm run build` successfully.

Notes:
- The earlier KPI effect was easy to miss because the `/api/students` background request can resolve too quickly for the `syncing` class to remain visible, and the previous overlay/text opacity was too close to the normal KPI styling.
- The sandbox `npm ci --ignore-scripts` command exceeded the tool timeout after installing dependencies, but the resulting dependency install was sufficient for `npm run build` to complete successfully.
