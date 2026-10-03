# Visual Testing Lab

This repo intentionally includes permanent dev-only visual testing tools for auth-heavy screens. Do not remove them unless you replace them with an equal or better workflow and update this document.

## Route

- Dev route: `/__visual-lab/students-account`
- Chrome-free route for screenshots: `/__visual-lab/students-account?chrome=0`
- Conceptos/talleres route: `/__visual-lab/conceptos`
- Conceptos chrome-free route: `/__visual-lab/conceptos?chrome=0`
- Production behavior: the route is blocked by `middleware/auth.global.ts` outside `import.meta.dev`.

The route renders the real `StudentsListPanel`, `StudentDetails`, `DocumentModal`, and global `ContextMenu` host with synthetic data. `StudentDetails` receives deterministic `visualLabDebts` so the account table is never blocked by auth, bridge state, or browser-storage quirks. The route also seeds:

- auth cookies for a dev superadmin/control-escolar session
- `auth_active_plantel=PT`
- local Estado de Cuenta cache records for four synthetic students
- a synthetic photo cache entry for `PTO574` so the detail-panel photo preview can be tested, with the other photo entries set to `none`
- `visual_lab=students-account` cookie for any future dev-only API fixtures

The conceptos route renders the real `/conceptos` page with a synthetic 2026–2027 financial catalog, workshop mappings, all nine configured planteles, and the temporary one-time seed confirmation. Its confirm action is simulated locally and never calls a database.

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
  - hovering or tapping the selected student's detail-panel photo shows an enlarged photo preview without clipping
  - Estado de Cuenta shows four rows in a short viewport
   - `Agregar documento`, the document modal, and `Mas` menu remain usable

5. Run `npm run build` before finishing.

For changes to `/conceptos`, also verify `/__visual-lab/conceptos?chrome=0` at desktop and mobile widths. Confirm that the temporary action is visible only for cycle 2026–2027 plus `Talleres y Servicios`, its confirmation explains the exact scope, and the action becomes a non-clickable completion status after the simulated run.

## Notes

- Fixture data is synthetic and should stay synthetic.
- Keep the route dev-only. Do not add production data, tokens, or external API calls.
- If the cache key format changes, update the visual lab seeding logic in `pages/__visual-lab/students-account.vue`.
- If auth middleware changes, preserve the dev-only bypass for `/__visual-lab/*`.
- Keep `visualLabDebts` scoped to the visual lab. It is a deterministic layout/testing seam, not a production data path.


## Buscador familiar

Ruta determinista para revisar búsqueda por familia, ficha de alumno y personas autorizadas sin depender de datos reales:

```text
http://localhost:3000/__visual-lab/buscador
```

Valida al menos los mismos viewports compactos anteriores y confirma que resultados, ficha, datos familiares y fotos de personas autorizadas no generan scroll horizontal.

## Complete Students workspace

Add `&workspace=1` to the students-account lab URL to render the real page title, metrics and filter controls around the same deterministic student/account components. Use `&summary=1` to start with the list and enrollment summary. Search, list selection, the back control and the enrollment summary are available in the fixture.

The Students composition uses readable text instead of scaling a desktop canvas. It defaults to a 35% student list on desktop, preserving saved user splits and keyboard/pointer resizing. Below 900px of available workspace width, or on a viewport shorter than 550px with an open record, it presents one pane at a time. Returning to Alumnos restores metrics, filters and page actions. Resumen por grado keeps the enrollment summary reachable in this mode. Scroll belongs to the student list and account body.

Verify 1920×1080, 1366×768, 1024×768, 900×640, 390×844 and 1150×410. Check the list and detail states, complete names and balances, reachable actions, document modal, Más, payment history, invoices, filtering and return to the list. Use the lab for layout proof; its synthetic records and invalid production session are not evidence of live database/API health.


## Row-density comparisons

Use `&workspace=1&dense=1` for a 52-student synthetic fixture covering six grades and four named groups. Compare complete rows inside `.student-list-scroll`, the account body height, metadata readability, and unclipped group chips against the current main. Also use `&summary=1` to inspect grade totals. The fixture repeats representative account documents to exercise normalization; measured account capacity must not be confused with distinct normalized document counts. Preserve the four-record fixture without `dense=1` for dialog, payment-history and invoice interaction checks.

Add `&appchrome=1` to include the real default sidebar and top bar; test both the summary and selected record with the reduced available workspace width.


## Sidebar and identity checks

For app chrome, `&role=admon` seeds the financial sidebar and `&role=ctrl` seeds Control Escolar; the default seeds superadmin. These are dev-only display fixtures, never signed backend sessions. Verify all 14 superadmin, 8 financial and 4 Control Escolar navigation links against their existing permission conditions, including scroll reachability, collapse/reload persistence, plantel options and keyboard/outside-click dismissal. Mobile keeps the existing bottom dock.

A browser harness may return an explicit synthetic 401 response for `/api/**` to keep the invalid lab session from clearing display cookies while inspecting the sidebar. Do not alter production auth/session code or interpret these screenshots as live API validation. Merely stripping `Set-Cookie` after `route.fetch()` is insufficient: that fetch may already have updated the browser cookie jar. Seed role cookies before opening app chrome, and label this isolation in test results.

The dense lab now uses EUROPA and ASIA in place of its unsupported country labels so the existing local group masks can be inspected in both rows and selected details. This changes synthetic fixture labels only. Inspect original mask URLs, opacity and zero contribution to row height; test full names/balances and table control overlap.

Detail actions: default toolbar has document, receipts and Más. Selecting pending debt rows exposes payment and invoice actions; both remain discoverable through Más. Cycle correction, baja for active students, edit, sections, scholarship/no-adeudo letters and reminders retain their existing handlers. Open and close dialogs without submitting payments, invoices, notifications or destructive changes. Test Más at 1150×410: it must stay on screen and allow scrolling without closing itself.

Identity asset sources, palette roles and application rules are recorded in `docs/institutional-identity.md`.


### Sidebar/detail refinement validation (2026-10-03)

Compared with main `abe3c986` using Montserrat/Fredoka and the same synthetic dense fixture. Chrome-free account body heights increased while complete student row counts stayed unchanged:

| Viewport | Before account body | After account body | Complete list rows before/after |
| --- | ---: | ---: | ---: |
| 1366×768 | 355px | 362px | 8 / 8 |
| 1920×1080 | 667px | 674px | 13 / 13 |
| 1024×768 | 286px | 362px | 5 / 5 |
| 900×640 | 369px | 376px | focused detail |
| 390×844 | 409px | 482px | focused detail |
| 1150×410 | 157px | 163px | focused detail |

All six enrollment summary grades remained visible without clipped groups. Real app chrome also passed at 1536×760, 1366×768 and 1920×1080 with no horizontal overflow or overlapping account controls. Sidebar role routes, plantel options, keyboard/outside dismissal, collapse persistence, footer visibility and last-link scroll reachability were checked at seven sizes. The browser harness supplied a synthetic version/date for `/api/login/updates` and synthetic 401 responses for authenticated APIs; none of this proves production connectivity.

Interaction checks covered document dialogs on desktop/mobile, KPI filtering and timed income reveal, back/list/search/summary, cycle correction, contextual payment/invoice dialogs, receipt history, invoice history, expanded detail and short-height Más. No payment, invoice, baja, email or other transaction was submitted. On narrow screens contextual action rows wrap when debt selection adds actions; the default receipts label and count stay inline.
