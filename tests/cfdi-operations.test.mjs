import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

// Exercise the actual adapters with isolated DB/provider doubles; never use
// credentials, the production database, or a live stamping endpoint.
const root = resolve('server/utils')
async function harness(overrides = {}) {
  const calls = []
  const env = Object.fromEntries(['IEDIS', 'IECS', 'SILVIA'].map(a => [`FACTURAPI_LIVE_KEY_${a}`, `test-${a}`]))
  const db = {
    executeStatementTransaction: async () => { throw new Error('Unexpected transaction') },
    query: async (sql, params) => {
      calls.push({ kind: 'local', sql, params })
      assert.ok(!sql.includes('company_data'), 'Fiscal profiles must never use the campus DB')
      return []
    },
    ...overrides.db,
  }
  const context = vm.createContext({
    Buffer, URLSearchParams, AbortController, Headers, Response,
    setTimeout: overrides.setTimeout || setTimeout, clearTimeout,
    process: { env }, console: { warn() {}, error() {} },
    createError: value => Object.assign(new Error(value.message), value),
    getQuery: event => event.query || {},
    readBody: async event => event.body,
    setHeader: (event, key, value) => { (event.headers ||= {})[key] = value },
    fetch: async (url, options) => {
      calls.push({ kind: 'provider', url, options })
      if (overrides.fetch) return overrides.fetch(url, options)
      if (url.includes('series-group')) return Response.json([{ series: 'CM' }])
      return Response.json({ id: 'invoice-1', series: 'CM', folio_number: 10 })
    },
    $fetch: async (url, options) => {
      calls.push({ kind: 'legacy', url, options })
      if (overrides.legacy) return overrides.legacy(url, options)
      return { success: true, invoice_id: 'legacy-1' }
    },
  })
  const modules = new Map()
  const dbModule = new vm.SyntheticModule(Object.keys(db), function () {
    for (const [name, value] of Object.entries(db)) this.setExport(name, value)
  }, { context })
  const centralModule = new vm.SyntheticModule(['controlEscolarCentralQuery'], function () {
    this.setExport('controlEscolarCentralQuery', async (sql, params) => {
      calls.push({ kind: 'central', sql, params })
      assert.ok(!/\b(?:CREATE|ALTER|DROP)\b/i.test(sql), 'No schema changes are allowed')
      assert.ok(!sql.includes('FROM facturas'), 'Campus index cannot be joined on central DB')
      return overrides.central ? overrides.central(sql, params) : []
    })
  }, { context })
  async function load(path) {
    if (modules.has(path)) return modules.get(path)
    const source = await readFile(path, 'utf8')
    const js = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    } }).outputText
    const module = new vm.SourceTextModule(js, { context, identifier: path })
    modules.set(path, module)
    await module.link((specifier, parent) => specifier === './db'
      ? dbModule : specifier === './control-escolar-central'
        ? centralModule : load(resolve(dirname(parent.identifier), `${specifier}.ts`)))
    return module
  }
  const module = await load(resolve(root, 'cfdi-compat.ts'))
  await module.evaluate()
  return {
    calls, env,
    request: (path, body, query = {}, method = body ? 'POST' : 'GET') =>
      module.namespace.proxyCfdiCompatEvent({ node: { req: { method } }, body, query }, path),
    studentSync: async matricula => {
      const studentModule = await load(resolve(root, 'student-invoices.ts'))
      await studentModule.evaluate()
      return studentModule.namespace.syncStudentInvoices(matricula)
    },
  }
}

const payload = () => ({
  companyData: { legal_name: 'TEST', tax_id: 'XAXX010101000', email: 'test@example.com',
    tax_system: '616', zip: '50000', nombreCompleto: 'TEST STUDENT', CURP: 'TEST',
    nivelEducativo: 'Preescolar', autRVOE: 'TEST' },
  invoiceData: { customer: { matricula: 'CM001', tax_id: ' xaxx010101000 ' },
    items: [], payment_form: '03', use: 'D10', facturaCon: 'IECS' },
})

test('invoice saves fiscal data centrally and is issued directly once without a campus query', async () => {
  const h = await harness()
  const response = await h.request('saveCompanyAndGenerate', payload())
  assert.equal(response.success, true)
  assert.equal(h.calls.filter(c => c.kind === 'local').length, 0)
  assert.equal(h.calls.filter(c => c.kind === 'central').length, 1)
  assert.match(h.calls.find(c => c.kind === 'central').sql, /INSERT INTO company_data/)
  assert.equal(h.calls.filter(c => c.kind === 'legacy').length, 0)
  const invoices = h.calls.filter(c => c.kind === 'provider' && c.url.endsWith('/invoices'))
  assert.equal(invoices.length, 1)
  const sent = JSON.parse(invoices[0].options.body)
  assert.equal(sent.customer.tax_id, 'XAXX010101000')
  assert.equal(sent.series, 'CM')
  assert.equal(sent.customer.matricula, undefined)
  assert.equal(invoices[0].options.headers.Authorization, 'Bearer test-IECS')
})

test('fiscal profile reads only the central source', async () => {
  const h = await harness({ central: async () => [{ tax_id: 'XAXX010101000' }] })
  const response = await h.request('getCompanyData', undefined, { matricula: 'CM001' })
  assert.equal(response.data.tax_id, 'XAXX010101000')
  assert.equal(h.calls.filter(c => c.kind === 'central').length, 1)
  assert.equal(h.calls.filter(c => c.kind === 'local' || c.kind === 'legacy').length, 0)
})

test('absent central profile stays absent without consulting the campus database', async () => {
  const h = await harness()
  assert.equal((await h.request('getCompanyData', undefined, { matricula: 'CM001' })).data, null)
  assert.equal(h.calls.filter(c => c.kind === 'local' || c.kind === 'legacy').length, 0)
})

test('missing key falls back before database work with no automatic retries', async () => {
  const h = await harness()
  delete h.env.FACTURAPI_LIVE_KEY_IECS
  assert.equal((await h.request('saveCompanyAndGenerate', payload())).success, true)
  assert.equal(h.calls.filter(c => ['central', 'local', 'provider'].includes(c.kind)).length, 0)
  const legacy = h.calls.filter(c => c.kind === 'legacy')
  assert.equal(legacy.length, 1)
  assert.equal(legacy[0].options.retry, 0)
  assert.equal(legacy[0].options.timeout, 60_000)
})

for (const failure of ['network', 'timeout', '500', '400']) {
  test(`invoice ${failure} is never retried or sent to legacy`, async () => {
    const h = await harness({ fetch: async url => {
      if (url.includes('series-group')) return Response.json([{ series: 'CM' }])
      if (failure === 'network') throw new TypeError('fetch failed')
      if (failure === 'timeout') throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      return Response.json({ message: 'Provider rejected request' }, { status: Number(failure) })
    } })
    await assert.rejects(h.request('saveCompanyAndGenerate', payload()), error => {
      if (failure === 'network' || failure === 'timeout') assert.match(error.message, /No repitas/)
      return true
    })
    assert.equal(h.calls.filter(c => c.kind === 'provider' && c.url.endsWith('/invoices')).length, 1)
    assert.equal(h.calls.filter(c => c.kind === 'legacy').length, 0)
  })
}

test('saved IECS emitter overrides DM prefix for email operations', async () => {
  const h = await harness({ central: async () => [{ factura_con: 'IECS' }] })
  await h.request('sendInvoiceEmail', { invoice_id: 'invoice-1', matricula: 'DM001' })
  assert.equal(h.calls.find(c => c.kind === 'provider').options.headers.Authorization, 'Bearer test-IECS')
})

test('explicit emitter stays authoritative without consulting student profile', async () => {
  const h = await harness({ db: { query: async () => { throw new Error('must not query') } } })
  await h.request('sendInvoiceEmail', { invoice_id: 'invoice-1', matricula: 'DM001', facturaCon: 'SILVIA' })
  assert.equal(h.calls.find(c => c.kind === 'provider').options.headers.Authorization, 'Bearer test-SILVIA')
})

test('invoice-only lookup separates local invoice index from central fiscal profile', async () => {
  const h = await harness({
    db: { query: async sql => {
      assert.ok(!sql.includes('company_data'))
      return [{ matricula: 'DM001', series: 'CM' }]
    } },
    central: async (_sql, params) => {
      assert.equal(params[0], 'DM001')
      return [{ factura_con: 'IECS' }]
    },
  })
  await h.request('invoices/invoice-1/cancel', { motive: '03' })
  const call = h.calls.find(c => c.kind === 'provider')
  assert.equal(call.options.headers.Authorization, 'Bearer test-IECS')
  assert.equal(call.options.method, 'DELETE')
})

test('RFC listing uses central company_data to select the emitter', async () => {
  const h = await harness({ central: async () => [{ matricula: 'DM001', factura_con: 'IECS' }],
    fetch: async () => Response.json({ data: [] }),
  })
  await h.request('invoices', undefined, { tax_id: 'XAXX010101000' })
  assert.equal(h.calls.filter(c => c.kind === 'provider').length, 1)
  assert.equal(h.calls.find(c => c.kind === 'provider').options.headers.Authorization, 'Bearer test-IECS')
})

test('history refresh reads the central profile and overlaps independent bounded legacy searches', async () => {
  let started = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  const h = await harness({ central: async () => [{ tax_id: 'XAXX010101000' }],
    legacy: async (url, options) => {
      assert.ok(url.endsWith('/invoices'))
      assert.equal(options.timeout, 60_000)
      assert.equal(options.retry, 0)
      if (++started === 2) release()
      await gate
      return { success: true, invoices: [] }
    },
  })
  const response = await h.studentSync('CM001')
  assert.equal(started, 2)
  assert.equal(response.updated, 0)
  assert.equal(response.warning, '')
})

test('listing starts independent emitter requests together and preserves sorting', async () => {
  let started = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  const h = await harness({ fetch: async (_url, options) => {
    const number = ++started
    if (started === 3) release()
    await gate
    return Response.json({ data: [{ id: `invoice-${number}`, created_at: `2026-09-0${number}`,
      customer: { tax_id: 'XAXX010101000' }, series: 'CM', total: 100 }] })
  } })
  const response = await h.request('invoices')
  assert.equal(started, 3)
  assert.deepEqual(Array.from(response.invoices, row => row.id), ['invoice-3', 'invoice-2', 'invoice-1'])
})

test('download timeout covers body consumption after response headers arrive', async () => {
  const h = await harness({
    setTimeout: callback => setTimeout(callback, 15),
    fetch: async (_url, options) => ({ ok: true, headers: new Headers(),
      arrayBuffer: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      }),
    }),
  })
  await assert.rejects(h.request('downloadInvoice/invoice-1/pdf', undefined, { facturaCon: 'IECS' }),
    error => error.statusCode === 504)
  assert.equal(h.calls.filter(c => c.kind === 'legacy').length, 0)
})
