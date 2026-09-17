import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
const root = process.cwd()
const [control, externalView, externalSnapshot, refresh, canonical] = await Promise.all([
  'server/utils/control-escolar.ts',
  'server/utils/control-escolar-external-view.ts',
  'server/utils/control-escolar-external-snapshot.ts',
  'server/utils/control-escolar-external-snapshot-refresh.ts',
  'server/utils/control-escolar-external-canonical-scope.ts'
].map(path => readFile(join(root, path), 'utf8')))
const failures = []
const expect = (condition, message) => { if (!condition) failures.push(message) }
const directPatterns = [
  { label: 'lectura directa de matricula.grado', pattern: /\b(?:matricula|m)\??\.grado\b/i },
  { label: 'lectura directa de matricula.nivel', pattern: /\b(?:matricula|m)\??\.nivel\b/i },
  { label: 'uso de grado desde el overlay central de matricula', pattern: /\boverlay\??\.grado\b/i },
  { label: 'uso de nivel desde el overlay central de matricula', pattern: /\boverlay\??\.nivel\b/i },
  { label: 'alias matriculaGrado', pattern: /\bmatriculaGrado\b/i },
  { label: 'alias matriculaNivel', pattern: /\bmatriculaNivel\b/i }
]
for (const rule of directPatterns) {
  const match = control.match(rule.pattern)
  if (match?.index !== undefined) failures.push(`server/utils/control-escolar.ts:${control.slice(0, match.index).split('\n').length}: ${rule.label}`)
}
const centralSelect = control.match(/const centralSelectColumns[\s\S]*?const canonicalMatriculaKey/)
if (centralSelect && /["']grado["']/.test(centralSelect[0])) failures.push('server/utils/control-escolar.ts: centralSelectColumns no puede seleccionar matricula.grado')
if (centralSelect && /["']nivel["']/.test(centralSelect[0])) failures.push('server/utils/control-escolar.ts: centralSelectColumns no puede seleccionar matricula.nivel')
expect(!control.includes('writeControlEscolarExternalStudentView'), 'El loader base no puede publicar snapshots antes de canonicalizar grupos.')
expect(externalView.includes("EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION = 'control-escolar-student-view-v2-canonical'"), 'El snapshot vigente debe ser v2 canonical.')
expect(externalView.includes('fetchCanonicalExternalSnapshotScope'), 'El warm externo debe usar el resolver canónico compartido.')
expect(canonical.includes('fetchControlEscolarStudentsWithCanonicalGroups'), 'El snapshot debe usar el mismo resolver de grupos que Control Escolar.')
expect(canonical.includes('parseEnrollmentConceptsForScope') && canonical.includes('readBestConceptosConfigPayload'), 'El snapshot debe resolver la misma configuración de conceptos de inscripción.')
expect(refresh.includes('EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION') && !refresh.includes("const VIEW_VERSION = 'control-escolar-student-view-v1'"), 'El refresh no puede fijar una versión vieja del snapshot.')
expect(externalView.includes('const refreshed = await warmExternalControlEscolarStudentScope(input)') && !externalView.includes('const payload = sanitizeExternalStudentPayload(student)'), 'El refresh puntual debe regenerar el scope canónico completo; no puede inyectar una fila.')
expect(!externalSnapshot.includes('overlayCanonicalMatriculaGroups') && !externalSnapshot.includes('matricula.grupo-live') && !externalSnapshot.includes('SELECT matricula, grupo'), 'La lectura pública no puede reemplazar el grupo canónico del snapshot con matricula.grupo ni otra fuente legacy.')
expect(externalSnapshot.includes('Snapshot age is telemetry only') && !externalSnapshot.includes('AURORA_STUDENT_SNAPSHOT_TOO_OLD'), 'La edad del snapshot debe ser telemetría; nunca debe impedir servir el last-known-good persistido.')
if (failures.length) { console.error('Fuente académica inválida:'); failures.forEach(failure => console.error(`- ${failure}`)); process.exit(1) }
console.log('Fuente académica válida: snapshot público y Control Escolar comparten conceptos, población y grupos canónicos sin overlay posterior.')
