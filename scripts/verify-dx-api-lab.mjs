import { readFile } from 'node:fs/promises'
const files = {
  page: 'pages/dx/api-lab.vue',
  util: 'server/utils/dx-api-lab.ts',
  explorer: 'server/utils/dx-integration-explorer.ts',
  overview: 'server/api/control-escolar/dx-api-lab/overview.post.ts',
  records: 'server/api/control-escolar/dx-api-lab/records.post.ts',
  proof: 'server/api/control-escolar/dx-api-lab/proof.post.ts'
}
const f = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key,path])=>[key,await readFile(path,'utf8')])))
const failures=[]
const expect=(pass,message)=>{if(!pass) failures.push(message)}
for(const token of ['Aplicaciones','APIs','Último uso','Alumnos API','Grupos API','Sin grupo','Comparar con','Buscar matrícula','recordColumns','filteredConsumers','downloadCsv']) expect(f.page.includes(token),'Vista DX: '+token)
expect(!f.page.includes('Auto-DX'),'No ejecutar todas las pruebas automáticamente ni presentar simulaciones como consumo real')
expect(f.util.includes("id: 'ce-operator-roster'") && f.util.includes("id: 'lista-roster', appId: 'lista'"),'Inventariar el roster real de Lista')
expect(f.explorer.includes('DX_CONSUMERS') && f.explorer.includes('DX_DATASETS') && f.explorer.includes('dxRosterStats'),'Mapa de consumo y resúmenes')
for (const route of ['ce-operator-roster','ce-students','ce-academic','talleres-roster']) expect(f.explorer.includes(route),'Falta trazabilidad para '+route)
expect(f.overview.includes('resolveControlEscolarAuth') && f.records.includes('resolveControlEscolarAuth'),'DX no debe permitir lecturas de otros planteles sin autorización')
expect(f.overview.includes('Promise.all(DX_DATASETS.map') && f.records.includes('DX_DATASETS.find'),'Solo una lectura por fuente y consulta de registros por lista autorizada')
expect(f.proof.includes('fetchCanonicalExternalSnapshotScope'),'Mantener diagnósticos legados de referencia')
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('DX Integraciones: invariantes de solo lectura, fuentes, consumidores, comparación y explorador presentes.')
