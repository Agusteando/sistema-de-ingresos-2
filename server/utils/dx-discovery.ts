import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import { discoverConsumer, isDiscoverySource } from '../../shared/utils/dxDiscovery.mjs'
import routeManifest from '#dx-routes'

export type IntegrationRoute = { id: string; path: string; method: string; file: string; lineage: string[]; tables: string[]; versions: string[] }
export const readIntegrationRoutes = async (): Promise<IntegrationRoute[]> => {
  return routeManifest as IntegrationRoute[]
}

// Only source text is read. Archives are never extracted or executed, and no
// credentials or source bodies leave this module. Unchanged repos are reused.
export const readArchiveSources = async (body: ReadableStream<Uint8Array>) => {
  const source = Readable.fromWeb(body as any)
  const input = source.pipe(createGunzip())
  source.on('error', error => input.destroy(error))
  const files: Record<string, string> = {}
  let pending = Buffer.alloc(0), remaining = 0, padding = 0, path = '', collect = false, total = 0, stored = 0
  let chunks: Buffer[] = []
  try {
    for await (const data of input) {
      total += data.length
      if (total > 128 * 1024 * 1024) throw new Error('SOURCE_ARCHIVE_LIMIT')
      pending = Buffer.concat([pending, data])
      while (pending.length) {
        if (remaining > 0) {
          const take = Math.min(remaining, pending.length)
          if (collect) chunks.push(pending.subarray(0, take))
          remaining -= take; pending = pending.subarray(take)
          if (!remaining && collect) { files[path] = Buffer.concat(chunks).toString('utf8'); chunks = [] }
          continue
        }
        if (padding) { const take = Math.min(padding, pending.length); padding -= take; pending = pending.subarray(take); continue }
        if (pending.length < 512) break
        const header = pending.subarray(0, 512); pending = pending.subarray(512)
        if (header.every(byte => byte === 0)) continue
        const name = header.subarray(0, 100).toString().replace(/\0.*$/, '')
        const prefix = header.subarray(345, 500).toString().replace(/\0.*$/, '')
        path = (prefix ? prefix + '/' + name : name).split('/').slice(1).join('/')
        remaining = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim() || '0', 8)
        if (!Number.isSafeInteger(remaining) || remaining < 0) throw new Error('SOURCE_ARCHIVE_INVALID')
        padding = (512 - remaining % 512) % 512
        if ([0, 48].includes(header[156]) && isDiscoverySource(path) && remaining > 1024 * 1024) throw new Error('SOURCE_FILE_LIMIT')
        collect = [0, 48].includes(header[156]) && isDiscoverySource(path)
        if (collect) { stored += remaining; if (stored > 12 * 1024 * 1024) throw new Error('SOURCE_TEXT_LIMIT') }
      }
    }
    if (remaining || padding || pending.length) throw new Error('SOURCE_ARCHIVE_INCOMPLETE')
    return files
  } finally { source.destroy(); input.destroy() }
}

type DiscoveryState = { running: boolean; startedAt: string | null; checkedAt: string | null; total: number; scanned: number; consumers: any[]; failures: { repository: string; code: string }[]; error: string | null }
const state: DiscoveryState = { running: false, startedAt: null, checkedAt: null, total: 0, scanned: 0, consumers: [], failures: [], error: null }
const repos = new Map<string, { revision: string; consumer: any }>()
let lastAttempt = 0
const api = async (path: string, token: string) => {
  const response = await fetch('https://api.github.com' + path, {
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'User-Agent': 'Aurora-Integraciones' },
    signal: AbortSignal.timeout(20000)
  })
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GITHUB_RATE_LIMIT' : 'GITHUB_HTTP_' + response.status)
  return response
}
const discover = async () => {
  state.running = true; state.startedAt = new Date().toISOString(); state.error = null; state.failures = []; state.scanned = 0
  try {
    const token = String(process.env.GITHUB_TOKEN || (useRuntimeConfig() as any).githubToken || '').trim()
    if (!token) throw new Error('GITHUB_CREDENTIAL_MISSING')
    const routes = await readIntegrationRoutes()
    const all: any[] = []
    for (let page = 1; ; page++) {
      const response = await api('/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&sort=pushed&page=' + page, token)
      const batch: any = await response.json()
      if (!Array.isArray(batch)) throw new Error('GITHUB_INVENTORY_INVALID')
      all.push(...batch.filter(repo => repo.size > 0))
      if (batch.length < 100) break
    }
    state.total = all.length
    const present = new Set(all.map(repo => repo.full_name))
    for (const name of repos.keys()) if (!present.has(name)) repos.delete(name)
    const publish = () => { state.consumers = [...repos.values()].map(item => item.consumer).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'es')) }
    let cursor = 0
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (cursor < all.length) {
        const repo = all[cursor++]
        try {
          const revision = repo.pushed_at + ':' + repo.default_branch
          if (repos.get(repo.full_name)?.revision !== revision) {
            const commit: any = await (await api('/repos/' + repo.full_name + '/commits/' + encodeURIComponent(repo.default_branch), token)).json()
            if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('SOURCE_REVISION_INVALID')
            const response = await api('/repos/' + repo.full_name + '/tarball/' + commit.sha, token)
            if (!response.body) throw new Error('SOURCE_ARCHIVE_EMPTY')
            const files = await readArchiveSources(response.body)
            // Producer code references its own APIs; it isn't an external consumer.
            const producer = routes.every(route => files[route.file] !== undefined)
            repos.set(repo.full_name, { revision, consumer: producer ? null : discoverConsumer({ ...repo, revision: commit.sha }, files, routes) })
          }
        } catch (error: any) { state.failures.push({ repository: repo.full_name, code: String(error?.message || 'SOURCE_READ_FAILED').slice(0, 100) }) }
        finally { state.scanned++; publish() }
      }
    }))
    state.checkedAt = new Date().toISOString()
  } catch (error: any) { state.error = String(error?.message || 'DISCOVERY_FAILED').slice(0, 120) }
  finally { state.running = false }
}
export const integrationDiscovery = () => {
  if (!state.running && Date.now() - lastAttempt > (state.error ? 60000 : 15 * 60000)) {
    lastAttempt = Date.now()
    void discover()
  }
  return { ...state, consumers: [...state.consumers], failures: [...state.failures] }
}
