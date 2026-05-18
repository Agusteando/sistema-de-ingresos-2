Refine ciclo de ingreso modal and remove base.interno coupling

- Rework the ciclo de ingreso modal to match the supplied wide Figma reference more closely: centered overlay, large student header, two-column picker/result layout, refined footer, and responsive behavior.
- Replace the compact 12-cycle grid with a focused picker: four nearby cycle cards plus an expandable previous-cycle range covering up to 12 cycles.
- Rename the visible result section to "Resultado" and add animated result feedback, timeline entry motion, selected-cycle checks, and reduced-motion safeguards.
- Keep the modal fully functional: selecting and saving a ciclo updates base.ciclo, recomputes the ciclo-scoped Interno/Externo result, and updates the current UI without a page reload.
- Remove base.interno from the active ciclo resolver, ingreso-cycle save flow, Nuxt student APIs, student edit form, and external-base sync writes. The active system now resolves Interno/Externo from base.ciclo and ciclo-scoped evidence, not from base.interno.
