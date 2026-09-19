import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = resolve('.')
const summaryPath = resolve(root, 'server/utils/talleres-admin-summary.ts')

const activeCatalog = [
  { servicio_clave: 'FUTBOL', servicio_nombre: 'FUTBOL', imagen_url: '/futbol.svg', activo: 1, orden: 10 },
  { servicio_clave: 'DESAYUNO', servicio_nombre: 'DESAYUNO', imagen_url: '/desayuno.svg', activo: 1, orden: 20 },
  { servicio_clave: 'COMIDA', servicio_nombre: 'COMIDA', imagen_url: '/comida.svg', activo: 1, orden: 30 },
  { servicio_clave: 'TRANSPORTE_REDONDO_R1', servicio_nombre: 'TRANSPORTE REDONDO R1', imagen_url: '/transporte.svg', activo: 1, orden: 40 },
  { servicio_clave: 'SERVICIO_ESPECIAL', servicio_nombre: 'SERVICIO ESPECIAL', imagen_url: '/especial.svg', activo: 1, orden: 50 },
]

async function loadSummaryHarness() {
  const context = vm.createContext({
    console,
    createError: value => Object.assign(new Error(value.message), value),
  })
  const modules = new Map()

  const controlEscolar = new vm.SyntheticModule(
    ['fetchControlEscolarStudents', 'runControlEscolar'],
    function () {
      this.setExport('runControlEscolar', async (_event, _plantel, callback) => callback())
      this.setExport('fetchControlEscolarStudents', async () => ({
        data: [
          { matricula: 'A1', nombres: 'Ana', apellidoPaterno: 'Uno', grado: '1', grupo: 'A', servicio: 'FUTBOL, DESAYUNO, TRANSPORTE REDONDO R1' },
          { matricula: 'A2', nombres: 'Beto', apellidoPaterno: 'Dos', grado: '2', grupo: 'B', servicio: 'COMIDA, SERVICIO FUERA DE CATALOGO' },
        ],
      }))
    },
    { context },
  )

  const routing = new vm.SyntheticModule(
    ['normalizeExternalControlEscolarPlantel'],
    function () { this.setExport('normalizeExternalControlEscolarPlantel', value => value) },
    { context },
  )

  const catalog = new vm.SyntheticModule(
    ['readAuthoritativeTalleresCatalog'],
    function () { this.setExport('readAuthoritativeTalleresCatalog', async () => ({ source: 'central', catalog: activeCatalog })) },
    { context },
  )

  const assignments = new Map([
    ['A1', [{ clave: 'SERVICIO_ESPECIAL', nombre: 'SERVICIO ESPECIAL' }]],
    ['A2', [{ clave: 'DESAYUNO', nombre: 'DESAYUNO' }, { clave: 'NO_ACTIVO', nombre: 'NO ACTIVO' }]],
  ])
  const talleresServicios = new vm.SyntheticModule(
    ['readConceptMappedServiciosForMatriculas'],
    function () {
      this.setExport('readConceptMappedServiciosForMatriculas', async () => ({
        result: assignments,
        mappingCount: 3,
        evidenceCount: 3,
      }))
    },
    { context },
  )

  async function load(path) {
    if (modules.has(path)) return modules.get(path)
    const source = await readFile(path, 'utf8')
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText
    const module = new vm.SourceTextModule(js, { context, identifier: path })
    modules.set(path, module)
    await module.link(async (specifier, parent) => {
      if (specifier === './control-escolar') return controlEscolar
      if (specifier === './control-escolar-plantel-routing') return routing
      if (specifier === './talleres-catalog-authority') return catalog
      if (specifier === './talleres-servicios') return talleresServicios
      const candidate = resolve(dirname(parent.identifier), specifier.endsWith('.ts') ? specifier : `${specifier}.ts`)
      return load(candidate)
    })
    return module
  }

  const module = await load(summaryPath)
  await module.evaluate()
  return module.namespace
}

test('Reporte Talleres includes every active /conceptos workshop and service, including custom services', async () => {
  const summaryModule = await loadSummaryHarness()
  const result = await summaryModule.readTalleresAdminSummary({
    event: {},
    plantel: 'CM',
    ciclo: '2026-2027',
    includeStudents: true,
  })

  const byKey = new Map(result.talleres.map(row => [row.clave, row]))
  assert.deepEqual(
    [...byKey.keys()].sort(),
    ['COMIDA', 'DESAYUNO', 'FUTBOL', 'SERVICIO_ESPECIAL', 'TRANSPORTE_REDONDO_R1'].sort(),
  )
  assert.equal(byKey.get('DESAYUNO').alumnos, 2)
  assert.equal(byKey.get('SERVICIO_ESPECIAL').alumnos, 1)
  assert.equal(byKey.get('TRANSPORTE_REDONDO_R1').alumnos, 1)
  assert.equal(byKey.has('NO_ACTIVO'), false)
  assert.equal(byKey.has('SERVICIO_FUERA_DE_CATALOGO'), false)
  assert.equal(byKey.get('COMIDA').students[0].matricula, 'A2')
})

test('institutional Excel is fed by the same report loader as the on-screen report', async () => {
  const source = await readFile(resolve(root, 'server/api/talleres-servicios/reporte-institucional-excel.get.ts'), 'utf8')
  assert.match(source, /loadTalleresReport/)
  assert.match(source, /includeStudents:\s*true/)
})
