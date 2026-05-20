feat: restore safe Control Escolar role mode

- Reintroduce ROLE_CTRL as a UI/navigation mode without using it to gate regular student loading.
- Route exact non-superadmin ROLE_CTRL users to Control Escolar and hide financial sidebar/ciclo controls only for that role.
- Preserve default financial access for superadmin, plantel users, and mixed-role users.
- Load role metadata from the local users table at login, without centralized-user validation in /api/students or shared API middleware.
- Gate Control Escolar endpoints to superadmin or ROLE_CTRL while leaving student APIs unchanged.
