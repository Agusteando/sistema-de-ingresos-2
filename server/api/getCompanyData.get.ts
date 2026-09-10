import { proxyCfdiCompatEvent } from '../utils/cfdi-compat'

export default defineEventHandler(async (event) => {
  try {
    return await proxyCfdiCompatEvent(event, 'getCompanyData')
  } catch (error: any) {
    const status = Number(
      error?.statusCode
      || error?.status
      || error?.response?.status
      || error?.data?.providerStatus
      || 500,
    ) || 500
    const providerMessage = String(
      error?.data?.providerMessage
      || error?.data?.message
      || error?.statusMessage
      || error?.message
      || 'No se pudo consultar el perfil fiscal del alumno.',
    ).trim()

    console.error('[CFDI] No se pudo consultar el perfil fiscal', {
      matricula: String(getQuery(event)?.matricula || '').trim(),
      status,
      message: providerMessage,
    })
    setResponseStatus(event, status)
    setHeader(event, 'content-type', 'application/json; charset=utf-8')
    setHeader(event, 'cache-control', 'private, no-store')
    return {
      success: false,
      error: providerMessage,
      message: providerMessage,
      providerMessage,
      providerStatus: status,
      data: null,
    }
  }
})
