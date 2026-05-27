type LoginUpdateCommit = {
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
  commits: LoginUpdateCommit[]
  error?: string
}

const CACHE_TTL_MS = 5 * 60 * 1000
const RECENT_DAYS = 7
const MAX_COMMITS = 30

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

const splitCommitMessage = (message?: string) => {
  const clean = String(message || '').replace(/\r/g, '').trim()
  const [firstLine = 'Actualización sin título', ...rest] = clean.split('\n')
  const description = rest.join(' ').replace(/\s+/g, ' ').trim()

  return {
    title: firstLine.trim() || 'Actualización sin título',
    description: description.length > 180 ? `${description.slice(0, 177)}…` : description
  }
}

const emptyPayload = (username = '', error = ''): LoginUpdatesPayload => ({
  ok: !error,
  configured: Boolean(username),
  source: 'github-search-commits',
  username,
  totalCount: 0,
  lastUpdatedAt: null,
  lastUpdatedDaysAgo: null,
  lastUpdatedLabel: 'sin datos',
  fetchedAt: nowIso(),
  commits: [],
  ...(error ? { error } : {})
})

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

  const url = new URL('https://api.github.com/search/commits')
  url.searchParams.set('q', `author:${username}`)
  url.searchParams.set('sort', 'author-date')
  url.searchParams.set('order', 'desc')
  url.searchParams.set('per_page', String(MAX_COMMITS))

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'aurora-login-updates'
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const response = await fetch(url, { headers })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const message = data?.message || `GitHub respondió con estado ${response.status}.`
      return emptyPayload(username, message)
    }

    const commits: LoginUpdateCommit[] = Array.isArray(data?.items)
      ? data.items.map((item: any) => {
          const message = splitCommitMessage(item?.commit?.message)
          const date = item?.commit?.author?.date || item?.commit?.committer?.date || ''
          const daysAgo = daysAgoFromDate(date)
          const repo = String(item?.repository?.full_name || 'Repositorio')

          return {
            sha: String(item?.sha || ''),
            shortSha: String(item?.sha || '').slice(0, 7),
            title: message.title,
            description: message.description,
            repo,
            repoUrl: String(item?.repository?.html_url || ''),
            url: String(item?.html_url || ''),
            author: String(item?.author?.login || username),
            date,
            daysAgo,
            relativeDateLabel: formatRelativeDays(daysAgo),
            isNew: daysAgo !== null && daysAgo <= RECENT_DAYS
          }
        })
      : []

    const latest = commits[0] || null
    const lastUpdatedDaysAgo = latest ? latest.daysAgo : null
    const payload: LoginUpdatesPayload = {
      ok: true,
      configured: true,
      source: 'github-search-commits',
      username,
      totalCount: Number(data?.total_count || 0),
      lastUpdatedAt: latest?.date || null,
      lastUpdatedDaysAgo,
      lastUpdatedLabel: formatRelativeDays(lastUpdatedDaysAgo),
      fetchedAt: nowIso(),
      commits
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
