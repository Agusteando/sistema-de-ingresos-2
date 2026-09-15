import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import type { AuthSessionUser } from './auth-session'

export const ONLINE_PRESENCE_TTL_MS = 120_000

type OnlinePresenceSession = {
  key: string
  email: string
  name: string
  role: string
  roles: string[]
  activePlantel: string
  homePlantel: string
  planteles: string[]
  ip: string
  firstSeenAt: number
  lastSeenAt: number
}

export type OnlineUser = {
  email: string
  name: string
  role: string
  roles: string[]
  activePlantel: string
  homePlantel: string
  planteles: string[]
  ips: string[]
  sessionCount: number
  firstSeenAt: string
  lastSeenAt: string
}

type PresenceGlobal = typeof globalThis & {
  __auroraOnlinePresence?: Map<string, OnlinePresenceSession>
}

const getStore = () => {
  const state = globalThis as PresenceGlobal
  if (!state.__auroraOnlinePresence) state.__auroraOnlinePresence = new Map()
  return state.__auroraOnlinePresence
}

const normalizeIpv4 = (value: unknown) => {
  let ip = String(value || '').split(',')[0].trim()
  if (!ip) return ''
  if (ip === '::1') return '127.0.0.1'
  if (ip.startsWith('::ffff:')) ip = ip.slice(7)
  return isIP(ip) === 4 ? ip : ''
}

const resolveClientIp = (event: any) => {
  const cloudflarePseudoIpv4 = normalizeIpv4(getRequestHeader(event, 'cf-pseudo-ipv4'))
  if (cloudflarePseudoIpv4) return cloudflarePseudoIpv4

  const cloudflareIp = getRequestHeader(event, 'cf-connecting-ip')
  if (cloudflareIp) return normalizeIpv4(cloudflareIp) || 'No disponible'

  const forwardedIp = getRequestHeader(event, 'x-forwarded-for')
  if (forwardedIp) return normalizeIpv4(forwardedIp) || 'No disponible'

  const socketIp = event?.node?.req?.socket?.remoteAddress
  return normalizeIpv4(socketIp) || 'No disponible'
}

const prunePresence = (now = Date.now()) => {
  const store = getStore()
  const cutoff = now - ONLINE_PRESENCE_TTL_MS
  for (const [key, session] of store.entries()) {
    if (session.lastSeenAt < cutoff) store.delete(key)
  }
  return store
}

const sessionKeyFor = (email: string, ip: string, userAgent: string) => createHash('sha256')
  .update(`${email}\n${ip}\n${userAgent}`)
  .digest('base64url')

export const touchOnlinePresence = (event: any, user: AuthSessionUser) => {
  const now = Date.now()
  const store = prunePresence(now)
  const ip = resolveClientIp(event)
  const userAgent = String(getRequestHeader(event, 'user-agent') || 'unknown').trim()
  const key = sessionKeyFor(user.email, ip, userAgent)
  const previous = store.get(key)

  const session: OnlinePresenceSession = {
    key,
    email: user.email,
    name: user.name,
    role: user.role,
    roles: [...user.roles],
    activePlantel: user.active_plantel,
    homePlantel: user.auth_home_plantel,
    planteles: [...user.plantelesList],
    ip,
    firstSeenAt: previous?.firstSeenAt || now,
    lastSeenAt: now
  }

  store.set(key, session)
  return session
}

export const listOnlineUsers = () => {
  const now = Date.now()
  const store = prunePresence(now)
  const grouped = new Map<string, {
    latest: OnlinePresenceSession
    firstSeenAt: number
    lastSeenAt: number
    ips: Set<string>
    sessionCount: number
  }>()

  for (const session of store.values()) {
    const current = grouped.get(session.email)
    if (!current) {
      grouped.set(session.email, {
        latest: session,
        firstSeenAt: session.firstSeenAt,
        lastSeenAt: session.lastSeenAt,
        ips: new Set([session.ip]),
        sessionCount: 1
      })
      continue
    }

    current.firstSeenAt = Math.min(current.firstSeenAt, session.firstSeenAt)
    current.lastSeenAt = Math.max(current.lastSeenAt, session.lastSeenAt)
    current.ips.add(session.ip)
    current.sessionCount += 1
    if (session.lastSeenAt >= current.latest.lastSeenAt) current.latest = session
  }

  const users: OnlineUser[] = Array.from(grouped.values())
    .map(({ latest, firstSeenAt, lastSeenAt, ips, sessionCount }) => ({
      email: latest.email,
      name: latest.name,
      role: latest.role,
      roles: [...latest.roles],
      activePlantel: latest.activePlantel,
      homePlantel: latest.homePlantel,
      planteles: [...latest.planteles],
      ips: Array.from(ips).sort(),
      sessionCount,
      firstSeenAt: new Date(firstSeenAt).toISOString(),
      lastSeenAt: new Date(lastSeenAt).toISOString()
    }))
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))

  return {
    users,
    totalUsers: users.length,
    totalSessions: users.reduce((sum, user) => sum + user.sessionCount, 0),
    generatedAt: new Date(now).toISOString(),
    ttlSeconds: Math.round(ONLINE_PRESENCE_TTL_MS / 1000)
  }
}
