fix: correct enrollment KPI filters and preserve cache-first sync

Align student KPI counts and active filters with enrollment rules: inscritos/internos/externos require current-cycle enrollment, no inscritos require previous-cycle enrollment without current-cycle enrollment, and bajas require current-cycle enrollment with non-active status. Cache enrollment concept IDs locally so cache-first student loads can classify rows before the remote config request completes.
