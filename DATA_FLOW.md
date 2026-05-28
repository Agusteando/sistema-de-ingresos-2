# Data Flow Contract

This document defines how student data is expected to move through the system. Treat it as a production contract. The goal is to keep financial operations correct, keep Control Escolar edits scoped to the right students, and avoid accidental writes to the wrong source.

## Core sources

The system has three different student data sources. They are not interchangeable.

| Source | Purpose | Writable from this app? |
|---|---|---|
| Bridge / plantel local DB | Financial operations, local `base`, payments, enrollment evidence, and the ground truth for which students belong to a plantel/ciclo. | Yes, only through existing financial/plantel flows. |
| External `matricula` DB | Central Control Escolar enrichment: CURP, parent data, contact data, administrative profile fields, and other external student metadata. | Yes, for Control Escolar-owned fields and approved central enrichment flows. |
| Verified Control Escolar cache | Fast/offline read replica of the bridge-derived Control Escolar scope, only after validation. | No direct user writes. Built/promoted by server refresh logic only. |

## Financial / admin area

The financial/admin area remains bridge-first.

```txt
Financial user opens students / estado de cuenta / edit student
        |
        v
Bridge / relayer
        |
        v
Plantel local DB
  - base
  - conceptos
  - documentos
  - referenciasdepago
  - payments / financial tables
        |
        v
Financial UI
```

The bridge/local DB is the operational source for financial state. Payment state, charges, documents, account status, local base fields, and financial actions must continue to come from the plantel DB through the bridge.

External `matricula` data is used only as enrichment in the financial/admin area. It must not block the core financial screen from working. The UI should show the bridge-backed financial data first, then seamlessly add central metadata when it is available.

```txt
Financial screen loads bridge data
        |
        v
UI is usable
        |
        v
Background/bulk fetch central matricula overlays
        |
        v
Subtly add CURP / Padre / Madre / related metadata where useful
```

For financial views, central enrichment must be subtle. If a central field is missing, do not display a noisy placeholder such as “No disponible.” Prefer hiding that specific metadata line.

Estado de cuenta header is financial-area only. It may show compact enriched metadata such as CURP, Padre, or Madre, but only when present and useful. It must not become a Control Escolar panel.

Editar alumno in the financial/admin area should display enriched CURP and parent data when available. It should not expose database-source wording to the user.

## Control Escolar area

Control Escolar has a different contract. Its job is to update and maintain external `matricula` data, but it must only show students that are valid for the selected plantel/ciclo according to the bridge-derived source of truth.

```txt
Bridge/base/evidence decides:
  which matrículas appear
  which ciclo they belong to
  inscritos / no inscritos / bajas / baja inscrita

External matricula decides:
  enriched editable Control Escolar data
  CURP
  parent/contact profile
  administrative fields
```

Control Escolar reads are built in this order:

```txt
1. Determine scope from bridge-derived data
   - live bridge, or
   - verified cache that passed parity checks

2. Apply Control Escolar filters
   - plantel
   - ciclo
   - enrollment evidence
   - inscritos / no inscritos / bajas / baja inscrita

3. Enrich the resulting matrículas from external matricula

4. Return the final Control Escolar rows
```

Control Escolar must not use browser student cache as an authoritative source.

Control Escolar must not write to the bridge/local `base` as part of normal Control Escolar editing.

Control Escolar writes should go to external `matricula` only, after confirming that the matrícula is inside the current valid scope.

```txt
Control Escolar edit
        |
        v
Validate matrícula is visible in current bridge-derived scope
        |
        v
Write central fields to external matricula
        |
        v
Do not write local base
Do not write cache rows directly
```

## Verified Control Escolar cache

The verified cache exists only to avoid forcing Control Escolar users to depend on bridge availability for every read. It must not be treated as valid just because rows exist.

A cache entry is usable only when it was built for the exact Control Escolar scope:

```txt
source_id
plantel
ciclo
previous_ciclo
concept_hash
concept_ids
```

It must pass validation before promotion. Validation must compare the live bridge result against the staged cache result for at least:

```txt
total visible rows
inscritos
no_inscritos
bajas
baja_inscrita
```

If validation fails, the cache must not be promoted. The live bridge result can still be served for that request, but the failed candidate must not become the source for later Control Escolar reads.

```txt
Bridge available
        |
        v
Build staged cache candidate
        |
        v
Compare live bridge counts vs staged counts
        |
        +-- pass
        |     promote cache
        |
        +-- fail
              reject cache and keep previous verified cache
```

If the bridge is offline:

```txt
Verified cache exists for exact scope
        |
        +-- yes: Control Escolar may use it
        |
        +-- no: block safely; do not invent scope
```

## Parent data and completion rules

Parent data must be represented separately as Madre and Padre. Do not collapse them into a generic “Tutor” completion model when measuring completeness.

A parent section counts as complete only when all required values are present and valid:

```txt
nombre
telefono valid with at least 10 digits
email valid
```

Empty values do not count as progress.

Invalid emails must be visible when displayed, but they do not count as complete.

Emails containing `@casita` are fake/internal placeholders and do not count as valid parent emails.

Phone numbers with fewer than 10 digits do not count as valid.

The expediente/progress UI must reflect the same rules used by Control Escolar. It must not show “Expediente completo” when identity or parent data is missing/invalid.

## Login updates / version display

The login “Actualizaciones” section reads GitHub history server-side only. The token must never be exposed to the browser.

Only the configured repository should be used for the visible update count and version label. The current automatic version convention is derived from the tracked repository update count.

The login page should show only a compact preview of recent updates. Larger history belongs in a modal, not an overflowing dropdown.

## Non-negotiable integrity rules

1. Financial operations remain bridge/local-DB first.
2. Control Escolar edits external `matricula`; it does not mutate local `base`.
3. Bridge/base/evidence defines Control Escolar scope and filters.
4. External `matricula` enriches students after scope is established.
5. Browser cache is not authoritative for student rows.
6. A Control Escolar cache is usable only after exact-scope validation.
7. Missing enrichment should not block financial workflows.
8. Missing or invalid parent data must not count as progress.
9. UI should not expose database implementation language to final users.

## Financial expediente / enrichment correction

The financial-area expediente is the same central `matricula` enrichment described above. It must not be loaded as a separate blocking student-detail source.

The incorrect behavior was:

```txt
Estado de Cuenta / Expediente del alumno
        |
        v
Per-student operator-info request
        |
        +-- bridge lookup for local base again
        +-- separate central lookup for matricula
        |
        v
Modal/detail result
```

That duplicated the bridge read after the financial screen had already loaded bridge-backed student rows, and it made the expediente view depend on a separate request path. When the device or bridge was unavailable, the UI could show an error even though the student identity and account data were already present from matrícula/base data.

The corrected behavior is:

```txt
Financial screen loads bridge/local DB data first
        |
        v
UI remains usable
        |
        v
Bulk/single matrícula overlay enrichment uses the same central enrichment path
        |
        v
Expediente progress, parent data, CURP, and read-only Control Escolar details render from that overlay
```

Editar alumno in the financial/admin area uses bridge/local fields for editable financial data. Contacto familiar is displayed from the Control Escolar enrichment overlay as read-only parent cards, so the user can see both Padre and Madre without implying that financial edits write those central fields.

## Diagnóstico adicional: por qué Finanzas muestra `Enriquecidos 0`

Cuando el diagnóstico financiero muestra `Estado: failed`, `Enriquecidos: 0` y `Error: Server Error`, la falla visible pertenece al refresh principal de `/api/students`. La pantalla conserva alumnos desde caché local, pero esos alumnos pueden no tener `centralMatricula` aplicado.

Control Escolar no depende de ese contrato. Control Escolar resuelve scope y enriquecimiento en servidor usando `/api/control-escolar/students`, cache verificado, bridge/base y `matricula` como etapas separadas con diagnóstico propio. Si `matricula` falla, devuelve base y marca el overlay como fallido sin romper la lista.

Finanzas aún mezcla dos estados: base financiera y enriquecimiento de expediente. El contador de enriquecidos se calcula desde los alumnos en memoria, pero el error mostrado corresponde al refresh financiero. Por eso `Server Error` no identifica la etapa real de enriquecimiento.

La solución correcta es separar el diagnóstico en dos fases y reutilizar el contrato normalizado de Control Escolar para el overlay de expediente, en lugar de depender de una llamada client-side aislada que no comparte cache verificado ni diagnóstico de etapas.
