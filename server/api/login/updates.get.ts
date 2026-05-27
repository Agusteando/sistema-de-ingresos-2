import https from 'node:https'

type GithubRequestOptions = {
  username: string
  token: string
}

type GithubUpdateItem = {
  sha: string
  shortSha: string
  title: string
  description: string
  repo: string
  repoUrl: string
  url: string
  author: string
  date: string
  daysAgo: number | null
  relativeDateLabel: string
  isNew: boolean
}

type LoginUpdatesPayload = {
  ok: boolean
  configured: boolean
  source: string
  username: string
  totalCount: number
  lastUpdatedAt: string | null
  lastUpdatedDaysAgo: number | null
  lastUpdatedLabel: string
  fetchedAt: string
  updates: GithubUpdateItem[]
  warning?: string
  error?: string
}

const CACHE_TTL_MS = 5 * 60 * 1000
const PER_PAGE = 100
const MAX_EVENT_PAGES = 10
const MAX_DISPLAY_UPDATES = 50
const RECENT_DAYS = 7
const EVENT_LOOKBACK_DAYS = 90

let cachedPayload: { cacheKey: string; expiresAt: number; data: LoginUpdatesPayload } | null = null

const nowIso = () => new Date().toISOString()

const startOfLocalDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
const subtractDays = (date: Date, days: number) => {
  const copy = new Date(date)
  copy.setDate(copy.getDate() - days)
  return copy
}

const daysAgoFromDate = (value?: string | null) => {
  if (!value) return null
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.floor((Date.now() - time) / 86400000))
}

const formatRelativeDays = (days: number | null) => {
  if (days === null) return 'sin datos'
  if (days <= 0) return 'hoy'
  if (days === 1) return 'hace 1 día'
  return `hace ${days} días`
}

const splitMessage = (message?: string) => {
  const clean = String(message || '').replace(/\r/g, '').trim()
  const [firstLine = 'Actualización sin título', ...rest] = clean.split('\n')
  const description = rest.join(' ').replace(/\s+/g, ' ').trim()

  return {
    title: firstLine.trim() || 'Actualización sin título',
    description: description.length > 180 ? `${description.slice(0, 177)}…` : description
  }
}

const isAllZeroSha = (sha?: string | null) => typeof sha === 'string' && /^0+$/.test(sha)

const emptyPayload = (username = '', error = '', warning = ''): LoginUpdatesPayload => {
  const payload: LoginUpdatesPayload = {
    ok: !error,
    configured: Boolean(username),
    source: 'github-push-events',
    username,
    totalCount: 0,
    lastUpdatedAt: null,
    lastUpdatedDaysAgo: null,
    lastUpdatedLabel: 'sin datos',
    fetchedAt: nowIso(),
    updates: []
  }

  if (warning) payload.warning = warning
  if (error) payload.error = error

  return payload
}

const requestJson = <T>(reqPath: string, options: GithubRequestOptions): Promise<T> => {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: reqPath,
        method: 'GET',
        headers: {
          'User-Agent': 'aurora-login-updates',
          Accept: 'application/vnd.github+json',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
        }
      },
      (res) => {
        let body = ''

        res.on('data', (chunk) => {
          body += chunk
        })

        res.on('end', () => {
          let data: any = null

          try {
            data = body ? JSON.parse(body) : null
          } catch {
            reject(new Error(`Respuesta inválida de GitHub para ${reqPath}.`))
            return
          }

          if ((res.statusCode || 500) < 200 || (res.statusCode || 500) >= 300) {
            reject(new Error(data?.message || `GitHub API ${res.statusCode} ${res.statusMessage}`))
            return
          }

          resolve(data as T)
        })
      }
    )

    req.on('error', reject)
    req.end()
  })
}

const getAuthenticatedLogin = async (options: GithubRequestOptions) => {
  if (!options.token) return null

  try {
    const me = await requestJson<{ login?: string }>('/user', options)
    return me?.login || null
  } catch {
    return null
  }
}

const fetchPushEventsForRecentWindow = async (options: GithubRequestOptions) => {
  const events: any[] = []
  const start = startOfLocalDay(subtractDays(new Date(), EVENT_LOOKBACK_DAYS))
  const endpoint = options.token
    ? `/users/${encodeURIComponent(options.username)}/events`
    : `/users/${encodeURIComponent(options.username)}/events/public`

  for (let page = 1; page <= MAX_EVENT_PAGES; page += 1) {
    const batch = await requestJson<any[]>(`${endpoint}?per_page=${PER_PAGE}&page=${page}`, options)

    if (!Array.isArray(batch) || batch.length === 0) break

    let sawOlderThanTarget = false

    for (const event of batch) {
      const createdAt = new Date(event?.created_at || '')

      if (Number.isFinite(createdAt.getTime()) && createdAt < start) {
        sawOlderThanTarget = true
        continue
      }

      if (event?.type === 'PushEvent') {
        events.push(event)
      }
    }

    if (sawOlderThanTarget || batch.length < PER_PAGE) break
  }

  return events
}

const fetchCompareUpdates = async (repoFullName: string, before: string, head: string, options: GithubRequestOptions) => {
  if (!repoFullName || !before || !head || before === head || isAllZeroSha(before)) {
    return []
  }

  try {
    const data = await requestJson<any>(
      `/repos/${repoFullName}/compare/${encodeURIComponent(before)}...${encodeURIComponent(head)}`,
      options
    )

    const items = Array.isArray(data?.commits) ? data.commits : []
    return items
      .filter((item: any) => item?.sha)
      .map((item: any) => ({
        sha: String(item?.sha || ''),
        message: String(item?.commit?.message || ''),
        author: String(item?.author?.login || item?.commit?.author?.name || ''),
        url: String(item?.html_url || '')
      }))
  } catch {
    return []
  }
}

const updatesFromPayload = (event: any) => {
  const items = Array.isArray(event?.payload?.commits) ? event.payload.commits : []

  return items
    .filter((item: any) => item?.sha)
    .map((item: any) => ({
      sha: String(item.sha || ''),
      message: String(item.message || ''),
      author: String(item?.author?.name || item?.author?.email || ''),
      url: ''
    }))
}

const collectUpdates = async (events: any[], options: GithubRequestOptions) => {
  const seen = new Set<string>()
  const updates: GithubUpdateItem[] = []

  for (const event of events) {
    const repo = String(event?.repo?.name || '')
    if (!repo) continue

    let items = await fetchCompareUpdates(repo, event?.payload?.before, event?.payload?.head, options)

    if (items.length === 0) {
      items = updatesFromPayload(event)
    }

    if (items.length === 0) continue

    for (const item of items) {
      const sha = String(item.sha || '')
      if (!sha) continue

      const key = `${repo}:${sha}`
      if (seen.has(key)) continue
      seen.add(key)

      const date = String(event?.created_at || '')
      const daysAgo = daysAgoFromDate(date)
      const message = splitMessage(item.message)
      const repoUrl = `https://github.com/${repo}`
      const url = item.url || `${repoUrl}/commit/${sha}`

      updates.push({
        sha,
        shortSha: sha.slice(0, 7),
        title: message.title,
        description: message.description,
        repo,
        repoUrl,
        url,
        author: item.author || options.username,
        date,
        daysAgo,
        relativeDateLabel: formatRelativeDays(daysAgo),
        isNew: daysAgo !== null && daysAgo <= RECENT_DAYS
      })
    }
  }

  return updates.sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))
}

export default defineEventHandler(async (event): Promise<LoginUpdatesPayload> => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const config = useRuntimeConfig()
  const username = String(process.env.GITHUB_USERNAME || config.githubUsername || '').trim()
  const token = String(process.env.GITHUB_TOKEN || config.githubToken || '').trim()
  const cacheKey = `${username}:${token ? 'auth' : 'public'}`

  if (!username) {
    return emptyPayload('', 'GITHUB_USERNAME no está configurado.')
  }

  if (cachedPayload && cachedPayload.expiresAt > Date.now() && cachedPayload.cacheKey === cacheKey) {
    return cachedPayload.data
  }

  const options = { username, token }

  try {
    const authLogin = await getAuthenticatedLogin(options)
    const warning = token && authLogin && authLogin.toLowerCase() !== username.toLowerCase()
      ? `El token pertenece a ${authLogin}; las actualizaciones privadas pueden no coincidir con ${username}.`
      : ''

    const events = await fetchPushEventsForRecentWindow(options)
    const updates = await collectUpdates(events, options)
    const displayUpdates = updates.slice(0, MAX_DISPLAY_UPDATES)
    const latest = updates[0] || null
    const lastUpdatedDaysAgo = latest ? latest.daysAgo : null

    const payload: LoginUpdatesPayload = {
      ok: true,
      configured: true,
      source: 'github-push-events',
      username,
      totalCount: updates.length,
      lastUpdatedAt: latest?.date || null,
      lastUpdatedDaysAgo,
      lastUpdatedLabel: formatRelativeDays(lastUpdatedDaysAgo),
      fetchedAt: nowIso(),
      updates: displayUpdates,
      ...(warning ? { warning } : {})
    }

    cachedPayload = {
      cacheKey,
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: payload
    }

    return payload
  } catch (error: any) {
    return emptyPayload(username, error?.message || 'No se pudieron cargar las actualizaciones.')
  }
})
