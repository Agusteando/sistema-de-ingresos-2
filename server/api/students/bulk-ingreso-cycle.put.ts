import { executeStatementTransaction, query, runWithBridgeAgentId } from '../../utils/db'
import { normalizeCicloForTipoIngreso, resolveTipoIngreso } from '../../../shared/utils/tipoIngreso'
import {
  calculateBasePlacementForTargetPosition,
  calculatePromotedGrado,
  displayGrado,
  isInProjectedPlantelScopeForCiclo,
  normalizeGradoForPlantel,
  normalizeNivelEscolar,
  normalizePlantel,
  resolveNivelEscolar
} from '../../../shared/utils/grado'

const normalizeMatricula = (value: unknown) => String(value || '').trim()

const sameText = (left: unknown, right: unknown) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()

const sameGrado = (left: unknown, right: unknown) => displayGrado(left).toLowerCase() === displayGrado(right).toLowerCase()

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const matriculas = Array.from(new Set((Array.isArray(body?.matriculas) ? body.matriculas : [])
    .map(normalizeMatricula)
    .filter(Boolean)))

  if (!matriculas.length) {
    throw createError({ statusCode: 400, message: 'Selecciona al menos un alumno.' })
  }

  if (matriculas.length > 1000) {
    throw createError({ statusCode: 400, message: 'La selección máxima por actualización es de 1000 alumnos.' })
  }

  const ingresoCiclo = normalizeCicloForTipoIngreso(body?.ciclo)
  if (!ingresoCiclo) {
    throw createError({ statusCode: 400, message: 'Ciclo de ingreso inválido.' })
  }

  const targetCiclo = normalizeCicloForTipoIngreso(body?.targetCiclo) || ingresoCiclo
  const requestedNivel = normalizeNivelEscolar(body?.targetNivel)
  if (!requestedNivel) {
    throw createError({ statusCode: 400, message: 'Nivel requerido.' })
  }

  const user = event.context.user
  const isScopedToActivePlantel = !user.isSuperAdmin || (user.isSuperAdmin && user.active_plantel !== 'GLOBAL')

  const placeholders = matriculas.map(() => '?').join(',')
  const rows = await query<any[]>(`
    SELECT matricula, nombreCompleto, plantel, nivel AS nivelBase, grado AS gradoBase, ciclo AS cicloBase, ciclo
    FROM base
    WHERE matricula IN (${placeholders})
  `, matriculas)

  const rowsByMatricula = new Map(rows.map((row) => [normalizeMatricula(row.matricula), row]))
  const results: any[] = []
  const statements: { sql: string; params: any[] }[] = []
  const updatesByMatricula = new Map<string, any>()

  matriculas.forEach((matricula) => {
    const student = rowsByMatricula.get(matricula)

    if (!student) {
      results.push({ matricula, status: 'failed', message: 'Alumno no encontrado.' })
      return
    }

    if (!isInProjectedPlantelScopeForCiclo(
      student.gradoBase,
      student.plantel,
      student.cicloBase,
      targetCiclo,
      student.nivelBase,
      isScopedToActivePlantel ? user.active_plantel : 'GLOBAL'
    )) {
      results.push({ matricula, nombreCompleto: student.nombreCompleto, status: 'failed', message: 'Fuera del plantel activo.' })
      return
    }

    const currentProjection = calculatePromotedGrado(
      student.gradoBase,
      student.plantel,
      student.cicloBase,
      targetCiclo,
      student.nivelBase
    )
    const requestedGrado = normalizeGradoForPlantel(
      body?.targetGrado || currentProjection.grado,
      currentProjection.plantel || student.plantel,
      requestedNivel
    )
    const targetPlantel = normalizePlantel(
      isScopedToActivePlantel
        ? user.active_plantel
        : currentProjection.plantel || student.plantel
    )
    const basePlacement = calculateBasePlacementForTargetPosition(
      requestedNivel,
      requestedGrado,
      ingresoCiclo,
      targetCiclo,
      targetPlantel || currentProjection.plantel || student.plantel
    )

    if (basePlacement.outOfScope || !basePlacement.nivel || !basePlacement.grado || !basePlacement.plantel) {
      results.push({ matricula, nombreCompleto: student.nombreCompleto, status: 'failed', message: 'La posición no corresponde con el ciclo elegido.' })
      return
    }

    if (!isInProjectedPlantelScopeForCiclo(
      basePlacement.grado,
      basePlacement.plantel,
      ingresoCiclo,
      targetCiclo,
      basePlacement.nivel,
      isScopedToActivePlantel ? user.active_plantel : 'GLOBAL'
    )) {
      results.push({ matricula, nombreCompleto: student.nombreCompleto, status: 'failed', message: 'La posición queda fuera del plantel activo.' })
      return
    }

    const unchanged =
      normalizeCicloForTipoIngreso(student.cicloBase || student.ciclo) === ingresoCiclo &&
      sameText(student.nivelBase || resolveNivelEscolar(student.plantel, student.nivelBase), basePlacement.nivel) &&
      sameGrado(student.gradoBase, basePlacement.grado) &&
      normalizePlantel(student.plantel) === normalizePlantel(basePlacement.plantel)

    const projected = calculatePromotedGrado(
      basePlacement.grado,
      basePlacement.plantel,
      ingresoCiclo,
      targetCiclo,
      basePlacement.nivel
    )
    const updatedStudent = {
      matricula,
      nombreCompleto: student.nombreCompleto,
      plantelBase: basePlacement.plantel,
      plantel: projected.plantel,
      nivelBase: basePlacement.nivel,
      nivel: projected.nivel,
      gradoBase: basePlacement.grado,
      grado: displayGrado(projected.grado),
      ciclo: ingresoCiclo,
      cicloBase: ingresoCiclo,
      tipoIngreso: resolveTipoIngreso({
        ...student,
        plantel: basePlacement.plantel,
        plantelBase: basePlacement.plantel,
        nivelBase: basePlacement.nivel,
        gradoBase: basePlacement.grado,
        ciclo: ingresoCiclo,
        cicloBase: ingresoCiclo
      }, targetCiclo)
    }

    if (unchanged) {
      results.push({
        matricula,
        nombreCompleto: student.nombreCompleto,
        status: 'skipped',
        message: 'Sin cambios.',
        student: updatedStudent,
        before: {
          ciclo: student.cicloBase || student.ciclo,
          nivel: student.nivelBase,
          grado: displayGrado(student.gradoBase),
          plantel: student.plantel
        },
        after: {
          ciclo: ingresoCiclo,
          nivel: basePlacement.nivel,
          grado: displayGrado(basePlacement.grado),
          plantel: basePlacement.plantel
        }
      })
      return
    }

    statements.push({
      sql: 'UPDATE base SET ciclo = ?, nivel = ?, grado = ?, plantel = ? WHERE matricula = ?',
      params: [ingresoCiclo, basePlacement.nivel, basePlacement.grado, basePlacement.plantel, matricula]
    })
    updatesByMatricula.set(matricula, updatedStudent)
    results.push({
      matricula,
      nombreCompleto: student.nombreCompleto,
      status: 'pending',
      message: 'Pendiente de actualizar.',
      before: {
        ciclo: student.cicloBase || student.ciclo,
        nivel: student.nivelBase,
        grado: displayGrado(student.gradoBase),
        plantel: student.plantel
      },
      after: {
        ciclo: ingresoCiclo,
        nivel: basePlacement.nivel,
        grado: displayGrado(basePlacement.grado),
        plantel: basePlacement.plantel
      }
    })
  })

  if (statements.length) {
    await executeStatementTransaction(statements)
  }

  const finalizedResults = results.map((result) => {
    if (result.status !== 'pending') return result
    return {
      ...result,
      status: 'updated',
      message: 'Actualizado.',
      student: updatesByMatricula.get(result.matricula)
    }
  })

  return {
    success: true,
    requested: matriculas.length,
    updated: finalizedResults.filter(result => result.status === 'updated').length,
    skipped: finalizedResults.filter(result => result.status === 'skipped').length,
    failed: finalizedResults.filter(result => result.status === 'failed').length,
    results: finalizedResults
  }
}))
