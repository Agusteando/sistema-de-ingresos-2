import { controlEscolarCentralQuery } from './control-escolar-central'
import { query, runWithBridgeAgentId } from './db'
import { CONCEPTOS_PLANTELES_LIST } from '../../utils/constants'

const DEFAULT_CONCEPTS = [986, 987, 988]
const DEFAULT_PLANTELES = [...CONCEPTOS_PLANTELES_LIST]
const SUMMER_PLANTELES = new Set(DEFAULT_PLANTELES)
const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const matriculaKey = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')
const SUMMER_QUERY_VERSION = 3
const SUMMER_QUERY_STRATEGY = 'single-union-direct-concept'

export const normalizeSummerPlantel = (value: unknown) => {
  const raw = clean(value, 40).toUpperCase()
  return SUMMER_PLANTELES.has(raw) ? raw : ''
}

export const parseSummerPlanteles = (value: unknown) => {
  const values = Array.isArray(value) ? value : String(value || '').split(',')
  const normalized = values.map(normalizeSummerPlantel).filter(Boolean)
  return Array.from(new Set(normalized.length ? normalized : DEFAULT_PLANTELES))
}

export const parseSummerConcepts = (value: unknown) => {
  const values = Array.isArray(value) ? value : String(value || '').split(',')
  const ids = values.map(Number).filter((id) => Number.isInteger(id) && id > 0)
  return Array.from(new Set(ids.length ? ids : DEFAULT_CONCEPTS)).slice(0, 20)
}

const mealCountFor = (conceptId: number) => conceptId === 988 ? 2 : conceptId === 987 ? 1 : 0
const betterConcept = (left: number, right: number) => mealCountFor(right) > mealCountFor(left) ? right : left || right

type SummerQueryError = {
  name: string
  message: string
  code: string | null
  errno: number | null
  sqlState: string | null
  sqlMessage: string | null
  statusCode: number | null
  stack: string | null
}

type SummerPlantelResult = {
  plantel: string
  ok: boolean
  latencyMs: number
  rowCount: number
  rows: any[]
  error: SummerQueryError | null
}

const serializeSummerQueryError = (error: any): SummerQueryError => ({
  name: clean(error?.name || 'Error', 120),
  message: clean(error?.message || error || 'Error desconocido', 4000),
  code: clean(error?.code, 120) || null,
  errno: Number.isFinite(Number(error?.errno)) ? Number(error.errno) : null,
  sqlState: clean(error?.sqlState, 120) || null,
  sqlMessage: clean(error?.sqlMessage, 4000) || null,
  statusCode: Number.isFinite(Number(error?.statusCode || error?.status || error?.httpStatus))
    ? Number(error?.statusCode || error?.status || error?.httpStatus)
    : null,
  stack: clean(error?.stack, 12000) || null
})

const readSummerRowsForPlantel = async (plantel: string, cycle: string, concepts: number[]): Promise<SummerPlantelResult> => {
  const started = Date.now()
  const placeholders = concepts.map(() => '?').join(',')

  try {
    const rows = await runWithBridgeAgentId(plantel, async () => await query<any[]>(`
      SELECT
        UPPER(TRIM(E.matricula)) AS matricula,
        MAX(TRIM(COALESCE(NULLIF(B.nombreCompleto, ''), NULLIF(E.nombreCompleto, ''), ''))) AS nombreCompleto,
        ? AS plantel,
        MAX(TRIM(COALESCE(B.curp, ''))) AS curp,
        MAX(E.conceptId) AS conceptId,
        MAX(E.hasPayment) AS hasPayment,
        MAX(E.hasCharge) AS hasCharge,
        MAX(CASE WHEN B.matricula IS NULL THEN 1 ELSE 0 END) AS externalStudent
      FROM (
        SELECT
          R.matricula,
          R.nombreCompleto,
          CAST(R.concepto AS UNSIGNED) AS conceptId,
          1 AS hasPayment,
          0 AS hasCharge
        FROM referenciasdepago R
        WHERE R.estatus = 'Vigente'
          AND R.ciclo = ?
          AND CAST(R.concepto AS UNSIGNED) IN (${placeholders})

        UNION ALL

        SELECT
          D.matricula,
          '' AS nombreCompleto,
          CAST(D.concepto AS UNSIGNED) AS conceptId,
          0 AS hasPayment,
          1 AS hasCharge
        FROM documentos D
        WHERE D.estatus = 'Activo'
          AND D.ciclo = ?
          AND CAST(D.concepto AS UNSIGNED) IN (${placeholders})
      ) E
      LEFT JOIN base B ON B.matricula = E.matricula
      WHERE TRIM(COALESCE(E.matricula, '')) <> ''
      GROUP BY UPPER(TRIM(E.matricula))
      ORDER BY nombreCompleto ASC, matricula ASC
    `, [plantel, cycle, ...concepts, cycle, ...concepts]))

    return {
      plantel,
      ok: true,
      latencyMs: Date.now() - started,
      rowCount: rows.length,
      rows,
      error: null
    }
  } catch (error: any) {
    return {
      plantel,
      ok: false,
      latencyMs: Date.now() - started,
      rowCount: 0,
      rows: [],
      error: serializeSummerQueryError(error)
    }
  }
}

const mapWithConcurrency = async <T, R>(values: T[], concurrency: number, task: (value: T, index: number) => Promise<R>) => {
  const results = new Array<R>(values.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= values.length) return
      results[index] = await task(values[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

const mergeSummerRows = (plantelResults: SummerPlantelResult[]) => {
  const merged = new Map<string, any>()
  const crossPlantelDuplicates: Array<{ matricula: string; planteles: string[] }> = []
  const identityPlanteles = new Map<string, Set<string>>()

  for (const result of plantelResults) {
    if (!result.ok) continue
    for (const row of result.rows) {
      const matricula = matriculaKey(row.matricula)
      if (!matricula) continue
      const planteles = identityPlanteles.get(matricula) || new Set<string>()
      planteles.add(result.plantel)
      identityPlanteles.set(matricula, planteles)

      const conceptId = Number(row.conceptId || 0)
      const current = merged.get(matricula)
      if (!current) {
        merged.set(matricula, {
          matricula,
          nombreCompleto: clean(row.nombreCompleto, 255) || matricula,
          plantel: result.plantel,
          curp: clean(row.curp, 18).toUpperCase(),
          conceptId,
          mealCount: mealCountFor(conceptId),
          photoAvailable: false,
          externalStudent: Boolean(Number(row.externalStudent || 0)),
          hasPayment: Boolean(Number(row.hasPayment || 0)),
          hasCharge: Boolean(Number(row.hasCharge || 0)),
          updatedAt: null
        })
        continue
      }

      current.nombreCompleto ||= clean(row.nombreCompleto, 255)
      current.curp ||= clean(row.curp, 18).toUpperCase()
      current.conceptId = betterConcept(Number(current.conceptId || 0), conceptId)
      current.mealCount = mealCountFor(current.conceptId)
      current.externalStudent = current.externalStudent && Boolean(Number(row.externalStudent || 0))
      current.hasPayment = current.hasPayment || Boolean(Number(row.hasPayment || 0))
      current.hasCharge = current.hasCharge || Boolean(Number(row.hasCharge || 0))
    }
  }

  for (const [matricula, planteles] of identityPlanteles) {
    if (planteles.size > 1) crossPlantelDuplicates.push({ matricula, planteles: Array.from(planteles).sort() })
  }

  return {
    data: Array.from(merged.values()).sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, 'es')),
    crossPlantelDuplicates
  }
}

const publicPlantelResult = (result: SummerPlantelResult) => ({
  plantel: result.plantel,
  ok: result.ok,
  latencyMs: result.latencyMs,
  rowCount: result.rowCount,
  error: result.error
})

export const readSummerStudentsFromBridge = async (plantelesValue: unknown, cycleValue: unknown, conceptsValue: unknown) => {
  const planteles = parseSummerPlanteles(plantelesValue)
  const cycle = clean(cycleValue || '2026', 20).match(/\d{4}/)?.[0] || '2026'
  const concepts = parseSummerConcepts(conceptsValue)
  const started = Date.now()

  const plantelResults = await mapWithConcurrency(planteles, 3, async (plantel) => await readSummerRowsForPlantel(plantel, cycle, concepts))
  const successful = plantelResults.filter((result) => result.ok)
  const failed = plantelResults.filter((result) => !result.ok)

  if (!successful.length) {
    throw createError({
      statusCode: 502,
      statusMessage: 'SUMMER_ALL_FINANCIAL_AGENTS_FAILED',
      message: 'No fue posible consultar ningún agente financiero de Summer Camp.',
      data: {
        queryVersion: SUMMER_QUERY_VERSION,
        queryStrategy: SUMMER_QUERY_STRATEGY,
        boundary: 'financial_agents',
        cycle,
        concepts,
        requestedPlanteles: planteles,
        plantelResults: plantelResults.map(publicPlantelResult)
      }
    })
  }

  const merged = mergeSummerRows(plantelResults)
  const successfulPlanteles = successful.map((result) => result.plantel)
  const emptyPlanteles = successful.filter((result) => result.rowCount === 0).map((result) => result.plantel)
  const failedPlanteles = failed.map((result) => result.plantel)

  return {
    data: merged.data,
    meta: {
      diagnosticVersion: 3,
      queryVersion: SUMMER_QUERY_VERSION,
      queryStrategy: SUMMER_QUERY_STRATEGY,
      cycle,
      concepts,
      requestedPlanteles: planteles,
      successfulPlanteles,
      emptyPlanteles,
      failedPlanteles,
      total: merged.data.length,
      generatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      bridgeReachable: successful.length > 0,
      partial: failed.length > 0,
      source: 'aurora-summer-bridge',
      plantelResults: plantelResults.map(publicPlantelResult),
      counts: {
        successfulAgents: successful.length,
        failedAgents: failed.length,
        rawRows: successful.reduce((sum, result) => sum + result.rowCount, 0),
        distinctMatriculas: merged.data.length,
        crossPlantelDuplicates: merged.crossPlantelDuplicates.length,
        withPayment: merged.data.filter((student) => student.hasPayment).length,
        withCharge: merged.data.filter((student) => student.hasCharge).length
      },
      crossPlantelDuplicates: merged.crossPlantelDuplicates.slice(0, 50).map((item) => ({
        matricula: `${item.matricula.slice(0, 2)}***${item.matricula.slice(-4)}`,
        planteles: item.planteles
      })),
      assumptions: {
        enrollmentEvidence: 'Active documentos.concepto OR Vigente referenciasdepago.concepto',
        cycleColumn: 'documentos.ciclo / referenciasdepago.ciclo',
        conceptColumns: 'documentos.concepto / referenciasdepago.concepto',
        plantelSource: 'Bridge agent requested by Aurora',
        studentDetails: 'Local base table in the same financial agent',
        centralEnrichment: 'Not used in the primary list path',
        concurrency: 3
      }
    }
  }
}

export const diagnoseSummerStudentsFromBridge = async (plantelesValue: unknown, cycleValue: unknown, conceptsValue: unknown) => {
  const planteles = parseSummerPlanteles(plantelesValue)
  const cycle = clean(cycleValue || '2026', 20).match(/\d{4}/)?.[0] || '2026'
  const concepts = parseSummerConcepts(conceptsValue)
  const started = Date.now()
  const plantelResults = await mapWithConcurrency(planteles, 2, async (plantel) => await readSummerRowsForPlantel(plantel, cycle, concepts))
  const merged = mergeSummerRows(plantelResults)
  const successful = plantelResults.filter((result) => result.ok)
  const failed = plantelResults.filter((result) => !result.ok)

  return {
    ok: successful.length > 0,
    diagnosticVersion: 3,
    queryVersion: SUMMER_QUERY_VERSION,
    queryStrategy: SUMMER_QUERY_STRATEGY,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    boundary: successful.length ? (failed.length ? 'partial_financial_agents' : 'complete') : 'financial_agents',
    configuration: { planteles, cycle, concepts },
    assumptions: {
      oneQueryPerAgent: true,
      parallelQueryBranchesPerAgent: false,
      directConceptColumnsOnly: ['documentos.concepto', 'referenciasdepago.concepto'],
      documentPlantelColumnUsed: false,
      periodTableUsed: false,
      centralOverlayUsed: false,
      concurrency: 2
    },
    plantelResults: plantelResults.map(publicPlantelResult),
    counts: {
      successfulAgents: successful.length,
      failedAgents: failed.length,
      rawRows: successful.reduce((sum, result) => sum + result.rowCount, 0),
      distinctMatriculas: merged.data.length
    },
    conclusion: !successful.length
      ? { code: 'ALL_FINANCIAL_AGENTS_FAILED' }
      : merged.data.length
        ? { code: failed.length ? 'PARTIAL_STUDENTS_FOUND' : 'STUDENTS_FOUND' }
        : { code: failed.length ? 'PARTIAL_ZERO_STUDENTS' : 'QUERIES_OK_ZERO_STUDENTS' }
  }
}

export const readSummerExternalHealth = async (plantelValue?: unknown) => {
  const started = Date.now()
  let centralReachable = false
  let bridgeReachable: boolean | null = null
  try {
    await controlEscolarCentralQuery('SELECT 1 AS ok')
    centralReachable = true
  } catch {}

  const plantel = normalizeSummerPlantel(plantelValue) || DEFAULT_PLANTELES[0]
  try {
    await runWithBridgeAgentId(plantel, async () => await query('SELECT 1 AS ok'))
    bridgeReachable = true
  } catch {
    bridgeReachable = false
  }

  return {
    status: bridgeReachable ? 'ok' : 'degraded',
    centralReachable,
    bridgeReachable,
    plantel,
    queryVersion: SUMMER_QUERY_VERSION,
    latencyMs: Date.now() - started,
    checkedAt: new Date().toISOString()
  }
}

const resolvePhotoUrl = (raw: unknown, base: string) => {
  const value = clean(raw, 2000)
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('//')) return `https:${value}`
  return new URL(value.startsWith('/') ? value : `/uploads/${value.replace(/^\.\//, '')}`, base).toString()
}

export const readSummerStudentPhoto = async (matriculaValue: unknown) => {
  const matricula = matriculaKey(matriculaValue)
  if (!matricula || !/^[A-Z0-9_-]+$/.test(matricula)) throw createError({ statusCode: 400, message: 'Matrícula inválida.' })
  const config = useRuntimeConfig() as any
  const base = clean(config.studentPhotoBaseUrl || 'https://matricula.casitaapps.com', 500).replace(/\/+$/, '')
  const apiKey = clean(config.studentPhotoApiKey || process.env.EXTERNAL_SYNC_API_KEY, 500)
  if (!apiKey) throw createError({ statusCode: 503, message: 'Servicio de fotos no configurado.' })
  const url = new URL(`/api/students/${encodeURIComponent(matricula)}/photo`, base)
  url.searchParams.set('format', 'json')
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey, Accept: 'application/json' },
    cache: 'no-store'
  })
  if (response.status === 404) throw createError({ statusCode: 404, message: 'Foto no disponible.' })
  if (!response.ok) throw createError({ statusCode: 502, message: 'No se pudo consultar la foto.' })
  const payload: any = await response.json().catch(() => null)
  const photoUrl = resolvePhotoUrl(payload?.photoUrl || payload?.url || payload?.data?.photoUrl || payload?.data?.url, base)
  if (!photoUrl) throw createError({ statusCode: 404, message: 'Foto no disponible.' })
  return { matricula, photoUrl }
}
