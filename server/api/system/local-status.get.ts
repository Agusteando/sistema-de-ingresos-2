import { requestLocalSystemManager } from '../../utils/local-system-manager'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  return await requestLocalSystemManager('/status', {
    refresh: String(query.refresh || '') === '1'
  })
})
