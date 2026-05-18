Refine alta modal academic fields and matrícula sequence

- Remove Grupo from the new-student alta form and save new students without grupo.
- Keep Grupo editable only when updating an existing student.
- Reduce the academic section to the required Grado control; plantel and nivel remain derived from the active session context and plantel resolver.
- Remove the invasive matrícula estimate card and move matrícula context into a compact footer strip.
- Compute the next matrícula display from the current highest matrícula for the active plantel, preserving the numeric padding format such as PM0053.
- Show last matrícula and next matrícula in the alta footer without reserving or creating the matrícula before save.
- Remove user-facing “estimada” wording from the alta matrícula UI and remove the alta footer explanation text.
- Rename the sidebar plantel label from “Plantel activo” to “Plantel”.
- Preserve CURP-first validation, inferred birth date/age/gender, active plantel, selected ciclo de ingreso, proper-name casing, and existing edit behavior.

Validation:
- npm ci --ignore-scripts passed.
- npx nuxi prepare passed.
- StudentFormModal.vue parsed and compiled with @vue/compiler-sfc.
- npm run build completed the client production build; the server transform step exceeded the execution timeout in this environment without surfacing a code error.
