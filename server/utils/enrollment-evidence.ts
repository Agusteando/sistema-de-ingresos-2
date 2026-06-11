import { normalizePlantel } from '../../shared/utils/grado'
import { query } from './db'

const EVIDENCE_CHUNK_SIZE = 500

const normalizeConceptId = (value: unknown) => {
  const raw = String(value ?? '').trim()
  return /^\d+$/.test(raw) ? String(Number(raw)) : ''
}

const normalizeMatricula = (value: unknown) => String(value ?? '').trim()

export const parseEnrollmentConceptIds = (raw: unknown): string[] => {
  const visit = (value: unknown): string[] => {
    if (value === null || value === undefined) return []
    if (Array.isArray(value)) return value.flatMap(visit)
    if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(visit)
    return String(value)
      .split(/[|,;]/)
      .map(normalizeConceptId)
      .filter(Boolean)
  }

  return Array.from(new Set(visit(raw)))
}

const addEvidenceRows = (
  target: Map<string, Set<string>>,
  rows: Array<{ matricula?: unknown; conceptIds?: unknown }>
) => {
  rows.forEach((row) => {
    const matricula = normalizeMatricula(row.matricula)
    if (!matricula) return

    const conceptIds = parseEnrollmentConceptIds(row.conceptIds)
    if (!conceptIds.length) return

    const current = target.get(matricula) || new Set<string>()
    conceptIds.forEach((conceptId) => current.add(conceptId))
    target.set(matricula, current)
  })
}


const GLOBAL_CONCEPT_PLANTELES = new Set(['', 'GLOBAL', 'GENERAL', 'ALL', 'TODOS', 'TODAS'])

export const resolveEnrollmentConceptIdsForPlantel = async (
  raw: unknown,
  plantel: unknown
): Promise<string[]> => {
  const conceptIds = parseEnrollmentConceptIds(raw)
  const plantelScope = normalizePlantel(plantel)

  if (!conceptIds.length || !plantelScope || plantelScope === 'GLOBAL') return conceptIds

  try {
    const placeholders = conceptIds.map(() => '?').join(',')
    const rows = await query<Array<{ id: unknown; plantel: unknown }>>(`
      SELECT CAST(id AS CHAR) AS id, plantel
      FROM conceptos
      WHERE CAST(id AS CHAR) IN (${placeholders})
    `, conceptIds)

    const allowed = new Set<string>()
    rows.forEach((row) => {
      const conceptId = normalizeConceptId(row.id)
      if (!conceptId) return
      const conceptPlantel = normalizePlantel(row.plantel)
      if (conceptPlantel === plantelScope || GLOBAL_CONCEPT_PLANTELES.has(conceptPlantel)) {
        allowed.add(conceptId)
      }
    })

    return conceptIds.filter((conceptId) => allowed.has(conceptId))
  } catch (error: any) {
    console.warn('[Enrollment concepts] Could not scope enrollment concepts by plantel.', {
      plantel: plantelScope,
      count: conceptIds.length,
      message: error?.message || error
    })
    return conceptIds
  }
}

export const getHistoricalEnrollmentConceptEvidence = async (
  matriculas: unknown[],
  enrollmentConcepts: unknown[]
): Promise<Map<string, string>> => {
  const uniqueMatriculas = Array.from(new Set(matriculas.map(normalizeMatricula).filter(Boolean)))
  const conceptIds = parseEnrollmentConceptIds(enrollmentConcepts)

  const result = new Map<string, Set<string>>()
  if (!uniqueMatriculas.length || conceptIds.length < 2) return new Map()

  for (let index = 0; index < uniqueMatriculas.length; index += EVIDENCE_CHUNK_SIZE) {
    const chunk = uniqueMatriculas.slice(index, index + EVIDENCE_CHUNK_SIZE)
    const matriculaPlaceholders = chunk.map(() => '?').join(',')
    const conceptPlaceholders = conceptIds.map(() => '?').join(',')

    const paymentRows = await query<Array<{ matricula: string; conceptIds: string }>>(`
      SELECT
        R.matricula,
        GROUP_CONCAT(DISTINCT CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS CHAR) SEPARATOR '|') AS conceptIds
      FROM referenciasdepago R
      LEFT JOIN documentos D ON D.documento = R.documento
      LEFT JOIN documento_concepto_periodos P
        ON P.documento = R.documento
        AND P.estatus = 'Activo'
        AND CAST(R.mes AS UNSIGNED) >= P.start_mes
        AND (P.end_mes IS NULL OR CAST(R.mes AS UNSIGNED) <= P.end_mes)
      WHERE R.estatus = 'Vigente'
        AND R.matricula IN (${matriculaPlaceholders})
        AND CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS CHAR) IN (${conceptPlaceholders})
      GROUP BY R.matricula
    `, [...chunk, ...conceptIds])

    const documentRows = await query<Array<{ matricula: string; conceptIds: string }>>(`
      SELECT
        D.matricula,
        GROUP_CONCAT(DISTINCT CAST(COALESCE(P.concepto_id, D.concepto) AS CHAR) SEPARATOR '|') AS conceptIds
      FROM documentos D
      LEFT JOIN documento_concepto_periodos P
        ON P.documento = D.documento
        AND P.estatus = 'Activo'
      WHERE D.estatus = 'Activo'
        AND (P.accion IS NULL OR P.accion <> 'cancelacion')
        AND D.matricula IN (${matriculaPlaceholders})
        AND CAST(COALESCE(P.concepto_id, D.concepto) AS CHAR) IN (${conceptPlaceholders})
      GROUP BY D.matricula
    `, [...chunk, ...conceptIds])

    addEvidenceRows(result, paymentRows)
    addEvidenceRows(result, documentRows)
  }

  return new Map(Array.from(result.entries()).map(([matricula, ids]) => [matricula, Array.from(ids).join('|')]))
}
