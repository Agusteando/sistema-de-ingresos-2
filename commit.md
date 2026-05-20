feat: add isolated Control Escolar module

- Added `/control-escolar` with a non-financial, student-focused workspace that matches the main student view scale, spacing, KPI treatment, toolbar density, row styling, detail panel, loading/empty/error states, and responsive behavior.
- Added isolated `/api/control-escolar/*` routes for options, KPIs, paginated students, and limited student updates using explicit `agentId` selection through bridge utilities.
- Enforced per-user plantel access, dynamic bridge-agent validation, server-side pagination, normalized student responses, filtered export, and restricted editable fields.
- Avoided financial tables, balances, payments, invoices, `/api/auth/switch`, `auth_active_plantel`, and `db_bridge_agent_id` mutation.
- Added Control Escolar navigation and route-level styling without changing existing plantel switching behavior.

Validation: `npm run build` passed.
