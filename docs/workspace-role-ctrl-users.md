# Workspace users and domain assignment

User access is assigned through the centralized external `users` table, read and written through the Control Escolar MySQL connection configured with `CONTROL_ESCOLAR_MYSQL_*`.

The authorization model uses the existing fields only:

- `users.role` determines the available domain.
- `users.plantel` contains the authorized plantels as a comma-separated list.
- `ROLE_CTRL` enables only Control Escolar.
- `ROLE_ADMON` enables only the Financial domain in every plantel already listed in `users.plantel`.
- `ROLE_CTRL,ROLE_ADMON` enables both domains in those plantels.
- Empty, unknown, or legacy roles normalize to the safe `ROLE_CTRL` default.
- `superadmin` enables both domains globally.

No second financial-plantel column is used. Changing a user's domain does not replace or duplicate the existing `users.plantel` assignment.

## Directory source

The Usuarios page searches Google Workspace through the Admin Directory API using a service account with domain-wide delegation.

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

## Assignment behavior

New users default to `ROLE_CTRL`. A superadministrator can select Control Escolar, Financial, or Both from Usuarios. The application stores exactly `ROLE_CTRL`, `ROLE_ADMON`, or `ROLE_CTRL,ROLE_ADMON` and keeps the existing comma-separated `users.plantel` value unchanged.

Each domain is strict and independent: `ROLE_CTRL` is required for Control Escolar and `ROLE_ADMON` is required for Financial access. One role never implies the other. Empty, unknown, or legacy roles remain in the safe Control Escolar domain.

Authorization is re-read from the centralized `users` table on protected requests. A non-superadmin account without a valid plantel in `users.plantel` is denied instead of receiving an implicit fallback plantel.

## Data boundaries

- Google Workspace Directory is read-only and is used only to select institutional users and display profile images.
- The centralized external `users` table stores identity, `users.plantel`, role, blocked status, and login metadata.
- The centralized external `matricula` table stores Control Escolar student overlay data.
- The plantel-local financial database remains the source for financial operations.
- Bridge/direct transport selection and plantel database routing are unchanged by these roles.
