Refine ciclo de ingreso UX and remove base.interno from active flow

- Rebuilt the alta/edit student modal around the selected ciclo escolar as the default ciclo de ingreso.
- The alta flow now shows the inferred visible status immediately: a new student defaults to Externo in the currently selected ciclo because base.ciclo is saved to that cycle.
- Added a restrained "Cambiar ciclo de ingreso" path with a 12-year ciclo picker for cases where the user is registering prior-cycle work.
- Added clear cycle/status summary rows in the alta modal so users can see which ciclo will be saved and what Interno/Externo status it implies.
- Added polished result-card transitions, sheen/orb motion, and reduced-motion handling.
- Added automatic proper-name casing for student and tutor names before saving.
- Removed active API/UI mirroring of tipo de ingreso into an interno field; the app now uses the ciclo-scoped resolver result instead of base.interno.
- Kept the existing resolver, cache-first students flow, Estado de Cuenta cache-first flow, KPIs, filters, tables, and exports intact.

Validation:
- npm ci --ignore-scripts passed.
- npx nuxi prepare passed.
- npm run build completed the client production build; the server transform step exceeded the execution timeout in this environment without surfacing a code error.
