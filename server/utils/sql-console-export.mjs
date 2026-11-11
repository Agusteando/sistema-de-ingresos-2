import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const SQL_EXPORT_DATABASE = 'ingresos'

export function buildFullDumpArgs({ host, port, user }) {
  if (!host || !user || !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('INVALID_MYSQL_EXPORT_CONNECTION')
  }
  return [
    '--no-defaults',
    `--host=${host}`,
    `--port=${port}`,
    `--user=${user}`,
    '--protocol=TCP',
    '--single-transaction', '--quick', '--routines', '--triggers', '--events',
    '--hex-blob', '--no-tablespaces', '--skip-lock-tables',
    '--default-character-set=utf8mb4', '--databases', SQL_EXPORT_DATABASE
  ]
}

// Strip only the MariaDB sandbox prologue, which native MySQL clients cannot parse.
export function mysqlClientCompatibleStream() {
  let firstLinePending = true
  let prefix = Buffer.alloc(0)
  return new Transform({
    transform(chunk, _encoding, callback) {
      if (!firstLinePending) return callback(null, chunk)
      prefix = Buffer.concat([prefix, chunk])
      const newline = prefix.indexOf(10)
      if (newline < 0 && prefix.length < 256) return callback()
      firstLinePending = false
      const line = newline < 0 ? prefix : prefix.subarray(0, newline + 1)
      const body = newline < 0 ? Buffer.alloc(0) : prefix.subarray(newline + 1)
      const sandboxHeader = /^\/\*M!999999\\- enable the sandbox mode \*\/\r?\n?$/.test(line.toString('ascii'))
      callback(null, sandboxHeader ? body : prefix)
      prefix = Buffer.alloc(0)
    },
    flush(callback) {
      if (firstLinePending && prefix.length) this.push(prefix)
      callback()
    }
  })
}

/** Credentials are passed through the child environment, never argv or SQL. */
export async function createFullSqlSnapshot({ host, port, user, password, binary = 'mariadb-dump', tempRoot = tmpdir() }) {
  const args = buildFullDumpArgs({ host, port, user })
  const directory = await mkdtemp(join(tempRoot, 'aurora-ingresos-'))
  const path = join(directory, 'ingresos.sql')
  let child
  let errorOutput = ''
  const cleanup = async () => rm(directory, { recursive: true, force: true })
  try {
    child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MYSQL_PWD: String(password ?? '') },
      shell: false
    })
    child.stderr.on('data', chunk => {
      errorOutput = (errorOutput + chunk.toString('utf8')).slice(-8192)
    })
    const completed = new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => {
        if (code === 0) resolve()
        else reject(Object.assign(new Error('SQL_DUMP_PROCESS_FAILED'), {
          code: 'SQL_DUMP_PROCESS_FAILED',
          exitCode: code, signal, diagnostic: errorOutput.trim().slice(0, 2000)
        }))
      })
    })
    await Promise.all([
      completed,
      pipeline(child.stdout, mysqlClientCompatibleStream(), createWriteStream(path, { flags: 'wx', mode: 0o600 }))
    ])
    const info = await stat(path)
    if (!info.size) throw new Error('SQL_DUMP_EMPTY_OUTPUT')
    return { path, bytes: info.size, cleanup, openStream: () => createReadStream(path) }
  } catch (error) {
    child?.kill()
    await cleanup()
    throw error
  }
}
