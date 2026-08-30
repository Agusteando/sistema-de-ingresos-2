# Sembrado temporal de talleres 2026–2027

## Objetivo

Asociar los conceptos financieros 2026–2027 cuyo nombre identifica de forma inequívoca un taller con el catálogo operativo de Talleres y Servicios. Cada asociación se crea para los planteles visibles en `/conceptos`, incluido `DM` aunque no aparezca en las tarjetas del dashboard financiero.

El proceso no crea conceptos financieros, no cambia costos y no modifica matrículas existentes. Los conceptos deben existir primero en la tabla central `conceptos` con ciclo `2026` o `2026-2027`.

## Ejecución

1. Iniciar sesión como super admin o administrador de conceptos.
2. Abrir `/conceptos` y entrar a `Categorías`.
3. Seleccionar ciclo `2026-2027` y categoría `Talleres y Servicios`.
4. Pulsar `Preparar talleres 2026–2027`.
5. Revisar la cantidad de conceptos, asociaciones y planteles; confirmar una sola vez.
6. Verificar el total de planteles informado y que cada concepto se vea asociado en al menos dos planteles de control.

La operación es idempotente: si se repite, no crea duplicados. Los Bridges fuera de línea conservan la configuración central como fuente y actualizarán su espejo cuando vuelvan a sincronizar.

## Coincidencias aceptadas

El sembrado sólo acepta nombres exactos del catálogo, con estas variaciones seguras:

- sufijo de ciclo, por ejemplo `BALLET 2026-2027`;
- prefijo `TALLER` o `TALLER DE`;
- alias canónicos como `TENNIS` → `TENIS` y `TOCHO BANDERA` → `TOCHITO BANDERA`;
- variante `4 DÍAS` cuando el nombre base identifica un taller vigente.

Nombres ambiguos como `1 TALLER`, ligas, uniformes o cuotas no se asocian automáticamente.

## Retirada después de producción

Cuando la ejecución y la verificación estén confirmadas, retirar:

- `server/api/conceptos-config/seed/talleres-2026-2027.post.ts`;
- el bloque marcado `TEMPORARY 2026-2027` y su modal/estado en `pages/conceptos.vue`;
- la exposición `temporaryWorkshopSeed` de `server/api/conceptos-config/admin.get.ts`.

Después de retirarlo, conservar `server/utils/conceptos-workshop-seed.ts` sólo si se desea mantener la lógica como herramienta auditable de diagnóstico; de lo contrario puede eliminarse junto con su fixture visual. La escritura normal de conceptos financieros hacia `matricula.servicios` vive en `server/utils/talleres-servicios.ts` y no debe retirarse.
