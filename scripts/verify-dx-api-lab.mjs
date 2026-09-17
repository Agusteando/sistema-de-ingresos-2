import { readFile } from 'node:fs/promises'

const files = {
  page: 'pages/dx/api-lab.vue',
  util: 'server/utils/dx-api-lab.ts',
  auto: 'server/api/control-escolar/dx-api-lab/auto.post.ts'
}

const [page, util, auto] = await Promise.all(Object.values(files).map(path => readFile(path, 'utf8')))
const failures = []
const expect = (condition, message) => { if (!condition) failures.push(message) }

expect(page.includes('Estado de integraciones'), 'La pantalla DX debe ser matrix-first y minimalista.')
expect(page.includes('Auto-DX'), 'Debe existir el botón Auto-DX.')
expect(page.includes('list="aurora-planteles"'), 'Plantel debe usar selector buscable.')
expect(page.includes('visiblePlanteles'), 'La matriz debe filtrar planteles en frontend.')
expect(page.includes('pageRows') && page.includes('filteredRows'), 'La tabla de datos debe paginar y buscar en frontend.')
expect(page.includes('downloadCsv'), 'La tabla debe exportar CSV.')
expect(page.includes('openCell') && page.includes('endpoint-tabs'), 'La matriz debe permitir drill-down por app/plantel y endpoint.')
expect(util.includes("import { PLANTELES_LIST } from '../../utils/constants'"), 'El catálogo DX debe usar la lista real de planteles de Aurora.')
for (const appId of ['lista', 'talleres', 'scanner', 'husky']) expect(util.includes(`id: '${appId}'`), `Falta app DX: ${appId}`)
expect(util.includes('runDxPlantelAutoDx'), 'Falta orquestador Auto-DX por plantel.')
expect(util.includes('sampleMatricula') && util.includes('sampleLabel'), 'Auto-DX debe derivar parámetros desde datos reales.')
expect(util.includes('talleres-health-sim') && util.includes('talleres-meta-sim') && util.includes('talleres-roster-sim') && util.includes('talleres-search-sim'), 'Talleres debe probar todos sus contratos DX.')
expect(util.includes('lista-cycle') && util.includes('lista-roster'), 'Lista de Caritas debe probar sus contratos reales.')
expect(util.includes('scanner-roster') && util.includes('scanner-academic'), 'Escáner debe probar bulk y lookup puntual.')
expect(auto.includes('runDxPlantelAutoDx'), 'El endpoint Auto-DX debe delegar al orquestador seguro.')
expect(!page.includes('mode-switch'), 'La UI vieja de dos modos no debe sobrevivir al rediseño.')

if (failures.length) {
  console.error('DX API Lab inválido:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('DX API Lab válido: matrix-first, Auto-DX por plantel, drill-down y paginación frontend.')
