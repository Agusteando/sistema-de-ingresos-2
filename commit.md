feat(users): assign ROLE_CTRL from Google Workspace directory

- Add superadmin-only Google Workspace Directory search for @casitaiedis.edu.mx users.
- Show directory profile images/fallback avatars when assigning workspace access.
- Store workspace role assignments only in the external Control Escolar users table.
- Keep new assignments unrestricted by default with explicit ROLE_CTRL selection.
- Skip schema/bridge work for directory endpoints and keep normal student loading ungated by external users.
- Document Google Workspace, external users, and ROLE_CTRL data boundaries.
