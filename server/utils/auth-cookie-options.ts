const boolValue = (value: unknown, fallback = false) => {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

export const useSecureAuthCookies = () => {
  if (process.env.NODE_ENV !== 'production') return false
  const config = useRuntimeConfig()
  const localMode = String(process.env.LOCAL_SYSTEM_MODE || config.localSystemMode || '').trim().toLowerCase() === 'true'
  if (!localMode) return true
  return boolValue(process.env.LOCAL_SYSTEM_COOKIE_SECURE || config.localSystemCookieSecure, false)
}

export const authCookieOptions = (maxAge = 86400 * 7) => ({
  secure: useSecureAuthCookies(),
  path: '/',
  maxAge,
  sameSite: 'lax' as const
})
