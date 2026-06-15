# Control Escolar and Financial access

The centralized external `users` table is the authorization source. The application uses `users.role` together with the existing comma-separated `users.plantel` field.

`ROLE_CTRL` enables only Control Escolar. `ROLE_ADMON` enables only the Financial domain in the plantels already assigned in `users.plantel`. A comma-separated `ROLE_CTRL,ROLE_ADMON` value enables both domains. Empty, unknown, or legacy roles normalize to the safe Control Escolar default. `superadmin` keeps global access.

Protected API requests re-read the central user record. A non-superadmin must have a valid active plantel contained in `users.plantel`; otherwise the request is denied. Financial endpoints additionally require the Financial role.

The student list, payments, documents, concepts, reports, Bridge/direct transport, and financial data sources are not changed by this authorization model.
