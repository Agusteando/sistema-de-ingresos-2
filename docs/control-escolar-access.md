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
