import { fetchCentralMatriculaOverlay } from '../../../../utils/central-matricula-overlay'
import { getTrustedAuthUser } from '../../../../utils/auth-session'
import { parseCurp } from '../../../../../shared/utils/curp'

// SIAG remains authoritative for historical daycare presence. This is optional
// student metadata, never a dependency of financial or Control Escolar reads.
const SIAG_HISTORY_URL = 'https://siag.casitaapps.com/api/daycare-history/curp/'
const UNITS: Record<string, string> = {
  'U-0837': 'Casita Toluca',
  'U-1763': 'Desarrollo Calimaya',
  'U-0854': 'Desarrollo Metepec',
  'U-1674': 'Casita Ocoyoacac',
  'U-0842': 'Casita Metepec'
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const user = await getTrustedAuthUser(event)
  const matricula = String(getRouterParam(event, 'matricula') || '').trim().toUpperCase()
  if (!/^[A-Z0-9-]{2,32}$/.test(matricula)) {
    throw createError({ statusCode: 400, message: 'Matrícula inválida.' })
  }
  const overlay = await fetchCentralMatriculaOverlay(matricula)
  if (!overlay?.student) throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  const plantel = String(overlay.student.plantel || '').trim().toUpperCase()
  if (!user.isSuperAdmin && (!plantel || ![
    ...(user.plantelesList || []), ...(user.financialPlantelesList || [])
  ].map((item: string) => item.toUpperCase()).includes(plantel))) {
    throw createError({ statusCode: 403, message: 'Sin acceso al plantel.' })
  }

  const parsed = parseCurp(overlay.student.curp)
  if (!parsed.isValid) return { ok: true, found: false, unidades: [], reason: 'NO_VALID_CURP' }

  // The SAME existing Aurora token is reused by SIAG. Never send it to the browser.
  const token = String(process.env.AURORA_API_TOKEN || '').trim()
  if (!token) {
    console.warn('[DAYCARE_HISTORY] Aurora API token missing; optional enrichment disabled')
    return { ok: false, found: false, unidades: [], code: 'TOKEN_NOT_CONFIGURED' }
  }

  try {
    const response = await fetch(SIAG_HISTORY_URL + encodeURIComponent(parsed.normalized), {
      headers: { Accept: 'application/json', 'x-aurora-token': token },
      redirect: 'error',
      signal: AbortSignal.timeout(6000)
    })
    if (!response.ok) {
      console.warn('[DAYCARE_HISTORY] SIAG identity lookup failed', { status: response.status })
      return { ok: false, found: false, unidades: [], code: 'SIAG_HTTP_' + response.status }
    }
    const data: any = await response.json()
    if (data?.ok !== true || !Array.isArray(data.unidades)) {
      console.warn('[DAYCARE_HISTORY] SIAG identity lookup contract mismatch')
      return { ok: false, found: false, unidades: [], code: 'SIAG_CONTRACT_INVALID' }
    }
    const unidades = Array.from(new Set(
      data.unidades.map((item: any) => String(item?.code || '')).filter((code: string) => UNITS[code])
    )).map((code: string) => ({ code, nombre: UNITS[code] }))
    return { ok: true, found: unidades.length > 0, unidades, source: 'SIAG' }
  } catch (error: any) {
    // No PII or credentials in logs. Never interrupt student account operations.
    console.warn('[DAYCARE_HISTORY] SIAG historical lookup unavailable', {
      code: String(error?.name || 'UPSTREAM_ERROR').slice(0, 50)
    })
    return { ok: false, found: false, unidades: [], code: 'SIAG_UNAVAILABLE' }
  }
})
