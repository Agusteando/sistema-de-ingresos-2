import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../server/utils/conceptos-config.ts', import.meta.url), 'utf8')
const start = source.indexOf('export const createOrUpdateMapping =')
const end = source.indexOf('export const deleteMapping =', start)
assert.ok(start >= 0 && end > start, 'the enrollment mapping write path must exist')
const code = ts.transpileModule(
  source.slice(start, end).replace('export const createOrUpdateMapping =', 'const createOrUpdateMapping =') + '\nglobalThis.save = createOrUpdateMapping',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText

const harness = ({ initialCycles = [['2026', 1]], initialMappings = [], parentFailure = false } = {}) => {
  const cycles = new Map(initialCycles)
  const mappings = initialMappings.map((row) => ({ ...row }))
  const statements = []
  let mirrored = 0
  const query = async (sql, params = []) => {
    statements.push({ sql: sql.trim(), params })
    if (/^INSERT IGNORE INTO config_school_cycles/.test(sql.trim())) {
      if (parentFailure) throw Error('school-cycle table unavailable')
      if (!cycles.has(params[0])) cycles.set(params[0], 0)
      return []
    }
    if (/^SELECT id FROM config_enrollment_mappings/.test(sql.trim())) {
      return mappings.filter((row) => row.ciclo === params[0] && row.plantel === params[1]
        && row.concepto_id === params[2] && row.tipo === params[3]).map((row) => ({ id: row.id }))
    }
    if (/^INSERT INTO config_enrollment_mappings/.test(sql.trim())) {
      if (!cycles.has(params[0])) throw Error('ER_NO_REFERENCED_ROW_2')
      mappings.push({ id: mappings.length + 1, ciclo: params[0], plantel: params[1], concepto_id: params[2], nombre: params[3], tipo: params[4] })
      return []
    }
    if (/^UPDATE config_enrollment_mappings/.test(sql.trim())) {
      const row = mappings.find((item) => item.id === params[6])
      assert.ok(row, 'update should target the existing mapping')
      row.nombre = params[0]
      return []
    }
    throw Error('Unexpected SQL: ' + sql)
  }
  const context = vm.createContext({
    controlEscolarCentralQuery: query,
    normalizeCicloKey: (value) => String(value ?? '').match(/\d{4}/)?.[0] || '',
    normalizePlantel: (value) => String(value ?? '').trim().toUpperCase(),
    normalizeCategory: (value) => String(value || 'regular').trim().toLowerCase(),
    normalizeText: (value, length = 255) => String(value ?? '').trim().slice(0, length),
    normalizeServiceKey: (value) => String(value ?? '').toLowerCase(),
    stringifyMonths: (value) => JSON.stringify(value || []),
    syncCentralConceptosConfigToBridgeBestEffort: async () => { mirrored++; return { ok: true } },
    refreshTalleresAfterCommittedConfigWrite: async () => ({ success: true }),
    createError: (opts) => Object.assign(Error(opts.message), opts),
    Date,
  })
  vm.runInContext(code, context)
  return {
    save: (input) => context.save(input, { email: 'admin@example.invalid' }),
    cycles, mappings, statements, mirrored: () => mirrored,
  }
}

const enrollment = (ciclo = '2027') => ({
  ciclo, plantel: 'CT', concepto_id: 1115,
  concepto_nombre: 'INSCRIPCION 2027-2028 PREESCOLAR TOLUCA', tipo: 'regular',
})

test('unregistered future cycle gets an inactive parent before its enrollment mapping is saved', async () => {
  const db = harness()
  const result = await db.save(enrollment())
  assert.equal(result.ok, true)
  assert.equal(db.cycles.get('2027'), 0)
  assert.equal(db.cycles.get('2026'), 1, 'current cycle remains unchanged')
  assert.equal(db.mappings.length, 1)
  assert.equal(db.mappings[0].ciclo, '2027', 'mapping remains readable after a page refresh')
  assert.match(db.statements[0].sql, /^INSERT IGNORE INTO config_school_cycles/)
  assert.match(db.statements[2].sql, /^INSERT INTO config_enrollment_mappings/)
  assert.equal(db.mirrored(), 1)
})

test('existing cycles and mappings are preserved; repeated saves update rather than duplicate', async () => {
  const db = harness({ initialCycles: [['2026', 1], ['2027', 0]], initialMappings: [
    { id: 9, ciclo: '2027', plantel: 'CT', concepto_id: 1115, nombre: 'old', tipo: 'regular' },
    { id: 10, ciclo: '2026', plantel: 'ST', concepto_id: 1119, nombre: 'existing', tipo: 'regular' },
  ] })
  await db.save(enrollment())
  assert.equal(db.mappings.length, 2)
  assert.equal(db.mappings[0].nombre, 'INSCRIPCION 2027-2028 PREESCOLAR TOLUCA')
  assert.equal(db.mappings[1].nombre, 'existing')
  assert.equal(db.cycles.get('2026'), 1)
  assert.equal(db.cycles.get('2027'), 0)
  assert.ok(db.statements.every(({ sql }) => !/^DELETE|^UPDATE config_school_cycles/.test(sql)))
})

test('failed parent registration cannot be reported as a successful mapping write', async () => {
  const db = harness({ parentFailure: true })
  await assert.rejects(db.save(enrollment()), /school-cycle table unavailable/)
  assert.equal(db.mappings.length, 0)
  assert.equal(db.mirrored(), 0)
  assert.equal(db.statements.length, 1)
})

test('invalid enrollment input never registers a new cycle', async () => {
  const db = harness()
  await assert.rejects(db.save({ ...enrollment(), concepto_id: 0 }), /Selecciona un concepto financiero/)
  assert.equal(db.cycles.has('2027'), false)
  assert.equal(db.statements.length, 0)
})
