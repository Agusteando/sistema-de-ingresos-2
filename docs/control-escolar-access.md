# Control Escolar access

Authentication and the normal financial/student screens use the existing application session cookies and local plantel context. The centralized `users` table and `ROLE_CTRL` routing gates are intentionally not used for access decisions.

Financial/student APIs keep the default behavior: any authenticated user with an active plantel can load the regular system, and superadmin users can use the consolidated selector.

The Control Escolar module still reads the selected plantel-local `base` table. Its matricula overlay remains separate from financial access and does not control whether regular students load.
