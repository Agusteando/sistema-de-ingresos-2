import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const controlEscolarPath = join(root, 'server/utils/control-escolar.ts')
const externalCanonicalPath = join(root, 'server/utils/control-escolar-external-canonical.ts')
const externalViewPath = join(root, 'server/utils/control-escolar-external-view.ts')
const externalSnapshotPath = join(root, 'server/utils/control-escolar-external-snapshot.ts')
const talleresSnapshotPath = join(root, 'server/utils/talleres-snapshot.ts')
const [text, externalCanonicalText, externalViewText, externalSnapshotText, talleresSnapshotText] = await Promise.all([
  readFile(controlEscolarPath, 'utf8'),
  readFile(externalCanonicalPath, 'utf8'),
  readFile(externalViewPath, 'utf8'),
  readFile(externalSnapshotPath, 'utf8'),
  readFile(talleresSnapshotPath, 'utf8')
])
const failures = []

const directPatterns = [
  { label: 'lectura directa de matricula.grado', pattern: /\b(?:matricula|m)\??\.grado\b/i },
  { label: 'lectura directa de matricula.nivel', pattern: /\b(?:matricula|m)\??\.nivel\b/i },
  { label: 'uso de grado desde el overlay central de matricula', pattern: /\boverlay\??\.grado\b/i },
  { label: 'uso de nivel desde el overlay central de matricula', pattern: /\boverlay\??\.nivel\b/i },
  { label: 'alias matriculaGrado', pattern: /\bmatriculaGrado\b/i },
  { label: 'alias matriculaNivel', pattern: /\bmatriculaNivel\b/i }
]
for (const rule of directPatterns) {
  const match = text.match(rule.pattern)
  if (!match || match.index === undefined) continue
  const line = text.slice(0, match.index).split('\n').length
  failures.push(`server/utils/control-escolar.ts:${line}: ${rule.label}`)
}
const centralSelect = text.match(/const centralSelectColumns[\s\S]*?const canonicalMatriculaKey/)
if (centralSelect && /["']grado["']/.test(centralSelect[0])) failures.push('server/utils/control-escolar.ts: centralSelectColumns no puede seleccionar matricula.grado')
if (centralSelect && /["']nivel["']/.test(centralSelect[0])) failures.push('server/utils/control-escolar.ts: centralSelectColumns no puede seleccionar matricula.nivel')
if (!externalCanonicalText.includes('fetchControlEscolarStudentsWithCanonicalGroups')) failures.push('server/utils/control-escolar-external-canonical.ts: la API pública debe reutilizar el resolver canónico de Control Escolar')
if (!externalCanonicalText.includes('readBestConceptosConfigPayload') || !externalCanonicalText.includes('parseEnrollmentConceptsForScope')) failures.push('server/utils/control-escolar-external-canonical.ts: la API pública debe resolver la misma configuración de inscripción que Control Escolar')
if (text.includes('writeControlEscolarExternalStudentView')) failures.push('server/utils/control-escolar.ts: el resolver base no puede publicar snapshots antes de canonicalizar grupos')
if (!externalViewText.includes("EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION = 'control-escolar-student-view-v2-canonical'")) failures.push('server/utils/control-escolar-external-view.ts: el snapshot canónico debe usar la versión v2')
if (!externalViewText.includes('readCanonicalExternalControlEscolarAllStudents')) failures.push('server/utils/control-escolar-external-view.ts: todo warm de snapshot debe originarse en Control Escolar canónico')
if (!externalViewText.includes('source?.canonical !== true')) failures.push('server/utils/control-escolar-external-view.ts: las escrituras no canónicas de snapshot deben estar bloqueadas')
if (!externalSnapshotText.includes('EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION')) failures.push('server/utils/control-escolar-external-snapshot.ts: los lectores deben compartir la misma versión de snapshot')
if (externalSnapshotText.includes('withCanonicalFallbackMeta') || externalSnapshotText.includes('overlayCanonicalMatriculaGroups')) failures.push('server/utils/control-escolar-external-snapshot.ts: no se permite rescatar snapshots viejos ni superponer una segunda interpretación')
if (!externalViewText.includes('mysqlSecondPrecisionNow') || !externalViewText.includes('const generatedAt = mysqlSecondPrecisionNow()')) failures.push('server/utils/control-escolar-external-view.ts: el marcador de generación debe respetar la precisión DATETIME de MySQL para no borrar filas recién escritas')
if (!talleresSnapshotText.includes('readCanonicalExternalControlEscolarAllStudents') || !talleresSnapshotText.includes('canonicalStudents: any[]')) failures.push('server/utils/talleres-snapshot.ts: Talleres debe sembrar su roster desde Control Escolar canónico')
if (!talleresSnapshotText.includes("TALLERES_SNAPSHOT_VIEW_VERSION = 'talleres-roster-v3-canonical'")) failures.push('server/utils/talleres-snapshot.ts: Talleres debe publicar una versión nueva del snapshot canónico y no reutilizar v2')
if (talleresSnapshotText.includes('current.base = mergeDefined(current.base, raw)')) failures.push('server/utils/talleres-snapshot.ts: una fuente de enriquecimiento no puede reemplazar la base académica canónica')
if (talleresSnapshotText.includes('...mergeDefined(current, incoming)')) failures.push('server/utils/talleres-snapshot.ts: una fila preservada no puede sobrescribir grado/grupo canónicos frescos')
if (!talleresSnapshotText.includes('mysqlSecondPrecisionNow') || !talleresSnapshotText.includes('const generatedAt = mysqlSecondPrecisionNow()')) failures.push('server/utils/talleres-snapshot.ts: el snapshot de Talleres debe usar un marcador compatible con DATETIME')
if (failures.length) {
  console.error('Fuente académica inválida: Control Escolar, snapshots y API pública deben compartir una sola proyección canónica.')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Fuente académica válida: los snapshots v2 se generan exclusivamente desde Control Escolar canónico y la API solo sirve esa proyección.')
