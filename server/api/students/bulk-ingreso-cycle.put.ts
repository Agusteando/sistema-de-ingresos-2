import { executeStatementTransaction, query, runWithBridgeAgentId } from '../../utils/db'
import { controlEscolarCentralQuery, getCentralTableColumns } from '../../utils/control-escolar-central'
import { normalizeCicloForTipoIngreso, resolveTipoIngreso } from '../../../shared/utils/tipoIngreso'
import {
  displayGrado,
  isInProjectedPlantelScopeForCiclo,
  normalizeGradoForPlantel,
  normalizeNivelEscolar,
  normalizePlantel,
  projectPlantelForNivel,
  resolveNivelEscolar
} from '../../../shared/utils/grado'

const normalizeMatricula = (value: unknown) => String(value || '').trim()

const sameText = (left: unknown, right: unknown) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()

const sameGrado = (left: unknown, right: unknown) => displayGrado(left).toLowerCase() === displayGrado(right).toLowerCase()

const escapeCentralColumn = (column: string) => `\`${String(column).replace(/`/g, '``')}\``
const canonicalMatriculaKey = (value: unknown) => String(value || '').trim().toUpperCase()

const syncCentralAcademicOverlays = async (updates: Map<string, any>, userEmail?: string) => {
  if (!updates.size) return
  try {
    const columns = await getCentralTableColumns('matricula')
    if (!columns.has('matricula')) return

    for (const [matricula, update] of updates.entries()) {
      const entries = [
        { column: 'plantel', value: update.plantelBase || update.plantel },
        { column: 'nivel', value: update.nivelBase || update.nivel },
        { column: 'grado', value: displayGrado(update.gradoBase || update.grado).toLowerCase() },
        { column: 'ciclo', value: update.cicloBase || update.ciclo },
      ].filter((entry) => entry.value !== undefined && entry.value !== null && columns.has(entry.column))

      if (!entries.length) continue

      const [existing] = await controlEscolarCentralQuery<any[]>(
        `SELECT \`matricula\` FROM \`matricula\` WHERE UPPER(TRIM(\`matricula\`)) = ? LIMIT 1`,
        [canonicalMatriculaKey(matricula)],
      )

      if (existing) {
        const assignments = entries.map((entry) => `${escapeCentralColumn(entry.column)} = ?`)
        const params = entries.map((entry) => entry.value)
        if (columns.has('updated_at')) assignments.push('`updated_at` = CURRENT_TIMESTAMP')
        if (columns.has('updated_by')) {
          assignments.push('`updated_by` = ?')
          params.push(userEmail || 'sistema')
        }
        params.push(canonicalMatriculaKey(matricula))
        await controlEscolarCentralQuery(
          `UPDATE \`matricula\` SET ${assignments.join(', ')} WHERE UPPER(TRIM(\`matricula\`)) = ?`,
          params,
        )
        continue
      }

      const insertColumns = ['matricula', ...entries.map((entry) => entry.column)]
      const insertValues: unknown[] = [matricula, ...entries.map((entry) => entry.value)]
      if (columns.has('created_by')) {
        insertColumns.push('created_by')
        insertValues.push(userEmail || 'sistema')
      }
      if (columns.has('updated_by')) {
        insertColumns.push('updated_by')
        insertValues.push(userEmail || 'sistema')
      }
      await controlEscolarCentralQuery(
        `INSERT INTO \`matricula\` (${insertColumns.map(escapeCentralColumn).join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
        insertValues,
      )
    }
  } catch (error: any) {
    console.warn('[Control Escolar] No se pudo sincronizar actualización masiva de grado/ciclo en matricula central.', error?.message || error)
  }
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const matriculas = Array.from(new Set<string>((Array.isArray(body?.matriculas) ? body.matriculas : [])
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
    SELECT
      base.matricula,
      base.nombreCompleto,
      base.plantel,
      base.nivel AS nivelBase,
      base.grado AS gradoBase,
      base.ciclo AS cicloBase,
      base.ciclo,
      IFNULL(TIO.override_activo, 0) AS tipoIngresoOverrideActivo,
      IFNULL(TIO.tipo_forzado, 'externo') AS tipoIngresoOverride
    FROM base
    LEFT JOIN student_tipo_ingreso_overrides TIO ON TIO.matricula = base.matricula
    WHERE base.matricula IN (${placeholders})
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

    const targetPlantel = normalizePlantel(
      isScopedToActivePlantel ? user.active_plantel : student.plantel
    )
    const placementPlantel = projectPlantelForNivel(
      targetPlantel || student.plantel,
      requestedNivel
    )
    const requestedGrado = normalizeGradoForPlantel(
      body?.targetGrado || student.gradoBase,
      placementPlantel,
      requestedNivel
    )

    if (!requestedNivel || !requestedGrado || !placementPlantel) {
      results.push({ matricula, nombreCompleto: student.nombreCompleto, status: 'failed', message: 'La posición académica seleccionada no es válida.' })
      return
    }

    const unchanged =
      normalizeCicloForTipoIngreso(student.cicloBase || student.ciclo) === ingresoCiclo &&
      sameText(student.nivelBase || resolveNivelEscolar(student.plantel, student.nivelBase), requestedNivel) &&
      sameGrado(student.gradoBase, requestedGrado) &&
      normalizePlantel(student.plantel) === normalizePlantel(placementPlantel)

    const updatedStudent = {
      matricula,
      nombreCompleto: student.nombreCompleto,
      plantelBase: placementPlantel,
      plantel: placementPlantel,
      nivelBase: requestedNivel,
      nivel: requestedNivel,
      gradoBase: requestedGrado,
      grado: displayGrado(requestedGrado),
      ciclo: ingresoCiclo,
      cicloBase: ingresoCiclo,
      tipoIngresoOverrideActivo: student.tipoIngresoOverrideActivo || 0,
      tipoIngresoOverride: student.tipoIngresoOverride || 'externo',
      tipoIngreso: resolveTipoIngreso({
        ...student,
        plantel: placementPlantel,
        plantelBase: placementPlantel,
        nivelBase: requestedNivel,
        gradoBase: requestedGrado,
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
          nivel: requestedNivel,
          grado: displayGrado(requestedGrado),
          plantel: placementPlantel
        }
      })
      return
    }

    statements.push({
      sql: 'UPDATE base SET ciclo = ?, nivel = ?, grado = ?, plantel = ? WHERE matricula = ?',
      params: [ingresoCiclo, requestedNivel, requestedGrado, placementPlantel, matricula]
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
        nivel: requestedNivel,
        grado: displayGrado(requestedGrado),
        plantel: placementPlantel
      }
    })
  })

  if (statements.length) {
    await executeStatementTransaction(statements)
    await syncCentralAcademicOverlays(updatesByMatricula, user?.email)
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
