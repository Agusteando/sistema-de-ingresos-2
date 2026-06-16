import { createHmac, timingSafeEqual } from 'node:crypto'
import { authCookieOptions } from './auth-cookie-options'

const TOKEN_VERSION = 1
const ACTIVE_MAX_AGE_SECONDS = 60 * 60 * 8
const COOKIE_RETENTION_SECONDS = 60 * 60 * 24 * 7

export type ImpersonationSession = {
  v: number
  impersonatorEmail: string
  impersonatorName: string
  activePlantel: string
  homePlantel: string
  issuedAt: number
  expiresAt: number
}

const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64url')
const decode = (value: string) => Buffer.from(value, 'base64url').toString('utf8')

const getSecret = () => {
  const config = useRuntimeConfig()
  const secret = String(config.authImpersonationSecret || '').trim()
  if (secret.length < 32) {
    throw createError({
      statusCode: 503,
      message: 'La suplantación requiere AUTH_IMPERSONATION_SECRET con al menos 32 caracteres.'
    })
  }
  return secret
}

const signatureFor = (payload: string, secret: string) => createHmac('sha256', secret)
  .update(payload)
  .digest('base64url')

export const createImpersonationToken = (input: Omit<ImpersonationSession, 'v' | 'issuedAt' | 'expiresAt'>) => {
  const now = Math.floor(Date.now() / 1000)
  const payload: ImpersonationSession = {
    v: TOKEN_VERSION,
    ...input,
    issuedAt: now,
    expiresAt: now + ACTIVE_MAX_AGE_SECONDS
  }
  const encodedPayload = encode(JSON.stringify(payload))
  const signature = signatureFor(encodedPayload, getSecret())
  return `${encodedPayload}.${signature}`
}

export const verifyImpersonationToken = (tokenValue: unknown, options: { allowExpired?: boolean } = {}): ImpersonationSession => {
  const token = String(tokenValue || '').trim()
  const [encodedPayload, receivedSignature, ...extra] = token.split('.')
  if (!encodedPayload || !receivedSignature || extra.length) {
    throw createError({ statusCode: 401, message: 'La sesión de suplantación no es válida.' })
  }

  const expectedSignature = signatureFor(encodedPayload, getSecret())
  const received = Buffer.from(receivedSignature)
  const expected = Buffer.from(expectedSignature)
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw createError({ statusCode: 401, message: 'La sesión de suplantación no es válida.' })
  }

  let payload: ImpersonationSession
  try {
    payload = JSON.parse(decode(encodedPayload)) as ImpersonationSession
  } catch {
    throw createError({ statusCode: 401, message: 'La sesión de suplantación no es válida.' })
  }

  const now = Math.floor(Date.now() / 1000)
  if (
    payload.v !== TOKEN_VERSION ||
    !payload.impersonatorEmail ||
    !payload.expiresAt ||
    (!options.allowExpired && payload.expiresAt <= now)
  ) {
    throw createError({ statusCode: 401, message: 'La sesión de suplantación expiró.' })
  }

  return payload
}

export const impersonationCookieOptions = () => authCookieOptions(COOKIE_RETENTION_SECONDS)

export const impersonatedAuthCookieOptions = () => authCookieOptions(ACTIVE_MAX_AGE_SECONDS)

export const impersonationSecondsRemaining = (session: ImpersonationSession) => Math.max(
  1,
  session.expiresAt - Math.floor(Date.now() / 1000)
)

export const clearImpersonationCookies = (event: any) => {
  const options = { path: '/' }
  deleteCookie(event, 'auth_impersonation_token', options)
  deleteCookie(event, 'auth_impersonating', options)
  deleteCookie(event, 'auth_impersonator_name', options)
}
