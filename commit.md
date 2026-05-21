feat(admin): add superadmin SQL console

- Added a superadmin-only sidebar section for SQL Console.
- Added a guarded SQL execution endpoint for pasted SQL or uploaded .sql file contents.
- Supports multiple SQL statements, DELIMITER blocks, ordered execution, and optional continue-on-error behavior.
- Executes statements literally through a raw SQL runner after the normal request context is established.
- Added result previews for SELECT queries and write metadata for DDL/DML statements.
- Added client and server authorization checks so non-superadmin sessions cannot access or execute the console.
