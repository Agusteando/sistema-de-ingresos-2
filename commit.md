Add live proper-case formatting to student name fields

- Apply automatic proper-case formatting while typing in name-related alta/edit fields.
- Covered A. paterno, A. materno, Nombre(s), and Padre/Tutor.
- Preserve in-progress spacing while typing so users can continue entering multi-word names naturally.
- Preserve final submit-time normalization for trimmed, single-spaced persisted names.
- Keep existing CURP validation, matrícula preview, plantel/ciclo behavior, and edit behavior unchanged.

Validation:
- npm ci --ignore-scripts passed.
- npx nuxi prepare passed.
- StudentFormModal.vue parsed and compiled with @vue/compiler-sfc.
- npm run build completed the client production build; the server transform step exceeded the execution timeout in this environment without surfacing a code error.
