import { getBridgeAgentId, getDbTransport, runRawSqlStatement } from '../../../utils/db'

const MAX_SQL_BYTES = 2 * 1024 * 1024
const MAX_STATEMENTS = 300
const MAX_PREVIEW_ROWS = 200

const byteLength = (value: string) => Buffer.byteLength(value, 'utf8')

const isIgnorableSql = (value: string) => {
  const stripped = value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*(--|#).*$/, '').trim())
    .filter(Boolean)
    .join('')

  return stripped.length === 0
}

const splitSqlStatements = (input: string) => {
  const sql = String(input || '').replace(/\r\n/g, '\n')
  const statements: string[] = []
  let delimiter = ';'
  let buffer = ''
  let i = 0
  let inSingle = false
  let inDouble = false
  let inBacktick = false
  let inLineComment = false
  let inBlockComment = false

  const pushStatement = () => {
    const statement = buffer.trim()
    if (statement && !isIgnorableSql(statement)) {
      statements.push(statement)
    }
    buffer = ''
  }

  while (i < sql.length) {
    const char = sql[i]
    const next = sql[i + 1]
    const atLineStart = i === 0 || sql[i - 1] === '\n'

    if (!inSingle && !inDouble && !inBacktick && !inLineComment && !inBlockComment && atLineStart && isIgnorableSql(buffer)) {
      const lineEnd = sql.indexOf('\n', i)
      const rawLine = lineEnd === -1 ? sql.slice(i) : sql.slice(i, lineEnd)
      const delimiterMatch = rawLine.trim().match(/^DELIMITER\s+(.+)$/i)

      if (delimiterMatch) {
        delimiter = delimiterMatch[1].trim()
        buffer = ''
        i = lineEnd === -1 ? sql.length : lineEnd + 1
        continue
      }
    }

    if (inLineComment) {
      buffer += char
      if (char === '\n') inLineComment = false
      i += 1
      continue
    }

    if (inBlockComment) {
      buffer += char
      if (char === '*' && next === '/') {
        buffer += next
        inBlockComment = false
        i += 2
      } else {
        i += 1
      }
      continue
    }

    if (inSingle) {
      buffer += char
      if (char === '\\') {
        if (next) buffer += next
        i += 2
        continue
      }
      if (char === "'" && next === "'") {
        buffer += next
        i += 2
        continue
      }
      if (char === "'") inSingle = false
      i += 1
      continue
    }

    if (inDouble) {
      buffer += char
      if (char === '\\') {
        if (next) buffer += next
        i += 2
        continue
      }
      if (char === '"' && next === '"') {
        buffer += next
        i += 2
        continue
      }
      if (char === '"') inDouble = false
      i += 1
      continue
    }

    if (inBacktick) {
      buffer += char
      if (char === '`') inBacktick = false
      i += 1
      continue
    }

    if (char === '-' && next === '-' && /\s/.test(sql[i + 2] || ' ')) {
      buffer += char + next
      inLineComment = true
      i += 2
      continue
    }

    if (char === '#') {
      buffer += char
      inLineComment = true
      i += 1
      continue
    }

    if (char === '/' && next === '*') {
      buffer += char + next
      inBlockComment = true
      i += 2
      continue
    }

    if (char === "'") {
      buffer += char
      inSingle = true
      i += 1
      continue
    }

    if (char === '"') {
      buffer += char
      inDouble = true
      i += 1
      continue
    }

    if (char === '`') {
      buffer += char
      inBacktick = true
      i += 1
      continue
    }

    if (delimiter && sql.startsWith(delimiter, i)) {
      pushStatement()
      i += delimiter.length
      continue
    }

    buffer += char
    i += 1
  }

  pushStatement()
  return statements
}

const coerceSerializable = (value: any): any => {
  if (typeof value === 'bigint') return value.toString()
  if (Buffer.isBuffer(value)) return value.toString('base64')
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(coerceSerializable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, coerceSerializable(entry)]))
  }
  return value
}

const normalizeResult = (result: any) => {
  if (Array.isArray(result)) {
    const rows = result.slice(0, MAX_PREVIEW_ROWS).map(coerceSerializable)
    const columns = rows.length ? Object.keys(rows[0]) : []

    return {
      kind: 'rows',
      rowCount: result.length,
      previewRowCount: rows.length,
      previewLimit: MAX_PREVIEW_ROWS,
      columns,
      rows
    }
  }

  const payload = coerceSerializable(result || {})

  return {
    kind: 'result',
    affectedRows: Number(payload.affectedRows || 0),
    changedRows: Number(payload.changedRows || 0),
    insertId: Number(payload.insertId || 0),
    warningStatus: Number(payload.warningStatus || 0),
    raw: payload
  }
}

export default defineEventHandler(async (event) => {
  const user = event.context.user

  if (!user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo superadmin puede ejecutar SQL.' })
  }

  const body = await readBody(event)
  const sql = String(body?.sql || '').trim()
  const continueOnError = Boolean(body?.continueOnError)

  if (!sql) {
    throw createError({ statusCode: 400, message: 'Escribe o carga una consulta SQL.' })
  }

  if (byteLength(sql) > MAX_SQL_BYTES) {
    throw createError({ statusCode: 413, message: 'El SQL supera el límite de 2 MB.' })
  }

  const statements = splitSqlStatements(sql)

  if (!statements.length) {
    throw createError({ statusCode: 400, message: 'No se encontraron sentencias SQL ejecutables.' })
  }

  if (statements.length > MAX_STATEMENTS) {
    throw createError({ statusCode: 400, message: `Demasiadas sentencias. Máximo permitido: ${MAX_STATEMENTS}.` })
  }

  const startedAt = Date.now()
  const results: any[] = []
  let failed = 0

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index]
    const statementStartedAt = Date.now()

    try {
      const result = await runRawSqlStatement<any>(statement)
      results.push({
        index: index + 1,
        sql: statement,
        status: 'success',
        durationMs: Date.now() - statementStartedAt,
        result: normalizeResult(result)
      })
    } catch (error: any) {
      failed += 1
      const httpStatus = error?.httpStatus || error?.statusCode || error?.status || null

      results.push({
        index: index + 1,
        sql: statement,
        status: 'error',
        durationMs: Date.now() - statementStartedAt,
        error: {
          message: error?.message || 'Error ejecutando sentencia.',
          code: error?.code || (httpStatus ? `DB_BRIDGE_HTTP_${httpStatus}` : null),
          errno: error?.errno || null,
          sqlState: error?.sqlState || null,
          httpStatus,
          hint: httpStatus === 503
            ? 'El DB bridge devolvió 503. La sentencia no se confirmó; revisa que el agente/bridge esté disponible y reintenta cuando responda.'
            : null
        }
      })

      if (!continueOnError) break
    }
  }

  const transport = getDbTransport()
  let bridgeAgentId: string | null = null

  if (transport === 'bridge') {
    try {
      bridgeAgentId = getBridgeAgentId()
    } catch (e) {}
  }

  return {
    success: failed === 0,
    stopped: failed > 0 && results.length < statements.length,
    totalStatements: statements.length,
    executedStatements: results.length,
    successfulStatements: results.filter((entry) => entry.status === 'success').length,
    failedStatements: failed,
    durationMs: Date.now() - startedAt,
    activePlantel: user.active_plantel,
    dataPlantel: bridgeAgentId || user.auth_home_plantel || user.active_plantel,
    transport,
    results
  }
})
