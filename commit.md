feat(control-escolar): add plantel-targeted student control view

Add a new Control Escolar module that preserves the existing app plantel/session behavior while allowing the page to query a selected bridge agent directly through dedicated server routes.

- Add `/control-escolar` page with plantel tabs, student KPIs, search, filters, pagination, export, and limited student-data editing.
- Add `/api/control-escolar/*` routes that resolve and validate the requested `agentId` server-side instead of relying on the active plantel cookie.
- Use the existing bridge `runWithBridgeAgentId` primitive; no agent or relay changes are required.
- Keep the module student-focused and exclude financial fields from its queries and UI.
- Skip global schema binding middleware for Control Escolar API requests so global/session plantel cookies do not select the target DB for this module.
