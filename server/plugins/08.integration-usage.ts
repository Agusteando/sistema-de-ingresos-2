import { getRequestURL, getHeader, getResponseStatus, getQuery } from 'h3'
import { readIntegrationRoutes } from '../utils/dx-discovery'
import { dxProbeId, rememberIntegrationUse } from '../utils/dx-usage'
import { findIntegrationRoute, studentStats } from '../../shared/utils/dxDiscovery.mjs'

export default defineNitroPlugin(async (app) => {
  const routes = await readIntegrationRoutes()
  const observe = (event: any, response: any, status?: number) => {
    try {
      if (!event || event.context?.auroraIntegrationObserved) return
      const path = getRequestURL(event).pathname
      if (!path.startsWith('/api/external/')) return
      const route = findIntegrationRoute(routes, path, event.method)
      if (!route) return
      let body: any = response.body
      if (typeof body === 'string') { try { body = JSON.parse(body) } catch { return } }
      const rows = [body?.data, body?.students, body?.rows].find(Array.isArray) || []
      const query = getQuery(event), meta = body?.meta || {}
      const campuses = new Set<string>(rows.map((row: any) => String(row?.plantel || '').trim().toUpperCase()).filter(Boolean))
      const requested = String(meta.plantel || query.plantel || '').trim().toUpperCase().slice(0, 40)
      if (requested && !campuses.size) campuses.add(requested)
      // Global calls retain activity without leaking unscoped totals to a campus user.
      if (!campuses.size) campuses.add('GLOBAL')
      let origin = ''
      try { origin = new URL(String(getHeader(event, 'origin') || '')).hostname.toLowerCase() } catch {}
      for (const plantel of campuses) {
        const campusRows = rows.filter((row: any) => String(row?.plantel || requested).toUpperCase() === plantel)
        const sourceMeta = (meta.sources || []).find?.((source: any) => source.plantel === plantel) || {}
        const record = {
          at: new Date().toISOString(), routeId: route.id, plantel,
          ciclo: String(query.ciclo || meta.ciclo || '').slice(0, 20), status: status || getResponseStatus(event),
          origin, credential: event.context.auroraExternalCredential || '',
          probe: getHeader(event, 'x-aurora-dx-probe') === dxProbeId,
          stats: campusRows.length || Array.isArray(body?.data) || Array.isArray(body?.students) ? studentStats(campusRows) : null,
          source: String(meta.provenance?.flow || sourceMeta.source || meta.source || body?.source || '').slice(0, 160),
          snapshotAt: meta.provenance?.cacheRefreshedAt || sourceMeta.generatedAt || meta.snapshotAt || meta.sourceUpdatedAt || null,
          partial: Boolean(body?.pagination?.nextCursor || meta.nextCursor),
          errorCode: String(body?.data?.code || body?.code || body?.statusMessage || '').slice(0, 120),
          requestId: event.context.auroraRequestId || ''
        }
        rememberIntegrationUse(record)
        console.info('[AuroraIntegration] ' + JSON.stringify(record))
      }
      event.context.auroraIntegrationObserved = true
    } catch { /* Observability must never affect the production response. */ }
  }
  app.hooks.hook('beforeResponse', (event, response) => observe(event, response))
  // Nitro's error renderer can bypass beforeResponse. Preserve failed reads,
  // using the thrown status rather than the not-yet-written HTTP status.
  app.hooks.hook('error', (error: any, context: any = {}) => {
    observe(context.event, { body: { data: error?.data, statusMessage: error?.statusMessage } }, Number(error?.statusCode || error?.status || 500))
  })
})
