# Becas en Cargo Extra

## Alcance

El flujo de `Cargo extra` permite registrar una o varias becas asociadas a un concepto específico. El cargo sigue perteneciendo a un solo concepto de la tabla `conceptos`, pero puede quedar marcado con múltiples tipos de beca.

## Tipos permitidos

Las opciones son cerradas; no hay captura abierta de tipo de beca:

- `Colaborador`
- `DRES`
- `Hermanos`
- `Promoción`
- `SEP`
- `Mercadotecnia`

Cuando se selecciona más de una, el sistema las guarda como texto separado por comas para que pueda leerse posteriormente sin depender de una tabla secundaria.

## Campos guardados

En `documentos` se agregan estos campos:

- `becaTipos`: lista separada por comas de los tipos seleccionados.
- `becaMotivo`: motivo opcional capturado por el operador.
- `becaMonto`: diferencia entre el costo del concepto y el monto final autorizado.
- `becaPorcentaje`: porcentaje calculado contra el costo del concepto.
- `becaCartaGenerada`: bandera de generación de carta.
- `becaCartaFecha`: fecha de generación de carta.

También se mantiene compatibilidad con los campos legacy `beca` y `becaNombre`:

- `beca` guarda el porcentaje calculado.
- `becaNombre` guarda la misma lista separada por comas.

## Monto final

El monto final sigue siendo el valor autorizado de cobro y se guarda en `documentos.montoFinal`. El servidor valida que sea un entero sin decimales. Si se selecciona beca, el monto final no puede exceder el costo base del concepto.

El descuento no se captura como campo manual. Se calcula en servidor:

`becaMonto = costo - montoFinal`

`becaPorcentaje = becaMonto / costo * 100`

## Carta de beca PDF

El operador puede activar `Generar carta de beca PDF` al crear el cargo. La carta se genera desde:

`GET /api/documentos/:id/beca-carta?ciclo=<ciclo>`

La carta es un PDF generado del lado del servidor con plantilla institucional, sellos IECS/IEDIS, datos del alumno, concepto, tipos de beca, motivo, costo base, monto final y apoyo aplicado.

La carta solo se genera si el documento tiene al menos un tipo de beca registrado. El endpoint también valida que el documento pertenezca al alumno/plantel/ciclo dentro del alcance normal del usuario.
