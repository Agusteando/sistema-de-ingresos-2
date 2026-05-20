feat(students): add bulk ciclo de ingreso workflow

- Add persistent multi-search student selection using stored matrícula snapshots.
- Add bulk action entry points for updating ciclo de ingreso from the selection dock and bulk workspace.
- Add a guided bulk ciclo de ingreso modal with selected-student review, linked nivel/grado progression controls, preview, and success results.
- Add a dedicated bulk ingreso-cycle API endpoint that validates plantel scope, updates ciclo/nivel/grado/plantel in one transaction, and never touches matrícula or grupo.
- Preserve existing student loading, interno resolver, and Control Escolar UI behavior.
