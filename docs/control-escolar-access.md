# Control Escolar access

The regular financial/student APIs keep the default authenticated-session behavior. They do not depend on the centralized Control Escolar data source and they do not use `ROLE_CTRL` to allow or deny student loading.

`ROLE_CTRL` is only used to choose the Control Escolar UI mode. An exact non-superadmin `ROLE_CTRL` user is routed to Control Escolar and the financial sidebar/ciclo controls are hidden. Superadmin, plantel users, and mixed-role users keep the default financial behavior.

The Control Escolar module still reads the selected plantel-local `base` table and the centralized `matricula` overlay. That overlay remains separate from regular financial access.
