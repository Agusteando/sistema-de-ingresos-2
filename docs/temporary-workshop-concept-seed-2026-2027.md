# Asociación global de Talleres y Servicios

## Objetivo

La configuración de Talleres y Servicios es institucional. Un concepto financiero debe asociarse una sola vez a su taller o servicio mediante una fila `GLOBAL`; esa asociación se aplica a todos los planteles. Las asociaciones específicas por plantel se conservan únicamente como excepciones y tienen precedencia sobre `GLOBAL`.

## Interfaz

En `/conceptos`, abrir `Talleres y servicios`. La vista muestra:

- ciclo escolar;
- asociaciones GLOBAL existentes;
- sugerencias seguras pendientes;
- excepciones específicas por plantel;
- búsqueda y asociación manual con guardado inmediato.

No es necesario repetir la misma asociación plantel por plantel.

## Migración automática

El botón `Migrar asociaciones seguras` analiza los conceptos financieros del ciclo seleccionado y crea o corrige una asociación GLOBAL sólo cuando el nombre identifica de forma inequívoca un Taller o Servicio.

La operación es idempotente. No cambia costos, documentos, pagos ni matrículas. Después de escribir la configuración central, intenta sincronizarla a los Bridges disponibles.

Se reconocen los Talleres del catálogo vigente, variantes seguras como `AJEDREZ 4 DÍAS` → `AJEDREZ`, y los servicios institucionales críticos `DESAYUNO`, `COMIDA`, `CENA` y `CLUB DE TAREAS`, incluyendo sufijos inequívocos de nivel o sede como `DESAYUNO PRIMARIA Y SECUNDARIA`.

Nombres ambiguos no se migran automáticamente; permanecen disponibles para asociación manual desde la misma pantalla.

## Precedencia

Al resolver una asignación financiera:

1. asociación exacta del plantel;
2. alias financiero correspondiente;
3. asociación `GLOBAL`.

Esto permite que la operación normal sea global y que un plantel sólo requiera configuración propia cuando exista una excepción real.
