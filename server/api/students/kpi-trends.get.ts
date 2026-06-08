import { runWithBridgeAgentId, query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { previousCicloKey, resolveTipoIngreso } from '../../../shared/utils/tipoIngreso'
import { isInProjectedPlantelScopeForCiclo, plantelCandidatesForProjectedScope } from '../../../shared/utils/grado'
import { getHistoricalEnrollmentConceptEvidence, parseEnrollmentConceptIds } from '../../utils/enrollment-evidence'

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_POINTS = 8
const trendCache = new Map<string, { expiresAt: number, value: Record<string, number[]> }>()

const sanitizeConceptIds = (raw: unknown) => {
  const source = Array.isArray(raw) ? raw.join(',') : String(raw || '')
  const ids = source
    .split(',')
    .map(value => String(value || '').trim())
    .filter(value => /^\d+$/.test(value))
    .map(value => String(Number(value)))

  return Array.from(new Set(ids))
}

const emptyEnrollmentSeries = () => ({ inscritos: [], internos: [], externos: [] })

const dateBucket = (value: unknown) => {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 7)
  const text = String(value)
  return /^\d{4}-\d{2}/.test(text) ? text.slice(0, 7) : ''
}

const monthIndex = (bucket: string) => {
  const [year, month] = bucket.split('-').map(Number)
  if (!year || !month) return 0
  return year * 12 + month
}

const orderedBuckets = (buckets: Iterable<string>) => Array.from(new Set(Array.from(buckets).filter(Boolean)))
  .sort((a, b) => monthIndex(a) - monthIndex(b))
  .slice(-MAX_POINTS)

const seriesFromMap = (map: Map<string, number>, buckets: string[]) => buckets.map(bucket => Number(map.get(bucket) || 0))

const increment = (map: Map<string, number>, bucket: string, amount = 1) => {
  if (!bucket) return
  map.set(bucket, Number(map.get(bucket) || 0) + amount)
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const user = event.context.user
  const { ciclo = '2025', concepts = '' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const previousCiclo = previousCicloKey(cicloKey)
  const enrollmentConceptIds = parseEnrollmentConceptIds(concepts)
  const plantelScope = user.active_plantel || 'GLOBAL'
  const cacheKey = [user.role, plantelScope, cicloKey, enrollmentConceptIds.join('|')].join('::')
  const cached = trendCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) return cached.value

  const isScopedToActivePlantel = plantelScope !== 'GLOBAL'
  const plantelParams = isScopedToActivePlantel ? plantelCandidatesForProjectedScope(plantelScope) : []
  const plantelPlaceholders = plantelParams.map(() => '?').join(',')
  const plantelWhere = isScopedToActivePlantel ? `AND A.plantel IN (${plantelPlaceholders})` : ''

  const inscritos = new Map<string, number>()
  const internos = new Map<string, number>()
  const externos = new Map<string, number>()
  const ingresos = new Map<string, number>()
  const buckets = new Set<string>()

  if (enrollmentConceptIds.length) {
    const conceptPredicate = enrollmentConceptIds.map(() => 'CAST(COALESCE(p.concepto_id, d.concepto, r.concepto) AS CHAR) = ?').join(' OR ')

    const enrollmentRows = await query<any[]>(`
      SELECT
        E.matricula,
        E.firstEnrollmentAt,
        E.conceptosTarget,
        E.conceptoIdsTarget,
        A.grado AS gradoBase,
        A.ciclo AS cicloBase,
        A.ciclo,
        A.plantel,
        A.nivel AS nivelBase,
        BPrev.conceptosPagadosPrevios,
        BPrev.conceptoIdsPagadosPrevios,
        CPrev.conceptosCargadosPrevios,
        CPrev.conceptoIdsCargadosPrevios,
        CONCAT_WS('|', BPrev.conceptosPagadosPrevios, CPrev.conceptosCargadosPrevios) AS conceptosCicloPrevio,
        CONCAT_WS('|', BPrev.conceptoIdsPagadosPrevios, CPrev.conceptoIdsCargadosPrevios) AS conceptoIdsCicloPrevio
      FROM (
        SELECT
          r.matricula,
          MIN(r.fecha) AS firstEnrollmentAt,
          GROUP_CONCAT(DISTINCT r.conceptoNombre SEPARATOR '|') AS conceptosTarget,
          GROUP_CONCAT(DISTINCT CAST(COALESCE(p.concepto_id, d.concepto, r.concepto) AS CHAR) SEPARATOR '|') AS conceptoIdsTarget
        FROM referenciasdepago r
        LEFT JOIN documentos d ON d.documento = r.documento
        LEFT JOIN documento_concepto_periodos p
          ON p.documento = r.documento
          AND p.estatus = 'Activo'
          AND CAST(r.mes AS UNSIGNED) >= p.start_mes
          AND (p.end_mes IS NULL OR CAST(r.mes AS UNSIGNED) <= p.end_mes)
        WHERE r.ciclo = ?
          AND r.estatus = 'Vigente'
          AND (${conceptPredicate})
        GROUP BY r.matricula
      ) E
      JOIN base A ON A.matricula = E.matricula
      LEFT JOIN (
        SELECT
          r.matricula AS matricula,
          GROUP_CONCAT(DISTINCT r.conceptoNombre SEPARATOR '|') AS conceptosPagadosPrevios,
          GROUP_CONCAT(DISTINCT CAST(COALESCE(p.concepto_id, d.concepto, r.concepto) AS CHAR) SEPARATOR '|') AS conceptoIdsPagadosPrevios
        FROM referenciasdepago r
        LEFT JOIN documentos d ON d.documento = r.documento
        LEFT JOIN documento_concepto_periodos p
          ON p.documento = r.documento
          AND p.estatus = 'Activo'
          AND CAST(r.mes AS UNSIGNED) >= p.start_mes
          AND (p.end_mes IS NULL OR CAST(r.mes AS UNSIGNED) <= p.end_mes)
        WHERE r.ciclo = ? AND r.estatus = 'Vigente'
        GROUP BY r.matricula
      ) BPrev ON A.matricula = BPrev.matricula
      LEFT JOIN (
        SELECT
          matricula,
          GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') AS conceptosCargadosPrevios,
          GROUP_CONCAT(DISTINCT concepto SEPARATOR '|') AS conceptoIdsCargadosPrevios
        FROM documentos
        WHERE ciclo = ? AND estatus = 'Activo'
        GROUP BY matricula
      ) CPrev ON A.matricula = CPrev.matricula
      WHERE 1 = 1 ${plantelWhere}
    `, [cicloKey, ...enrollmentConceptIds, previousCiclo, previousCiclo, ...plantelParams])

    const historicalEnrollmentEvidence = await getHistoricalEnrollmentConceptEvidence(enrollmentRows.map(row => row.matricula), enrollmentConceptIds)

    enrollmentRows.forEach((row) => {
      if (!isInProjectedPlantelScopeForCiclo(row.gradoBase, row.plantel, row.cicloBase, cicloKey, row.nivelBase, isScopedToActivePlantel ? plantelScope : 'GLOBAL')) return
      const bucket = dateBucket(row.firstEnrollmentAt)
      if (!bucket) return
      buckets.add(bucket)
      increment(inscritos, bucket)
      const historicalConceptIds = historicalEnrollmentEvidence.get(String(row.matricula || '').trim()) || ''
      const tipoIngreso = resolveTipoIngreso({
        ...row,
        conceptoIdsCicloActual: row.conceptoIdsTarget,
        tipoIngresoEvidence: {
          targetCiclo: cicloKey,
          previousCiclo,
          targetConceptIds: row.conceptoIdsTarget,
          previousConceptIds: [row.conceptoIdsPagadosPrevios, row.conceptoIdsCargadosPrevios, row.conceptoIdsCicloPrevio],
          allConceptIds: [historicalConceptIds]
        }
      }, cicloKey, { enrollmentConcepts: enrollmentConceptIds })
      if (tipoIngreso.value === 'interno') increment(internos, bucket)
      else increment(externos, bucket)
    })
  }

  const incomeWhere = isScopedToActivePlantel ? `AND COALESCE(A.plantel, r.plantel) IN (${plantelPlaceholders})` : ''
  const incomeRows = await query<any[]>(`
    SELECT
      r.fecha,
      r.monto,
      A.grado AS gradoBase,
      A.ciclo AS cicloBase,
      A.nivel AS nivelBase,
      COALESCE(A.plantel, r.plantel) AS plantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE r.ciclo = ?
      AND r.estatus = 'Vigente'
      AND COALESCE(r.depurado, 0) = 0
      ${incomeWhere}
  `, [cicloKey, ...plantelParams])

  incomeRows.forEach((row) => {
    if (!isInProjectedPlantelScopeForCiclo(row.gradoBase, row.plantel, row.cicloBase, cicloKey, row.nivelBase, isScopedToActivePlantel ? plantelScope : 'GLOBAL')) return
    const bucket = dateBucket(row.fecha)
    if (!bucket) return
    buckets.add(bucket)
    increment(ingresos, bucket, Number(row.monto || 0))
  })

  const ordered = orderedBuckets(buckets)
  const enrollmentSeries = enrollmentConceptIds.length
    ? {
        inscritos: seriesFromMap(inscritos, ordered),
        internos: seriesFromMap(internos, ordered),
        externos: seriesFromMap(externos, ordered)
      }
    : emptyEnrollmentSeries()

  const value = {
    ...enrollmentSeries,
    ingresos: seriesFromMap(ingresos, ordered)
  }

  trendCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value })
  return value
}))
