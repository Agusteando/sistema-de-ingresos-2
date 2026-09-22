import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = resolve('.')
const target = resolve(root, 'server/utils/talleres-admin-summary.ts')

const canonicalKey = (value) => String(value || '').trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')

async function harness() {
  const context = vm.createContext({
    console,
    createError: value => Object.assign(new Error(value.message), value),
  })
  const modules = new Map()

  const ciclo = new vm.SyntheticModule(['normalizeCicloKey'], function () {
    this.setExport('normalizeCicloKey', value => String(value || '2026'))
  }, { context })

  const talleresServicios = new vm.SyntheticModule(
    ['canonicalTallerKey', 'finalTallerSeed', 'parseServiciosCsv'],
    function () {
      this.setExport('canonicalTallerKey', canonicalKey)
      this.setExport('finalTallerSeed', () => null)
      this.setExport('parseServiciosCsv', value => String(value || '').split(',').map(v => v.trim()).filter(Boolean))
    },
    { context },
  )

  const controlEscolar = new vm.SyntheticModule(['fetchControlEscolarStudents', 'runControlEscolar'], function () {
    this.setExport('runControlEscolar', async (_event, _plantel, worker) => await worker())
    this.setExport('fetchControlEscolarStudents', async () => ({
      data: [{
        matricula: 'PM1018',
        fullName: 'Lopez Rosas Emilio Alejandro',
        nombreCompleto: 'Lopez Rosas Emilio Alejandro',
        grado: 'quinto',
        grupo: 'ASIA',
        baja: true,
        status: 'Baja',
        servicio: 'FUTBOL',
      }],
    }))
  }, { context })

  const routing = new vm.SyntheticModule(
    ['controlEscolarBridgeAgentCandidates', 'normalizeExternalControlEscolarPlantel'],
    function () {
      this.setExport('controlEscolarBridgeAgentCandidates', () => ['PM'])
      this.setExport('normalizeExternalControlEscolarPlantel', value => String(value || '').trim().toUpperCase())
    },
    { context },
  )

  const catalog = new vm.SyntheticModule(['readAuthoritativeTalleresCatalog'], function () {
    this.setExport('readAuthoritativeTalleresCatalog', async () => ({
      catalog: [{ servicio_clave: 'FUTBOL', servicio_nombre: 'FÚTBOL', activo: 1, orden: 60 }],
    }))
  }, { context })

  const snapshot = new vm.SyntheticModule(['readTalleresSnapshotRoster'], function () {
    this.setExport('readTalleresSnapshotRoster', async () => { throw new Error('snapshot fallback not expected') })
  }, { context })

  const servicios = new vm.SyntheticModule(['readConceptMappedServiciosForMatriculas'], function () {
    this.setExport('readConceptMappedServiciosForMatriculas', async () => ({
      result: new Map([['PM1018', [{
        clave: 'FUTBOL',
        nombre: 'FÚTBOL',
        conceptosFinancieros: [{ conceptoId: 1034, conceptoNombre: 'TALLER DE FUTBOL' }],
      }]]]),
    }))
  }, { context })

  async function load(path) {
    if (modules.has(path)) return modules.get(path)
    const source = await readFile(path, 'utf8')
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText
    const module = new vm.SourceTextModule(js, { context, identifier: path })
    modules.set(path, module)
    await module.link(async (specifier, parent) => {
      if (specifier === '../../shared/utils/ciclo') return ciclo
      if (specifier === '../../shared/utils/talleresServicios') return talleresServicios
      if (specifier === './control-escolar') return controlEscolar
      if (specifier === './control-escolar-plantel-routing') return routing
      if (specifier === './talleres-catalog-authority') return catalog
      if (specifier === './talleres-snapshot') return snapshot
      if (specifier === './talleres-servicios') return servicios
      const candidate = resolve(dirname(parent.identifier), specifier.endsWith('.ts') ? specifier : `${specifier}.ts`)
      return load(candidate)
    })
    return module
  }

  const module = await load(target)
  await module.evaluate()
  return module.namespace
}

test('PM1018 remains in FUTBOL even when school-level metadata says Baja', async () => {
  const module = await harness()
  const summary = await module.readTalleresAdminSummary({
    event: {},
    plantel: 'PM',
    ciclo: '2026',
    includeStudents: true,
  })

  const futbol = summary.talleres.find(row => row.clave === 'FUTBOL')
  assert.ok(futbol, 'FUTBOL must survive the summary builder')
  assert.equal(futbol.alumnos, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(futbol.students)), [{
    matricula: 'PM1018',
    nombre: 'Lopez Rosas Emilio Alejandro',
    grado: 'quinto',
    grupo: 'ASIA',
  }])
  assert.equal(summary.totals.alumnos, 1)
  console.log('AURORA_PM1018_FUTBOL_SUMMARY_OK')
})

test('Talleres summary does not use school-level baja/status as a membership veto', async () => {
  const source = await readFile(target, 'utf8')
  assert.doesNotMatch(source, /filter\(isActiveStudent\)/)
  assert.doesNotMatch(source, /const isActiveStudent/)
})
