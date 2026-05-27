type LoginUpdateItem = {
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
  updates: LoginUpdateItem[]
  warning?: string
  error?: string
}

const CACHE_TTL_MS = 5 * 60 * 1000
const RECENT_DAYS = 7
const PER_PAGE = 100
const MAX_EVENT_PAGES = 10
const MAX_DISPLAY_UPDATES = 40

let cachedPayload: { expiresAt: number; data: LoginUpdatesPayload } | null = null

const nowIso = () => new Date().toISOString()

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

const githubFetch = async <T>(path: string, token: string, userAgent = 'aurora-login-updates'): Promise<T> => {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': userAgent,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = data?.message || `GitHub respondió con estado ${response.status}.`
    throw new Error(message)
  }

  return data as T
}

const getAuthenticatedLogin = async (token: string) => {
  if (!token) return null

  try {
    const me = await githubFetch<{ login?: string }>('/user', token)
    return me?.login || null
  } catch {
    return null
  }
}

const fetchPushEvents = async (username: string, token: string) => {
  const events: any[] = []
  const endpoint = token
    ? `/users/${encodeURIComponent(username)}/events`
    : `/users/${encodeURIComponent(username)}/events/public`

  for (let page = 1; page <= MAX_EVENT_PAGES; page += 1) {
    const batch = await githubFetch<any[]>(`${endpoint}?per_page=${PER_PAGE}&page=${page}`, token)

    if (!Array.isArray(batch) || batch.length === 0) break

    for (const event of batch) {
      if (event?.type === 'PushEvent') {
        events.push(event)
      }
    }

    if (batch.length < PER_PAGE) break
  }

  return events
}

const fetchCompareItems = async (repoFullName: string, before: string, head: string, token: string) => {
  if (!repoFullName || !before || !head || before === head || isAllZeroSha(before)) {
    return []
  }

  try {
    const data = await githubFetch<any>(
      `/repos/${repoFullName}/compare/${encodeURIComponent(before)}...${encodeURIComponent(head)}`,
      token
    )

    const commits = Array.isArray(data?.commits) ? data.commits : []
    return commits
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

const itemsFromPayload = (event: any) => {
  const commits = Array.isArray(event?.payload?.commits) ? event.payload.commits : []

  return commits
    .filter((item: any) => item?.sha)
    .map((item: any) => ({
      sha: String(item?.sha || ''),
      message: String(item?.message || ''),
      author: String(item?.author?.name || item?.author?.email || ''),
      url: ''
    }))
}

const collectUpdatesFromEvents = async (events: any[], token: string, fallbackAuthor: string) => {
  const seen = new Set<string>()
  const updates: LoginUpdateItem[] = []

  for (const event of events) {
    const repo = String(event?.repo?.name || '')
    if (!repo) continue

    let items = await fetchCompareItems(repo, event?.payload?.before, event?.payload?.head, token)

    if (items.length === 0) {
      items = itemsFromPayload(event)
    }

    if (items.length === 0) continue

    for (const item of items) {
      const sha = String(item.sha || '')
      if (!sha) continue

      const key = `${repo}:${sha}`
      if (seen.has(key)) continue
      seen.add(key)

      const message = splitMessage(item.message)
      const date = String(event?.created_at || '')
      const daysAgo = daysAgoFromDate(date)
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
        author: item.author || fallbackAuthor,
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
  const username = String(config.githubUsername || process.env.GITHUB_USERNAME || '').trim()
  const token = String(config.githubToken || process.env.GITHUB_TOKEN || '').trim()

  if (!username) {
    return emptyPayload('', 'GITHUB_USERNAME no está configurado.')
  }

  if (cachedPayload && cachedPayload.expiresAt > Date.now() && cachedPayload.data.username === username) {
    return cachedPayload.data
  }

  try {
    const authLogin = await getAuthenticatedLogin(token)
    const warning = token && authLogin && authLogin.toLowerCase() !== username.toLowerCase()
      ? `El token pertenece a ${authLogin}; las actualizaciones privadas pueden no coincidir con ${username}.`
      : ''

    const events = await fetchPushEvents(username, token)
    const allUpdates = await collectUpdatesFromEvents(events, token, username)
    const displayUpdates = allUpdates.slice(0, MAX_DISPLAY_UPDATES)
    const latest = allUpdates[0] || null
    const lastUpdatedDaysAgo = latest ? latest.daysAgo : null

    const payload: LoginUpdatesPayload = {
      ok: true,
      configured: true,
      source: 'github-push-events',
      username,
      totalCount: allUpdates.length,
      lastUpdatedAt: latest?.date || null,
      lastUpdatedDaysAgo,
      lastUpdatedLabel: formatRelativeDays(lastUpdatedDaysAgo),
      fetchedAt: nowIso(),
      updates: displayUpdates,
      ...(warning ? { warning } : {})
    }

    cachedPayload = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: payload
    }

    return payload
  } catch (error: any) {
    return emptyPayload(username, error?.message || 'No se pudieron cargar las actualizaciones de GitHub.')
  }
})
