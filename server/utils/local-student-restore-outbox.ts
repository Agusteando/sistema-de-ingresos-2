import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

type PendingRestore = { matricula: string; plantel: string; actor: string; requestedAt: string }

const root = () => path.resolve(String(process.env.LOCAL_SYSTEM_ROOT || (process.platform === 'win32' ? 'C:\\Server\\sistema-rapido' : '/var/lib/aurora-local')))
const directory = () => path.join(root(), 'state', 'student-restores')
const normalized = (value: unknown) => String(value || '').trim().toUpperCase()
const fileFor = (matricula: string, plantel: string) => path.join(directory(), createHash('sha256').update(plantel + ':' + matricula).digest('hex') + '.json')

const TRANSIENT_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'EPIPE', 'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR', 'PROTOCOL_ENQUEUE_AFTER_QUIT', 'PROTOCOL_ENQUEUE_AFTER_END'])
export const isCentralTransportFailure = (error: any) => {
  const code = String(error?.code || error?.cause?.code || '').toUpperCase()
  if (TRANSIENT_CODES.has(code)) return true
  // Avoid classifying invalid SQL, authentication and role errors as outages.
  if (code.startsWith('ER_')) return false
  const text = String(error?.message || '')
  return /(?:connect|connection|socket|network|fetch) (?:timed? out|refused|reset|failed|lost|closed)|EHOSTUNREACH|ENETUNREACH/i.test(text)
}

export const queueLocalStudentRestore = async ({ matricula, plantel, actor }: Omit<PendingRestore, 'requestedAt'>) => {
  const key = normalized(matricula), campus = normalized(plantel)
  if (!key || !campus || campus === 'GLOBAL') throw new Error('No se puede registrar una restauración sin matrícula y plantel.')
  await fs.mkdir(directory(), { recursive: true })
  const entry: PendingRestore = { matricula: key, plantel: campus, actor: String(actor || ''), requestedAt: new Date().toISOString() }
  try {
    await fs.writeFile(fileFor(key, campus), JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    return { created: true, entry }
  } catch (error: any) {
    if (error?.code !== 'EEXIST') throw error
    const existing = JSON.parse(await fs.readFile(fileFor(key, campus), 'utf8')) as PendingRestore
    return { created: false, entry: existing }
  }
}

export const clearQueuedStudentRestore = async (matricula: string, plantel: string) => {
  await fs.unlink(fileFor(normalized(matricula), normalized(plantel))).catch((error: any) => { if (error?.code !== 'ENOENT') throw error })
}

export const readQueuedStudentRestores = async (limit = 100): Promise<PendingRestore[]> => {
  let files: string[]
  try { files = (await fs.readdir(directory())).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).slice(0, limit) }
  catch (error: any) { if (error?.code === 'ENOENT') return []; throw error }
  const items: PendingRestore[] = []
  for (const name of files) {
    try {
      const item = JSON.parse(await fs.readFile(path.join(directory(), name), 'utf8')) as PendingRestore
      if (normalized(item.matricula) && normalized(item.plantel)) items.push(item)
    } catch (error) { console.error('[AuroraLocalRestoreOutbox] unreadable-entry', name, error) }
  }
  return items
}
