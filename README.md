# Sistema de Ingresos 2

Plataforma administrativa para gestión de alumnos, ingresos y facturación.

## DB Bridge protocol 3.0

Aurora correlates requests across relay and agent, preserves MySQL error codes, and performs a single coalesced schema repair only when an agent reports `ER_NO_SUCH_TABLE` or `ER_BAD_FIELD_ERROR`. See `docs/db-bridge-contract.md`.
## Actualización automática de Sistema Rápido

Aurora consulta periódicamente el estado del agente del plantel. Si el manager detecta un SHA remoto distinto, inicia la actualización local en segundo plano. La versión activa continúa disponible durante descarga, instalación, build y health check; el nuevo release solo se activa cuando pasa las verificaciones. El manager local también realiza esta comprobación por intervalo aunque ningún usuario tenga Aurora abierta.

