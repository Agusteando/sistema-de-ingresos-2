import { readFile } from 'node:fs/promises'
const files = {
  page: 'pages/dx/api-lab.vue', util: 'server/utils/dx-api-lab.ts', auto: 'server/api/control-escolar/dx-api-lab/auto.post.ts',
  proof: 'server/api/control-escolar/dx-api-lab/proof.post.ts', proofPanel: 'components/DxProofPanel.vue'
}
const [page, util, auto, proof, proofPanel] = await Promise.all(Object.values(files).map(path => readFile(path, 'utf8')))
const failures = []; const expect = (condition, message) => { if (!condition) failures.push(message) }
expect(page.includes('Estado de integraciones') && page.includes('Auto-DX'), 'DX debe seguir matrix-first con Auto-DX.')
expect(page.includes('list="aurora-planteles"') && page.includes('visiblePlanteles'), 'Plantel debe seguir siendo un selector buscable.')
expect(page.includes('pageRows') && page.includes('filteredRows') && page.includes('downloadCsv'), 'Datos debe conservar búsqueda, paginación frontend y CSV.')
expect(page.includes('DxProofPanel') && page.includes("drawerView === 'proof'"), 'El drawer debe incluir la pestaña Proof.')
expect(util.includes("import { PLANTELES_LIST } from '../../utils/constants'") && util.includes('runDxPlantelAutoDx'), 'El catálogo Auto-DX debe conservar su contrato.')
for (const appId of ['lista','talleres','scanner','husky']) expect(util.includes(`id: '${appId}'`), `Falta app DX: ${appId}`)
expect(proof.includes('fetchCanonicalExternalSnapshotScope') && proof.includes('rows: canonical.rows.map'), 'Proof debe devolver filas canónicas sin pre-agregar.')
expect(proofPanel.includes('endpointRows.value.length') && proofPanel.includes('gradeRows') && proofPanel.includes('proofRows'), 'Proof debe calcular total, grado y grado × grupo en frontend.')
expect(proofPanel.includes('endpointGradeCounts') && proofPanel.includes('baselineGradeCounts') && proofPanel.includes('distributionDiffs'), 'Proof debe conservar conteos frontend separados por grado y grupo.')
expect(proofPanel.includes("simulationId === 'lista-roster'") && proofPanel.includes('missingMatriculas') && proofPanel.includes('extraMatriculas'), 'Proof debe validar el padrón exacto de Lista.')
expect(proofPanel.includes('matches Control Escolar'), 'Proof debe mostrar estado compacto de paridad exacta.')
expect(auto.includes('runDxPlantelAutoDx'), 'Auto-DX debe seguir delegando al orquestador.')
if (failures.length) { console.error('DX API Lab inválido:'); failures.forEach(failure => console.error(`- ${failure}`)); process.exit(1) }
console.log('DX API Lab válido: matriz, datos reales y Proof frontend de total/grado/grupo contra Control Escolar.')
