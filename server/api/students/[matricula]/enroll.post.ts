import { executeStatementTransaction, query, type SqlStatement } from '../../../utils/db'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'

const parseMeses = (concepto: any) => {
  if (Number(concepto.eventual || 0) === 1) return 1

  const plazo = String(concepto.plazo || '').trim()
  if (!plazo) return 1

  if (plazo.startsWith('[')) {
    try {
      const parsed = JSON.parse(plazo)
      return Array.isArray(parsed) ? Math.max(1, parsed.length) : 1
    } catch (e) {
      return 1
    }
  }

  if (plazo.includes(',')) {
    return Math.max(1, plazo.split(',').filter(Boolean).length)
  }

  return Math.max(1, Number(plazo) || 1)
}

export default defineEventHandler(async (event) => {
  const matricula = String(event.context.params?.matricula || '').trim()
  const body = await readBody(event)
  const cicloKey = normalizeCicloKey(body?.ciclo)
  const user = event.context.user

  if (!matricula) {
    throw createError({ statusCode: 400, message: 'Matricula requerida' })
  }

  const [student] = await query<any[]>(
    `SELECT matricula, plantel, estatus FROM base WHERE matricula = ? LIMIT 1`,
    [matricula]
  )

  if (!student) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado' })
  }

  if (student.estatus !== 'Activo') {
    throw createError({ statusCode: 400, message: 'Solo se puede inscribir un alumno activo.' })
  }

  if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
    if (String(student.plantel || '') !== String(user.active_plantel || '')) {
      throw createError({ statusCode: 403, message: 'Alumno fuera del plantel activo.' })
    }
  }

  const conceptos = await query<any[]>(`
    SELECT id, concepto, costo, eventual, plazo, plantel
    FROM conceptos
    WHERE ciclo = ?
      AND LOWER(concepto) LIKE '%inscrip%'
      AND (plantel = ? OR LOWER(plantel) = 'global' OR plantel IS NULL OR plantel = '')
    ORDER BY
      CASE
        WHEN plantel = ? THEN 0
        WHEN LOWER(plantel) = 'global' THEN 1
        ELSE 2
      END,
      id ASC
  `, [cicloKey, student.plantel, student.plantel])

  if (!conceptos.length) {
    throw createError({ statusCode: 404, message: 'No hay conceptos de inscripcion para este plantel y ciclo.' })
  }

  const conceptIds = conceptos.map(concepto => String(concepto.id))
  const existingDocs = await query<any[]>(`
    SELECT concepto
    FROM documentos
    WHERE matricula = ?
      AND ciclo = ?
      AND estatus = 'Activo'
      AND concepto IN (?)
  `, [matricula, cicloKey, conceptIds])

  const existing = new Set(existingDocs.map(doc => String(doc.concepto)))
  const selectedConceptos = conceptos.filter(concepto => !existing.has(String(concepto.id)))

  if (!selectedConceptos.length) {
    return { success: true, inserted: 0, skipped: conceptos.length, conceptos: [] }
  }

  const statements: SqlStatement[] = selectedConceptos.map((concepto) => {
    const meses = parseMeses(concepto)
    const plazoLegacy = Array.from({ length: meses }, (_, i) => i + 1).join(',')

    return {
      sql: `
        INSERT INTO documentos (concepto, conceptoNombre, matricula, costo, plazo, meses, beca, ciclo, eventual, responsable, estatus)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'Admin', 'Activo')
      `,
      params: [
        concepto.id,
        concepto.concepto,
        matricula,
        concepto.costo,
        plazoLegacy,
        meses,
        cicloKey,
        Number(concepto.eventual || 0) === 1 ? 1 : 0
      ]
    }
  })

  await executeStatementTransaction(statements)

  return {
    success: true,
    inserted: selectedConceptos.length,
    skipped: conceptos.length - selectedConceptos.length,
    conceptos: selectedConceptos.map(concepto => concepto.concepto)
  }
})
