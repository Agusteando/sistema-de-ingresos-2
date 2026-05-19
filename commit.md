fix: bind bridge agent context for API route database access

Preserve the existing cookie-based bridge isolation for regular users while allowing validated superadmins to switch plantel scope.

Wrap API route handlers in the resolved bridge-agent async context so all query(), ensureSchema(), and transaction calls execute with the request's validated dbBridgeAgentId. This fixes 500 errors such as "No DB bridge agent selected" on routes like /api/students/kpi-trends after switching plantel.

Keep server-side authorization as the source of truth: normal users remain limited to their assigned planteles, while superadmin/global users may switch to any configured plantel. Do not reintroduce any alternate enrollment flow; enrollment remains derived only from specific external concept IDs.
