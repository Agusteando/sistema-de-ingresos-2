Implement cache-first Estado de Cuenta sync

Add a cache-first loading flow for Estado de Cuenta that mirrors the students cache/sync pattern without redesigning the account UI.

Changes:
- Added `composables/useAccountStateCacheSync.ts` for ciclo-, plantel-, recargo-, and matrícula-scoped Estado de Cuenta caching.
- Estado de Cuenta now renders cached account rows immediately when available, then fetches fresh debts in the background.
- Background sync no longer clears visible account rows while refreshing.
- Same-context refreshes preserve scroll position, expanded payment history, selected debts, and the current concept/action context where the refreshed row still exists.
- Added a restrained inline sync indicator in the Estado de Cuenta header for local data, updating, updated, and stale/sync-failed states.
- Added a quiet updating treatment over the account table while background sync is running, using a soft moving wash and subtle text breathing without skeletons, flashing, layout movement, or blocking interaction.
- Added reduced-motion handling for the account sync indicator and account updating treatment.
- Mutation-driven refreshes after payments, enrollment, depuración, monto-final changes, and payment cancellation bypass stale cache and fetch fresh account data while keeping the current panel stable.

Validation:
- npm ci --ignore-scripts passed.
- npx nuxi prepare passed.
- npm run build completed the client build; the server build transform step exceeded the execution timeout in this environment and did not return a final success/failure signal.

Note:
- npm ci reported the existing dependency audit status: 5 vulnerabilities (4 moderate, 1 high).
