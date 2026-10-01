import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
const root = process.cwd()
const [control, externalView, externalSnapshot, refresh, canonical, credentialPhotos, credentialPhotosRoute] = await Promise.all([
  'server/utils/control-escolar.ts',
  'server/utils/control-escolar-external-view.ts',
  'server/utils/control-escolar-external-snapshot.ts',
  'server/utils/control-escolar-external-snapshot-refresh.ts',
  'server/utils/control-escolar-external-canonical-scope.ts',
  'server/utils/control-escolar-credential-photo-stages.ts',
  'server/api/external/v1/control-escolar/credential-photos.get.ts'
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
expect(externalView.includes("EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION = 'control-escolar-student-view-v3-sections'"), 'El snapshot vigente debe ser v3 con pertenencia a secciones.')
expect(externalView.includes('fetchCanonicalExternalSnapshotScope'), 'El warm externo debe usar el resolver canónico compartido.')
expect(canonical.includes('fetchControlEscolarStudentsWithCanonicalGroups'), 'El snapshot debe usar el mismo resolver de grupos que Control Escolar.')
expect(canonical.includes('parseEnrollmentConceptsForScope') && canonical.includes('readBestConceptosConfigPayload'), 'El snapshot debe resolver la misma configuración de conceptos de inscripción.')
expect(control.includes('includedByExternalSection') && control.includes('externalSectionMember') && control.includes('inSections: Boolean(base.externalSectionMember)'), 'El resolver externo debe conservar alumnos que pertenecen a secciones y publicar inSections.')
expect(canonical.includes("enrollmentState === 'baja_inscrita'") && canonical.includes('!isBajaStudent(student)'), 'El snapshot externo debe excluir bajas y bajas inscritas aunque pertenezcan a secciones.')
expect(refresh.includes('EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION') && !refresh.includes("const VIEW_VERSION = 'control-escolar-student-view-v1'"), 'El refresh no puede fijar una versión vieja del snapshot.')
expect(externalView.includes('const refreshed = await warmExternalControlEscolarStudentScope(input)') && !externalView.includes('const payload = sanitizeExternalStudentPayload(student)'), 'El refresh puntual debe regenerar el scope canónico completo; no puede inyectar una fila.')
expect(!externalSnapshot.includes('overlayCanonicalMatriculaGroups') && !externalSnapshot.includes('matricula.grupo-live') && !externalSnapshot.includes('SELECT matricula, grupo'), 'La lectura pública no puede reemplazar el grupo canónico del snapshot con matricula.grupo ni otra fuente legacy.')
expect(externalSnapshot.includes('Snapshot age is telemetry only') && !externalSnapshot.includes('AURORA_STUDENT_SNAPSHOT_TOO_OLD'), 'La edad del snapshot debe ser telemetría; nunca debe impedir servir el last-known-good persistido.')
expect(credentialPhotos.includes("getCentralTableColumns('credenciales')") && credentialPhotos.includes("getCentralTableColumns('matricula')"), 'El filtro de fotos por etapa debe resolver credenciales y matricula desde la fuente central.')
expect(credentialPhotos.includes("contract:'credential-photo-stages-v2'"), 'El historial de fotos por etapa debe exponer el contrato v2.')
expect(credentialPhotos.includes('AS photo_url') && credentialPhotos.includes('cFoto'), 'Cada etapa debe publicar su propia foto desde credenciales.')
expect(credentialPhotos.includes('is_current_photo'), 'La coincidencia con matricula.foto debe conservarse sólo como telemetría.')
expect(credentialPhotos.includes('matricula.foto is only the latest global picture') && credentialPhotos.includes('const currentSql='), 'matricula.foto sólo puede usarse como telemetría; no como filtro que borre etapas históricas.')
expect(credentialPhotos.includes('photos:Array.from(stage.photos.values())'), 'Cada etapa debe publicar snapshots de foto por matrícula.')
expect(credentialPhotos.includes('defaultStageKey') && credentialPhotos.includes('submissionCount'), 'El contrato v2 debe publicar etapa predeterminada y total de envíos.')
expect(credentialPhotos.includes('plantelAliases') && credentialPhotos.includes('cycleCandidates'), 'El filtro de etapa debe respetar plantel y ciclo.')
expect(credentialPhotosRoute.includes('assertAuroraExternalApiToken'), 'El endpoint de fotos por etapa debe conservar la autenticación de la API externa.')
if (failures.length) { console.error('Fuente académica inválida:'); failures.forEach(failure => console.error(`- ${failure}`)); process.exit(1) }
console.log('Fuente académica válida: snapshot público y Control Escolar comparten conceptos, población y grupos canónicos sin overlay posterior.')
