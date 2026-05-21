# Control Escolar access

The regular financial/student APIs keep the default authenticated-session behavior. They do not depend on the centralized Control Escolar data source and they do not use `ROLE_CTRL` to allow or deny student loading.

`ROLE_CTRL` is only used to choose the Control Escolar UI mode. An exact non-superadmin `ROLE_CTRL` user is routed to Control Escolar and the financial sidebar/ciclo controls are hidden. Superadmin, plantel users, and mixed-role users keep the default financial behavior.

The Control Escolar module reads the selected plantel-local `base` table and the centralized `matricula` overlay. That overlay remains separate from regular financial access.

## Operator-only student information view

Financial/default operators and superadmin can use the separate `Ver información de alumno` action from the student menu. This action opens a read-only information modal and calls the bounded `/api/students/:matricula/operator-info` endpoint.

This view is not the normal `Ver detalles` financial/account panel. It is a separate read-only operator view that consolidates:

- selected plantel-local `base` row through the active bridge agent;
- centralized Control Escolar MySQL `matricula` row through `CONTROL_ESCOLAR_MYSQL_*` runtime configuration.

The endpoint rejects exact Control Escolar-only users (`ROLE_CTRL`) with `403`. Control Escolar users should not see this action, and the Control Escolar workspace should not expose this operator information view.

The centralized external `users` table is separate. It is used for workspace/user role assignment such as `ROLE_CTRL`; it must not become a required gate for regular `/api/students` loading or other financial APIs.

## Control Escolar student fetch data flow

Control Escolar student fetching is intentionally local-first.

1. The module selects the active plantel bridge agent.
2. It reads the plantel-local `base` table through the same bridge-backed source used by the operator-facing student module.
3. It takes only the `matricula` values returned by that local `base` read.
4. It queries the centralized external Control Escolar MySQL table `matricula` only for those matriculas.
5. It overlays the external `matricula` fields on top of the local `base` row for display/editing.

The external `matricula` table is an additional information layer, not the source that decides which students exist in the Control Escolar list. The Control Escolar list must not start from the centralized table, because that would hide students that exist in the plantel-local `base` but do not yet have a centralized overlay row.

The local `ingresos` table is not used as a hard gate for the Control Escolar student list. Some plantels do not keep `ingresos` aligned with the normal operator student list, so requiring an active `ingresos` row can make Control Escolar look empty even when `base` has the students.

If the centralized `matricula` overlay is temporarily unavailable, the read-only list can still return local `base` rows with `overlayExists = false`. Saving Control Escolar edits still requires the centralized `matricula` table because edits are written there.
