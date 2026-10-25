import { resolveControlEscolarAuth } from '../../../utils/control-escolar'
import { runDxApiRequest } from '../../../utils/dx-api-lab'
import { DX_DATASETS } from '../../../utils/dx-integration-explorer'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const input = await readBody(event)
  const { agentId } = await resolveControlEscolarAuth(event, input?.plantel)
  const ciclo = String(input?.ciclo || '').trim()
  if (!/^\d{4}(?:-\d{4})?$/.test(ciclo)) throw createError({ statusCode: 400, message: 'Ciclo inválido.' })
  const dataset = DX_DATASETS.find(item => item.id === input?.dataset)
  if (!dataset) throw createError({ statusCode: 400, message: 'Origen DX no reconocido.' })
  const result = await runDxApiRequest(event, {
    ...(dataset.simulationId ? { simulationId: dataset.simulationId } : { endpointId: dataset.endpointId }),
    params: { plantel: agentId, ciclo, status: 'inscrito', limit: '500' }
  })
  return {
    dataset: dataset.id, ok: Boolean(result.ok), status: result.status,
    error: result.error || null, rows: result.ok ? result.rows : [],
    incomplete: Boolean(result.truncated), meta: result.meta || {},
    measuredAt: new Date().toISOString()
  }
})
