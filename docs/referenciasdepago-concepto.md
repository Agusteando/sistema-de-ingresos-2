# Contrato de datos: referenciasdepago.concepto

`referenciasdepago.concepto` guarda el id del concepto financiero activo al momento de registrar el pago.

No debe guardar el número de documento. El número de documento ya vive en `referenciasdepago.documento`.

## Regla de escritura

Al insertar en `referenciasdepago`:

- `documento` = id del documento pagado.
- `concepto` = id del concepto financiero activo para ese documento y mes.
- `conceptoNombre` = nombre visible del concepto financiero activo para ese documento y mes.

Para documentos sin cambio por periodo, el concepto activo viene de `documentos.concepto` y `documentos.conceptoNombre`.

Para documentos con cambio por periodo, el concepto activo viene de `documento_concepto_periodos.concepto_id` y `documento_concepto_periodos.conceptoNombre` cuando el mes cae dentro del periodo activo.

Si el periodo activo está cancelado, no se debe registrar pago.

## Motivo

`referenciasdepago` es auditoría de pagos. Aunque muchas lecturas reconstruyen el concepto por join con `documentos`, el registro de pago debe conservar su propio snapshot correcto para recibos, reportes y auditoría futura.

## Prohibido

No escribir `documento` dentro de `referenciasdepago.concepto`.
No corregir esto con fallbacks silenciosos.
No mover ni reescribir folios históricos sin proceso de auditoría/backfill aprobado.

## Corrección directa de concepto

La corrección directa de concepto es una acción de super admin para corregir la identidad completa de un documento cuando fue capturado con el concepto equivocado.

Esta corrección actualiza de forma explícita:

- `documentos.concepto`
- `documentos.conceptoNombre`
- `referenciasdepago.concepto`
- `referenciasdepago.conceptoNombre`

No modifica importes, folios, fechas, meses, formas de pago, estatus ni saldos.

La corrección directa no usa `documento_concepto_periodos`, no crea diferenciales y no representa un cambio por mes. Si el documento ya tiene periodos activos, debe usarse el flujo de Ajustar concepto.

Cada corrección directa debe registrarse en `documento_concepto_correcciones` con concepto anterior, concepto nuevo, folios afectados, usuario y fecha.
