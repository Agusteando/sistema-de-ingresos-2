import type { IntegrationRoute } from './dx-discovery'
import { tokenForHeader } from './dx-api-lab'
import { dxProbeId } from './dx-usage'
import { studentStats } from '../../shared/utils/dxDiscovery.mjs'
import { normalizeExternalControlEscolarPlantel, controlEscolarBridgeAgentCandidates } from './control-escolar-plantel-routing'
import { TALLERES_SNAPSHOT_PLANTELES } from './talleres-snapshot'

export const integrationAuthorizedPlanteles = (planteles: string[]) => [...new Set(planteles.flatMap(plantel => [plantel, normalizeExternalControlEscolarPlantel(plantel), ...controlEscolarBridgeAgentCandidates(plantel)]).filter(Boolean))]
export const integrationPlantelAliases = (planteles: string[]) => Object.fromEntries(planteles.map(plantel => [plantel, normalizeExternalControlEscolarPlantel(plantel) || plantel]))

// Read adapters are a safety boundary, not an inventory. Only collection
// contracts that enforce a plantel filter may be actively read by this screen.
export const canInspectRosterRoute = (route: IntegrationRoute) => route.method === 'GET'
  && /^\/api\/external\/v\d+\/(?:control-escolar\/(?:operator-roster|students)|talleres\/roster)$/.test(route.path)

export const inspectIntegrationRoster = async (event: any, route: IntegrationRoute, planteles: string[], ciclo: string) => {
  if (!canInspectRosterRoute(route)) throw createError({ statusCode: 405, message: 'Esta ruta no permite una lectura de padrón desde el explorador.' })
  const header = route.path.includes('/talleres/') ? 'x-aurora-token' : 'x-api-key'
  const token = tokenForHeader(header)
  if (!token) throw createError({ statusCode: 503, message: 'No está disponible la credencial de lectura de Aurora.' })
  const rows: any[] = [], errors: any[] = [], campuses: Record<string, any> = {}
  // Public academic scopes use PREET/PREEM while the operator agents may be
  // CT/CM. Reuse the producer's routing, and never probe unsupported scopes.
  planteles = route.path.includes('/control-escolar/')
    ? [...new Set(planteles.map(normalizeExternalControlEscolarPlantel).filter(Boolean))]
    : planteles.filter(plantel => TALLERES_SNAPSHOT_PLANTELES.includes(plantel))
  let cursorIndex = 0, incomplete = false
  await Promise.all(Array.from({ length: Math.min(2, planteles.length) }, async () => {
    while (cursorIndex < planteles.length) {
      const plantel = planteles[cursorIndex++]
      const campusRows: any[] = []
      let cursor = '', meta: any = {}
      try {
        for (let page = 0; page < 50; page++) {
          const params = new URLSearchParams({ plantel, ciclo, limit: '500', status: 'inscrito', ...(cursor ? { cursor } : {}) })
          const payload = await event.$fetch(route.path + '?' + params.toString(), { method: 'GET', headers: { Accept: 'application/json', [header]: token, 'x-aurora-dx-probe': dxProbeId }, timeout: 60000, retry: 0 })
          meta = payload.meta || {}
          const result = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.students) ? payload.students : []
          // A collection adapter must not leak another campus, even if an
          // upstream contract accidentally returns an unfiltered response.
          campusRows.push(...result.filter((row: any) => String(row.plantel || plantel).toUpperCase() === plantel))
          cursor = String(payload.pagination?.nextCursor || meta.nextCursor || '')
          if (!cursor) break
          if (page === 49) incomplete = true
        }
        if (rows.length + campusRows.length > 25000) incomplete = true
        rows.push(...campusRows.slice(0, Math.max(0, 25000 - rows.length)))
        const source = (meta.sources || []).find?.((item: any) => item.plantel === plantel) || {}
        campuses[plantel] = { ...studentStats(campusRows), observedAt: new Date().toISOString(), source: meta.provenance?.flow || source.source || meta.source || null,
          generatedAt: meta.provenance?.cacheRefreshedAt || source.generatedAt || meta.snapshotAt || null }
      } catch (error: any) { incomplete = true; errors.push({ plantel, code: String(error?.data?.data?.code || error?.data?.statusMessage || error?.statusCode || 'SOURCE_UNAVAILABLE').slice(0, 120) }) }
    }
  }))
  if (rows.length > 25000) incomplete = true
  return { rows: rows.slice(0, 25000), incomplete, errors, campuses, measuredAt: new Date().toISOString() }
}
