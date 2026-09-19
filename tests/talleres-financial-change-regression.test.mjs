import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = resolve('.')

const loadShared = async () => {
  const source = await readFile(resolve(root, 'shared/utils/talleresServicios.ts'), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  const context = vm.createContext({ console })
  const module = new vm.SourceTextModule(js, { context, identifier: 'talleresServicios.ts' })
  await module.link(() => { throw new Error('shared talleresServicios must remain dependency-free') })
  await module.evaluate()
  return module.namespace
}

test('stale financial write-through does not survive a workshop change', async () => {
  const shared = await loadShared()
  const history = {
    FUTBOL: { lastAction: 'assigned', lastSource: 'financial_concept' },
    TENIS: { lastAction: 'assigned', lastSource: 'aurora_portal_snapshot_v2' },
  }

  assert.equal(shared.shouldIncludeDirectTallerAssignment({
    value: 'FÚTBOL',
    financialKeys: ['ROBOTICA'],
    history,
  }), false, 'FUTBOL was finance-managed and no longer has financial evidence')

  assert.equal(shared.shouldIncludeDirectTallerAssignment({
    value: 'TENIS',
    financialKeys: ['ROBOTICA'],
    history,
  }), true, 'manual direct assignments must survive unrelated financial changes')

  assert.equal(shared.shouldIncludeDirectTallerAssignment({
    value: 'FÚTBOL',
    financialKeys: ['FUTBOL'],
    history: { FUTBOL: { lastAction: 'removed', lastSource: 'financial_concept_change' } },
  }), true, 'another active financial document for FUTBOL must keep the assignment')
})

test('explicitly removed direct assignments stay removed without current financial evidence', async () => {
  const shared = await loadShared()
  assert.equal(shared.shouldIncludeDirectTallerAssignment({
    value: 'FUTBOL',
    financialKeys: [],
    history: { FUTBOL: { lastAction: 'removed', lastSource: 'financial_concept_change' } },
  }), false)
})

test('financial lifecycle endpoints reconcile assignment history and force Talleres snapshot refresh', async () => {
  const [directChange, periodChange, deleteDoc, createDoc, servicios, snapshot, contracts] = await Promise.all([
    readFile(resolve(root, 'server/api/documentos/[id]/concepto.put.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/documentos/period.post.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/documentos/[id].delete.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/documentos/index.post.ts'), 'utf8'),
    readFile(resolve(root, 'server/utils/talleres-servicios.ts'), 'utf8'),
    readFile(resolve(root, 'server/utils/talleres-snapshot.ts'), 'utf8'),
    readFile(resolve(root, 'server/utils/talleres-contracts.ts'), 'utf8'),
  ])

  assert.match(directChange, /syncChangedConceptMappedServicioToMatricula/)
  assert.match(directChange, /refreshTalleresSnapshotPlantel\(\{ plantel: doc\.plantel, ciclo: effectiveCiclo, force: true \}\)/)

  assert.match(periodChange, /syncChangedConceptMappedServicioToMatricula/)
  assert.match(periodChange, /syncCancelledConceptMappedServicioOnMatricula/)
  assert.match(periodChange, /effectiveConceptIdAt/)
  assert.match(periodChange, /refreshTalleresSnapshotPlantel\(\{ plantel, ciclo, force: true \}\)/)

  assert.match(deleteDoc, /syncCancelledConceptMappedServicioOnMatricula/)
  assert.match(deleteDoc, /refreshTalleresSnapshotPlantel/)
  assert.match(createDoc, /refreshTalleresSnapshotPlantel/)

  assert.match(servicios, /source: 'financial_concept_change'/)
  assert.match(servicios, /source: 'financial_concept_cancel'/)
  assert.match(servicios, /readCurrentFinancialTallerKeys/)
  assert.match(servicios, /readTalleresAssignmentSummaries/)
  assert.match(servicios, /previousFinanciallyManaged/)
  assert.match(servicios, /financiallyManaged/)
  assert.match(snapshot, /shouldIncludeDirectTallerAssignment/)
  assert.match(contracts, /metadata_json/)
  assert.match(contracts, /lastSource/)
})
