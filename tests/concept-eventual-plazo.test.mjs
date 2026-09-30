import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = resolve('.')

const loadDocumentMonths = async () => {
  const source = await readFile(resolve(root, 'shared/utils/documentMonths.ts'), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  const context = vm.createContext({ console })
  const module = new vm.SourceTextModule(js, { context, identifier: 'documentMonths.ts' })
  await module.link(() => { throw new Error('documentMonths must remain dependency-free') })
  await module.evaluate()
  return module.namespace
}

test('plazo is the authoritative eventual/recurring signal', async () => {
  const { isEventualConceptPlazo } = await loadDocumentMonths()

  assert.equal(isEventualConceptPlazo(1, 0), true, 'plazo=1 is eventual even if a stale flag says 0')
  assert.equal(isEventualConceptPlazo('1', '0'), true)
  assert.equal(isEventualConceptPlazo('[1]', 0), true)
  assert.equal(isEventualConceptPlazo([1], 0), true)

  assert.equal(isEventualConceptPlazo(11, 1), false, 'plazo=11 is recurring even if a stale flag says 1')
  assert.equal(isEventualConceptPlazo('11', '1'), false)
  assert.equal(isEventualConceptPlazo(12, 1), false)
  assert.equal(isEventualConceptPlazo(7, 1), false)
  assert.equal(isEventualConceptPlazo(2, 1), false)
  assert.equal(isEventualConceptPlazo('[1,2]', 1), false)

  assert.equal(isEventualConceptPlazo('', 1), true, 'legacy rows without plazo may use eventual as fallback')
  assert.equal(isEventualConceptPlazo(null, 0), false)
})

test('Aurora applies the same plazo semantics at ingestion, API, finance and UI boundaries', async () => {
  const [financial, ingestion, catalogApi, config, modal, select, multi] = await Promise.all([
    readFile(resolve(root, 'server/utils/financial-concept.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/external/v1/conceptos/update.post.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/conceptos/index.ts'), 'utf8'),
    readFile(resolve(root, 'server/utils/conceptos-config.ts'), 'utf8'),
    readFile(resolve(root, 'components/DocumentModal.vue'), 'utf8'),
    readFile(resolve(root, 'components/ConceptSearchSelect.vue'), 'utf8'),
    readFile(resolve(root, 'components/ConceptMultiSearchSelect.vue'), 'utf8'),
  ])

  assert.match(financial, /eventual: isEventualConceptPlazo\(plazo, row\?\.eventual\)/)
  assert.match(ingestion, /canonicalEventual = isEventualConceptPlazo\(row\[PLAZO_INDEX\], row\[EVENTUAL_INDEX\]\)/)
  assert.match(catalogApi, /normalizeConceptSemantics/)
  assert.match(catalogApi, /isEventualConceptPlazo\(row\?\.plazo, row\?\.eventual\)/)
  assert.match(config, /eventual: isEventualConceptPlazo\(plazo, row\.eventual\) \? 1 : 0/)
  assert.match(config, /const eventual = isEventualConceptPlazo\(plazo, input\?\.eventual\) \? 1 : 0/)
  assert.match(modal, /form\.value\.eventual = isEventualConceptPlazo\(concepto\?\.plazo, concepto\?\.eventual\)/)
  assert.match(select, /isEventualConceptPlazo\(concept\?\.plazo, concept\?\.eventual\)/)
  assert.match(multi, /isEventualConceptPlazo\(concept\?\.plazo, concept\?\.eventual\)/)
})
