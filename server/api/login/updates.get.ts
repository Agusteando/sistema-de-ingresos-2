import https from 'node:https'

type GithubRequestOptions = {
  username: string
  token: string
}

type GithubResponse<T> = {
  data: T
  headers: Record<string, string>
  statusCode: number
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

type GithubRepo = {
  full_name?: string
  html_url?: string
  fork?: boolean
  archived?: boolean
  pushed_at?: string
  updated_at?: string
  permissions?: Record<string, boolean>
}

type GithubCommit = {
  sha?: string
  html_url?: string
  commit?: {
    message?: string
    author?: {
      name?: string
      date?: string
    }
    committer?: {
      name?: string
      date?: string
    }
  }
  author?: {
    login?: string
  }
  committer?: {
    login?: string
  }
}

const CACHE_TTL_MS = 10 * 60 * 1000
const PER_PAGE = 100
const MAX_REPO_PAGES = 10
const MAX_DISPLAY_UPDATES = 80
const RECENT_DAYS = 7

let cachedPayload: { cacheKey: string; expiresAt: number; data: LoginUpdatesPayload } | null = null

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

const emptyPayload = (username = '', error = '', warning = ''): LoginUpdatesPayload => {
  const payload: LoginUpdatesPayload = {
    ok: !error,
    configured: Boolean(username),
    source: 'github-repository-history',
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

const toHeaderRecord = (headers: Record<string, string | string[] | undefined>) => {
  const record: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) record[key.toLowerCase()] = value.join(', ')
    else if (value) record[key.toLowerCase()] = value
  }
  return record
}

const requestGithub = <T>(reqPath: string, options: GithubRequestOptions): Promise<GithubResponse<T>> => {
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

          resolve({
            data: data as T,
            headers: toHeaderRecord(res.headers),
            statusCode: res.statusCode || 200
          })
        })
      }
    )

    req.on('error', reject)
    req.end()
  })
}

const requestJson = async <T>(reqPath: string, options: GithubRequestOptions) => {
  const response = await requestGithub<T>(reqPath, options)
  return response.data
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

const parseLastPage = (linkHeader?: string) => {
  if (!linkHeader) return null
  const match = linkHeader.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/)
  return match ? Number(match[1]) : null
}

const fetchRepoPage = async (page: number, options: GithubRequestOptions) => {
  const path = options.token
    ? `/user/repos?affiliation=owner,collaborator,organization_member&visibility=all&sort=pushed&direction=desc&per_page=${PER_PAGE}&page=${page}`
    : `/users/${encodeURIComponent(options.username)}/repos?type=all&sort=pushed&direction=desc&per_page=${PER_PAGE}&page=${page}`

  return requestGithub<GithubRepo[]>(path, options)
}

const fetchRepositories = async (options: GithubRequestOptions) => {
  const repos: GithubRepo[] = []

  for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
    const response = await fetchRepoPage(page, options)
    const batch = Array.isArray(response.data) ? response.data : []

    repos.push(...batch)

    const lastPage = parseLastPage(response.headers.link)
    if (!lastPage || page >= lastPage || batch.length < PER_PAGE) break
  }

  const seen = new Set<string>()

  return repos
    .filter((repo) => repo?.full_name && !repo.archived)
    .filter((repo) => {
      const name = String(repo.full_name || '')
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
    .sort((a, b) => Date.parse(String(b.pushed_at || b.updated_at || '')) - Date.parse(String(a.pushed_at || a.updated_at || '')))
}

const commitDate = (commit: GithubCommit) => (
  commit?.commit?.committer?.date
  || commit?.commit?.author?.date
  || null
)

const commitAuthor = (commit: GithubCommit, fallback: string) => (
  commit?.author?.login
  || commit?.committer?.login
  || commit?.commit?.author?.name
  || commit?.commit?.committer?.name
  || fallback
)

const fetchAuthorCommitsForRepo = async (repo: GithubRepo, options: GithubRequestOptions) => {
  const fullName = String(repo.full_name || '')
  if (!fullName) return { total: 0, updates: [] as GithubUpdateItem[] }

  const basePath = `/repos/${fullName}/commits?author=${encodeURIComponent(options.username)}&per_page=${PER_PAGE}`

  try {
    const firstPage = await requestGithub<GithubCommit[]>(`${basePath}&page=1`, options)
    const firstCommits = Array.isArray(firstPage.data) ? firstPage.data : []
    const lastPage = parseLastPage(firstPage.headers.link) || (firstCommits.length === PER_PAGE ? 1 : null)
    let total = firstCommits.length

    if (lastPage && lastPage > 1) {
      const lastPageResponse = await requestGithub<GithubCommit[]>(`${basePath}&page=${lastPage}`, options)
      const lastCommits = Array.isArray(lastPageResponse.data) ? lastPageResponse.data : []
      total = ((lastPage - 1) * PER_PAGE) + lastCommits.length
    }

    const repoUrl = String(repo.html_url || `https://github.com/${fullName}`)
    const updates = firstCommits
      .filter((commit) => commit?.sha)
      .map((commit) => {
        const sha = String(commit.sha || '')
        const date = commitDate(commit) || String(repo.pushed_at || '')
        const daysAgo = daysAgoFromDate(date)
        const message = splitMessage(commit?.commit?.message)

        return {
          sha,
          shortSha: sha.slice(0, 7),
          title: message.title,
          description: message.description,
          repo: fullName,
          repoUrl,
          url: String(commit.html_url || `${repoUrl}/commit/${sha}`),
          author: commitAuthor(commit, options.username),
          date,
          daysAgo,
          relativeDateLabel: formatRelativeDays(daysAgo),
          isNew: daysAgo !== null && daysAgo <= RECENT_DAYS
        }
      })

    return { total, updates }
  } catch {
    return { total: 0, updates: [] as GithubUpdateItem[] }
  }
}

const collectRepositoryCommitHistory = async (options: GithubRequestOptions) => {
  const repos = await fetchRepositories(options)
  const seenUpdates = new Set<string>()
  let totalCount = 0
  const updates: GithubUpdateItem[] = []

  // Sequential requests are intentional here. They avoid bursty rate-limit failures on the login page.
  for (const repo of repos) {
    const result = await fetchAuthorCommitsForRepo(repo, options)
    totalCount += result.total

    for (const update of result.updates) {
      const key = `${update.repo}:${update.sha}`
      if (seenUpdates.has(key)) continue
      seenUpdates.add(key)
      updates.push(update)
    }
  }

  updates.sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))

  return {
    repoCount: repos.length,
    totalCount,
    updates: updates.slice(0, MAX_DISPLAY_UPDATES)
  }
}

export default defineEventHandler(async (event): Promise<LoginUpdatesPayload> => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const config = useRuntimeConfig()
  const username = String(process.env.GITHUB_USERNAME || config.githubUsername || '').trim()
  const token = String(process.env.GITHUB_TOKEN || config.githubToken || '').trim()
  const cacheKey = `${username}:${token ? 'auth' : 'public'}:repository-history`

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

    const result = await collectRepositoryCommitHistory(options)
    const latest = result.updates[0] || null
    const lastUpdatedDaysAgo = latest ? latest.daysAgo : null

    const payload: LoginUpdatesPayload = {
      ok: true,
      configured: true,
      source: 'github-repository-history',
      username,
      totalCount: result.totalCount,
      lastUpdatedAt: latest?.date || null,
      lastUpdatedDaysAgo,
      lastUpdatedLabel: formatRelativeDays(lastUpdatedDaysAgo),
      fetchedAt: nowIso(),
      updates: result.updates,
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
