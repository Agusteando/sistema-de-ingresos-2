# Diagnóstico: Control Escolar vs. Finanzas para enriquecimiento de expediente

## Resultado observado

En el diagnóstico financiero aparece este estado:

```txt
Estado: failed
Alumnos visibles: 262
Enriquecidos: 0
Pendientes: 262
Mensaje: No se pudo actualizar. Se conservan los alumnos disponibles.
Caché local: Disponible
Error: Server Error
```

Ese estado no significa que el Estado de Cuenta haya perdido sus datos financieros. Significa que el refresh principal de alumnos financieros falló y la pantalla siguió usando los alumnos ya disponibles en caché/local state. Como esos alumnos no traen `centralMatricula`, el contador de enriquecimiento queda en `0`.

## Diferencia central

Control Escolar y Finanzas no están cargando el expediente con el mismo contrato.

| Tema | Control Escolar | Finanzas actual |
|---|---|---|
| Endpoint principal | `/api/control-escolar/students` | `/api/students` |
| Scope de alumnos | Bridge/base o cache verificado de Control Escolar | Query financiera directa a bridge/base |
| Enriquecimiento `matricula` | Segunda fase dentro del flujo servidor | Segunda llamada client-side a `/api/students/matricula-overlays` |
| Fallback cuando bridge falla | Puede leer cache verificado por scope | Lee caché del navegador si existe |
| Fallback cuando `matricula` falla | Sirve base y reporta `overlayAvailable=false` | La falla queda separada o silenciosa; el diagnóstico mezcla estados |
| Diagnóstico de fases | `source.diagnostics.steps` con base, cache, overlay y Husky Pass | Un solo `studentsSyncState` para el refresh financiero |
| Normalización de campos | `overlayStudentRow()` une base + matrícula + Husky Pass | `mergeMatriculaOverlayIntoStudent()` duplica parte del mapeo en cliente |

## Qué hace bien Control Escolar

Control Escolar usa un flujo de servidor por etapas:

```txt
1. Resolver plantel/ciclo/conceptos.
2. Intentar cache verificado del scope.
3. Si no hay cache, leer bridge/base.
4. Proyectar grado, plantel, inscripción y baja con evidencia financiera.
5. Enriquecer las matrículas resultantes con CONTROL_ESCOLAR_MYSQL.matricula.
6. Enriquecer Husky Pass cuando existe.
7. Devolver filas normalizadas y diagnóstico por etapa.
```

La clave es que el enriquecimiento central es opcional dentro del mismo contrato. Si `matricula` falla, Control Escolar no rompe la lista: devuelve los alumnos base y marca el overlay como no disponible.

## Qué hace Finanzas que causa el problema

Finanzas carga primero `/api/students`. Ese endpoint ejecuta una consulta financiera grande contra el bridge/local DB y, si falla, el cliente cae a caché local del navegador.

Después, ya en cliente, llama a `/api/students/matricula-overlays` para intentar enriquecer las matrículas visibles. Ese overlay no comparte el mismo pipeline de Control Escolar: no usa el cache verificado de Control Escolar, no usa `fetchControlEscolarStudents()`, no devuelve los mismos pasos diagnósticos y no unifica base + matrícula + Husky Pass con `overlayStudentRow()`.

Por eso el diagnóstico mostrado es ambiguo:

```txt
Estado: failed
Error: Server Error
```

Ese `failed` viene del refresh de `/api/students`, no necesariamente de la etapa de enriquecimiento. El contador `Enriquecidos: 0` solo indica que los alumnos actualmente en memoria no tienen `centralMatricula` aplicado.

## Dónde está la falla

La falla está en la separación de contratos:

```txt
Control Escolar:
bridge/cache verificado -> scope -> enriquecimiento servidor -> filas normalizadas -> diagnóstico por etapa

Finanzas:
/api/students -> browser cache fallback -> overlay client-side separado -> diagnóstico mezclado
```

Finanzas está intentando usar el enriquecimiento como una llamada adicional del navegador en vez de consumir el mismo contrato de carga que Control Escolar ya resolvió.

## Implicación para Expediente del alumno

Expediente en Finanzas no debe ser una fuente nueva ni una consulta bloqueante. Debe ser una vista de solo lectura sobre el mismo enriquecimiento `matricula` aplicado a la matrícula del alumno.

El Estado de Cuenta debe seguir funcionando con datos financieros aunque el enriquecimiento falte. Pero el diagnóstico debe diferenciar claramente:

```txt
Base financiera / bridge: ok | failed | cached
Enriquecimiento matrícula: ready | partial | failed | not-run
Cache usado: browser | verified-control-escolar | none
```

## Corrección esperada

La corrección no es esconder el error. La corrección es alinear Finanzas con el contrato de Control Escolar:

1. El refresh financiero puede seguir siendo bridge-first para Estado de Cuenta.
2. La etapa de expediente/enriquecimiento debe moverse a un servicio servidor compartido o reutilizar el flujo normalizado de Control Escolar.
3. Ese servicio debe aceptar matrículas visibles y devolver overlay normalizado con el mismo mapeo de Control Escolar.
4. El diagnóstico financiero debe separar el estado de base financiera del estado de enriquecimiento.
5. Editar alumno debe mostrar Contacto familiar como lectura de Control Escolar enriquecido, no como campos financieros editables.
6. Si el overlay falla, el Estado de Cuenta no se bloquea, pero el diagnóstico debe decir exactamente qué etapa falló.

## Regla final

La pantalla financiera es dueña de cargos, pagos y saldo. Control Escolar es dueño del expediente enriquecido. Finanzas puede mostrar ese expediente, pero no debe reinventar ni bloquear su carga con una ruta distinta.
