fix(auth): allow superadmins to switch bridge plantel safely

Separate the authentication plantel from the active data plantel for DB bridge sessions.

Superadmins now authenticate against their home plantel but can switch the active bridge agent to any configured plantel from the sidebar. Regular users remain restricted to their assigned planteles, and the server validates the trusted role/plantel scope from the authentication plantel before accepting a plantel switch.

Key changes:
- Add trusted auth-session resolution for bridge mode using `auth_home_plantel`.
- Keep normal users scoped to their allowed planteles.
- Allow `global`/`superadmin` users to select any configured plantel.
- Prevent regular users from switching to `GLOBAL` or arbitrary bridge agents.
- Populate the sidebar plantel selector with all configured planteles for superadmins.
- Preserve the active bridge agent cookie for plantel-specific data fetching.
