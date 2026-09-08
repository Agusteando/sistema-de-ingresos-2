import { proxyCfdiCompatEvent } from '../../../utils/cfdi-compat'

export default defineEventHandler(async (event) => {
  const id = encodeURIComponent(String(event.context.params?.id || ''))
  const format = encodeURIComponent(String(event.context.params?.format || 'pdf'))
  return proxyCfdiCompatEvent(event, `downloadInvoice/${id}/${format}`)
})
