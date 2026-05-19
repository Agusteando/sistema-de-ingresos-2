fix(auth): preserve bridge agent selection when switching plantel

Restore stable bridge-mode database selection after adding superadmin plantel switching.

The failure was caused by protected API handlers reaching query()/ensureSchema() without a resolved DB bridge agent after a plantel switch, producing 500 errors such as "No DB bridge agent selected". This was especially visible on /api/student-sections.

Changes:
- Keep regular users scoped to their assigned planteles through server-side validation.
- Allow superadmins to switch into any configured plantel while preserving the authenticated home plantel.
- Resolve the active DB bridge agent from the validated request context inside db.ts, so route handlers do not rely only on cookie state or AsyncLocalStorage propagation.
- When switching to GLOBAL/CONSOLIDADO, keep a concrete data bridge agent using the authenticated home plantel so bridge-mode endpoints never run without an agent.
- Return a controlled auth error if bridge mode has no resolvable plantel instead of allowing an unhandled 500.

Also preserves the earlier fixes:
- Student alta uses cicloIngreso/ciclo as the academic anchor for future-cycle first-grade students.
- Removed the alternate manual inscription flow; enrolled status remains derived from configured external concept IDs.
