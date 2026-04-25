import { getExternalSyncConfig, buildExternalHeaders } from '../../../utils/externalBaseSync'

const memoryCache = new Map<string, { url: string | null, expiresAt: number }>()

export default defineEventHandler(async (event) => {
  const matriculaRaw = event.context.params?.matricula
  const matricula = String(matriculaRaw || '').trim().toUpperCase()
  
  if (!matricula) return { matricula: '', photoUrl: null }

  const now = Date.now()
  const cached = memoryCache.get(matricula)
  if (cached && cached.expiresAt > now) {
    return { matricula, photoUrl: cached.url }
  }

  const syncConfig = getExternalSyncConfig()
  if (!syncConfig.apiKey) {
    return { matricula, photoUrl: null }
  }

  const externalUrl = `https://matricula.casitaapps.com/api/students/${encodeURIComponent(matricula)}/photo?format=json`
  const headers = buildExternalHeaders(syncConfig)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(externalUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json().catch(() => null)
      const photoUrl = data?.photoUrl || null
      const ttl = photoUrl ? 86400000 : 300000
      
      memoryCache.set(matricula, { url: photoUrl, expiresAt: now + ttl })
      return { matricula, photoUrl }
    } else {
      memoryCache.set(matricula, { url: null, expiresAt: now + 300000 })
      return { matricula, photoUrl: null }
    }

  } catch (error) {
    memoryCache.set(matricula, { url: null, expiresAt: now + 60000 })
    return { matricula, photoUrl: null }
  }
})