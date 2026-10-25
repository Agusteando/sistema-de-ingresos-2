import { resolveControlEscolarAuth } from '../../../utils/control-escolar'
import { runDxApiRequest, DX_API_ENDPOINTS } from '../../../utils/dx-api-lab'
import { DX_DATASETS, DX_CONSUMERS, dxRosterStats } from '../../../utils/dx-integration-explorer'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const input = await readBody(event)
  const { agentId } = await resolveControlEscolarAuth(event, input?.plantel)
  const ciclo = String(input?.ciclo || '').trim()
  if (!/^\d{4}(?:-\d{4})?$/.test(ciclo)) throw createError({ statusCode: 400, message: 'Ciclo inválido.' })

  // One scoped, bounded request per UNIQUE data contract; never one per app.
  // It is a read-only diagnostic. No warm-up, Bridge wake-up or automatic writes.
  const sources = await Promise.all(DX_DATASETS.map(async (dataset) => {
    try {
      const result = await runDxApiRequest(event, {
        ...(dataset.simulationId ? { simulationId: dataset.simulationId } : { endpointId: dataset.endpointId }),
        params: { plantel: agentId, ciclo, status: 'inscrito', limit: '500' }
      })
      const meta = result.meta || {}
      return {
        id: dataset.id, label: dataset.label, endpointId: dataset.endpointId,
        endpoint: DX_API_ENDPOINTS.find(e => e.id === dataset.endpointId)?.path,
        scope: dataset.scope, origin: dataset.origin,
        ok: Boolean(result.ok), status: result.status, error: result.error || null,
        stats: result.ok ? dxRosterStats(result.rows || [], dataset.scope) : null,
        incomplete: Boolean(result.truncated),
        // generatedAt on operator-roster is the response time, NOT a cache freshness claim.
        snapshotAt: dataset.id === 'operator' ? null : (meta.snapshotAt || meta.cachedAt || meta.generatedAt || null),
        responseAt: meta.generatedAt || null,
        upstreamAt: meta.sourceUpdatedAt || meta.lastSourceReadAt || null,
        originReported: result.source || meta.source || null,
        fallback: result.fallback ?? meta.fallback ?? null,
        requests: result.pages || 0
      }
    } catch (error: any) {
      return {
        id: dataset.id, label: dataset.label, endpointId: dataset.endpointId,
        endpoint: DX_API_ENDPOINTS.find(e => e.id === dataset.endpointId)?.path,
        scope: dataset.scope, origin: dataset.origin,
        ok: false, status: Number(error?.statusCode || 503),
        error: { code: 'DX_SOURCE_UNAVAILABLE', message: String(error?.message || 'No disponible').slice(0, 180) },
        stats: null, incomplete: false, snapshotAt: null, responseAt: null, upstreamAt: null,
        originReported: null, fallback: null, requests: 0
      }
    }
  }))
  return {
    plantel: agentId, ciclo, measuredAt: new Date().toISOString(),
    sources, consumers: DX_CONSUMERS,
    // Routes absent from DX's old hand-maintained list are explicitly included
    // through DX_API_ENDPOINTS; unknown consumers stay unknown.
    endpoints: DX_API_ENDPOINTS.map(({ id, path, method, group, label, runnable }) =>
      ({ id, path, method, group, label, runnable }))
  }
})
