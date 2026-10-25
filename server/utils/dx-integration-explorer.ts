// Source-verified read paths, not a claim of runtime usage.
// Review consumer adapters when changing an Aurora contract. Do not create a
// new student endpoint solely because an integration needs another field.
export type DxDataset = { id: string; label: string; endpointId: string; method: string; scope: string; origin: string; simulationId?: string }

export const DX_DATASETS: DxDataset[] = [
  { id: 'operator', label: 'Control Escolar', endpointId: 'ce-operator-roster', method: 'GET', scope: 'inscritos', origin: 'Bridge + matrícula / caché verificada' },
  { id: 'directory', label: 'Directorio', endpointId: 'ce-students', simulationId: 'scanner-roster', method: 'GET', scope: 'inscritos', origin: 'Snapshot central' },
  { id: 'talleres', label: 'Talleres', endpointId: 'talleres-roster', method: 'GET', scope: 'talleres', origin: 'Snapshot de talleres' }
]

export const DX_CONSUMERS = [
  { id: 'lista', endpoints: ["school-cycle","ce-operator-roster"], app: 'Lista de Caritas', dataset: 'operator', consumption: 'Consulta y muestra', code: 'lista-de-caritas/server/utils/auroraRoster.ts', repository: 'Agusteando/lista-de-caritas', lastUsedAt: null },
  { id: 'plans', endpoints: ["ce-operator-roster","ce-students","talleres-roster"], app: 'Plans 2', dataset: 'operator', consumption: 'Sincroniza a MySQL', code: 'plans-2/server/utils/activities.ts', repository: 'Agusteando/plans-2', lastUsedAt: null },
  { id: 'identidad', endpoints: ["ce-students","ce-student","ce-kpis","ce-credential-photos"], app: 'Gestor de Identidad', dataset: 'directory', consumption: 'Consulta y acredita', code: 'gestor-de-identidad/server/utils/credentialing-api.ts', repository: 'Agusteando/gestor-de-identidad', lastUsedAt: null },
  { id: 'husky', endpoints: ["ce-students","ce-student","ce-academic","ce-health"], app: 'Husky Pass CRM', dataset: 'directory', consumption: 'Consulta y enriquece', code: 'husky-pass-crm/server/data/auroraAcademicDirectory.ts', repository: 'Agusteando/husky-pass-crm', lastUsedAt: null },
  { id: 'scanner', endpoints: ["ce-students","ce-academic"], app: 'Escáner Husky Pass', dataset: 'directory', consumption: 'Consulta y valida', code: 'escaner-husky-pass/server/academicSnapshot.js', repository: 'Agusteando/escaner-husky-pass', lastUsedAt: null },
  { id: 'factura', endpoints: ["school-cycle","ce-students"], app: 'Factura API', dataset: 'directory', consumption: 'Compatibilidad padrón', code: 'factura-api/aurora-student-compat.js', repository: 'Agusteando/factura-api', lastUsedAt: null },
] as const

const stringValue = (value: unknown) => String(value ?? '').trim()
const isEnrolled = (row: any) => !row?.enrollmentState || stringValue(row.enrollmentState).toLowerCase() === 'inscrito'

export const dxRosterStats = (rows: any[], scope: string) => {
  // Talleres is a distinct population. Do not imply parity with Control Escolar.
  const relevant = scope === 'inscritos' ? rows.filter(isEnrolled) : rows
  const groups = new Set<string>()
  let withoutGroup = 0
  const identities = new Set<string>()
  for (const row of relevant) {
    const matricula = stringValue(row?.matricula || row?.studentId)
    const grade = stringValue(row?.grado || row?.grade)
    const group = stringValue(row?.grupo || row?.group)
    if (matricula) identities.add(matricula.toUpperCase())
    if (grade && group) groups.add(stringValue(row?.nivel).toLocaleLowerCase('es') + '|' + grade.toLocaleLowerCase('es') + '|' + group.toLocaleUpperCase('es'))
    if (matricula && !group) withoutGroup++
  }
  if (relevant.length && !identities.size) return { students: null, groups: null, withoutGroup: null }
  return { students: identities.size, groups: groups.size, withoutGroup }
}
