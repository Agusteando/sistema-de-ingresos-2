import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = resolve('.')

const loadEventual = async () => {
  const source = await readFile(resolve(root, 'shared/utils/conceptEventual.ts'), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  const context = vm.createContext({ console })
  const module = new vm.SourceTextModule(js, { context, identifier: 'conceptEventual.ts' })
  await module.link(() => { throw new Error('conceptEventual must remain dependency-free') })
  await module.evaluate()
  return module.namespace
}

test('eventual flag has direct canonical 0/1 meaning', async () => {
  const { isEventualConcept, normalizeEventualFlag } = await loadEventual()

  assert.equal(isEventualConcept(0), false)
  assert.equal(isEventualConcept('0'), false)
  assert.equal(normalizeEventualFlag(0), 0)
  assert.equal(normalizeEventualFlag('0'), 0)

  assert.equal(isEventualConcept(1), true)
  assert.equal(isEventualConcept('1'), true)
  assert.equal(normalizeEventualFlag(1), 1)
  assert.equal(normalizeEventualFlag('1'), 1)

  assert.equal(isEventualConcept(false), false)
  assert.equal(isEventualConcept(true), true)
  assert.equal(normalizeEventualFlag(2), 0, 'eventual is a 0/1 flag, not an arbitrary non-zero number')
})

test('plazo never determines eventual status', async () => {
  const [
    months,
    financial,
    ingestion,
    catalog,
    config,
    modal,
    singleSelect,
    multiSelect,
  ] = await Promise.all([
    readFile(resolve(root, 'shared/utils/documentMonths.ts'), 'utf8'),
    readFile(resolve(root, 'server/utils/financial-concept.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/external/v1/conceptos/update.post.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/conceptos/index.ts'), 'utf8'),
    readFile(resolve(root, 'server/utils/conceptos-config.ts'), 'utf8'),
    readFile(resolve(root, 'components/DocumentModal.vue'), 'utf8'),
    readFile(resolve(root, 'components/ConceptSearchSelect.vue'), 'utf8'),
    readFile(resolve(root, 'components/ConceptMultiSearchSelect.vue'), 'utf8'),
  ])

  for (const source of [months, financial, ingestion, catalog, config, modal, singleSelect, multiSelect]) {
    assert.doesNotMatch(source, /isEventualConceptPlazo/)
  }

  assert.match(financial, /eventual: isEventualConcept\(row\?\.eventual\)/)
  assert.match(ingestion, /return normalizeEventualFlag\(value\)/)
  assert.match(catalog, /eventual: normalizeEventualFlag\(row\?\.eventual\)/)
  assert.match(config, /eventual: normalizeEventualFlag\(row\.eventual\)/)
  assert.match(config, /normalizeEventualFlag\(input\?\.eventual === undefined \? 1 : input\.eventual\)/)
  assert.match(modal, /form\.value\.eventual = isEventualConcept\(concepto\?\.eventual\)/)
  assert.match(singleSelect, /isEventualConcept\(concept\?\.eventual\)/)
  assert.match(multiSelect, /isEventualConcept\(concept\?\.eventual\)/)
})

test('plazo remains only the recurring-month configuration', async () => {
  const createDocument = await readFile(resolve(root, 'server/api/documentos/index.post.ts'), 'utf8')

  assert.match(createDocument, /const eventual = Boolean\(conceptoRef\.eventual\)/)
  assert.match(createDocument, /const configuredMonths = eventual \? \[1\] : parseDocumentMonths\(conceptoRef\.plazo, 1\)/)
})
