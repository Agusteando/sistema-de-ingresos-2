import { createHmac, timingSafeEqual } from 'node:crypto'
import { authCookieOptions } from './auth-cookie-options'

const AUTH_SESSION_COOKIE = 'auth_session_token'
const TOKEN_VERSION = 1
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export type SignedAuthSession = {
  v: number
  email: string
  name: string
  role: string
  planteles: string
  activePlantel: string
  homePlantel: string
  issuedAt: number
  expiresAt: number
}

type AuthSessionInput = Omit<SignedAuthSession, 'v' | 'issuedAt' | 'expiresAt'>

const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64url')
const decode = (value: string) => Buffer.from(value, 'base64url').toString('utf8')

const getAuthSessionSecret = () => {
  const config = useRuntimeConfig()
  const secret = String(
    config.authSessionSecret ||
    config.authImpersonationSecret ||
    config.localSystemManagerToken ||
    ''
  ).trim()

  if (secret.length < 32) {
    throw createError({
      statusCode: 503,
      message: 'La sesión segura requiere AUTH_SESSION_SECRET o AUTH_IMPERSONATION_SECRET con al menos 32 caracteres.'
    })
  }

  return secret
}

const signatureFor = (payload: string, secret: string) => createHmac('sha256', secret)
  .update(payload)
  .digest('base64url')

export const createAuthSessionToken = (
  input: AuthSessionInput,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS
) => {
  const now = Math.floor(Date.now() / 1000)
  const payload: SignedAuthSession = {
    v: TOKEN_VERSION,
    email: String(input.email || '').trim().toLowerCase(),
    name: String(input.name || '').trim(),
    role: String(input.role || '').trim(),
    planteles: String(input.planteles || '').trim(),
    activePlantel: String(input.activePlantel || '').trim().toUpperCase(),
    homePlantel: String(input.homePlantel || '').trim().toUpperCase(),
    issuedAt: now,
    expiresAt: now + maxAgeSeconds
  }

  if (!payload.email || !payload.role || !payload.activePlantel) {
    throw createError({ statusCode: 500, message: 'No se pudo crear una sesión segura válida.' })
  }

  const encodedPayload = encode(JSON.stringify(payload))
  const signature = signatureFor(encodedPayload, getAuthSessionSecret())
  return `${encodedPayload}.${signature}`
}

export const verifyAuthSessionToken = (value: unknown): SignedAuthSession => {
  const token = String(value || '').trim()
  const [encodedPayload, receivedSignature, ...extra] = token.split('.')
  if (!encodedPayload || !receivedSignature || extra.length) {
    throw createError({ statusCode: 401, message: 'La sesión no es válida. Inicia sesión nuevamente.', data: { diagnostic: { code: 'AUTH_SESSION_INVALID', source: 'auth_session', status: 401, retryable: false, message: 'La sesión no es válida. Inicia sesión nuevamente.' } } })
  }

  const expectedSignature = signatureFor(encodedPayload, getAuthSessionSecret())
  const received = Buffer.from(receivedSignature)
  const expected = Buffer.from(expectedSignature)
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw createError({ statusCode: 401, message: 'La sesión no es válida. Inicia sesión nuevamente.', data: { diagnostic: { code: 'AUTH_SESSION_INVALID', source: 'auth_session', status: 401, retryable: false, message: 'La sesión no es válida. Inicia sesión nuevamente.' } } })
  }

  let payload: SignedAuthSession
  try {
    payload = JSON.parse(decode(encodedPayload)) as SignedAuthSession
  } catch {
    throw createError({ statusCode: 401, message: 'La sesión no es válida. Inicia sesión nuevamente.', data: { diagnostic: { code: 'AUTH_SESSION_INVALID', source: 'auth_session', status: 401, retryable: false, message: 'La sesión no es válida. Inicia sesión nuevamente.' } } })
  }

  const now = Math.floor(Date.now() / 1000)
  if (
    payload.v !== TOKEN_VERSION ||
    !payload.email ||
    !payload.role ||
    !payload.activePlantel ||
    !payload.expiresAt ||
    payload.expiresAt <= now
  ) {
    throw createError({ statusCode: 401, message: 'La sesión expiró. Inicia sesión nuevamente.', data: { diagnostic: { code: 'AUTH_SESSION_EXPIRED', source: 'auth_session', status: 401, retryable: false, message: 'La sesión expiró. Inicia sesión nuevamente.' } } })
  }

  return payload
}

export const readAuthSessionToken = (event: any) => verifyAuthSessionToken(
  getCookie(event, AUTH_SESSION_COOKIE)
)

export const setAuthSessionToken = (
  event: any,
  input: AuthSessionInput,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS
) => {
  setCookie(event, AUTH_SESSION_COOKIE, createAuthSessionToken(input, maxAgeSeconds), {
    ...authCookieOptions(maxAgeSeconds),
    httpOnly: true
  })
}

export const clearAuthSessionToken = (event: any) => {
  deleteCookie(event, AUTH_SESSION_COOKIE, { path: '/' })
}
