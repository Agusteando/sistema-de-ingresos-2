Improve modal safety and draft persistence across high-risk workflows

- Add reusable modal draft persistence for dirty-state detection, scoped localStorage drafts, restoration, outside-click protection, Escape-key protection, and cleanup after save/discard.
- Add a reusable unsaved-changes confirmation dialog with the safe/default action focused on “Continuar editando” and a secondary “Descartar cambios” action.
- Add a visible draft state indicator so users can see when a local draft is saving, saved, restored, pending, or unavailable.
- Protect Alta from accidental outside-click, close-button, cancel-button, and Escape-key closure when unsaved changes exist.
- Persist Alta drafts per create/edit context and restore unfinished work with “Se restauró información no guardada.”
- Apply the same reusable pattern to Pagos, scoped by student, cycle, and selected debt context so payment amounts and payment method can be restored safely.
- Clear drafts after successful saves and only clear drafts on intentional discard after confirmation.
- Keep drafts local, scoped, and short-lived with a 24-hour expiration to avoid retaining sensitive form data longer than necessary.

Validation:
- StudentFormModal.vue script syntax checked with node --check.
- PaymentModal.vue script syntax checked with node --check.
- ModalDiscardDialog.vue script syntax checked with node --check.
- ModalDraftStatus.vue script syntax checked with node --check.
- useModalDraftPersistence.ts checked with TypeScript transpile diagnostics.
- npm run build was attempted but could not run because node_modules/nuxt is not installed in this sandbox.
