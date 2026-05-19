fix(students): preserve ingreso anchor when enrolling students

- Treat cycles before the registered ingreso cycle as out of scope instead of clamping grade promotion back to Primero.
- Stop quick enrollment from rewriting `base.grado`, `base.nivel`, or `base.ciclo`; enrollment now only creates the missing inscription documents for the selected cycle.
- Preserve `base.ciclo` and `base.grado` as the academic anchor used to derive the visible grade per cycle, so a Primero registered for a future ingreso cycle stays Primero when viewing that ingreso cycle.
