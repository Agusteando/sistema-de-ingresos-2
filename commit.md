Improve modal safety and draft persistence across high-risk workflows

- Add a reusable modal draft persistence guard for dirty-state detection, scoped localStorage drafts, restoration, discard confirmation, Escape-key handling, and cleanup after save/discard.
- Protect the Alta student modal from accidental outside-click, close-button, cancel-button, and Escape-key closure when unsaved changes exist.
- Persist Alta drafts per create/edit context and restore unfinished work with the inline message: “Se restauró información no guardada.”
- Apply the same reusable pattern to Pagos, scoped by student, cycle, and selected debt context so payment amounts and payment method can be restored safely.
- Clear drafts after successful saves and only clear drafts on intentional discard after the user confirms: “Hay información sin guardar. ¿Quieres salir y descartar los cambios?”
- Keep drafts local, scoped, and short-lived with a 24-hour expiration to avoid retaining sensitive form data longer than necessary.

Validation:
- StudentFormModal.vue script syntax checked with node --check.
- PaymentModal.vue script syntax checked with node --check.
- useModalDraftPersistence.ts checked with TypeScript transpile diagnostics.
- npm run build could not run because this sandbox does not include node_modules/nuxt, and npm ci could not complete in the container.
