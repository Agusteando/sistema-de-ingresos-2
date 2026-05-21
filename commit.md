fix: stabilize KPI filters and restore sync feedback

- Keep the dashboard default filter locked to inscritos instead of falling back to an unfiltered mixed cohort.
- Preserve current-ciclo enrollment predicates for inscritos, internos, externos, no inscritos, and bajas across KPI counts and filtered lists.
- Prevent student search and clear actions from dropping the inscritos filter unintentionally.
- Add enrollment-concept signatures to cached student records so stale concept-specific cache entries are not reused when concepts change.
- Add an unavailable sync state for cold-load failures without local cache.
- Redesign the sidebar student sync indicator with compact packet/spiral/check states for cached, syncing, synced, failed, and unavailable.
