fix(students): anchor alta grade to ingreso cycle

- Preserve the ciclo selected in the alta form as the student's ingreso cycle when creating the base record.
- Send the ingreso cycle explicitly from the alta form and use it as the server-side academic anchor.
- Include configured future cycles in the alta cycle picker so a Primero can be registered for a future ingreso cycle without changing the stored grade anchor.
- Treat cycles before the ingreso cycle as out of scope instead of clamping promotion back to Primero.

Expected behavior: a student created as Primero for ciclo 2026-2027 remains Primero when the user is positioned in ciclo 2026-2027. The system should only promote the grade when the selected cycle is after the registered ingreso cycle.
