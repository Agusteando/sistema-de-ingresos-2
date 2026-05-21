Fix student detail and isolate ROLE_CTRL user management

- Add read-only Control Escolar detail panel to the student detail view.
- Load consolidated base + centralized matricula data without exposing editable fields.
- Include parent contact emails, grupo, academic profile, baja follow-up, and available raw fields.
- Add a bounded student detail endpoint that does not affect the main students fetch.
- Move user management reads/writes to the external users table when available.
- Keep external ROLE_CTRL lookup isolated to login cookies and Control Escolar navigation only.
- Avoid centralized users as a required gate for normal student APIs.
