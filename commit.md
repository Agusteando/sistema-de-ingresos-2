Refine student background sync affordances

- Keep the cache-first student loading flow intact while making the sidebar sync indicator lower-signal and less visually prominent.
- Reduce the indicator to a compact muted status line that communicates cached, updating, updated, and failed/stale states without a card, banner, toast, modal, or alert treatment.
- Add a restrained pending-data treatment to the student KPI cards while background sync is active and existing student data remains visible.
- Preserve current KPI values, card sizing, filters, selection, workspace state, and interaction during sync; fresh values apply through the existing student data update path.
- Respect reduced-motion preferences by disabling the KPI sweep and sync-dot animation while keeping a static low-signal state.

Validation:
- Ran `npm ci --ignore-scripts` to install dependencies in the sandbox.
- Ran `npm run build` successfully.

Notes:
- `npm ci` reported the existing dependency audit status: 3 vulnerabilities from the current lockfile dependency tree.
