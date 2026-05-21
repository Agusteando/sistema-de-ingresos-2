# Conceptos: fuente, lectura y actualización manual

## Fuente de datos

Los conceptos que se muestran en `Cargo extra`, `Catálogo de conceptos` y reportes se leen desde el endpoint interno:

```txt
GET /api/conceptos?ciclo=<ciclo>
```

Ese endpoint ejecuta la consulta contra la tabla `conceptos` del bridge del plantel activo. La consulta se ejecuta con el agente seleccionado en la sesión (`event.context.dbBridgeAgentId`) y filtra por el ciclo escolar normalizado.

Campos principales usados por la UI:

- `id`
- `concepto`
- `costo`
- `description`
- `plantel`
- `eventual`
- `plazo`
- `ciclo`

La aplicación no edita ni crea conceptos desde `Cargo extra`; sólo consulta el catálogo vigente y usa el `id` seleccionado para generar el documento/cargo.

## Qué no es esta fuente

Este catálogo no viene de la configuración de inscripción/reinscripción usada por los KPI de inscritos/internos/externos. Esa configuración de conceptos de inscripción es otra fuente externa y sólo sirve para clasificar inscripción.

El catálogo de `Cargo extra` tampoco depende de la tabla externa `users` ni de `ROLE_CTRL`.

## Actualización manual desde Cargo extra

El modal de `Cargo extra` incluye el botón `Actualizar` junto al buscador de conceptos. Ese botón vuelve a consultar `GET /api/conceptos` para el ciclo activo y reemplaza la lista local de opciones.

La respuesta del endpoint se marca como `no-store`, por lo que la actualización manual no debe reutilizar una respuesta HTTP cacheada.

## Si un concepto no aparece

Revisar en este orden:

1. Que el ciclo escolar activo sea el correcto.
2. Que el agente/plantel activo tenga conexión al bridge.
3. Que el concepto exista en la tabla `conceptos` del bridge de ese plantel.
4. Que el campo `ciclo` del concepto coincida con el ciclo normalizado usado por la app.
5. Usar `Actualizar` en el modal de `Cargo extra` después de corregir o sincronizar la fuente.

Si el bridge del plantel está offline, el botón `Actualizar` no podrá traer datos nuevos hasta que el agente vuelva a estar disponible.
