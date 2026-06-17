# Sistema de Ingresos 2

Plataforma administrativa para gestión de alumnos, ingresos y facturación.

## DB Bridge protocol 3.0

Aurora correlates requests across relay and agent, preserves MySQL error codes, and performs a single coalesced schema repair only when an agent reports `ER_NO_SUCH_TABLE` or `ER_BAD_FIELD_ERROR`. See `docs/db-bridge-contract.md`.
