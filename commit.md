Refine student account actions and expandable account sidebar

- Fix the Más action menu so click-triggered context menus stay open instead of closing immediately.
- Add a toggleable expanded Estado de Cuenta panel with a right-sidebar treatment, larger layout, summary metrics, and a dedicated collapse control.
- Add a subtle hover/magnetic affordance to the account header so users can discover the expanded account view without adding noisy UI.
- Preserve the existing account table interactions, search, debt selection, concept adjustment, history, and refresh states while expanding/retracting the panel.
- Keep the action/detail implementation scoped to the student detail area with reusable state and clean CSS rather than overrides or dead styles.
