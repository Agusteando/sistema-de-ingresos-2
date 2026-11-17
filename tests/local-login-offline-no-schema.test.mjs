import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const login = read('../server/api/auth/local-login.post.ts')
const db = read('../server/utils/db.ts')
const health = read('../server/api/system/health.get.ts')

test('Aurora Local login reads existing campus accounts without starting schema migrations', () => {
  assert.match(login, /import\s*\{\s*runRawSqlStatement,\s*getDbTransport\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\/db['"]/)
  assert.match(login, /await\s+runRawSqlStatement<any\[\]>\('SELECT \* FROM users WHERE username = \? LIMIT 1',\s*\[username\]\)/)
  assert.doesNotMatch(login, /await\s+query<any\[\]>/)
  assert.match(db, /if\s*\(getTransport\(\)\s*!==\s*'bridge'\)\s*await\s+ensureSchema\(\)/)
  assert.match(db, /export const runRawSqlStatement = async/)
})

test('local login retains campus scope, bcrypt, signed session and financial access checks', () => {
  assert.match(login, /getDbTransport\(\)\s*!==\s*'direct'/)
  assert.match(login, /accountPlantel\s*&&\s*accountPlantel\s*!==\s*plantel/)
  assert.match(login, /bcrypt\.compare\(password, hash\)/)
  assert.match(login, /hasFinancialAccessForPlantel/)
  assert.match(login, /setAuthSessionToken\(event/)
})

test('existing authenticated health endpoint uses raw SQL without an implicit schema initialization', () => {
  assert.match(health, /runRawSqlStatement<any\[\]>\('SELECT 1 AS ok/)
  assert.match(health, /const ok = mysqlOk/)
})
