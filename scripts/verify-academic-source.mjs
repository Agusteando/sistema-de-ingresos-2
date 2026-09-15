import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const controlEscolarPath = join(root, 'server/utils/control-escolar.ts')
const externalCanonicalPath = join(root, 'server/utils/control-escolar-external-canonical.ts')
const externalSnapshotPath = join(root, 'server/utils/control-escolar-external-snapshot.ts')
const [text, externalCanonicalText, externalSnapshotText] = await Promise.all([
  readFile(controlEscolarPath, 'utf8'),
  readFile(externalCanonicalPath, 'utf8'),
  readFile(externalSnapshotPath, 'utf8')
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
if (centralSelect && /["']grado["']/.test(centralSelect[0])) {
  failures.push('server/utils/control-escolar.ts: centralSelectColumns no puede seleccionar matricula.grado')
}
if (centralSelect && /["']nivel["']/.test(centralSelect[0])) {
  failures.push('server/utils/control-escolar.ts: centralSelectColumns no puede seleccionar matricula.nivel')
}

if (!externalCanonicalText.includes('fetchControlEscolarStudentsWithCanonicalGroups')) {
  failures.push('server/utils/control-escolar-external-canonical.ts: la API pública debe reutilizar el resolver canónico de Control Escolar')
}
if (!externalCanonicalText.includes('readBestConceptosConfigPayload') || !externalCanonicalText.includes('parseEnrollmentConceptsForScope')) {
  failures.push('server/utils/control-escolar-external-canonical.ts: la API pública debe resolver la misma configuración de inscripción que Control Escolar')
}
if (!externalSnapshotText.includes('readCanonicalExternalControlEscolarStudents(query)')) {
  failures.push('server/utils/control-escolar-external-snapshot.ts: el snapshot no puede ser la fuente primaria de alumnos públicos')
}
if (!externalSnapshotText.includes('readCanonicalExternalControlEscolarStudentDetail(query, matriculaValue)')) {
  failures.push('server/utils/control-escolar-external-snapshot.ts: el detalle/academic público debe usar Control Escolar canónico primero')
}

if (failures.length) {
  console.error('Fuente académica inválida: grado y nivel vigentes deben salir de la proyección de Control Escolar, nunca de matricula.grado/matricula.nivel.')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Fuente académica válida: Control Escolar y la API pública comparten la misma proyección canónica de grado, grupo, ciclo y alcance de inscripción.')
