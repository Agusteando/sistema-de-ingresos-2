import { proxyCfdiEvent } from '../../../utils/cfdi-proxy'

export default defineEventHandler(async (event) => {
  const id = encodeURIComponent(String(event.context.params?.id || ''))
  const format = encodeURIComponent(String(event.context.params?.format || 'pdf'))
  return proxyCfdiEvent(event, `downloadInvoice/${id}/${format}`)
})
