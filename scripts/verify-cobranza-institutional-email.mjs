import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = await readFile(join(process.cwd(), 'server/utils/cobranzaEmail.ts'), 'utf8')
const smoke = await readFile(join(process.cwd(), 'server/api/external/v1/deudores/email-smoke.post.ts'), 'utf8')

const checks = [
  [source.includes("DEFAULT_COBRANZA_EMAIL_SUBJECT = 'IECS-IEDIS | Estado de cuenta | {{nombre_alumno}}'"), 'subject is institutional'],
  [source.includes('data-iecs-iedis-email="cobranza-v2"'), 'institutional wrapper marker is present'],
  [source.includes('https://aurora.casitaiedis.edu.mx/brand/iecs-iedis-logo.png'), 'official IECS-IEDIS logo asset is present'],
  [source.includes('#00692F') && source.includes('#618B2F'), 'IECS institutional greens are present'],
  [source.includes('#007F92') && source.includes('#5FB4A9'), 'IEDIS institutional teal palette is present'],
  [source.includes('#50535A') && source.includes('#86888C'), 'institutional gray palette is present'],
  [source.includes('font-family:Montserrat') && source.includes('font-family:Fredoka,Montserrat'), 'institutional typography families are present'],
  [source.includes('Instituto Educativo La Casita del Saber S.C.') && source.includes('Instituto Educativo para el Desarrollo Integral del Saber S.C.'), 'formal institutional footer is present'],
  [source.includes("rawSubject === LEGACY_COBRANZA_EMAIL_SUBJECT"), 'legacy subject migrates in memory'],
  [source.includes('normalizeComparableHtml(raw) === normalizeComparableHtml(LEGACY_COBRANZA_EMAIL_TEMPLATE)'), 'legacy body migrates only on exact normalized match'],
  [source.includes('wrapInstitutionalEmail(renderedContent)'), 'all rendered cobranza content passes through institutional shell'],
  [source.includes("new Set(['desglose', 'desglose_table'])"), 'trusted generated breakdown remains renderable'],
  [smoke.includes("import { renderCobranzaEmail }"), 'production smoke uses the real cobranza renderer'],
  [smoke.includes("institutionalTemplate: rendered.html.includes('data-iecs-iedis-email=\"cobranza-v2\"')"), 'production smoke asserts institutional renderer marker'],
  [smoke.includes("TEST_EMAIL = 'desarrollo.tecnologico@casitaiedis.edu.mx'"), 'production smoke remains locked to institutional test mailbox'],
]

const failures = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
if (failures.length) process.exit(1)
console.log('COBRANZA_INSTITUTIONAL_EMAIL_OK')
