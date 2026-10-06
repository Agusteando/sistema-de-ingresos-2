import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

async function load({ authorized = true, plantel = 'PM', transport = 'bridge' } = {}) {
  const calls = [], headers = {}, scopes = []
  const query = async (sql, params = []) => {
    calls.push({ sql, params })
    assert.match(sql.trim(), /^(SELECT|SHOW)\b/)
    if (sql.includes('FROM base')) return [{ matricula: 'PM1152', plantel }]
    if (sql.includes('SHOW COLUMNS')) return ['documento', 'matricula', 'ciclo', 'estatus', 'montoFinal', 'folio', 'mes', 'monto', 'fecha'].map(Field => ({ Field }))
    if (sql.includes('FROM documentos')) return [{ documento: 100, estatus: 'Activo' }, { documento: 101, estatus: 'Cancelado' }]
    if (sql.includes('FROM referenciasdepago')) return [{ folio: 10, documento: 101, estatus: 'Cancelado' }]
    return []
  }
  const context = vm.createContext({
    defineEventHandler: fn => fn,
    setResponseHeader: (_, name, value) => { headers[name] = value },
    createError: data => Object.assign(new Error(data.message), data),
  })
  const dependency = new vm.SyntheticModule(['assertAuroraExternalApiToken', 'getDbTransport', 'runRawSqlStatement', 'runWithBridgeAgentId'], function () {
    this.setExport('assertAuroraExternalApiToken', () => { if (!authorized) throw new Error('unauthorized') })
    this.setExport('getDbTransport', () => transport)
    this.setExport('runRawSqlStatement', query)
    this.setExport('runWithBridgeAgentId', async (scope, fn) => { scopes.push(scope); return await fn() })
  }, { context })
  const source = await readFile('server/api/external/v1/incidents/pm1152.get.ts', 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  const module = new vm.SourceTextModule(code, { context })
  await module.link(() => dependency)
  await module.evaluate()
  return { handler: module.namespace.default, calls, headers, scopes }
}

test('authentication precedes any financial read', async () => {
  const harness = await load({ authorized: false })
  await assert.rejects(harness.handler({ context: {} }), /unauthorized/)
  assert.equal(harness.calls.length, 0)
})
test('incident read includes cancelled documents and payments without writes or schema repair', async () => {
  const harness = await load()
  const result = await harness.handler({ context: { auroraRequestId: 'test-request' } })
  assert.equal(result.documents.length, 2)
  assert.equal(result.documents[1].estatus, 'Cancelado')
  assert.equal(result.payments[0].estatus, 'Cancelado')
  assert.equal(result.requestId, 'test-request')
  assert.deepEqual(harness.scopes, ['PM'])
  assert.equal(harness.headers['Cache-Control'], 'private, no-store')
  const docQuery = harness.calls.find(call => call.sql.trim().startsWith('SELECT') && call.sql.includes('FROM documentos'))
  assert.deepEqual(Array.from(docQuery.params), ['PM1152', '2026', '2026-2027'])
  assert.doesNotMatch(docQuery.sql, /estatus\s*=/)
})
test('wrong physical plantel fails closed before ledger reads', async () => {
  const harness = await load({ plantel: 'PT' })
  await assert.rejects(harness.handler({ context: {} }), error => error.statusCode === 409)
  assert.equal(harness.calls.length, 1)
})
test('direct transport does not select a bridge agent', async () => {
  const harness = await load({ transport: 'direct' })
  await harness.handler({ context: {} })
  assert.deepEqual(harness.scopes, [undefined])
})
