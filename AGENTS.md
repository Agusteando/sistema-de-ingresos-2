# Agent Notes

For interface work, prioritize a clear user journey over exposing everything at once. Preserve working functionality and data flows, but freely rethink layout, structure, and interaction when it makes the result calmer, more readable, and easier to test visually.

## Permanent Visual Lab

Do not remove the dev-only visual testing tools under `/__visual-lab/*` unless you replace them with an equal or better workflow. They exist so agents can test auth-heavy screens, seeded cookies, cached Estado de Cuenta data, compact responsive layouts, modals, and menus without getting blocked by login.

Read `docs/visual-testing.md` before making or reviewing visual changes to student/account screens.
