feat(control-escolar): add matricula overlay workspace

- Add an isolated `/control-escolar` module with explicit plantel/agent selection, student KPIs, filtered pagination, detail editing, and CSV export.
- Match the existing student workspace density, scaling, card language, toolbar behavior, loading/empty/error states, and responsive layout while removing financial concepts.
- Add Control Escolar API routes that validate the requested `agentId`, bypass the normal plantel-switch/session bridge mutation flow, and run selected-agent queries through bridge utilities.
- Drive visible rows from local `base`/active enrollment data and layer centralized `matricula` values over those rows using `matricula` as the join key.
- Save edits only to allowed `matricula` fields, creating the overlay row on first edit when it does not already exist.
- Keep agent service, relay service, existing app routes, existing plantel switching behavior, and financial data untouched.
