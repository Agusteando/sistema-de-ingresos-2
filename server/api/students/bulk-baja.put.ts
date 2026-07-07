import { executeStatementTransaction, query, runWithBridgeAgentId, type SqlStatement } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

const normalizeMatricula = (value: unknown) => String(value || '').trim()
const canonicalMatriculaKey = (value: unknown) => normalizeMatricula(value).toUpperCase()
const normalizeStatus = (value: unknown) => String(value || '').trim().toLowerCase()

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const motivo = String(body?.motivo || '').trim()
  const rawCiclo = String(body?.ciclo || body?.targetCiclo || '').trim()
  const cicloKey = rawCiclo ? normalizeCicloKey(rawCiclo) : ''
  const matriculas = Array.from(new Set<string>((Array.isArray(body?.matriculas) ? body.matriculas : [])
    .map(normalizeMatricula)
    .filter(Boolean)))

  if (!matriculas.length) {
    throw createError({ statusCode: 400, message: 'Selecciona al menos un alumno.' })
  }

  if (matriculas.length > 1000) {
    throw createError({ statusCode: 400, message: 'La selección máxima por baja masiva es de 1000 alumnos.' })
  }

  if (motivo.length < 3) {
    throw createError({ statusCode: 400, message: 'Motivo de baja requerido.' })
  }

  const canonicalKeys = matriculas.map(canonicalMatriculaKey)
  const placeholders = canonicalKeys.map(() => '?').join(',')
  const rows = await query<any[]>(`
    SELECT matricula, nombreCompleto, estatus
    FROM base
    WHERE UPPER(TRIM(CAST(matricula AS CHAR))) IN (${placeholders})
  `, canonicalKeys)

  const rowsByKey = new Map(rows.map((row) => [canonicalMatriculaKey(row.matricula), row]))
  const results: any[] = []
  const statements: SqlStatement[] = []

  matriculas.forEach((matricula) => {
    const key = canonicalMatriculaKey(matricula)
    const student = rowsByKey.get(key)

    if (!student) {
      results.push({ matricula, status: 'failed', message: 'Alumno no encontrado.' })
      return
    }

    if (normalizeStatus(student.estatus) !== 'activo') {
      results.push({
        matricula: student.matricula,
        nombreCompleto: student.nombreCompleto,
        status: 'skipped',
        message: 'El alumno no está activo.',
        previousEstatus: student.estatus || '',
      })
      return
    }

    statements.push({
      sql: `
        UPDATE base
        SET estatus = ?${cicloKey ? ', ciclo = ?' : ''}
        WHERE matricula = ?
          AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'activo'
      `,
      params: cicloKey ? [motivo, cicloKey, student.matricula] : [motivo, student.matricula],
    })
    results.push({
      matricula: student.matricula,
      nombreCompleto: student.nombreCompleto,
      status: 'pending',
      message: 'Pendiente de baja.',
      previousEstatus: student.estatus || '',
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
      message: 'Baja aplicada.',
      estatus: motivo,
      ...(cicloKey ? { ciclo: cicloKey } : {}),
    }
  })

  return {
    success: true,
    requested: matriculas.length,
    updated: finalizedResults.filter((result) => result.status === 'updated').length,
    skipped: finalizedResults.filter((result) => result.status === 'skipped').length,
    failed: finalizedResults.filter((result) => result.status === 'failed').length,
    motivo,
    ...(cicloKey ? { ciclo: cicloKey } : {}),
    results: finalizedResults,
  }
}))
