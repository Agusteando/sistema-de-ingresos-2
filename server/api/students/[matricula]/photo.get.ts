import crypto from 'node:crypto'
import { query } from '../../../utils/db'

type PhotoCacheEntry = {
  matricula: string
  photoUrl: string
  etag: string
  expiresAt: number
}

const SUCCESS_TTL_MS = 1000 * 60 * 60 * 6
const NOT_FOUND_MAX_AGE_SECONDS = 60
const CLIENT_MAX_AGE_SECONDS = 900

const photoCache = new Map<string, PhotoCacheEntry>()
const pendingLookups = new Map<string, Promise<PhotoCacheEntry | null>>()

const normalizeMatricula = (value: unknown) => String(value || '').trim().toUpperCase()

const isValidMatricula = (value: string) => {
  return value.length > 0 && value.length <= 64 && /^[A-Z0-9][A-Z0-9_-]*$/.test(value)
}

const getPhotoBaseUrl = (event: any) => {
  const config = useRuntimeConfig() as any
  const configured = String(config.studentPhotoBaseUrl || '').trim()
  if (configured) return configured.replace(/\/+$/, '')

  return 'https://matricula.casitaapps.com'
}

const encodePath = (value: string) => {
  return value
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

const resolvePhotoUrl = (event: any, rawValue: unknown) => {
  const value = String(rawValue || '').trim()
  if (!value) return null

  if (/^https?:\/\//i.test(value)) {
    return value
  }

  if (value.startsWith('//')) {
    return `https:${value}`
  }

  const baseUrl = getPhotoBaseUrl(event)

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

const cacheHeaders = (event: any, entry?: PhotoCacheEntry | null) => {
  if (entry) {
    setResponseHeader(event, 'ETag', entry.etag)
    setResponseHeader(
      event,
      'Cache-Control',
      `private, max-age=${CLIENT_MAX_AGE_SECONDS}, stale-while-revalidate=3600`
    )
    return
  }

  setResponseHeader(event, 'Cache-Control', `private, max-age=${NOT_FOUND_MAX_AGE_SECONDS}`)
}

const jsonError = (event: any, statusCode: number, code: string, message: string, extra: Record<string, any> = {}) => {
  setResponseStatus(event, statusCode)
  if (statusCode === 404) {
    cacheHeaders(event, null)
  } else {
    setResponseHeader(event, 'Cache-Control', 'no-store')
  }

  return {
    ok: false,
    error: { code, message },
    ...extra
  }
}

const queryActiveStudentPhoto = async (event: any, matricula: string): Promise<PhotoCacheEntry | null> => {
  const rows = await query<any[]>(
    `
      SELECT b.matricula, m.foto
      FROM base b
      INNER JOIN \`matricula\` m
        ON UPPER(TRIM(m.matricula)) = UPPER(TRIM(b.matricula))
      WHERE UPPER(TRIM(b.matricula)) = ?
        AND b.estatus = 'Activo'
        AND m.foto IS NOT NULL
        AND TRIM(m.foto) != ''
      ORDER BY b.id DESC
      LIMIT 1
    `,
    [matricula]
  )

  const photoUrl = resolvePhotoUrl(event, rows[0]?.foto)
  if (!photoUrl) return null

  return {
    matricula,
    photoUrl,
    etag: createEtag(matricula, photoUrl),
    expiresAt: Date.now() + SUCCESS_TTL_MS
  }
}

const resolveEntry = async (event: any, matricula: string, refresh: boolean) => {
  const cached = photoCache.get(matricula)

  if (!refresh && cached && cached.expiresAt > Date.now()) {
    return cached
  }

  const pending = pendingLookups.get(matricula)
  if (pending) {
    return await pending
  }

  const lookup = queryActiveStudentPhoto(event, matricula)
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
  const paramsMatricula = event.context.params?.matricula
  const requestQuery = getQuery(event)
  const matricula = normalizeMatricula(paramsMatricula)
  const wantsJson = String(requestQuery.format || '').toLowerCase() === 'json'
  const refresh = String(requestQuery.refresh || '') === '1'

  if (!isValidMatricula(matricula)) {
    return jsonError(event, 400, 'INVALID_MATRICULA', 'Matricula invalida.', { matricula })
  }

  try {
    const entry = await resolveEntry(event, matricula, refresh)

    if (!entry) {
      return jsonError(event, 404, 'PHOTO_NOT_FOUND', 'No hay foto activa para esta matricula.', { matricula })
    }

    cacheHeaders(event, entry)

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
    console.error('[StudentPhoto] Error resolving photo', {
      matricula,
      message: error?.message,
      code: error?.code
    })

    return jsonError(event, 500, 'PHOTO_LOOKUP_FAILED', 'No se pudo resolver la foto del alumno.', { matricula })
  }
})
