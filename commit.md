fix(students): remove alternate enrollment action and preserve ingreso anchor

- Preserve the ciclo selected in the alta form as the student's ingreso cycle when creating the base record.
- Send the ingreso cycle explicitly from the alta form and use it as the server-side academic anchor.
- Include configured future cycles in the alta cycle picker so a Primero can be registered for a future ingreso cycle without changing the stored grade anchor.
- Treat cycles before the ingreso cycle as out of scope instead of clamping promotion back to Primero.
- Remove the generated quick-enroll action from the student detail menu.
- Remove the `/api/students/:matricula/enroll` endpoint so the app cannot create enrollment through an alternate flow.
- Resolve enrolled status only from configured external enrollment concept IDs matched against paid/loaded concept IDs from the selected cycle.
- Stop using enrollment concept names or `inscrip` text matching as fallback enrollment evidence.
- Bump the students cache version so stale cached rows without concept IDs are not reused.

Expected behavior: a student created as Primero for ciclo 2026-2027 remains Primero when the user is positioned in ciclo 2026-2027. A student is considered inscrito only when the current cycle has a loaded or paid concept whose ID is present in the external enrollment configuration.
