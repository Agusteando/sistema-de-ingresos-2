import { fetchCentralMatriculaOverlays } from './central-matricula-overlay'
import { controlEscolarCentralQuery } from './control-escolar-central'
import { query, runWithBridgeAgentId } from './db'
import { PLANTELES_LIST } from '../../utils/constants'

const SUMMER_PLANTELES = new Set(PLANTELES_LIST)
const DEFAULT_CONCEPTS = [986, 987, 988]
const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const matriculaKey = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')

export const normalizeSummerPlantel = (value: unknown) => {
  const raw = clean(value, 40).toUpperCase()
  return SUMMER_PLANTELES.has(raw) ? raw : ''
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
  stack: string | null
}

type SummerQueryBranch = {
  key: 'paid' | 'charged'
  ok: boolean
  rowCount: number
  latencyMs: number
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
  stack: clean(error?.stack, 12000) || null
})

const runSummerQueryBranch = async (key: 'paid' | 'charged', task: () => Promise<any[]>): Promise<SummerQueryBranch> => {
  const started = Date.now()
  try {
    const rows = await task()
    return { key, ok: true, rowCount: rows.length, latencyMs: Date.now() - started, rows, error: null }
  } catch (error: any) {
    return { key, ok: false, rowCount: 0, latencyMs: Date.now() - started, rows: [], error: serializeSummerQueryError(error) }
  }
}

const readSummerEnrollmentBranches = async (plantel: string, cycle: string, concepts: number[]) => {
  const placeholders = concepts.map(() => '?').join(',')
  return await runWithBridgeAgentId(plantel, async () => {
    const [paid, charged] = await Promise.all([
      runSummerQueryBranch('paid', async () => await query<any[]>(`
        SELECT
          UPPER(TRIM(R.matricula)) AS matricula,
          MAX(TRIM(COALESCE(R.nombreCompleto, B.nombreCompleto, ''))) AS nombreCompleto,
          MAX(UPPER(TRIM(COALESCE(R.plantel, B.plantel, ?)))) AS plantel,
          MAX(TRIM(COALESCE(B.curp, ''))) AS curp,
          MAX(CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS UNSIGNED)) AS conceptId
        FROM referenciasdepago R
        LEFT JOIN documentos D ON D.documento = R.documento
        LEFT JOIN documento_concepto_periodos P
          ON P.documento = R.documento
          AND P.estatus = 'Activo'
          AND CAST(R.mes AS UNSIGNED) >= P.start_mes
          AND (P.end_mes IS NULL OR CAST(R.mes AS UNSIGNED) <= P.end_mes)
        LEFT JOIN base B ON B.matricula = R.matricula
        WHERE R.estatus = 'Vigente'
          AND R.ciclo = ?
          AND CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS UNSIGNED) IN (${placeholders})
        GROUP BY UPPER(TRIM(R.matricula))
      `, [plantel, cycle, ...concepts])),
      runSummerQueryBranch('charged', async () => await query<any[]>(`
        SELECT
          UPPER(TRIM(D.matricula)) AS matricula,
          MAX(TRIM(COALESCE(B.nombreCompleto, ''))) AS nombreCompleto,
          MAX(UPPER(TRIM(COALESCE(D.plantel, B.plantel, ?)))) AS plantel,
          MAX(TRIM(COALESCE(B.curp, ''))) AS curp,
          MAX(CAST(COALESCE(P.concepto_id, D.concepto) AS UNSIGNED)) AS conceptId
        FROM documentos D
        LEFT JOIN documento_concepto_periodos P ON P.documento = D.documento AND P.estatus = 'Activo'
        LEFT JOIN base B ON B.matricula = D.matricula
        WHERE D.estatus = 'Activo'
          AND D.ciclo = ?
          AND CAST(COALESCE(P.concepto_id, D.concepto) AS UNSIGNED) IN (${placeholders})
        GROUP BY UPPER(TRIM(D.matricula))
      `, [plantel, cycle, ...concepts]))
    ])
    return { paid, charged }
  })
}

const publicBranchDiagnostic = (branch: SummerQueryBranch) => ({
  key: branch.key,
  ok: branch.ok,
  rowCount: branch.rowCount,
  latencyMs: branch.latencyMs,
  error: branch.error
})

const mergeSummerRows = (rows: any[], plantel: string) => {
  const merged = new Map<string, any>()
  for (const row of rows) {
    const matricula = matriculaKey(row.matricula)
    if (!matricula) continue
    const current = merged.get(matricula)
    const conceptId = Number(row.conceptId || 0)
    if (!current) {
      merged.set(matricula, {
        matricula,
        nombreCompleto: clean(row.nombreCompleto, 255),
        plantel: normalizeSummerPlantel(row.plantel) || plantel,
        curp: clean(row.curp, 18).toUpperCase(),
        conceptId
      })
    } else {
      current.nombreCompleto ||= clean(row.nombreCompleto, 255)
      current.curp ||= clean(row.curp, 18).toUpperCase()
      current.conceptId = betterConcept(current.conceptId, conceptId)
    }
  }
  return merged
}

export const readSummerStudentsFromBridge = async (plantelValue: unknown, cycleValue: unknown, conceptsValue: unknown) => {
  const plantel = normalizeSummerPlantel(plantelValue)
  const cycle = clean(cycleValue || '2026', 20).match(/\d{4}/)?.[0] || '2026'
  const concepts = parseSummerConcepts(conceptsValue)
  if (!plantel) throw createError({ statusCode: 400, statusMessage: 'PLANTEL_INVALID', message: 'El plantel no es válido.' })

  let branches: Awaited<ReturnType<typeof readSummerEnrollmentBranches>>
  try {
    branches = await readSummerEnrollmentBranches(plantel, cycle, concepts)
  } catch (error: any) {
    throw createError({
      statusCode: 502,
      statusMessage: 'SUMMER_BRIDGE_CONTEXT_FAILED',
      message: 'No se pudo abrir el contexto Bridge del plantel.',
      data: { plantel, cycle, concepts, boundary: 'bridge_context', error: serializeSummerQueryError(error) }
    })
  }

  const queryDiagnostics = {
    paid: publicBranchDiagnostic(branches.paid),
    charged: publicBranchDiagnostic(branches.charged)
  }
  if (!branches.paid.ok && !branches.charged.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: 'SUMMER_FINANCIAL_QUERIES_FAILED',
      message: 'Las dos consultas financieras de Summer Camp fallaron.',
      data: { plantel, cycle, concepts, boundary: 'financial_queries', queryDiagnostics }
    })
  }

  const merged = mergeSummerRows([...branches.paid.rows, ...branches.charged.rows], plantel)

  let centralReachable = true
  let overlays = new Map<string, any>()
  let centralError: SummerQueryError | null = null
  try {
    overlays = await fetchCentralMatriculaOverlays(Array.from(merged.keys()))
  } catch (error: any) {
    centralReachable = false
    centralError = serializeSummerQueryError(error)
    console.warn('[Summer API] Central matricula enrichment unavailable.', { plantel, message: error?.message || error })
  }

  const data = Array.from(merged.values()).map((student) => {
    const central = overlays.get(student.matricula)?.student || null
    return {
      matricula: student.matricula,
      nombreCompleto: clean(central?.nombreCompleto || central?.fullName || student.nombreCompleto, 255) || student.matricula,
      plantel: normalizeSummerPlantel(student.plantel) || plantel,
      curp: clean(central?.curp || student.curp, 18).toUpperCase(),
      conceptId: Number(student.conceptId || 0),
      mealCount: mealCountFor(Number(student.conceptId || 0)),
      photoAvailable: Boolean(central?.foto),
      externalStudent: !central,
      updatedAt: central?.updatedAt || null
    }
  }).sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, 'es'))

  return {
    data,
    meta: {
      diagnosticVersion: 1,
      plantel,
      cycle,
      concepts,
      total: data.length,
      generatedAt: new Date().toISOString(),
      bridgeReachable: true,
      centralReachable,
      partial: !centralReachable || !branches.paid.ok || !branches.charged.ok,
      source: 'aurora-summer-bridge',
      queryDiagnostics,
      centralDiagnostic: centralReachable ? null : centralError,
      counts: {
        paidRows: branches.paid.rowCount,
        chargedRows: branches.charged.rowCount,
        rowsBeforeDeduplication: branches.paid.rowCount + branches.charged.rowCount,
        distinctMatriculas: merged.size,
        responseStudents: data.length
      }
    }
  }
}

export const diagnoseSummerStudentsFromBridge = async (plantelValue: unknown, cycleValue: unknown, conceptsValue: unknown) => {
  const plantel = normalizeSummerPlantel(plantelValue)
  const cycle = clean(cycleValue || '2026', 20).match(/\d{4}/)?.[0] || '2026'
  const concepts = parseSummerConcepts(conceptsValue)
  const started = Date.now()
  if (!plantel) return { ok: false, diagnosticVersion: 1, boundary: 'configuration', configuration: { plantel: clean(plantelValue, 40), cycle, concepts }, error: { message: 'El plantel no es válido.' } }

  try {
    const branches = await readSummerEnrollmentBranches(plantel, cycle, concepts)
    const merged = mergeSummerRows([...branches.paid.rows, ...branches.charged.rows], plantel)
    const queryDiagnostics = { paid: publicBranchDiagnostic(branches.paid), charged: publicBranchDiagnostic(branches.charged) }
    const failedBranches = [branches.paid, branches.charged].filter((branch) => !branch.ok).map((branch) => branch.key)
    return {
      ok: branches.paid.ok || branches.charged.ok,
      diagnosticVersion: 1,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      boundary: failedBranches.length === 2 ? 'financial_queries' : failedBranches.length === 1 ? 'partial_financial_query' : 'complete',
      configuration: { plantel, cycle, concepts, bridgeAgentId: plantel },
      assumptions: {
        paidTables: ['referenciasdepago', 'documentos', 'documento_concepto_periodos', 'base'],
        chargedTables: ['documentos', 'documento_concepto_periodos', 'base'],
        paidFilters: { referenciaEstatus: 'Vigente', ciclo: cycle, concepts },
        chargedFilters: { documentoEstatus: 'Activo', ciclo: cycle, concepts },
        conceptResolutionPaid: 'COALESCE(P.concepto_id, D.concepto, R.concepto)',
        conceptResolutionCharged: 'COALESCE(P.concepto_id, D.concepto)'
      },
      queryDiagnostics,
      counts: {
        paidRows: branches.paid.rowCount,
        chargedRows: branches.charged.rowCount,
        rowsBeforeDeduplication: branches.paid.rowCount + branches.charged.rowCount,
        distinctMatriculas: merged.size
      },
      conclusion: failedBranches.length
        ? { code: failedBranches.length === 2 ? 'BOTH_FINANCIAL_QUERIES_FAILED' : 'ONE_FINANCIAL_QUERY_FAILED', failedBranches }
        : merged.size
          ? { code: 'STUDENTS_FOUND', failedBranches: [] }
          : { code: 'QUERIES_OK_ZERO_STUDENTS', failedBranches: [] }
    }
  } catch (error: any) {
    return {
      ok: false,
      diagnosticVersion: 1,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      boundary: 'bridge_context',
      configuration: { plantel, cycle, concepts, bridgeAgentId: plantel },
      error: serializeSummerQueryError(error),
      conclusion: { code: 'BRIDGE_CONTEXT_FAILED' }
    }
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

  const plantel = normalizeSummerPlantel(plantelValue)
  if (plantel) {
    try {
      await runWithBridgeAgentId(plantel, async () => await query('SELECT 1 AS ok'))
      bridgeReachable = true
    } catch {
      bridgeReachable = false
    }
  }

  return {
    status: centralReachable && bridgeReachable !== false ? 'ok' : 'degraded',
    centralReachable,
    bridgeReachable,
    plantel: plantel || null,
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
