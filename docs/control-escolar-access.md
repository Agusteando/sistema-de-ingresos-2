# Control Escolar and Financial access

The centralized external `users` table is the authorization source. The application uses `users.role` together with the existing comma-separated `users.plantel` field.

`ROLE_CTRL` is the safe default and keeps the user in Control Escolar. `ROLE_ADMON` enables the Financial domain only in the plantels already assigned in `users.plantel`. `superadmin` keeps global access.

Protected API requests re-read the central user record. A non-superadmin must have a valid active plantel contained in `users.plantel`; otherwise the request is denied. Financial endpoints additionally require the Financial role.

The student list, payments, documents, concepts, reports, Bridge/direct transport, and financial data sources are not changed by this authorization model.
