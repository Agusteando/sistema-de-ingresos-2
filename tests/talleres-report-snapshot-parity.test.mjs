import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = resolve('.')
const target = resolve(root, 'server/utils/talleres-report.ts')
const requestedPlanteles = []

const canonicalPlantel = (value) => {
  const code = String(value || '').trim().toUpperCase()
  if (code === 'CM' || code === 'DM' || code === 'PREEM') return 'PREEM'
  if (code === 'PMA' || code === 'PMB' || code === 'PM') return 'PM'
  if (code === 'PREET' || code === 'CT') return 'CT'
  return ['PT', 'SM', 'ST', 'GM', 'CO', 'DC'].includes(code) ? code : ''
}

const catalog = [
  { clave: 'COMIDA', nombre: 'COMIDA', imagen: '/comida.svg', activo: true, orden: 10 },
  { clave: 'DESAYUNO', nombre: 'DESAYUNO', imagen: '/desayuno.svg', activo: true, orden: 20 },
  { clave: 'TRANSPORTE_REDONDO_R1', nombre: 'TRANSPORTE REDONDO R1', imagen: '/transporte.svg', activo: true, orden: 30 },
  { clave: 'ROBOTICA', nombre: 'ROBÓTICA', imagen: '/robotica.svg', activo: true, orden: 40 },
  { clave: 'FUTBOL', nombre: 'FÚTBOL', imagen: '/futbol.svg', activo: true, orden: 50 },
  { clave: 'AJEDREZ', nombre: 'AJEDREZ', imagen: '/ajedrez.svg', activo: true, orden: 60 },
  { clave: 'TRANSPORTE_SENCILLO_R6', nombre: 'TRANSPORTE SENCILLO R6', imagen: '/transporte-r6.svg', activo: true, orden: 70 },
  { clave: 'INACTIVO', nombre: 'INACTIVO', activo: false, orden: 80 },
]

const rosters = {
  PREEM: [
    {
      matricula: 'M1', nombreCompleto: 'Ana Uno', grado: '1', grupo: 'A', status: 'active',
      asignaciones: [
        { clave: 'COMIDA', nombre: 'COMIDA' },
        { clave: 'ROBOTICA', nombre: 'ROBÓTICA' },
        { clave: 'ROBOTICA', nombre: 'ROBÓTICA' },
        { clave: 'FUERA_DE_CATALOGO', nombre: 'FUERA DE CATÁLOGO' },
      ],
    },
    {
      matricula: 'M2', nombreCompleto: 'Beto Dos', grado: '2', grupo: 'B', baja: 1,
      asignaciones: [{ clave: 'TRANSPORTE_REDONDO_R1', nombre: 'TRANSPORTE REDONDO R1' }],
    },
  ],
  PM: [
    {
      matricula: 'P1', fullName: 'Carla Tres', grado: '3', grupo: 'C', status: 'active',
      talleres: [{ clave: 'DESAYUNO', nombre: 'DESAYUNO' }],
    },
    {
      matricula: 'PM1018', fullName: 'Lopez Rosas Emilio Alejandro', grado: '4', grupo: 'A', baja: true, status: 'withdrawn',
      asignaciones: [{ clave: 'FUTBOL', nombre: 'FÚTBOL', fuentes: ['matricula', 'concepto_financiero'] }],
    },
  ],
  CT: [
    {
      matricula: 'T1', nombres: 'Diego', apellidoPaterno: 'Cuatro', grado: '4', grupo: 'D', status: 'active',
      servicios: ['AJEDREZ'],
    },
  ],
  SM: [
    {
      matricula: 'SM-R6-ACCEPTANCE', fullName: 'Caso Transporte R6', grado: '6', grupo: 'A', status: 'active',
      asignaciones: [{ clave: 'TRANSPORTE_SENCILLO_R6', nombre: 'TRANSPORTE SENCILLO R6', fuentes: ['concepto_financiero'] }],
    },
  ],
}

async function harness() {
  const context = vm.createContext({
    console,
    createError: value => Object.assign(new Error(value.message), value),
  })
  const modules = new Map()

  const auth = new vm.SyntheticModule(
    ['getTrustedAuthUser', 'normalizePlantel'],
    function () {
      this.setExport('normalizePlantel', value => String(value || '').trim().toUpperCase())
      this.setExport('getTrustedAuthUser', async () => ({
        isSuperAdmin: false,
        plantelesList: ['CM', 'DM', 'PMA', 'PREET', 'SM', 'IS'],
      }))
    },
    { context },
  )

  const snapshot = new vm.SyntheticModule(
    ['canonicalTalleresPlantel', 'readTalleresSnapshotRoster', 'TALLERES_SNAPSHOT_PLANTELES', 'TALLERES_SNAPSHOT_VIEW_VERSION'],
    function () {
      this.setExport('canonicalTalleresPlantel', canonicalPlantel)
      this.setExport('TALLERES_SNAPSHOT_PLANTELES', ['PM', 'PT', 'SM', 'ST', 'PREEM', 'CT', 'GM', 'CO', 'DC'])
      this.setExport('TALLERES_SNAPSHOT_VIEW_VERSION', 'talleres-roster-v2')
      this.setExport('readTalleresSnapshotRoster', async ({ plantel, ciclo }) => {
        requestedPlanteles.push({ plantel, ciclo })
        return {
          ok: true,
          source: 'aurora-mysql-snapshot',
          ciclo,
          planteles: [plantel],
          catalog,
          students: rosters[plantel] || [],
          assignmentResolution: { complete: true, policy: 'materialized-union', snapshot: 'talleres-roster-v2' },
          meta: { sources: [{ plantel, ok: true, source: 'mysql:control_external_student_view:talleres-roster-v2', freshness: 'fresh' }] },
        }
      })
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
      if (specifier === './auth-session') return auth
      if (specifier === './talleres-snapshot') return snapshot
      const candidate = resolve(dirname(parent.identifier), specifier.endsWith('.ts') ? specifier : `${specifier}.ts`)
      return load(candidate)
    })
    return module
  }

  const module = await load(target)
  await module.evaluate()
  return module.namespace
}

test('Aurora report uses the same canonical campus families as talleres-vue', async () => {
  requestedPlanteles.length = 0
  const module = await harness()
  const result = await module.loadTalleresReport({ event: {}, ciclo: '2026-2027' })

  assert.deepEqual(Array.from(result.planteles), ['PM', 'PREEM', 'CT'])
  assert.deepEqual(requestedPlanteles.map(row => row.plantel), ['PM', 'PREEM', 'CT'])
  assert.equal(module.normalizeTalleresReportPlantel('CM'), 'PREEM')
  assert.equal(module.normalizeTalleresReportPlantel('DM'), 'PREEM')
  assert.equal(module.normalizeTalleresReportPlantel('PMA'), 'PM')
  assert.equal(module.normalizeTalleresReportPlantel('PMB'), 'PM')
  assert.equal(module.normalizeTalleresReportPlantel('PREET'), 'CT')
  assert.equal(module.normalizeTalleresReportPlantel('IS'), '')
})

test('report categories and counts are derived only from the Talleres roster v2 assignments', async () => {
  requestedPlanteles.length = 0
  const module = await harness()
  const result = await module.loadTalleresReport({ event: {}, ciclo: '2026-2027' })
  const byKey = new Map(result.groups.map(row => [row.clave, row]))

  assert.equal(result.source, 'talleres-roster-v2')
  assert.equal(result.sourceViewVersion, 'talleres-roster-v2')
  assert.deepEqual([...byKey.keys()].sort(), ['AJEDREZ', 'COMIDA', 'DESAYUNO', 'FUTBOL', 'ROBOTICA', 'TRANSPORTE_REDONDO_R1', 'TRANSPORTE_SENCILLO_R6'].sort())
  assert.equal(byKey.get('ROBOTICA').totalAlumnos, 1, 'duplicate assignment rows must not double count a student')
  assert.equal(byKey.get('TRANSPORTE_REDONDO_R1').totalAlumnos, 1, 'report must preserve the same withdrawn member that Talleres keeps in the official roster')
  assert.equal(byKey.get('FUTBOL').totalAlumnos, 1)
  assert.equal(byKey.get('FUTBOL').planteles[0].plantel, 'PM')
  assert.equal(byKey.get('TRANSPORTE_SENCILLO_R6').totalAlumnos, 1, 'TRANSPORTE SENCILLO R6 must survive the generic catalog/roster path')
  assert.equal(byKey.get('TRANSPORTE_SENCILLO_R6').planteles[0].plantel, 'SM')
  assert.equal(byKey.has('FUERA_DE_CATALOGO'), false, 'Talleres active catalog remains authoritative')
  assert.equal(byKey.has('INACTIVO'), false)
  assert.equal(result.totals.asignaciones, 7)
})

test('institutional detail resolves aliases to the same Talleres canonical campus and exports roster students', async () => {
  requestedPlanteles.length = 0
  const module = await harness()
  const result = await module.loadTalleresReport({
    event: {},
    ciclo: '2026-2027',
    requestedPlantel: 'DM',
    includeStudents: true,
  })

  assert.deepEqual(Array.from(result.planteles), ['PREEM'])
  assert.deepEqual(requestedPlanteles.map(row => row.plantel), ['PREEM'])
  const comida = result.groups.find(row => row.clave === 'COMIDA')
  assert.equal(comida.planteles[0].plantel, 'PREEM')
  assert.deepEqual(JSON.parse(JSON.stringify(comida.planteles[0].students)), [
    { matricula: 'M1', nombre: 'Ana Uno', grado: '1', grupo: 'A' },
  ])
})

test('external Talleres API and Aurora report are wired to the same roster implementation', async () => {
  const external = await readFile(resolve(root, 'server/api/external/v1/talleres/roster.get.ts'), 'utf8')
  const reportSource = await readFile(resolve(root, 'server/utils/talleres-report.ts'), 'utf8')

  assert.match(external, /readTalleresSnapshotRoster/)
  assert.match(reportSource, /readTalleresSnapshotRoster/)
  assert.match(reportSource, /TALLERES_SNAPSHOT_VIEW_VERSION/)
  assert.doesNotMatch(reportSource, /readTalleresAdminSummary/)
})


test('Lopez Rosas Emilio Alejandro remains in FUTBOL exactly as Talleres roster exposes him', async () => {
  requestedPlanteles.length = 0
  const module = await harness()
  const result = await module.loadTalleresReport({
    event: {},
    ciclo: '2026-2027',
    requestedPlantel: 'PM',
    includeStudents: true,
  })

  const futbol = result.groups.find(row => row.clave === 'FUTBOL')
  assert.ok(futbol)
  const emilio = futbol.planteles[0].students.find(row => row.matricula === 'PM1018')
  assert.deepEqual(JSON.parse(JSON.stringify(emilio)), {
    matricula: 'PM1018',
    nombre: 'Lopez Rosas Emilio Alejandro',
    grado: '4',
    grupo: 'A',
    baja: true,
  })
})


test('ultimate acceptance case keeps TRANSPORTE SENCILLO R6 from Aurora catalog through report parity', async () => {
  requestedPlanteles.length = 0
  const module = await harness()
  const result = await module.loadTalleresReport({
    event: {},
    ciclo: '2026-2027',
    requestedPlantel: 'SM',
    includeStudents: true,
  })

  const r6 = result.groups.find(row => row.clave === 'TRANSPORTE_SENCILLO_R6')
  assert.ok(r6, 'R6 must exist whenever Aurora active catalog exposes it')
  assert.equal(r6.nombre, 'TRANSPORTE SENCILLO R6')
  assert.equal(r6.planteles[0].plantel, 'SM')
  assert.deepEqual(JSON.parse(JSON.stringify(r6.planteles[0].students)), [
    { matricula: 'SM-R6-ACCEPTANCE', nombre: 'Caso Transporte R6', grado: '6', grupo: 'A' },
  ])
})
