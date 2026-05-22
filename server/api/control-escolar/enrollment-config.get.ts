import { ENROLLMENT_CONFIG_TIMEOUT_MS, ENROLLMENT_CONFIG_URL, cleanApiKey } from '../../utils/externalBaseSync'

export default defineEventHandler(async () => {
  const config = useRuntimeConfig() as any
  const apiKey = cleanApiKey(config.externalSyncApiKey)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ENROLLMENT_CONFIG_TIMEOUT_MS)

  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
      headers['x-api-key'] = apiKey
    }

    const response = await fetch(ENROLLMENT_CONFIG_URL, {
      headers,
      cache: 'no-store',
      signal: controller.signal
    })

    if (!response.ok) {
      throw createError({ statusCode: response.status, message: 'No se pudo cargar la configuración de inscripción.' })
    }

    return await response.json()
  } catch (error: any) {
    throw createError({
      statusCode: error?.statusCode || (error?.name === 'AbortError' ? 504 : 502),
      message: error?.message || 'No se pudo cargar la configuración de inscripción.'
    })
  } finally {
    clearTimeout(timeout)
  }
})
