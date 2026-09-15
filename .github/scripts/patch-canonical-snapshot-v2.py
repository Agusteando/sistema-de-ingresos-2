from pathlib import Path
import re

root = Path('.')


def replace_once(path, old, new, label):
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: {label}: expected 1 match, got {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


def regex_once(path, pattern, replacement, label, flags=0):
    text = path.read_text(encoding='utf-8')
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{path}: {label}: expected 1 match, got {count}')
    path.write_text(new_text, encoding='utf-8')


control = root / 'server/utils/control-escolar.ts'
replace_once(control, 'import { writeControlEscolarExternalStudentView } from "./control-escolar-external-view";\n', '', 'remove direct snapshot writer import')
regex_once(
    control,
    r'  if \(wantsAll && !normalizeText\(filters\.search \|\| filters\.q \|\| "", 80\)\) \{\n    writeControlEscolarExternalStudentView\(agentId, filters, allStudents, loaded\.source\)\.catch\(\(error: any\) => \{\n      console\.warn\("\[Aurora External API\] Warm student view publish failed\.", \{\n        plantel: normalizePlantel\(agentId\),\n        ciclo: normalizeText\(filters\.ciclo \|\| filters\.cicloKey \|\| ""\),\n        message: error\?\.message \|\| error\n      \}\);\n    \}\);\n  \}\n',
    '',
    'remove pre-canonical auto snapshot side effect',
)

view = root / 'server/utils/control-escolar-external-view.ts'
replace_once(view, "import { runWithBridgeAgentId } from './db'\n", '', 'remove obsolete bridge runner import')
replace_once(
    view,
    "const VIEW_VERSION = 'control-escolar-student-view-v1'",
    "export const EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION = 'control-escolar-student-view-v2-canonical'\nconst VIEW_VERSION = EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION",
    'bump snapshot version',
)
replace_once(
    view,
    "  const scope = buildExternalControlEscolarScope({ ...filters, plantel: agentId, agentId })\n  if (!scope.plantel || !scope.cicloKey || !scope.descriptor.cacheable || !Array.isArray(students)) {",
    "  if (source?.canonical !== true) {\n    throw createError({\n      statusCode: 500,\n      statusMessage: 'AURORA_NON_CANONICAL_SNAPSHOT_WRITE_BLOCKED',\n      message: 'Los snapshots externos solo pueden escribirse desde el resolver canónico de Control Escolar.'\n    })\n  }\n\n  const scope = buildExternalControlEscolarScope({ ...filters, plantel: agentId, agentId })\n  if (!scope.plantel || !scope.cicloKey || !scope.descriptor.cacheable || !Array.isArray(students)) {",
    'guard canonical snapshot writes',
)
replace_once(
    view,
    "  // A Bridge maintenance window must never turn a healthy shared snapshot\n  // into a cached empty result.\n  if (students.length === 0) {\n    return { skipped: true, reason: 'empty_rows_preserved', rows: 0 }\n  }",
    "  if (students.length === 0) {\n    await ensureControlEscolarExternalViewSchema()\n    await controlEscolarCentralQuery(\n      `DELETE FROM ${EXTERNAL_VIEW_TABLE} WHERE plantel = ? AND ciclo_key = ? AND view_version = ?`,\n      [scope.plantel, scope.cicloKey, VIEW_VERSION]\n    )\n    throw createError({\n      statusCode: 503,\n      statusMessage: 'AURORA_CANONICAL_SNAPSHOT_EMPTY',\n      message: `Control Escolar canónico no produjo alumnos para ${scope.plantel} en ciclo ${scope.cicloKey}; Aurora no conservará un snapshot anterior.`\n    })\n  }",
    'fail closed on empty canonical snapshot',
)
replace_once(
    view,
    "  await controlEscolarCentralQuery(\n    `DELETE FROM ${EXTERNAL_VIEW_TABLE}\n     WHERE plantel = ? AND scope_key = ? AND view_version = ? AND generated_at < ?`,\n    [scope.plantel, scope.descriptor.scopeKey, VIEW_VERSION, generatedAt]\n  )\n\n  return {",
    "  await controlEscolarCentralQuery(\n    `DELETE FROM ${EXTERNAL_VIEW_TABLE}\n     WHERE plantel = ? AND scope_key = ? AND view_version = ? AND generated_at < ?`,\n    [scope.plantel, scope.descriptor.scopeKey, VIEW_VERSION, generatedAt]\n  )\n\n  await controlEscolarCentralQuery(\n    `DELETE FROM ${EXTERNAL_VIEW_TABLE}\n     WHERE plantel = ? AND ciclo_key = ? AND view_version <> ?`,\n    [scope.plantel, scope.cicloKey, VIEW_VERSION]\n  )\n\n  return {",
    'purge superseded snapshot versions',
)

text = view.read_text(encoding='utf-8')
warm_start = text.index('export const warmExternalControlEscolarStudentScope = async')
warm_end = text.index('export const warmExternalControlEscolarStudentScopes = async', warm_start)
warm_block = r'''export const warmExternalControlEscolarStudentScope = async (input: any = {}) => {
  const scope = buildExternalControlEscolarScope(input)
  if (!scope.plantel || !scope.cicloKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'SCOPE_REQUIRED',
      message: 'Plantel y ciclo son obligatorios para preparar la base de alumnos.'
    })
  }

  const warmKey = `${scope.plantel}:${scope.cicloKey}:${VIEW_VERSION}`
  const existing = warmingScopes.get(warmKey)
  if (existing) return await existing

  const promise = (async () => {
    try {
      const { readCanonicalExternalControlEscolarAllStudents } = await import('./control-escolar-external-canonical')
      const canonical = await readCanonicalExternalControlEscolarAllStudents({
        ...input,
        plantel: scope.plantel,
        ciclo: scope.cicloKey,
        cicloKey: scope.cicloKey
      })
      const controlScope = canonical.controlScope
      const rows = Array.isArray(canonical?.data) ? canonical.data : []
      const filters = {
        ...input,
        plantel: controlScope.bridgeAgentId,
        agentId: controlScope.bridgeAgentId,
        ciclo: controlScope.ciclo,
        cicloKey: controlScope.ciclo,
        concepts: controlScope.concepts.join(',') || undefined,
        tipoConcepts: controlScope.tipoConcepts.join(',') || undefined,
        all: 'snapshot',
        mode: 'snapshot',
        search: '',
        q: '',
        status: '',
        grado: '',
        grupo: '',
        group: '',
        quality: '',
        recent: ''
      }
      const written = await writeControlEscolarExternalStudentView(
        controlScope.bridgeAgentId,
        filters,
        rows,
        { canonical: true, source: 'aurora-control-escolar-canonical' }
      )
      return {
        ...written,
        rows: rows.length,
        plantel: controlScope.plantel,
        bridgeAgentId: controlScope.bridgeAgentId,
        ciclo: controlScope.ciclo,
        concepts: controlScope.concepts,
        tipoConcepts: controlScope.tipoConcepts,
        catalogs: canonical.catalogs || {}
      }
    } catch (error: any) {
      throwExternalStudentScopeError({
        statusCode: 502,
        statusMessage: 'AURORA_STUDENT_SCOPE_WARM_FAILED',
        message: `Aurora no pudo generar el snapshot canónico de ${scope.plantel} para ciclo ${scope.cicloKey}.`,
        plantel: scope.plantel,
        ciclo: scope.cicloKey,
        cause: error,
        extra: { phase: 'canonical-snapshot-v2' }
      })
    }
  })().finally(() => warmingScopes.delete(warmKey))

  warmingScopes.set(warmKey, promise)
  return await promise
}

'''
view.write_text(text[:warm_start] + warm_block + text[warm_end:], encoding='utf-8')

text = view.read_text(encoding='utf-8')
refresh_start = text.index('export const refreshExternalControlEscolarStudentViewRow = async')
refresh_end = text.index('export const readExternalControlEscolarStudents = async', refresh_start)
refresh_block = r'''export const refreshExternalControlEscolarStudentViewRow = async (input: any, student: any) => {
  const matricula = normalizeText(student?.matricula || student?.studentId || input?.matricula, 64)
  if (!matricula) {
    throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })
  }

  const refreshed = await warmExternalControlEscolarStudentScope(input)
  return {
    success: true,
    matricula,
    refreshedSnapshot: true,
    ...refreshed
  }
}

'''
view.write_text(text[:refresh_start] + refresh_block + text[refresh_end:], encoding='utf-8')

presenter = root / 'server/utils/control-escolar-external-snapshot-presenter.ts'
replace_once(
    presenter,
    "      source: 'aurora-control-escolar-central-snapshot',\n      fallback: false,\n      freshRequested: isExternalFreshReadRequested(query),\n      cachePolicy: 'central-snapshot-only'",
    "      source: 'aurora-control-escolar-canonical-snapshot',\n      fallback: false,\n      freshRequested: isExternalFreshReadRequested(query),\n      cachePolicy: 'control-escolar-canonical-snapshot-v2'",
    'canonical snapshot public metadata',
)

snapshot = root / 'server/utils/control-escolar-external-snapshot.ts'
snapshot.write_text(r'''import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { controlEscolarCentralQuery } from './control-escolar-central'
import {
  buildExternalControlEscolarScope,
  ensureControlEscolarExternalViewSchema,
  EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION,
  getExternalStudentPlanteles,
  readExternalControlEscolarChanges,
  readExternalControlEscolarStudentDetail,
  readExternalControlEscolarStudents,
  warmExternalControlEscolarStudentScope
} from './control-escolar-external-view'
import { normalizeExternalControlEscolarPlantel } from './control-escolar-plantel-routing'
import { withExternalSnapshotMeta } from './control-escolar-external-snapshot-presenter'

const EXTERNAL_VIEW_TABLE = 'control_external_student_view'
const MAX_PAGE_SIZE = 500
const FRESH_REQUEST_MAX_AGE_MS = 60_000

const clean = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const canonicalMatricula = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')

const timestamp = (value: unknown) => {
  if (!value) return Number.NaN
  const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime()
  return Number.isFinite(time) ? time : Number.NaN
}

const wantsFreshSnapshot = (query: any = {}) =>
  ['1', 'true', 'yes', 'fresh'].includes(clean(query.fresh, 20).toLowerCase())

const snapshotNeedsWarm = (row: any, query: any = {}) => {
  if (!row?.scope_key) return true
  const now = Date.now()
  const generatedAt = timestamp(row.generated_at)
  const staleAt = timestamp(row.stale_after)
  const expiresAt = timestamp(row.expires_at)
  if (!Number.isFinite(generatedAt)) return true
  if (Number.isFinite(expiresAt) && now >= expiresAt) return true
  if (Number.isFinite(staleAt) && now >= staleAt) return true
  if (wantsFreshSnapshot(query) && now - generatedAt > FRESH_REQUEST_MAX_AGE_MS) return true
  return false
}

const readLatestSnapshotScope = async (scope: ReturnType<typeof buildExternalControlEscolarScope>) => {
  const params: any[] = [scope.plantel, scope.cicloKey, EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION]
  let scopeSql = ''
  if (scope.hasExplicitConcepts) {
    scopeSql = ' AND scope_key = ?'
    params.push(scope.descriptor.scopeKey)
  }

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT scope_key, generated_at, stale_after, expires_at
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE plantel = ? AND ciclo_key = ? AND view_version = ?${scopeSql}
     ORDER BY generated_at DESC
     LIMIT 1`,
    params
  )
  return rows[0] || null
}

const snapshotUnavailable = (plantel: string, ciclo: string) => createError({
  statusCode: 503,
  statusMessage: 'AURORA_CANONICAL_SNAPSHOT_NOT_READY',
  message: `Aurora no pudo generar un snapshot canónico de ${plantel} para ciclo ${ciclo}.`,
  data: { code: 'AURORA_CANONICAL_SNAPSHOT_NOT_READY', plantel, ciclo, retryable: true, source: 'aurora-control-escolar-canonical-snapshot' }
})

export const assertExternalControlEscolarSnapshotReady = async (query: any = {}) => {
  const scope = buildExternalControlEscolarScope(query)
  if (!scope.plantel) throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  if (!scope.cicloKey) throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })

  await ensureControlEscolarExternalViewSchema()
  let row = await readLatestSnapshotScope(scope)
  if (snapshotNeedsWarm(row, query)) {
    await warmExternalControlEscolarStudentScope({ ...query, plantel: scope.plantel, ciclo: scope.cicloKey, cicloKey: scope.cicloKey })
    row = await readLatestSnapshotScope(scope)
  }
  if (!row?.scope_key || snapshotNeedsWarm(row, query)) throw snapshotUnavailable(scope.plantel, scope.cicloKey)
  return { scope, row }
}

export const readExternalSnapshotStudents = async (query: any = {}) => {
  await assertExternalControlEscolarSnapshotReady(query)
  return withExternalSnapshotMeta(await readExternalControlEscolarStudents(query), query)
}

export const readExternalSnapshotChanges = async (query: any = {}) => {
  await assertExternalControlEscolarSnapshotReady(query)
  return withExternalSnapshotMeta(await readExternalControlEscolarChanges(query), query)
}

export const readExternalSnapshotStudentDetail = async (query: any = {}, matriculaValue: unknown) => {
  const matricula = canonicalMatricula(matriculaValue)
  if (!matricula) throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })

  const requestedPlantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  if (requestedPlantel) {
    await assertExternalControlEscolarSnapshotReady({ ...query, plantel: requestedPlantel })
    return withExternalSnapshotMeta(await readExternalControlEscolarStudentDetail({ ...query, plantel: requestedPlantel }, matricula), query)
  }

  let lastInfrastructureError = null
  let readyScopes = 0
  for (const plantel of getExternalStudentPlanteles()) {
    try {
      await assertExternalControlEscolarSnapshotReady({ ...query, plantel })
      readyScopes += 1
      try {
        return withExternalSnapshotMeta(await readExternalControlEscolarStudentDetail({ ...query, plantel }, matricula), query)
      } catch (error) {
        if (Number(error?.statusCode || 0) !== 404) throw error
      }
    } catch (error) {
      lastInfrastructureError = error
    }
  }

  if (!readyScopes && lastInfrastructureError) throw lastInfrastructureError
  throw createError({ statusCode: 404, statusMessage: 'STUDENT_NOT_FOUND', message: `No se encontró la matrícula ${matricula} en los snapshots canónicos disponibles.` })
}

export const readAllExternalSnapshotStudents = async (query: any = {}) => {
  const plantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  if (!plantel) throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })

  const data = []
  let cursor = ''
  let firstResponse = null
  do {
    const response = await readExternalSnapshotStudents({ ...query, plantel, limit: MAX_PAGE_SIZE, cursor })
    firstResponse ||= response
    data.push(...(Array.isArray(response?.data) ? response.data : []))
    cursor = clean(response?.pagination?.nextCursor, 500)
  } while (cursor)

  return {
    data,
    catalogs: firstResponse?.catalogs || { niveles: [], grados: [], grupos: [], gruposPorGrado: {} },
    meta: { ...(firstResponse?.meta || {}), rows: data.length }
  }
}

export const readExternalSnapshotAcademicPlacement = async (query: any = {}, matriculaValue: unknown) => {
  const ciclo = normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || '')
  if (!ciclo) throw createError({ statusCode: 400, statusMessage: 'CICLO_INVALID', message: 'El ciclo escolar no es válido.' })

  const response = await readExternalSnapshotStudentDetail(query, matriculaValue)
  const student = response?.data || {}
  return {
    data: {
      matricula: canonicalMatricula(student.matricula || matriculaValue),
      ciclo,
      plantel: normalizeExternalControlEscolarPlantel(student.plantel || query.plantel || query.agentId || ''),
      nivel: clean(student.nivel, 80),
      grado: clean(student.grado, 80),
      grupo: clean(student.group || student.grupo, 80)
    },
    meta: {
      ...(response?.meta || {}),
      academicPlacementSource: 'control-escolar-canonical-snapshot',
      groupSource: 'control-escolar-canonical',
      generatedAt: response?.meta?.generatedAt || null
    }
  }
}
''', encoding='utf-8')

verifier = root / 'scripts/verify-academic-source.mjs'
verifier.write_text(r'''import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const controlEscolarPath = join(root, 'server/utils/control-escolar.ts')
const externalCanonicalPath = join(root, 'server/utils/control-escolar-external-canonical.ts')
const externalViewPath = join(root, 'server/utils/control-escolar-external-view.ts')
const externalSnapshotPath = join(root, 'server/utils/control-escolar-external-snapshot.ts')
const [text, externalCanonicalText, externalViewText, externalSnapshotText] = await Promise.all([
  readFile(controlEscolarPath, 'utf8'),
  readFile(externalCanonicalPath, 'utf8'),
  readFile(externalViewPath, 'utf8'),
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
if (failures.length) {
  console.error('Fuente académica inválida: Control Escolar, snapshots y API pública deben compartir una sola proyección canónica.')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Fuente académica válida: los snapshots v2 se generan exclusivamente desde Control Escolar canónico y la API solo sirve esa proyección.')
''', encoding='utf-8')
