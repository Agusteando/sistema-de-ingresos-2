# Workspace users and ROLE_CTRL assignment

Control Escolar workspace access is assigned through the centralized external `users` table, not through the plantel-local financial database. The user-management screen reads and writes this external table only. The table is accessed through the same external Control Escolar MySQL connection configured with `CONTROL_ESCOLAR_MYSQL_*`.

This table is only an access/role assignment layer. It must not be used as a hard gate for normal `/api/students` loading or other financial/operator APIs.

## Directory source

The `Usuarios / ROLE_CTRL` page searches Google Workspace through the Admin Directory API using a service account with domain-wide delegation.

The search endpoint is:

`GET /api/directory/users?q=<search>`

It only returns accounts from:

`@casitaiedis.edu.mx`

Profile images are served through:

`GET /api/directory/photo?email=<email>&name=<name>`

The photo endpoint tries Google Workspace Directory first and falls back to an initials avatar if the directory photo is unavailable.

Required runtime configuration can use either naming set already present in the app:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL` or `GCP_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY` or `GCP_PRIVATE_KEY`
- `GOOGLE_ADMIN_EMAIL` or `GCP_ADMIN_SUBJECT`

The delegated admin account must be allowed to use the Admin Directory readonly scope:

`https://www.googleapis.com/auth/admin.directory.user.readonly`

## Role assignment behavior

New workspace assignments are not restricted by default.

Default role:

`plantel`

This means normal operator/financial access.

Restricted Control Escolar-only role:

`ROLE_CTRL`

Only an exact non-superadmin `ROLE_CTRL` session is routed to the Control Escolar workspace and hidden from the default financial/sidebar controls.

Superadmin role:

`global`

Existing operators should not be logged out or restricted just because the external `users` table exists. A user only becomes Control Escolar-only when their external `users.role` is explicitly set to `ROLE_CTRL`.

## Data boundaries

- Google Workspace Directory is read-only and is used only to select valid institutional users and display profile images.
- The centralized external `users` table stores the workspace role assignment, planteles, avatar URL, and email. User management does not write local fallback `users` rows for ROLE_CTRL.
- The centralized external `matricula` table stores Control Escolar student overlay data.
- The plantel-local `base` table remains the source for the normal operator-facing student list.
