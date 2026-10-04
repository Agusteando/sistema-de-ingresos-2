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

## Control Escolar CSS isolation and photo regression (October 2026)

`/__visual-lab/control-escolar` renders the real Control Escolar page client-side, with dev-only display cookies. It shares the existing middleware block outside development. The browser harness supplies 48 synthetic records through the existing API response shape; authenticated requests outside that fixture return synthetic 401 responses. No live session, production student data, payment or mutation is used.

Run `node scripts/verify-student-workspace-ui.mjs` after installing Playwright and the Montserrat/Fredoka fontsource packages. The `Student workspace UI regression` PR workflow installs these verification-only packages without changing the application lockfile, builds the application, and verifies both screens at six widths. It captures screenshots, request paths, row dimensions and page errors in the workflow artifact. Optional local runtime overrides: `VISUAL_PLAYWRIGHT_MODULE`, `VISUAL_BROWSER_EXECUTABLE`, `VISUAL_FONT_MODULES`, `VISUAL_EVIDENCE_DIR`.

The regression was reproduced on main aa155d73: the Control Escolar name column was 22px at 1920px, and the first synthetic row grew to 434px. Financial workspace overrides must exclude `.control-escolar-screen`, even though both roots use `.students-screen`. Control Escolar retains its own four-column identity grid, quality rail and group graphics. The photo fixture now includes both a selected and unselected student with a cached photo: both must retain the original grade/photo animation. Reduced motion shows the still photo. The restored shared chrome is static. Keep compact row capacity and account height when adjusting portrait sizes.

These checks prove browser rendering and fixture interactions, not live API or database health. Backend, schema, roles and photo-source contracts are unchanged by this correction.

At viewport heights below 550px, the Control Escolar KPI rail keeps all five indicators in a shorter composition so the first complete row remains reachable. The same browser gate requires at least one complete row at 1150×410. Its production selection, filters and quality indicators retain their existing handlers.


## Visible photos and readable Control Escolar follow-up

Rows previously read cached photo URLs without loading uncached portraits. `utils/studentPhotos.js` now shares row/detail requests through the existing photo endpoint, with three concurrent lookups, session URL reuse, a five-minute negative cache and no negative cache for transient failures. Only intersecting list rows request uncached photos. Legacy `none` entries without a check time expire; opening a record retains the existing photo preview and face-image processor. Source service, authentication and response shape are unchanged.

Use `&photos=uncached` in the students-account lab to avoid seeding photo URLs. The permanent browser gate supplies synthetic photos and Vision geometry/pixels, verifies a genuinely unselected uncached row, grade/photo/grade phases, processed image rendering, scroll loading, selected/row request deduplication, concurrency, missing-photo caching and transient failure handling. All API/Vision responses in this gate are fixtures, not live service verification.

Control Escolar now lays out at rendered size rather than scaling the desktop canvas. Narrow available workspaces focus the selected record with a return control. Its sidebar role permissions, student selection, filters, draft/save/discard handlers, group masks, tabs, progress actions and fields retain their original data flows. At narrow list widths the quality score stays visible; its existing accessible health description is also available as a tooltip, while the complete record keeps every health field.

Compared with main `56ac11b5`, using the same synthetic records and fonts:

| Viewport | Complete Control rows before / after | Visible record body before / after |
| --- | ---: | ---: |
| 1920×1080 detail (1920×941 list) | 4 / 5 | 533px / 695px |
| 1366×768 | 4 / 5 | 349px / 407px |
| 1024×768 | 5 / 5 | 283px / 433px |
| 900×640 | 3 / 3 | 189px / 305px |
| 390×844 | 1 / 1 | 168px / 300px |
| 1150×410 | 1 / 1 | 89px / 126px |

Visible record body excludes the previous footer overlap. The new footer occupies separate layout space. Student names use weight 500, detail titles 600 and supporting copy 450–500; the original KPI medallions, grade imagery and group graphics remain. Alumnos retains 8 / 13 / 5 complete rows at 1366 / 1920 / 1024, with unchanged account body heights across all six sizes.

The browser gate checks all seven Control detail tabs on desktop and mobile, field bounds and the original 16px mobile input sizing, local edit → enabled save → discard without sending a mutation, and return → reopen. It also requires identical solid primary fills for Nuevo Alumno, Agregar documento and enabled Control save. Institutional chrome returns to the prior pale/sidebar palette; both official marks and the Aurora v2 logo remain. No backend, schema, production runtime configuration, roles or authentication changes are part of this follow-up.

## Photo recovery and classic logo (2026-10-04)

The photo resolver honors the existing dedicated `studentPhotoApiKey` with the existing external-sync key as fallback; the URL and Bearer plus x-api-key contract are unchanged. Missing credentials return retryable 503/no-store rather than a cacheable photo-not-found 404. `node --test tests/student-photo-source.test.mjs` covers dedicated/fallback credentials, missing configuration and genuine missing/source failures. No credentials or runtime configuration are added by this change.

Visible rows retry transient photo failures after 4, 12 and 30 seconds, with the existing shared three-request limit. Retries check current visibility; timers are disposed on unmount. Genuine missing photos retain their five-minute negative cache and grade tile. The browser gate now requires a row to recover from a synthetic 503 without scrolling, then render the original 8.8-second grade/photo effect. Sidebar and login must use the same transparent flat classic logo; official combined institutional logo and existing layout density remain. These checks do not establish authenticated production photo/Vision availability.

## Original pills and institutional Control workbench (2026-10-04)

The responsive Alumnos select substitution is removed. The browser gate clicks original grade, group, debt and Todos pills at 1920, 1366, 1024, 900 and 390px, and rejects any filter-bar select. The dev-only dense fixture now applies those same filter events to synthetic rows. Existing complete-row capacity remains 8 / 13 / 5 at 1366 / 1920 / 1024.

Control record tabs sit outside the scrolling body. The gate scrolls the form and verifies that all seven tabs stay in place, then checks each section, resetting its scroll position on section selection. The default view places identity fields before the repeated status cards; all four identity inputs must be fully visible without scrolling at 1366×768. Header photo, original group sigil, status switch, completeness issue and all existing actions remain. Synthetic Control rows must complete the same grade → photo → grade phases as Alumnos. Preserve these effects and semantic status colors in future visual changes.

Shared brand checks require the newer official combined emblem, the official fingerprint-containing pattern, the classic flat Aurora mark and identical filled primary actions using exact institutional secondary green `#00692F`. A browser canvas check samples opaque logo pixels for exact primary green `#618B2F` and teal `#007F92`; image-generation approximations alone are insufficient. Sources and roles are documented in `docs/institutional-identity.md`. The collapsed rail is 72px; verify route access, role visibility, plantel selection and persisted collapse state.

## Alumnos photo recovery and permanent detail portrait

Only an explicit photo-endpoint 404 establishes a missing photo. The shared client rejects empty successful responses and ignores legacy `none` cache entries without the new confirmed-404 marker, so an old failed lookup cannot suppress the grade/photo cycle. It uses Nuxt's shared `$fetch` as Control Escolar does, retaining the existing endpoint and JSON contract. Opening the detail rechecks a cached missing result; its fixed portrait keeps a usable source while recovering from temporary failures, with bounded retries and cancellation when switching/unmounting.

The browser fixture seeds a recent legacy negative cache, returns one empty response for an unselected row and a first-attempt 503 for the selected portrait. Both must recover without scrolling or reselection; row grade/photo/grade phases must still work and the detail portrait must have no animation. A synthetic foreign-plantel student retains the underlying metadata but must render no name flag. Nuevo Alumno and Agregar documento must match at rest and hover, including flat fills and no shadows.

## Control Escolar bounded selectors and password filter

Control Escolar reuses `UiSlideSelect` for grade, group, enrollment and record-quality pills. Verify arrow buttons and Left/Right/Home/End, including the last grade/group and the adjacent option peek. At mobile widths expand Filtros before checking these lanes. In the compact desktop list, record-quality filters expand through Filtros so the default selected-record view retains five complete rows at 1366×768. Verify selected grade/group pills with the sidebar both expanded and collapsed. Search, selectors and the reset action must stay within their allotted space with the record open and closed; short-height layouts must retain a complete student row.

The circular list score uses the same 32px ring, 4px inner inset and centered 7.8px percentage in both states. The header presents explicit Activo/Baja options using the existing local `baja` draft. Changing the selection must enable Guardar; Descartar must restore the original state without a mutation request. Preserve grade/photo animation, fixed record portrait and group masks.

`Sin contraseña Husky Pass` checks the existing `huskyPassPlaintext` field for an absent or empty trimmed value, on both the server and the cached client. It composes with enrollment, grade and group and does not implicitly exclude non-enrolled records when Todos is selected. `node --test tests/control-escolar-password-filter.test.mjs` verifies both paths with synthetic credential values. The browser gate uses a mix of synthetic configured/missing credentials; this is rendering and interaction evidence, not live database validation.
