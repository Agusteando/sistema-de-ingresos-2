Refine ciclo de ingreso UI without changing core behavior

Keep the ciclo-scoped Interno/Externo resolver and data flow intact while reducing UI clutter around the resolved tipo de ingreso labels and ingreso-cycle correction modal.

Changes:
- Simplified the Estado de Cuenta Interno/Externo badge to show only the resolved value for the selected ciclo, with resolver details kept in the hover title instead of visible helper text.
- Matched the student-list tipo de ingreso chips to the cleaner pill treatment: icon plus Interno/Externo label, no uppercase/source/ciclo clutter.
- Removed the duplicate "¿Cuándo ingresó?" toolbar button so the correction action remains available through the top icon next to the existing header actions without crowding the action row.
- Teleported the ingreso-cycle modal to document body so it opens over the main screen instead of being constrained by the scaled secondary panel.
- Removed the user-facing "Simulación" framing and replaced the modal explanation with shorter final-user copy.
- Kept the timeline/progression preview, but presented it as a quieter cycle view.

Validation:
- npm ci --ignore-scripts passed.
- npm run build completed the client build, but the server build step exceeded the execution timeout while transforming and did not return a final success/failure signal in this environment.

Note:
- npm ci reported the existing dependency audit status: 5 vulnerabilities (4 moderate, 1 high).
