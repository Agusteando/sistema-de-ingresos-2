import { proxyCfdiEvent } from '../../../utils/cfdi-proxy'

export default defineEventHandler(async (event) => {
  const id = encodeURIComponent(String(event.context.params?.id || ''))
  return proxyCfdiEvent(event, `invoices/${id}/cancel`)
})
