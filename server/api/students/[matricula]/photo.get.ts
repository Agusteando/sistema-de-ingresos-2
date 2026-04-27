import crypto from 'node:crypto'
import { cleanApiKey } from '../../../utils/externalBaseSync'

type PhotoCacheEntry = {
  matricula: string
  photoUrl: string
  etag: string
  expiresAt: number
}

class ExternalPhotoError extends Error {
  statusCode: number
  code: string
  externalStatus?: number

  constructor(statusCode: number, code: string, message: string, externalStatus?: number) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.externalStatus = externalStatus
  }
}

const SUCCESS_TTL_MS = 1000 * 60 * 60 * 6
const CLIENT_MAX_AGE_SECONDS = 900
const NOT_FOUND_MAX_AGE_SECONDS = 60
const EXTERNAL_TIMEOUT_MS = 10000

const photoCache = new Map<string, PhotoCacheEntry>()
const pendingLookups = new Map<string, Promise<PhotoCacheEntry | null>>()

const normalizeMatricula = (value: unknown) => String(value || '').trim().toUpperCase()

const isValidMatricula = (value: string) => {
  return value.length > 0 && value.length <= 64 && /^[A-Z0-9][A-Z0-9_-]*$/.test(value)
}

const getPhotoBaseUrl = () => {
  const config = useRuntimeConfig() as any
  const configured = String(config.studentPhotoBaseUrl || '').trim()
  return (configured || 'https://matricula.casitaapps.com').replace(/\/+$/, '')
}

const getExternalApiKey = () => {
  const config = useRuntimeConfig() as any
  return cleanApiKey(config.studentPhotoApiKey || config.externalSyncApiKey)
}

const buildExternalPhotoUrl = (matricula: string) => {
  const url = new URL(`/api/students/${encodeURIComponent(matricula)}/photo`, getPhotoBaseUrl())
  url.searchParams.set('format', 'json')
  return url.toString()
}

const encodePath = (value: string) => {
  return value
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

const resolvePhotoUrl = (rawValue: unknown) => {
  const value = String(rawValue || '').trim()
  if (!value) return null

  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('//')) return `https:${value}`

  const baseUrl = getPhotoBaseUrl()

  if (value.startsWith('/')) {
    return new URL(value, baseUrl).toString()
  }

  const normalizedPath = value.replace(/\\/g, '/').replace(/^\.?\//, '')
  const hasDirectory = normalizedPath.includes('/')
  const path = hasDirectory ? `/${encodePath(normalizedPath)}` : `/uploads/${encodePath(normalizedPath)}`

  return new URL(path, baseUrl).toString()
}

const createEtag = (matricula: string, photoUrl: string) => {
  const hash = crypto.createHash('sha1').update(`${matricula}:${photoUrl}`).digest('hex')
  return `"student-photo-${hash}"`
}

const setCacheHeaders = (event: any, entry?: PhotoCacheEntry | null) => {
  if (entry) {
    setResponseHeader(event, 'ETag', entry.etag)
    setResponseHeader(event, 'Cache-Control', `private, max-age=${CLIENT_MAX_AGE_SECONDS}, stale-while-revalidate=3600`)
    return
  }

  setResponseHeader(event, 'Cache-Control', `private, max-age=${NOT_FOUND_MAX_AGE_SECONDS}`)
}

const jsonError = (event: any, statusCode: number, code: string, message: string, extra: Record<string, any> = {}) => {
  setResponseStatus(event, statusCode)

  if (statusCode === 404) {
    setCacheHeaders(event, null)
  } else {
    setResponseHeader(event, 'Cache-Control', 'no-store')
  }

  return {
    ok: false,
    error: { code, message },
    ...extra
  }
}

const extractPhotoUrl = (payload: any) => {
  return resolvePhotoUrl(
    payload?.photoUrl ||
    payload?.url ||
    payload?.data?.photoUrl ||
    payload?.data?.url ||
    payload?.student?.photoUrl ||
    payload?.student?.foto
  )
}

const fetchExternalPhoto = async (matricula: string): Promise<PhotoCacheEntry | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS)
  const headers: Record<string, string> = { Accept: 'application/json' }
  const apiKey = getExternalApiKey()

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
    headers['x-api-key'] = apiKey
  }

  try {
    const response = await fetch(buildExternalPhotoUrl(matricula), {
      method: 'GET',
      headers,
      signal: controller.signal
    })

    if (response.status === 404) return null

    if (response.status === 401 || response.status === 403) {
      throw new ExternalPhotoError(
        502,
        'EXTERNAL_PHOTO_UNAUTHORIZED',
        'El servicio externo de matricula rechazo la consulta de foto.',
        response.status
      )
    }

    if (!response.ok) {
      throw new ExternalPhotoError(
        502,
        'EXTERNAL_PHOTO_FAILED',
        'El servicio externo de matricula no pudo resolver la foto.',
        response.status
      )
    }

    const payload = await response.json().catch(() => null)
    const photoUrl = extractPhotoUrl(payload)

    if (!photoUrl) return null

    return {
      matricula,
      photoUrl,
      etag: createEtag(matricula, photoUrl),
      expiresAt: Date.now() + SUCCESS_TTL_MS
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new ExternalPhotoError(504, 'EXTERNAL_PHOTO_TIMEOUT', 'Tiempo agotado consultando la foto externa.')
    }

    if (error instanceof ExternalPhotoError) throw error

    throw new ExternalPhotoError(502, 'EXTERNAL_PHOTO_FAILED', 'No se pudo consultar la foto externa.')
  } finally {
    clearTimeout(timeout)
  }
}

const resolveEntry = async (matricula: string, refresh: boolean) => {
  const cached = photoCache.get(matricula)

  if (!refresh && cached && cached.expiresAt > Date.now()) {
    return cached
  }

  const pending = pendingLookups.get(matricula)
  if (pending) {
    return await pending
  }

  const lookup = fetchExternalPhoto(matricula)
    .then(entry => {
      if (entry) {
        photoCache.set(matricula, entry)
      } else {
        photoCache.delete(matricula)
      }

      return entry
    })
    .finally(() => {
      pendingLookups.delete(matricula)
    })

  pendingLookups.set(matricula, lookup)
  return await lookup
}

export default defineEventHandler(async (event) => {
  const requestQuery = getQuery(event)
  const matricula = normalizeMatricula(event.context.params?.matricula)
  const wantsJson = String(requestQuery.format || '').toLowerCase() === 'json'
  const refresh = String(requestQuery.refresh || '') === '1'

  if (!isValidMatricula(matricula)) {
    return jsonError(event, 400, 'INVALID_MATRICULA', 'Matricula invalida.', { matricula })
  }

  try {
    const entry = await resolveEntry(matricula, refresh)

    if (!entry) {
      return jsonError(event, 404, 'PHOTO_NOT_FOUND', 'No hay foto disponible para esta matricula.', { matricula })
    }

    setCacheHeaders(event, entry)

    if (getRequestHeader(event, 'if-none-match') === entry.etag) {
      setResponseStatus(event, 304)
      return null
    }

    if (wantsJson) {
      return {
        ok: true,
        matricula,
        photoUrl: entry.photoUrl,
        etag: entry.etag,
        expiresAt: new Date(entry.expiresAt).toISOString()
      }
    }

    return sendRedirect(event, entry.photoUrl, 302)
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 502)
    const code = error?.code || 'EXTERNAL_PHOTO_FAILED'

    console.error('[StudentPhoto] External resolver failed', {
      matricula,
      code,
      externalStatus: error?.externalStatus,
      message: error?.message
    })

    return jsonError(
      event,
      statusCode,
      code,
      error?.message || 'No se pudo resolver la foto externa del alumno.',
      {
        matricula,
        externalStatus: error?.externalStatus
      }
    )
  }
})
