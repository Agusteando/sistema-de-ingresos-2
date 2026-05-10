import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../shared/utils/grado'

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_POINTS = 8
const trendCache = new Map<string, { expiresAt: number, value: Record<string, number[]> }>()

const DEFAULT_ENROLLMENT_CONCEPTS = ['inscripcion', 'inscripción', 'reinscripcion', 'reinscripción']

const normalizeConcept = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const sanitizeConcepts = (raw: unknown) => {
  const source = Array.isArray(raw) ? raw.join(',') : String(raw || '')
  const concepts = source
    .split(',')
    .map(normalizeConcept)
    .filter(Boolean)
    .filter(concept => concept.length >= 3 && concept.length <= 80)

  return Array.from(new Set(concepts.length ? concepts : DEFAULT_ENROLLMENT_CONCEPTS.map(normalizeConcept)))
}

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

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const { ciclo = '2025', concepts = '' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const enrollmentConcepts = sanitizeConcepts(concepts)
  const plantelScope = user.active_plantel || 'GLOBAL'
  const cacheKey = [user.role, plantelScope, cicloKey, enrollmentConcepts.join('|')].join('::')
  const cached = trendCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) return cached.value

  const normalizedConceptSql = "LOWER(REPLACE(REPLACE(REPLACE(REPLACE(r.conceptoNombre, 'í', 'i'), 'Í', 'i'), 'ó', 'o'), 'Ó', 'o'))"
  const conceptPredicate = enrollmentConcepts.map(() => `${normalizedConceptSql} LIKE ?`).join(' OR ')
  const conceptParams = enrollmentConcepts.map(concept => `%${concept}%`)
  const plantelWhere = plantelScope !== 'GLOBAL' ? 'AND A.plantel = ?' : ''
  const plantelParams = plantelScope !== 'GLOBAL' ? [plantelScope] : []

  const enrollmentRows = await query<any[]>(`
    SELECT
      E.matricula,
      E.firstEnrollmentAt,
      A.interno,
      A.grado AS gradoBase,
      A.ciclo AS cicloBase,
      A.plantel
    FROM (
      SELECT r.matricula, MIN(r.fecha) AS firstEnrollmentAt
      FROM referenciasdepago r
      WHERE r.ciclo = ?
        AND r.estatus = 'Vigente'
        AND (${conceptPredicate})
      GROUP BY r.matricula
    ) E
    JOIN base A ON A.matricula = E.matricula
    WHERE 1 = 1 ${plantelWhere}
  `, [cicloKey, ...conceptParams, ...plantelParams])

  const incomeWhere = plantelScope !== 'GLOBAL' ? 'AND COALESCE(A.plantel, r.plantel) = ?' : ''
  const incomeRows = await query<any[]>(`
    SELECT
      r.fecha,
      r.monto,
      A.grado AS gradoBase,
      A.ciclo AS cicloBase,
      COALESCE(A.plantel, r.plantel) AS plantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE r.ciclo = ?
      AND r.estatus = 'Vigente'
      ${incomeWhere}
  `, [cicloKey, ...plantelParams])

  const inscritos = new Map<string, number>()
  const internos = new Map<string, number>()
  const externos = new Map<string, number>()
  const ingresos = new Map<string, number>()
  const buckets = new Set<string>()

  enrollmentRows.forEach((row) => {
    if (isOutOfScopeForPlantelCiclo(row.gradoBase, row.plantel, row.cicloBase, cicloKey)) return
    const bucket = dateBucket(row.firstEnrollmentAt)
    if (!bucket) return
    buckets.add(bucket)
    increment(inscritos, bucket)
    if (String(row.interno) === '1') increment(internos, bucket)
    else increment(externos, bucket)
  })

  incomeRows.forEach((row) => {
    if (isOutOfScopeForPlantelCiclo(row.gradoBase, row.plantel, row.cicloBase, cicloKey)) return
    const bucket = dateBucket(row.fecha)
    if (!bucket) return
    buckets.add(bucket)
    increment(ingresos, bucket, Number(row.monto || 0))
  })

  const ordered = orderedBuckets(buckets)
  const value = {
    inscritos: seriesFromMap(inscritos, ordered),
    internos: seriesFromMap(internos, ordered),
    externos: seriesFromMap(externos, ordered),
    ingresos: seriesFromMap(ingresos, ordered)
  }

  trendCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value })
  return value
})
