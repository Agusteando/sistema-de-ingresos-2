import { readConceptosCatalog } from '../../utils/conceptos-config'
import { runWithBridgeAgentId } from '../../utils/db'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0, must-revalidate')
  const { source = 'local', ciclo = '', q = '', limit = '250' } = getQuery(event)
  const normalizedSource = String(source) === 'central' ? 'central' : 'local'
  return await readConceptosCatalog(normalizedSource, {
    ciclo: String(ciclo || ''),
    q: String(q || ''),
    limit: Number(limit || 250)
  })
}))
