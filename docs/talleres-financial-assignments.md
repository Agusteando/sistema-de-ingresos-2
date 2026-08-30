# Talleres: contrato de asignaciones financieras

## Qué representa cada fuente

Aurora conserva dos evidencias válidas para saber si un alumno tiene un taller o servicio en el ciclo:

1. **Asignación directa**: el nombre está guardado en `matricula.servicio` o `matricula.servicios`.
2. **Concepto financiero**: existe un `documentos` activo del alumno y su concepto está asociado a un taller/servicio activo en `config_enrollment_mappings`, categoría `talleres_servicios`, para el ciclo y plantel correspondientes.

La API externa de Talleres usa una política de **unión**. Una asignación aparece si cualquiera de las dos fuentes la confirma. Esto permite leer los cargos históricos de producción que se generaron antes de que Aurora empezara a copiar automáticamente el servicio a `matricula.servicio(s)`.

La lectura no modifica datos. Los cargos nuevos conservan el `write-through` existente hacia `matricula.servicio(s)`, pero la exactitud de la API ya no depende de que ese efecto lateral haya ocurrido.

## Planteles

`/conceptos` usa los códigos financieros. Portal Tallerista mantiene códigos públicos más específicos. Al resolver asociaciones, Aurora aplica esta precedencia:

1. mapeo exacto del plantel solicitado;
2. alias financiero (`PMA`/`PMB` → `PM`, `PREET` → `CT`, `CM` → `PREEM`);
3. mapeo `GLOBAL`.

`DM` también está disponible en `/conceptos`, aunque no forme parte de las tarjetas del dashboard financiero.

## Contrato de la API

Cada alumno conserva `servicios` como arreglo de nombres por compatibilidad y recibe:

- `talleres`: asignaciones resueltas con días, historial y procedencia;
- `asignaciones`: resumen explícito por clave;
- `asignacionesCompletas: true` cuando ambas fuentes se resolvieron;
- `fuentes`: `matricula`, `concepto_financiero` o ambas;
- `conceptosFinancieros`: concepto, nombre y cantidad de documentos activos que respaldan la asignación.

El roster y la búsqueda incluyen `assignmentResolution.policy = "union"`. Si Aurora no puede leer la evidencia financiera de un plantel solicitado, no devuelve una lista silenciosamente incompleta: ese plantel falla y la respuesta global lo identifica en `meta.sources`.

## Altas, bajas y cambios

Quitar un nombre de `matricula.servicio(s)` sólo elimina la fuente directa. Si queda un cargo financiero activo y mapeado, la asignación continúa vigente en la API. Para retirarla por completo se debe cancelar/corregir el cargo o cambiar/eliminar su asociación financiera, según corresponda.

Los documentos con `estatus` distinto de `Activo` no cuentan. Cuando existen ajustes por periodo, se toma el ajuste activo más reciente; una cancelación activa más reciente impide que ese documento cuente como asignación actual.
