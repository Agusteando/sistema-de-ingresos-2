import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { readExternalLiveStudents } from './control-escolar-external-live'
import {
  getExternalStudentPlanteles,
  readExternalControlEscolarStudents,
} from './control-escolar-external-view'
import { normalizeExternalControlEscolarPlantel } from './control-escolar-plantel-routing'

const clean = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const normalizeSearch = (value: unknown) => clean(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const canonicalMatricula = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')

const publicFailure = (error: any) => ({
  statusCode: Number(error?.statusCode || error?.status || error?.response?.status || 500) || 500,
  code: clean(error?.data?.code || error?.code || error?.statusMessage || error?.name || 'AURORA_ERROR', 120),
  message: clean(error?.message || error?.statusMessage || 'Aurora no pudo consultar el origen solicitado.', 700),
})

const withFallbackMeta = (response: any, liveError: any) => ({
  ...(response || {}),
  meta: {
    ...(response?.meta || {}),
    source: 'warm-cache-fallback',
    fallback: true,
    liveFailure: publicFailure(liveError),
  },
})

const readOneScope = async (event: any, query: any, plantel: string) => {
  const scopedQuery = { ...query, plantel }
  try {
    const response = await readExternalLiveStudents(event, scopedQuery)
    return {
      ...(response || {}),
      meta: {
        ...(response?.meta || {}),
        source: response?.meta?.source || 'aurora-control-escolar-live',
        fallback: false,
      },
    }
  } catch (liveError: any) {
    try {
      const cached = await readExternalControlEscolarStudents(scopedQuery)
      return withFallbackMeta(cached, liveError)
    } catch (cacheError: any) {
      throw createError({
        statusCode: 502,
        statusMessage: 'AURORA_STUDENT_SCOPE_UNAVAILABLE',
        message: `Aurora no pudo consultar ${plantel} ni desde el Bridge live ni desde el snapshot de respaldo.`,
        data: {
          code: 'AURORA_STUDENT_SCOPE_UNAVAILABLE',
          plantel,
          ciclo: normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || ''),
          live: publicFailure(liveError),
          fallback: publicFailure(cacheError),
        },
      })
    }
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
      row?.madre?.nombreCompleto,
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
    || normalizeSearch(left?.nombreCompleto || left?.fullName).localeCompare(normalizeSearch(right?.nombreCompleto || right?.fullName), 'es')
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
 * External Control Escolar read contract used by server-to-server consumers.
 *
 * - Scoped reads prefer the live Bridge but transparently fall back to Aurora's
 *   already-existing warm student view when the Bridge is unavailable.
 * - Search without a plantel is owned by Aurora: all canonical scopes are
 *   queried concurrently, partial scope failures do not destroy valid matches,
 *   and results are deduplicated/ranked before returning to the consumer.
 */
export const readExternalResilientStudents = async (event: any, query: any = {}) => {
  const requestedPlantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  if (requestedPlantel) return await readOneScope(event, query, requestedPlantel)

  const search = clean(query.search || query.q, 120)
  if (!search) {
    throw createError({
      statusCode: 400,
      statusMessage: 'PLANTEL_OR_SEARCH_REQUIRED',
      message: 'Indica un plantel para listar alumnos o una búsqueda para consultar globalmente.',
    })
  }

  const planteles = getExternalStudentPlanteles()
  const requestedLimit = Math.min(100, Math.max(1, Number(query.limit || 25) || 25))
  const perScopeLimit = Math.min(100, Math.max(requestedLimit, 25))
  const settled = await Promise.allSettled(
    planteles.map((plantel) => readOneScope(event, { ...query, limit: perScopeLimit }, plantel))
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
      statusCode: 502,
      statusMessage: 'AURORA_GLOBAL_STUDENT_SEARCH_UNAVAILABLE',
      message: 'Aurora no pudo consultar ningún plantel para la búsqueda global de alumnos.',
      data: {
        code: 'AURORA_GLOBAL_STUDENT_SEARCH_UNAVAILABLE',
        ciclo: normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || ''),
        failedScopes: failed,
      },
    })
  }

  const rows = rankRows(
    dedupeRows(successful.flatMap(({ response }) => Array.isArray(response?.data) ? response.data : [])),
    query,
  ).slice(0, requestedLimit)

  return {
    data: rows,
    pagination: {
      limit: requestedLimit,
      nextCursor: null,
      total: rows.length,
    },
    catalogs: successful.length === 1 ? successful[0].response?.catalogs || null : null,
    meta: {
      version: 'v1',
      source: 'aurora-global-resilient-search',
      ciclo: normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || ''),
      partial: failed.length > 0,
      searchedPlanteles: planteles,
      successfulScopes: successful.map(({ plantel, response }) => ({
        plantel,
        source: response?.meta?.source || null,
        fallback: Boolean(response?.meta?.fallback),
        rows: Array.isArray(response?.data) ? response.data.length : 0,
      })),
      failedScopes: failed,
    },
  }
}
