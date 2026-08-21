import { OAuth2Client } from 'google-auth-library'
import { assertAuroraExternalApiToken } from './external-api-auth'

const LEGACY_TALLERES_GOOGLE_CLIENT_ID = '182000980506-g7e79r026td38bsiipnttp36osl28hvb.apps.googleusercontent.com'
const DEFAULT_DOMAIN = 'casitaiedis.edu.mx'
const client = new OAuth2Client()

const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

export const setTalleresPortalCors = (event: any) => {
  const origin = clean(getHeader(event, 'origin'), 1000)
  const config = useRuntimeConfig() as any
  const configured = clean(process.env.TALLERES_PORTAL_ORIGINS || config.talleresPortalOrigins, 4000)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const allowedOrigin = configured.length
    ? (origin && configured.includes(origin) ? origin : '')
    : '*'

  if (allowedOrigin) setResponseHeader(event, 'Access-Control-Allow-Origin', allowedOrigin)
  setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS')
  setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, X-Google-ID-Token, Authorization, X-Aurora-Token, X-API-Key')
  setResponseHeader(event, 'Access-Control-Max-Age', '86400')
  setResponseHeader(event, 'Vary', 'Origin')
}

const verifyGooglePortalUser = async (event: any) => {
  const token = clean(getHeader(event, 'x-google-id-token'), 10000)
  if (!token) return null

  const config = useRuntimeConfig() as any
  const configuredClientId = clean(process.env.TALLERES_GOOGLE_CLIENT_ID || config.talleresGoogleClientId, 500)
  const audiences = Array.from(new Set([configuredClientId, LEGACY_TALLERES_GOOGLE_CLIENT_ID].filter(Boolean)))
  let payload: any = null
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: audiences })
    payload = ticket.getPayload()
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'TALLERES_GOOGLE_TOKEN_INVALID', message: 'La sesión de Google no es válida o expiró.' })
  }
  const email = clean(payload?.email, 255).toLowerCase()
  const domain = clean(process.env.TALLERES_ALLOWED_DOMAIN || config.talleresAllowedDomain || DEFAULT_DOMAIN, 255).toLowerCase()

  if (!payload?.email_verified || !email || !email.endsWith(`@${domain}`)) {
    throw createError({ statusCode: 403, statusMessage: 'TALLERES_FORBIDDEN', message: 'La cuenta no está autorizada para Portal Tallerista.' })
  }

  return {
    email,
    name: clean(payload?.name, 255),
    googleId: clean(payload?.sub, 255),
    authSource: 'google' as const,
  }
}

export const assertTalleresPortalAccess = async (event: any) => {
  setTalleresPortalCors(event)

  const googleUser = await verifyGooglePortalUser(event)
  if (googleUser) return googleUser

  // Server-to-server consumers may use Aurora's normal external API token contract.
  assertAuroraExternalApiToken(event)
  return {
    email: 'external-api',
    name: 'External API',
    googleId: '',
    authSource: 'api-token' as const,
  }
}
