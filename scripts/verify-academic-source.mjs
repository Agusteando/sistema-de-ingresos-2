import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const controlEscolarPath = join(root, 'server/utils/control-escolar.ts')
const text = await readFile(controlEscolarPath, 'utf8')
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

if (failures.length) {
  console.error('Fuente académica inválida: grado y nivel vigentes deben salir de la proyección de Control Escolar, nunca de matricula.grado/matricula.nivel.')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Fuente académica válida: Control Escolar no lee matricula.grado ni matricula.nivel para resolver la colocación vigente.')
