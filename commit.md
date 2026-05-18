Implement ciclo-scoped tipo de ingreso resolution

Treat base.ciclo as the student's ciclo de ingreso and resolve Interno/Externo per selected ciclo through one shared resolver. The ingreso cycle is Externo, later selected cycles resolve as Interno from the ingreso anchor and can be confirmed by inscripción/reinscripción concepts in both the target and immediately previous ciclo. Missing prior-cycle migrated concepts are not used to infer Externo.

Changes:
- Added shared tipo de ingreso resolver in shared/utils/tipoIngreso.ts and server/utils/resolveTipoIngreso.ts.
- Updated student list/detail data, filters, KPI counts, KPI trends, table chips, and CSV exports to use the resolver instead of raw base.interno.
- Preserved base.interno as a legacy compatibility field and fallback only when base.ciclo is missing or invalid.
- Added an Estado de Cuenta badge that clearly shows the resolved Interno/Externo value for the selected ciclo.
- Added the "¿Cuándo ingresó?" correction action and modal with student context, selected ciclo, resolved status, current ingreso cycle, ingreso-cycle selector, timeline simulation, and grade progression preview.
- Saving the modal updates base.ciclo and mirrors base.interno = 0, then recomputes the selected student's resolved tipo de ingreso without a full page reload.
- Updated exports to be ciclo-aware and include the resolved tipo de ingreso metadata plus available contact/synced fields.
- Adjusted external base sync so existing user-corrected base.ciclo values are not overwritten by the current sync cycle.

Validation:
- npm ci --ignore-scripts passed.
- npm run build passed.

Note:
- npm ci reported the existing dependency audit status: 5 vulnerabilities (4 moderate, 1 high).
