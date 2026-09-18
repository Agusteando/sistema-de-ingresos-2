import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const read = (path) => readFile(join(process.cwd(), path), 'utf8')
const [api, detailApi, service, component, middleware, clientMiddleware, layout, liveProbe] = await Promise.all([
  read('server/api/buscador/index.get.ts'),
  read('server/api/buscador/[matricula].get.ts'),
  read('server/utils/buscador.ts'),
  read('components/buscador/BuscadorWorkspace.vue'),
  read('server/middleware/auth.ts'),
  read('middleware/auth.global.ts'),
  read('layouts/default.vue'),
  read('scripts/probe-buscador-live.mjs')
])

const checks = [
  [api.includes('resolveBuscadorPlantel') && detailApi.includes('resolveBuscadorPlantel'), 'both endpoints enforce assigned-plantel scope'],
  [api.includes('runWithBridgeAgentId') && detailApi.includes('runWithBridgeAgentId'), 'buscador reads use the selected plantel bridge'],
  [service.includes('searchCentralMatricula') && service.includes('localRowsForMatriculas'), 'parent-name matches come from central matricula and are revalidated against Aurora plantel scope'],
  [service.includes("'apellido_paterno_padre'") && service.includes("'apellido_materno_padre'"), 'father surnames are searchable'],
  [service.includes("'apellido_paterno_madre'") && service.includes("'apellido_materno_madre'"), 'mother surnames are searchable'],
  [service.includes('Nombre del padre o tutor') && service.includes('detail.guardianName'), 'legacy tutor field remains searchable and visible in the profile'],
  [service.includes("'personas_autorizadas'") && service.includes('authorizedPeopleForStudent') && service.includes("'nombreP'") && service.includes("'paternoP'") && service.includes("'maternoP'") && service.includes("'parenP'"), 'Husky Pass authorized people match the cross-repo schema'],
  [service.includes('compressed_foto') && service.includes('photoUrl: resolveHuskyPhoto'), 'authorized-person photos are resolved'],
  [service.includes('SECRET_KEY_PATTERN') && service.includes('delete safeDetail.huskyPassPlaintext') && service.includes('delete safeDetail.rawUsers'), 'credentials and secrets are blocked from the shared profile'],
  [!/(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE)/i.test(service), 'buscador data service is read-only and contains no DDL/DML writes'],
  [component.includes('Personas autorizadas') && component.includes('Todos los datos disponibles'), 'profile renders authorized people and full available-data disclosure'],
  [component.includes('Alumno, matrícula, mamá, papá o tutor.'), 'search UX explains family-name lookup'],
  [middleware.includes('isBuscadorEndpoint'), 'server auth explicitly recognizes shared Buscador endpoints'],
  [clientMiddleware.includes("'/buscador'"), 'client auth allows Buscador for non-financial authenticated users'],
  [layout.includes('to="/buscador"') && layout.includes("route.path === '/buscador'"), 'Buscador is in shared navigation and preserves route while switching plantel'],
  [liveProbe.includes('familyCandidate') && liveProbe.includes('familyDataAssertions < 3'), 'live gate verifies real canonical parent/tutor data without assuming undeployed branch behavior'],
]

let failed = 0
for (const [ok, label] of checks) {
  console.log((ok ? 'PASS ' : 'FAIL ') + label)
  if (!ok) failed += 1
}
if (failed) process.exit(1)
console.log('BUSCADOR_CONTRACT_OK')
