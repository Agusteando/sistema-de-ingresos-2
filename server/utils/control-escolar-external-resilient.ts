import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { getExternalStudentPlanteles } from './control-escolar-external-view'
import { readExternalSnapshotStudents } from './control-escolar-external-snapshot'
import { normalizeExternalControlEscolarPlantel } from './control-escolar-plantel-routing'

const clean = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const normalizeSearch = (value: unknown) => clean(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const canonicalMatricula = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')

const publicFailure = (error: any) => ({
  statusCode: Number(error?.statusCode || error?.status || error?.response?.status || 500) || 500,
  code: clean(error?.data?.code || error?.code || error?.statusMessage || error?.name || 'AURORA_ERROR', 120),
  message: clean(error?.message || error?.statusMessage || 'Aurora no pudo consultar el snapshot central solicitado.', 700)
})

const readOneScope = async (query: any, plantel: string) => {
  try {
    return await readExternalSnapshotStudents({ ...query, plantel })
  } catch (error: any) {
    throw createError({
      statusCode: Number(error?.statusCode || 503) || 503,
      statusMessage: error?.statusMessage || 'AURORA_STUDENT_SCOPE_UNAVAILABLE',
      message: `Aurora no pudo consultar el snapshot central de ${plantel}.`,
      data: {
        code: error?.data?.code || error?.statusMessage || 'AURORA_STUDENT_SCOPE_UNAVAILABLE',
        plantel,
        ciclo: normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || ''),
        source: 'central-snapshot',
        snapshot: publicFailure(error)
      }
    })
  }
}

const rankRows = (rows: any[], query: any) => {
  const needle = normalizeSearch(query.search || query.q || '')
  if (!needle) return rows
  const tokens = needle.split(/\s+/).filter(Boolean)

  const score = (row: any) => {
    const matricula = normalizeSearch(row?.matricula)
    const name = normalizeSearch(row?.nombreCompleto || row?.fullName)
    const haystack = normalizeSearch([
      row?.matricula,
      row?.nombreCompleto,
      row?.fullName,
      row?.curp,
      row?.padre?.nombreCompleto,
      row?.madre?.nombreCompleto
    ].filter(Boolean).join(' '))

    if (matricula === needle) return 0
    if (matricula.startsWith(needle)) return 1
    if (name === needle) return 2
    if (name.startsWith(needle)) return 3
    if (tokens.length > 1 && tokens.every((token) => haystack.includes(token))) return 4
    if (haystack.includes(needle)) return 5
    return 20
  }

  return [...rows].sort((left, right) =>
    score(left) - score(right)
    || normalizeSearch(left?.nombreCompleto || left?.fullName)
      .localeCompare(normalizeSearch(right?.nombreCompleto || right?.fullName), 'es')
  )
}

const dedupeRows = (rows: any[]) => {
  const unique = new Map<string, any>()
  for (const row of rows) {
    const key = canonicalMatricula(row?.matricula)
      || `${normalizeSearch(row?.nombreCompleto || row?.fullName)}|${clean(row?.plantel, 30).toUpperCase()}`
    if (!key || unique.has(key)) continue
    unique.set(key, row)
  }
  return Array.from(unique.values())
}

/**
 * External Control Escolar reads are intentionally central-snapshot only.
 * Bridge traffic belongs to the background snapshot producer, never to an
 * API consumer request.
 */
export const readExternalResilientStudents = async (_event: any, query: any = {}) => {
  const requestedPlantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  if (requestedPlantel) return await readOneScope(query, requestedPlantel)

  const search = clean(query.search || query.q, 120)
  if (!search) {
    throw createError({
      statusCode: 400,
      statusMessage: 'PLANTEL_OR_SEARCH_REQUIRED',
      message: 'Indica un plantel para listar alumnos o una búsqueda para consultar globalmente.'
    })
  }

  const planteles = getExternalStudentPlanteles()
  const requestedLimit = Math.min(100, Math.max(1, Number(query.limit || 25) || 25))
  const perScopeLimit = Math.min(100, Math.max(requestedLimit, 25))
  const settled = await Promise.allSettled(
    planteles.map((plantel) => readOneScope({ ...query, limit: perScopeLimit }, plantel))
  )

  const successful: Array<{ plantel: string; response: any }> = []
  const failed: Array<{ plantel: string; error: any }> = []
  settled.forEach((result, index) => {
    const plantel = planteles[index]
    if (result.status === 'fulfilled') successful.push({ plantel, response: result.value })
    else failed.push({ plantel, error: publicFailure(result.reason) })
  })

  if (!successful.length) {
    throw createError({
      statusCode: 503,
      statusMessage: 'AURORA_GLOBAL_STUDENT_SEARCH_UNAVAILABLE',
      message: 'Aurora no tiene snapshots centrales disponibles para la búsqueda global de alumnos.',
      data: {
        code: 'AURORA_GLOBAL_STUDENT_SEARCH_UNAVAILABLE',
        ciclo: normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || ''),
        source: 'central-snapshot',
        failedScopes: failed
      }
    })
  }

  const rows = rankRows(
    dedupeRows(successful.flatMap(({ response }) => Array.isArray(response?.data) ? response.data : [])),
    query
  ).slice(0, requestedLimit)

  return {
    data: rows,
    pagination: {
      limit: requestedLimit,
      nextCursor: null,
      total: rows.length
    },
    catalogs: successful.length === 1 ? successful[0].response?.catalogs || null : null,
    meta: {
      version: 'v1',
      source: 'aurora-global-central-snapshot-search',
      ciclo: normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || ''),
      partial: failed.length > 0,
      searchedPlanteles: planteles,
      successfulScopes: successful.map(({ plantel, response }) => ({
        plantel,
        source: response?.meta?.source || 'aurora-control-escolar-central-snapshot',
        rows: Array.isArray(response?.data) ? response.data.length : 0,
        freshness: response?.meta?.freshness || null,
        generatedAt: response?.meta?.generatedAt || null
      })),
      failedScopes: failed
    }
  }
}
