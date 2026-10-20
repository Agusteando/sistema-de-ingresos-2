import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const root = resolve('.')
const loadRoute = async (path, dependencies) => {
  const source = await readFile(resolve(root, path), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(js, {
    module, exports: module.exports,
    require: name => { if (!(name in dependencies)) throw Error('Unmocked import: ' + name); return dependencies[name] },
    defineEventHandler: fn => fn,
    readBody: async event => event.body,
    createError: details => Object.assign(Error(details.statusMessage || details.message), details),
    console
  })
  return module.exports.default
}

const debtor = (matricula, mes, isDeudor = true) => ({
  matricula, mes, isDeudor, correo: matricula.toLowerCase() + '@example.org',
  nombreCompleto: matricula, saldoPendiente: 500, desglose: []
})
const mocks = (rows, onSend = async () => ({ messageId: 'gmail-test', sender: 'workspace@example.org' })) => {
  const calls = []
  const db = {
    runWithBridgeAgentId: async (_agent, fn) => fn(),
    query: async (sql) => {
      calls.push('SQL:' + sql)
      if (sql.includes('FROM cobranza_eventos')) return []
      if (sql.includes('FROM cobranza_email_templates')) return [{ subject: 'Estado', html_template: 'Plantilla', include_desglose: 1 }]
      if (sql.includes('INSERT INTO cobranza_eventos')) return []
      throw Error('Unexpected query')
    }
  }
  return {
    calls,
    imports: {
      '../../utils/db': db,
      '../../utils/deudores': { getDeudoresGlobal: async args => { calls.push(['debt', args]); return rows } },
      '../../utils/cobranzaEmail': {
        normalizeTemplateInput: value => ({ subject: value?.subject || 'Estado', htmlTemplate: value?.htmlTemplate || 'Plantilla', includeDesglose: value?.includeDesglose ?? true }),
        renderCobranzaEmail: input => ({ subject: input.subject, html: '<p>' + input.matricula + '</p>', desglose: [] })
      },
      '../../utils/mailer': { sendEmail: async (...args) => { calls.push(['send', args[0]]); return onSend(...args) } },
      '../../utils/whatsapp': { whatsappApi: {} },
      'node:crypto': {}
    }
  }
}
const event = () => ({
  context: { user: { email: 'operator@example.org', active_plantel: 'PREEM' }, dbBridgeAgentId: 'PREEM', auroraRequestId: 'request-1' },
  body: { ciclo: '2026-2027', items: ['PREEM1000', 'PREEM1001', 'PREEM1002'].map(matricula => ({ matricula, mes: 2 })) }
})
test('preview uses one scoped batch and excludes no-longer-due entries', async () => {
  const m = mocks([debtor('PREEM1000', 2), debtor('PREEM1001', 2, false)])
  const run = await loadRoute('server/api/deudores/email-preview.post.ts', m.imports)
  const result = await run(event())
  assert.equal(result.available, 1)
  assert.equal(result.failed, 2)
  assert.equal(m.calls.filter(x => Array.isArray(x) && x[0] === 'debt').length, 1)
  assert.deepEqual(Array.from(m.calls.find(x => Array.isArray(x) && x[0] === 'debt')[1].matriculas), ['PREEM1000', 'PREEM1001', 'PREEM1002'])
})
test('send batch records only accepted deliveries and returns partial failures', async () => {
  const m = mocks([debtor('PREEM1000', 2), debtor('PREEM1001', 2)], async recipient => {
    if (recipient === 'preem1001@example.org') throw Error('Gmail unavailable')
    return { messageId: 'gmail-test', sender: 'workspace@example.org' }
  })
  const run = await loadRoute('server/api/deudores/actions.post.ts', m.imports)
  const e = event()
  e.body.accion = 'correo_recordatorio'
  const result = await run(e)
  assert.equal(result.completed, 1)
  assert.equal(result.failed, 2)
  assert.equal(m.calls.filter(x => Array.isArray(x) && x[0] === 'debt').length, 1)
  assert.equal(m.calls.filter(x => Array.isArray(x) && x[0] === 'send').length, 2)
  assert.equal(m.calls.filter(x => typeof x === 'string' && x.includes('INSERT INTO cobranza_eventos')).length, 1)
})
test('source retains active status, plantel scope and partial-send retry UI', async () => {
  const [deudores, page] = await Promise.all([
    readFile(resolve(root, 'server/utils/deudores.ts'), 'utf8'),
    readFile(resolve(root, 'pages/deudores.vue'), 'utf8')
  ])
  assert.ok(deudores.includes('...matriculasFiltro, ...plantelCandidates'))
  assert.ok(deudores.includes("estatus = 'Activo' AND matricula IN"))
  assert.ok(page.includes("options.confirmed && !failed"))
  assert.ok(page.includes('emailComposer.error = describeEmailError(e)'))
})
