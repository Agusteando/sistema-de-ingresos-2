type ManagerRequestOptions = {
  method?: 'GET' | 'POST'
  refresh?: boolean
}

const normalizeManagerUrl = (value: unknown) => String(value || 'http://127.0.0.1:8790').trim().replace(/\/+$/, '')

export const isLocalSystemRuntime = () => {
  const config = useRuntimeConfig()
  return String(process.env.LOCAL_SYSTEM_MODE || config.localSystemMode || '').toLowerCase() === 'true'
}


const boolValue = (value: unknown, fallback = false) => {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

export const isLocalSystemAutoUpdateEnabled = () => {
  if (!isLocalSystemRuntime()) return false
  const explicit = String(process.env.LOCAL_SYSTEM_AUTO_UPDATE || '').trim()
  if (explicit) return boolValue(explicit, false)
  // Existing agent installations already carry LOCAL_SYSTEM_AUTO_INSTALL.
  // Reuse it as the compatibility default so Aurora can apply later releases
  // automatically without modifying the bridge agent.
  return boolValue(process.env.LOCAL_SYSTEM_AUTO_INSTALL, true)
}

export const localSystemAutoUpdateIntervalMs = () => {
  const value = Number(process.env.LOCAL_SYSTEM_CHECK_INTERVAL_MS || 300000)
  return Number.isFinite(value) && value >= 60000 ? Math.floor(value) : 300000
}

export const requestLocalSystemManager = async <T = any>(path: string, options: ManagerRequestOptions = {}): Promise<T> => {
  const config = useRuntimeConfig()
  const managerUrl = normalizeManagerUrl(process.env.LOCAL_SYSTEM_MANAGER_URL || config.localSystemManagerUrl)
  const token = String(process.env.LOCAL_SYSTEM_MANAGER_TOKEN || config.localSystemManagerToken || '').trim()

  if (!isLocalSystemRuntime()) {
    throw createError({ statusCode: 409, message: 'Esta instalación no está ejecutándose como Sistema Rápido.' })
  }

  if (!token) {
    throw createError({ statusCode: 503, message: 'El gestor de Sistema Rápido no está configurado.' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const suffix = options.refresh ? `${path.includes('?') ? '&' : '?'}refresh=1` : ''
    const response = await fetch(`${managerUrl}${path}${suffix}`, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-local-system-token': token
      },
      signal: controller.signal
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        message: payload?.message || payload?.error || 'No se pudo comunicar con el gestor de Sistema Rápido.'
      })
    }

    return payload as T
  } catch (error: any) {
    if (error?.statusCode) throw error
    throw createError({
      statusCode: 503,
      message: error?.name === 'AbortError'
        ? 'El gestor de Sistema Rápido tardó demasiado en responder.'
        : 'El gestor de Sistema Rápido no está disponible.'
    })
  } finally {
    clearTimeout(timeout)
  }
}
