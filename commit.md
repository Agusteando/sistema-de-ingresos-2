Refine ciclo de ingreso UX

- Redesign the ciclo de ingreso modal as a polished full-screen overlay with a centered, unclipped dialog.
- Add a functional 12-cycle ingreso picker with current, registered, nearby, and selected cycle cues.
- Keep ciclo de ingreso saving behavior intact: selected ingreso cycle persists to base.ciclo and mirrors base.interno=0 through the existing API.
- Replace the cluttered Interno/Externo chip treatment with cleaner standalone pills in student list and details.
- Move the list Interno/Externo label out of the matrícula pill so matrícula and resolved tipo de ingreso read as separate data.
- Preserve the ciclo-scoped resolver, cache-first flows, Estado de Cuenta behavior, KPIs, filters, tables, and exports.
