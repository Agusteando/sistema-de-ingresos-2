# Visual Testing Lab

This repo intentionally includes permanent dev-only visual testing tools for auth-heavy screens. Do not remove them unless you replace them with an equal or better workflow and update this document.

## Route

- Dev route: `/__visual-lab/students-account`
- Chrome-free route for screenshots: `/__visual-lab/students-account?chrome=0`
- Production behavior: the route is blocked by `middleware/auth.global.ts` outside `import.meta.dev`.

The route renders the real `StudentsListPanel`, `StudentDetails`, `DocumentModal`, and global `ContextMenu` host with synthetic data. `StudentDetails` receives deterministic `visualLabDebts` so the account table is never blocked by auth, bridge state, or browser-storage quirks. The route also seeds:

- auth cookies for a dev superadmin/control-escolar session
- `auth_active_plantel=PT`
- local Estado de Cuenta cache records for four synthetic students
- photo cache entries set to `none` so the layout is stable
- `visual_lab=students-account` cookie for any future dev-only API fixtures

After opening the route, agents can navigate to `/`, `/control-escolar`, or other protected pages in the same browser context without hitting the login redirect first.

## Agent Workflow

1. Start a dev server, for example:

   ```powershell
   npm run dev -- --host 127.0.0.1 --port 3001
   ```

2. Open:

   ```text
   http://127.0.0.1:3001/__visual-lab/students-account?chrome=0
   ```

3. Use responsive viewports that match real failure cases:

   ```text
   1150x410
   1024x520
   900x640
   390x800
   ```

4. Verify at least:

   - student rows do not grow unexpectedly when compressed
   - the grade tile remains centered
   - matricula and ingreso chips stay compact
   - Estado de Cuenta shows four rows in a short viewport
   - `Agregar documento`, the document modal, and `Mas` menu remain usable

5. Run `npm run build` before finishing.

## Notes

- Fixture data is synthetic and should stay synthetic.
- Keep the route dev-only. Do not add production data, tokens, or external API calls.
- If the cache key format changes, update the visual lab seeding logic in `pages/__visual-lab/students-account.vue`.
- If auth middleware changes, preserve the dev-only bypass for `/__visual-lab/*`.
- Keep `visualLabDebts` scoped to the visual lab. It is a deterministic layout/testing seam, not a production data path.
