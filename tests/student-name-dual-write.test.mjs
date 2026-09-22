import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

async function harness({ failTransaction = false } = {}) {
  const calls = []
  const warnings = []
  const context = vm.createContext({
    console: {
      info: (...args) => calls.push({ kind: 'info', args }),
      warn: (...args) => warnings.push(args),
    },
    Promise,
    Set,
    String,
    Object,
    Array,
  })

  const db = {
    executeStatementTransaction: async (statements) => {
      calls.push({ kind: 'transaction', statements })
      if (failTransaction) throw Object.assign(new Error('bridge unavailable'), { code: 'DB_BRIDGE_AGENT_OFFLINE' })
      return [{ affectedRows: 1 }, { affectedRows: 1 }]
    },
    runWithBridgeAgentId: async (agentId, callback) => {
      calls.push({ kind: 'agent', agentId })
      return await callback()
    },
  }

  const dbModule = new vm.SyntheticModule(Object.keys(db), function () {
    for (const [name, value] of Object.entries(db)) this.setExport(name, value)
  }, { context })

  const source = await readFile(resolve('server/utils/student-name-sync.ts'), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText

  const module = new vm.SourceTextModule(js, { context, identifier: 'student-name-sync.ts' })
  await module.link((specifier) => {
    if (specifier === './db') return dbModule
    throw new Error(`Unexpected import: ${specifier}`)
  })
  await module.evaluate()

  return { api: module.namespace, calls, warnings }
}

test('name change detection is narrow and ignores unrelated student fields', async () => {
  const { api } = await harness()
  const before = { apellidoPaterno: 'Reyes', apellidoMaterno: 'Padiñas', nombres: 'Fernando Liam', curp: 'OLD' }

  assert.deepEqual(Array.from(api.studentNameFieldsInPatch({ nombres: 'Fernando', curp: 'NEW' })), ['nombres'])
  assert.deepEqual(Array.from(api.studentNameFieldsChanged(before, { nombres: 'Fernando Liam', curp: 'NEW' })), [])
  assert.deepEqual(Array.from(api.studentNameFieldsChanged(before, { nombres: 'Fernando' })), ['nombres'])
})

test('Control Escolar mirrors only changed name columns to Bridge and recomputes nombreCompleto', async () => {
  const { api, calls } = await harness()

  await api.syncStudentNamePatchToBridgeBase({
    agentId: 'ST',
    matricula: 'ST001',
    fields: ['nombres'],
    values: { nombres: 'Fernando Liam' },
  })

  assert.equal(calls.find((call) => call.kind === 'agent')?.agentId, 'ST')
  const transaction = calls.find((call) => call.kind === 'transaction')
  assert.ok(transaction)
  assert.equal(transaction.statements.length, 2)
  assert.match(transaction.statements[0].sql, /UPDATE base[\s\S]*nombres = \?[\s\S]*WHERE matricula = \?/)
  assert.doesNotMatch(transaction.statements[0].sql, /apellidoPaterno = \?|apellidoMaterno = \?|curp|grado|nivel/)
  assert.deepEqual(Array.from(transaction.statements[0].params), ['Fernando Liam', 'ST001'])
  assert.match(
    transaction.statements[1].sql,
    /nombreCompleto = CONCAT\(apellidoPaterno, ' ', apellidoMaterno, ' ', nombres\)/,
  )
  assert.deepEqual(Array.from(transaction.statements[1].params), ['ST001'])
})

test('secondary synchronization failures are non-blocking and are captured in logs', async () => {
  const { api, warnings } = await harness({ failTransaction: true })
  let background

  const returned = api.scheduleStudentNameSync(
    {
      waitUntil(promise) {
        background = promise
      },
    },
    () =>
      api.syncStudentNamePatchToBridgeBase({
        agentId: 'ST',
        matricula: 'ST001',
        fields: ['nombres'],
        values: { nombres: 'Fernando Liam' },
      }),
    { direction: 'central-to-bridge', matricula: 'ST001' },
  )

  assert.equal(returned, undefined)
  assert.ok(background)
  await background
  assert.equal(warnings.length, 1)
  assert.match(String(warnings[0][0]), /Secondary name synchronization failed/)
})

test('both production write routes keep their current primary write first and queue only the name mirror', async () => {
  const [alumnoRoute, controlRoute] = await Promise.all([
    readFile(resolve('server/api/students/[matricula]/index.ts'), 'utf8'),
    readFile(resolve('server/api/control-escolar/students/[id].patch.ts'), 'utf8'),
  ])

  const alumnoPrimary = alumnoRoute.indexOf('await executeStatementTransaction(statements);')
  const alumnoSecondary = alumnoRoute.indexOf('scheduleStudentNameSync(')
  assert.ok(alumnoPrimary >= 0 && alumnoSecondary > alumnoPrimary)
  assert.match(alumnoRoute, /studentNameFieldsChanged\([\s\S]*currentStudent[\s\S]*namePatch/)
  assert.match(alumnoRoute, /updateControlEscolarStudent\([\s\S]*plantel[\s\S]*namePatch/)

  const controlPrimary = controlRoute.indexOf('await updateControlEscolarStudent(')
  const controlSecondary = controlRoute.indexOf('scheduleStudentNameSync(')
  assert.ok(controlPrimary >= 0 && controlSecondary > controlPrimary)
  assert.match(controlRoute, /studentNameFieldsInPatch\(body\)/)
  assert.match(controlRoute, /syncStudentNamePatchToBridgeBase\(/)
})
