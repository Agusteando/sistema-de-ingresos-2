fix(students): stabilize KPI filters and baja refresh state

- Keep dashboard filters in valid canonical states and reset stranded grade/group filters after data changes.
- Preserve enrollment concept IDs from cached data and avoid clearing them when remote config returns no usable IDs.
- Include inactive students with current-cycle enrollment evidence in the students reload scope so baja updates remain countable.
- Refresh students and KPI trend data after baja updates without dropping the dashboard into empty stale state.
