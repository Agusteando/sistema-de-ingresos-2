fix: keep baja-with-motive students in current-cycle bajas filter

- Preserve baja rows with current-cycle enrollment evidence even when their academic projection is out of scope.
- Expose server-side current enrollment evidence to KPI/list predicates so motive-based baja statuses still count under Bajas.
- Keep existing cache, KPI, Control Escolar, SQL console, and bulk ciclo behavior unchanged.
