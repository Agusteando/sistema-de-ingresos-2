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
  repository: string
  versionLabel: string
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
  name?: string
  full_name?: string
  html_url?: string
  archived?: boolean
  pushed_at?: string
  updated_at?: string
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
const MAX_DISPLAY_UPDATES = 200
const RECENT_DAYS = 7
const TARGET_REPO_NAME = 'sistema-de-ingresos-2'

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

const toHeaderRecord = (headers: Record<string, string | string[] | undefined>) => {
  const record: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) record[key.toLowerCase()] = value.join(', ')
    else if (value) record[key.toLowerCase()] = value
  }
  return record
}

const emptyPayload = (username = '', error = '', warning = ''): LoginUpdatesPayload => {
  const payload: LoginUpdatesPayload = {
    ok: !error,
    configured: Boolean(username),
    source: 'github-repository-commits',
    username,
    repository: TARGET_REPO_NAME,
    versionLabel: 'v0.0',
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

const findTargetRepository = async (options: GithubRequestOptions) => {
  const directCandidates = [
    `${options.username}/${TARGET_REPO_NAME}`
  ]

  for (const fullName of directCandidates) {
    try {
      const repo = await requestJson<GithubRepo>(`/repos/${encodeURIComponent(fullName).replace(/%2F/g, '/')}`, options)
      if (repo?.full_name && !repo.archived) return repo
    } catch {}
  }

  for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
    const response = await fetchRepoPage(page, options)
    const batch = Array.isArray(response.data) ? response.data : []
    const match = batch.find((repo) => String(repo?.name || '').toLowerCase() === TARGET_REPO_NAME.toLowerCase() || String(repo?.full_name || '').toLowerCase().endsWith(`/${TARGET_REPO_NAME.toLowerCase()}`))

    if (match?.full_name && !match.archived) return match

    const lastPage = parseLastPage(response.headers.link)
    if (!lastPage || page >= lastPage || batch.length < PER_PAGE) break
  }

  return null
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

const fetchTargetRepoUpdates = async (options: GithubRequestOptions) => {
  const repo = await findTargetRepository(options)

  if (!repo?.full_name) {
    throw new Error(`No se encontró el repositorio ${TARGET_REPO_NAME}.`)
  }

  const fullName = String(repo.full_name)
  const repoUrl = String(repo.html_url || `https://github.com/${fullName}`)
  const basePath = `/repos/${fullName}/commits?author=${encodeURIComponent(options.username)}`

  const countPage = await requestGithub<GithubCommit[]>(`${basePath}&per_page=1&page=1`, options)
  const countItems = Array.isArray(countPage.data) ? countPage.data : []
  const lastPage = parseLastPage(countPage.headers.link)
  const totalCount = lastPage || countItems.length

  const updates: GithubUpdateItem[] = []
  const seen = new Set<string>()
  const maxPages = Math.min(Math.ceil(MAX_DISPLAY_UPDATES / PER_PAGE), Math.max(1, Math.ceil(totalCount / PER_PAGE)))

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await requestGithub<GithubCommit[]>(`${basePath}&per_page=${PER_PAGE}&page=${page}`, options)
    const commits = Array.isArray(response.data) ? response.data : []

    for (const commit of commits) {
      const sha = String(commit.sha || '')
      if (!sha || seen.has(sha)) continue
      seen.add(sha)

      const date = commitDate(commit) || String(repo.pushed_at || '')
      const daysAgo = daysAgoFromDate(date)
      const message = splitMessage(commit?.commit?.message)

      updates.push({
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
      })
    }

    if (commits.length < PER_PAGE || updates.length >= MAX_DISPLAY_UPDATES) break
  }

  updates.sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))

  return {
    repoFullName: fullName,
    repoUrl,
    totalCount,
    updates: updates.slice(0, MAX_DISPLAY_UPDATES)
  }
}

export default defineEventHandler(async (event): Promise<LoginUpdatesPayload> => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const config = useRuntimeConfig()
  const username = String(process.env.GITHUB_USERNAME || config.githubUsername || '').trim()
  const token = String(process.env.GITHUB_TOKEN || config.githubToken || '').trim()
  const cacheKey = `${username}:${token ? 'auth' : 'public'}:${TARGET_REPO_NAME}`

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

    const result = await fetchTargetRepoUpdates(options)
    const latest = result.updates[0] || null
    const lastUpdatedDaysAgo = latest ? latest.daysAgo : null
    const versionLabel = `v0.${result.totalCount}`

    const payload: LoginUpdatesPayload = {
      ok: true,
      configured: true,
      source: 'github-repository-commits',
      username,
      repository: result.repoFullName,
      versionLabel,
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
