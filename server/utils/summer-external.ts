import { fetchCentralMatriculaOverlays } from './central-matricula-overlay'
import { controlEscolarCentralQuery } from './control-escolar-central'
import { query, runWithBridgeAgentId } from './db'

const CANONICAL_PLANTELES = new Set(['PREEM', 'PREET', 'GM', 'PM', 'PT', 'SM', 'ST'])
const DEFAULT_CONCEPTS = [986, 987, 988]
const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const matriculaKey = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')

export const normalizeSummerPlantel = (value: unknown) => {
  const raw = clean(value, 40).toUpperCase()
  if (raw === 'CM') return 'PREEM'
  if (raw === 'CT') return 'PREET'
  if (raw === 'PMA' || raw === 'PMB') return 'PM'
  return CANONICAL_PLANTELES.has(raw) ? raw : ''
}

export const parseSummerConcepts = (value: unknown) => {
  const values = Array.isArray(value) ? value : String(value || '').split(',')
  const ids = values.map(Number).filter((id) => Number.isInteger(id) && id > 0)
  return Array.from(new Set(ids.length ? ids : DEFAULT_CONCEPTS)).slice(0, 20)
}

const mealCountFor = (conceptId: number) => conceptId === 988 ? 2 : conceptId === 987 ? 1 : 0
const betterConcept = (left: number, right: number) => mealCountFor(right) > mealCountFor(left) ? right : left || right

export const readSummerStudentsFromBridge = async (plantelValue: unknown, cycleValue: unknown, conceptsValue: unknown) => {
  const plantel = normalizeSummerPlantel(plantelValue)
  const cycle = clean(cycleValue || '2026', 20).match(/\d{4}/)?.[0] || '2026'
  const concepts = parseSummerConcepts(conceptsValue)
  if (!plantel) throw createError({ statusCode: 400, statusMessage: 'PLANTEL_INVALID', message: 'El plantel no es válido.' })
  const placeholders = concepts.map(() => '?').join(',')

  const rows = await runWithBridgeAgentId(plantel, async () => {
    const paid = await query<any[]>(`
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
    `, [plantel, cycle, ...concepts]).catch(() => [])

    const charged = await query<any[]>(`
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
    `, [plantel, cycle, ...concepts]).catch(() => [])

    return [...paid, ...charged]
  })

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

  let centralReachable = true
  let overlays = new Map<string, any>()
  try {
    overlays = await fetchCentralMatriculaOverlays(Array.from(merged.keys()))
  } catch (error: any) {
    centralReachable = false
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
      plantel,
      cycle,
      concepts,
      total: data.length,
      generatedAt: new Date().toISOString(),
      bridgeReachable: true,
      centralReachable,
      partial: !centralReachable,
      source: 'aurora-summer-bridge'
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
