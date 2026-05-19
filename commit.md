Add isolated Control Escolar module

- Add `/control-escolar` with plantel-scoped KPIs, searchable/filterable paginated student table, detail panel, limited validated edits, and CSV export for the current filtered view.
- Add isolated `/api/control-escolar/*` routes that validate allowed agent IDs, run bridge queries through `runWithBridgeAgentId`, avoid cookie/session bridge mutation, and reject fixed `DB_BRIDGE_AGENT_ID` bridge setups for this module.
- Normalize student API responses from the real `base` schema, avoid financial joins/data, handle missing schema columns defensively, and include offline/loading/error/empty states.
- Reuse the existing students design language and add Control Escolar navigation without changing existing plantel switching behavior.
