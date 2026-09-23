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


test('one-way transport aliases use one canonical SENCILLO identity for every route', async () => {
  const shared = await loadShared()

  assert.equal(shared.normalizeServicioClave('TRANSPORTE SIMPLE R4'), 'TRANSPORTE_SENCILLO_R4')
  assert.equal(shared.normalizeServicioClave('TRANSPORTE_SIMPLE_R6'), 'TRANSPORTE_SENCILLO_R6')
  assert.equal(shared.normalizeServicioClave('Transporte Simple R10'), 'TRANSPORTE_SENCILLO_R10')
  assert.equal(shared.canonicalTallerKey('TRANSPORTE SIMPLE R7'), 'TRANSPORTE_SENCILLO_R7')

  assert.equal(shared.normalizeServicioNombre('TRANSPORTE SIMPLE R6'), 'TRANSPORTE SENCILLO R6')
  assert.equal(shared.normalizeServicioNombre('TRANSPORTE SENCILLO R6'), 'TRANSPORTE SENCILLO R6')

  assert.deepEqual(
    Array.from(shared.parseServiciosCsv('TRANSPORTE SIMPLE R6, TRANSPORTE SENCILLO R6')),
    ['TRANSPORTE SENCILLO R6'],
    'legacy SIMPLE and canonical SENCILLO must not create duplicate memberships',
  )
})

test('legacy Talleres category aliases remain authoritative for financial mappings', async () => {
  const source = await readFile(resolve(root, 'server/utils/talleres-servicios.ts'), 'utf8')

  assert.doesNotMatch(
    source,
    /IFNULL\(enrollment_type, 'regular'\) = 'talleres_servicios'/,
    'resolver must not require only the newest raw category literal',
  )
  const aliases = source.match(/IN \('talleres_servicios', 'talleres', 'talleres_y_servicios'\)/g) || []
  assert.equal(aliases.length, 2, 'both mapping lookup paths must accept the category aliases normalized by /conceptos')
})

test('workshop seed never overwrites an active configured association', async () => {
  const source = await readFile(resolve(root, 'server/utils/conceptos-workshop-seed.ts'), 'utf8')

  assert.match(source, /const activeExisting = existing\.filter\(\(row\) => active\(row\?\.activo\)\)/)
  assert.match(source, /if \(activeExisting\.length\) \{[\s\S]*?unchanged \+= 1[\s\S]*?continue/)
  assert.match(
    source,
    /Boolean\(normalizeServicioClave\(row\.servicio_clave \|\| row\.servicio_nombre\)\)/,
    'seed preview must treat an existing active mapped workshop as complete even when it differs from name inference',
  )
})

test('financial mapping selection is recency-first, not permanently campus-first', async () => {
  const source = await readFile(resolve(root, 'server/utils/talleres-servicios.ts'), 'utf8')
  assert.match(source, /selectPreferredFinancialMapping/)
  assert.match(source, /IFNULL\(sync_version, 0\) AS sync_version/)
  assert.doesNotMatch(source, /candidate\.plantelRank < current\.plantelRank/)
})

test('legacy Talleres mappings with servicio_nombre but no servicio_clave remain authoritative', async () => {
  const source = await readFile(resolve(root, 'server/utils/talleres-servicios.ts'), 'utf8')

  assert.doesNotMatch(
    source,
    /AND IFNULL\(servicio_clave, ''\) <> ''/,
    'Talleres must not discard legacy mappings just because servicio_clave is empty',
  )
  const compatiblePredicates = source.match(/COALESCE\(NULLIF\(TRIM\(servicio_clave\), ''\), NULLIF\(TRIM\(servicio_nombre\), ''\)\) IS NOT NULL/g) || []
  assert.equal(compatiblePredicates.length, 2, 'both concept lookup paths must accept servicio_nombre as the legacy identity')
})

test('newer global Talleres mapping overrides stale seeded campus rows, while later campus overrides still win', async () => {
  const shared = await loadShared()
  const scopes = ['PT', 'GLOBAL']

  const staleCampus = {
    id: 84,
    plantel: 'PT',
    sync_version: 100,
    servicio_clave: 'GIMNASIA_RITMICA',
  }
  const correctedGlobal = {
    id: 189,
    plantel: 'GLOBAL',
    sync_version: 200,
    servicio_clave: 'GIMNASIA',
  }

  assert.equal(
    shared.selectPreferredFinancialMapping([staleCampus, correctedGlobal], scopes)?.servicio_clave,
    'GIMNASIA',
    'PT1271 marker: newer GLOBAL GIMNASIA mapping must supersede stale PT GIMNASIA_RITMICA seed row',
  )

  const laterCampusOverride = {
    id: 250,
    plantel: 'PT',
    sync_version: 300,
    servicio_clave: 'GIMNASIA_RITMICA',
  }
  assert.equal(
    shared.selectPreferredFinancialMapping([correctedGlobal, laterCampusOverride], scopes)?.servicio_clave,
    'GIMNASIA_RITMICA',
    'a genuinely newer plantel-specific override must still supersede GLOBAL',
  )

  const noVersions = [
    { id: 84, plantel: 'PT', servicio_clave: 'OLD' },
    { id: 189, plantel: 'GLOBAL', servicio_clave: 'NEW' },
  ]
  assert.equal(
    shared.selectPreferredFinancialMapping(noVersions, scopes)?.servicio_clave,
    'NEW',
    'row id is the safe recency fallback when sync_version is unavailable',
  )
})

test('financial mappings survive Bridge concept-id drift by unambiguous concept name', async () => {
  const shared = await loadShared()
  const indexes = shared.buildFinancialConceptMappingIndexes([
    { conceptoId: 501, conceptoNombre: 'GIMNASIA RITMICA', clave: 'GIMNASIA', nombre: 'GIMNASIA' },
    { conceptoId: 1069, conceptoNombre: 'TRANSPORTE SENCILLO RUTA 2 2026-2027', clave: 'TRANSPORTE_SENCILLO_R2', nombre: 'TRANSPORTE SENCILLO R2' },
  ])

  const exact = shared.resolveFinancialConceptMapping(indexes, {
    conceptoId: 1069,
    conceptoNombre: 'TRANSPORTE SENCILLO RUTA 2 2026-2027',
  })
  assert.equal(exact?.mapping?.clave, 'TRANSPORTE_SENCILLO_R2')
  assert.equal(exact?.matchedBy, 'id')

  const drifted = shared.resolveFinancialConceptMapping(indexes, {
    conceptoId: 999501,
    conceptoNombre: 'Gimnasia Rítmica',
  })
  assert.equal(drifted?.mapping?.clave, 'GIMNASIA', 'PT1271 marker: GIMNASIA RITMICA must resolve to GIMNASIA even when Bridge concept ID drifted')
  assert.equal(drifted?.matchedBy, 'name')

  const ambiguous = shared.buildFinancialConceptMappingIndexes([
    { conceptoId: 1, conceptoNombre: 'TALLER DUPLICADO', clave: 'FUTBOL', nombre: 'FUTBOL' },
    { conceptoId: 2, conceptoNombre: 'TALLER DUPLICADO', clave: 'TENIS', nombre: 'TENIS' },
  ])
  assert.equal(
    shared.resolveFinancialConceptMapping(ambiguous, { conceptoId: 999, conceptoNombre: 'Taller Duplicado' }),
    null,
    'name fallback must never guess when the same concept name maps to different workshops',
  )
})

test('Aurora student Talleres UI unions manual and financial assignments', async () => {
  const [getApi, putApi, details, servicios] = await Promise.all([
    readFile(resolve(root, 'server/api/students/[matricula]/servicios/index.get.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/students/[matricula]/servicios/index.put.ts'), 'utf8'),
    readFile(resolve(root, 'components/StudentDetails.vue'), 'utf8'),
    readFile(resolve(root, 'server/utils/talleres-servicios.ts'), 'utf8'),
  ])

  assert.match(getApi, /readEffectiveStudentServicios/)
  assert.match(putApi, /readEffectiveStudentServicios/)
  assert.match(servicios, /resolveFinancialConceptMapping/)
  assert.match(servicios, /concepto_nombre/)
  assert.doesNotMatch(servicios, /CAST\(\$\{effectiveConcept\} AS UNSIGNED\) IN/)
  assert.match(details, /servicio\.directa === false/)
  assert.match(details, />Concepto<\/small>/)
  assert.match(details, /servicio\.directa !== false/)
})

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
  assert.match(directChange, /ensureCurrentTalleresSnapshotPlantel\(\{ plantel: doc\.plantel, ciclo: effectiveCiclo, force: true \}\)/)

  assert.match(periodChange, /syncChangedConceptMappedServicioToMatricula/)
  assert.match(periodChange, /syncCancelledConceptMappedServicioOnMatricula/)
  assert.match(periodChange, /effectiveConceptIdAt/)
  assert.match(periodChange, /ensureCurrentTalleresSnapshotPlantel\(\{ plantel, ciclo, force: true \}\)/)

  assert.match(deleteDoc, /syncCancelledConceptMappedServicioOnMatricula/)
  assert.match(deleteDoc, /ensureCurrentTalleresSnapshotPlantel/)
  assert.match(createDoc, /ensureCurrentTalleresSnapshotPlantel/)

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


test('snapshot-backed Talleres v1 never knowingly serves stale data or seed catalog fallbacks', async () => {
  const [snapshot, rosterApi, metaApi, searchApi, warmApi] = await Promise.all([
    readFile(resolve(root, 'server/utils/talleres-snapshot.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/external/v1/talleres/roster.get.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/external/v1/talleres/meta.get.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/external/v1/talleres/students/search.get.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/external/v1/talleres/warm.post.ts'), 'utf8'),
  ])

  assert.match(snapshot, /SNAPSHOT CONTRACT/)
  assert.match(snapshot, /ensureCurrentTalleresSnapshotPlantel/)
  assert.match(snapshot, /invalidateTalleresSnapshotPlantel/)
  assert.match(snapshot, /readAuthoritativeTalleresCatalog/)
  assert.doesNotMatch(snapshot, /empty_refresh_preserved/)
  assert.doesNotMatch(snapshot, /all_sources_failed_preserved/)
  assert.doesNotMatch(snapshot, /DEFAULT_TALLERES_SERVICIOS/)
  assert.doesNotMatch(snapshot, /source: 'seed'/)
  assert.doesNotMatch(snapshot, /void refreshTalleresSnapshotPlantel\(\{ plantel, ciclo \}/)

  for (const source of [rosterApi, metaApi, searchApi, warmApi]) {
    assert.match(source, /PUBLIC API STAYS v1|PUBLIC API STAYS v1|SNAPSHOT CONTRACT/)
    assert.match(source, /Cache-Control', 'no-store, max-age=0'/)
    assert.doesNotMatch(source, /external\/v[2-9]/)
  }
})
