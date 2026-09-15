from pathlib import Path

ROOT = Path('.')


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: {label}: expected 1 match, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_block(path: Path, start: str, end: str, new_block: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f'{path}: {label}: start marker not found')
    end_index = text.find(end, start_index + len(start))
    if end_index < 0:
        raise SystemExit(f'{path}: {label}: end marker not found')
    path.write_text(text[:start_index] + new_block + text[end_index:], encoding='utf-8')


canonical_path = ROOT / 'server/utils/control-escolar-external-canonical.ts'
canonical_path.write_text(r'''import { runWithBridgeAgentId } from './db'
import { readBestConceptosConfigPayload } from './conceptos-config'
import { normalizeCicloKey } from '../../shared/utils/ciclo'
import {
  normalizeEnrollmentConceptIds,
  normalizeEnrollmentPlantelKey,
  parseEnrollmentConceptsForPlantelHistory,
  parseEnrollmentConceptsForScope
} from '../../shared/utils/studentPresentation'
import {
  EXTERNAL_CONTROL_ESCOLAR_PLANTELES,
  controlEscolarBridgeAgentCandidates,
  normalizeExternalControlEscolarPlantel
} from './control-escolar-plantel-routing'

const MAX_PAGE_SIZE = 500
const DEFAULT_PAGE_SIZE = 100
const MAX_ALL_ROWS = 25000

const clean = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const canonicalMatricula = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')
const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ offset })).toString('base64url')
const decodeCursor = (value: unknown) => {
  const text = clean(value, 200)
  if (!text) return 0
  try {
    const parsed = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
    const offset = Number(parsed?.offset || 0)
    return Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'INVALID_CURSOR',
      message: 'El cursor de alumnos no es válido.'
    })
  }
}

const explicitCurrentConcepts = (query: any = {}) => normalizeEnrollmentConceptIds(
  query.concepts || query.enrollmentConcepts || query.conceptIds || ''
)
const explicitTipoConcepts = (query: any = {}) => normalizeEnrollmentConceptIds(
  query.tipoConcepts || query.tipoIngresoConcepts || ''
)

const resolveCanonicalConceptScope = async (query: any, bridgeAgentId: string, ciclo: string) => {
  let concepts = explicitCurrentConcepts(query)
  let tipoConcepts = explicitTipoConcepts(query)

  if (!concepts.length || !tipoConcepts.length) {
    const config = await readBestConceptosConfigPayload()
    const plantel = normalizeEnrollmentPlantelKey(bridgeAgentId)
    if (!concepts.length) {
      concepts = parseEnrollmentConceptsForScope(config, { ciclo, plantel })
    }
    if (!tipoConcepts.length) {
      tipoConcepts = parseEnrollmentConceptsForPlantelHistory(config, { plantel })
    }
  }

  if (!tipoConcepts.length) tipoConcepts = [...concepts]
  return {
    concepts: Array.from(new Set(concepts)),
    tipoConcepts: Array.from(new Set(tipoConcepts))
  }
}

const canonicalScopeError = (plantel: string, ciclo: string, error: any) => createError({
  statusCode: Number(error?.statusCode || error?.httpStatus || 502) || 502,
  statusMessage: 'AURORA_CONTROL_ESCOLAR_CANONICAL_UNAVAILABLE',
  message: `Aurora no pudo resolver Control Escolar canónico para ${plantel} en ciclo ${ciclo}.`,
  data: {
    code: 'AURORA_CONTROL_ESCOLAR_CANONICAL_UNAVAILABLE',
    plantel,
    ciclo,
    cause: clean(error?.statusMessage || error?.code || error?.message || 'control_escolar_unavailable', 240)
  }
})

const runCanonicalScope = async (query: any = {}, options: { all?: boolean } = {}) => {
  const plantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  const ciclo = normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || '')
  if (!plantel) {
    throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  }
  if (!ciclo) {
    throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })
  }

  const candidates = controlEscolarBridgeAgentCandidates(plantel)
  let lastError: any = null

  for (const bridgeAgentId of candidates) {
    try {
      const conceptScope = await resolveCanonicalConceptScope(query, bridgeAgentId, ciclo)
      const { fetchControlEscolarStudentsWithCanonicalGroups } = await import('./control-escolar-groups')

      if (options.all) {
        const filters = {
          ...query,
          agentId: bridgeAgentId,
          plantel: bridgeAgentId,
          ciclo,
          cicloKey: ciclo,
          concepts: conceptScope.concepts.join(',') || undefined,
          tipoConcepts: conceptScope.tipoConcepts.join(',') || undefined,
          externalApi: true,
          all: '1',
          mode: 'index',
          page: 1,
          limit: MAX_ALL_ROWS,
          search: '',
          q: '',
          status: '',
          grado: '',
          group: '',
          grupo: '',
          nivel: '',
          quality: '',
          calidad: '',
          missing: '',
          recent: ''
        }
        const result = await runWithBridgeAgentId(
          bridgeAgentId,
          async () => await fetchControlEscolarStudentsWithCanonicalGroups(bridgeAgentId, filters)
        )
        return {
          ...result,
          controlScope: {
            plantel,
            bridgeAgentId,
            ciclo,
            concepts: conceptScope.concepts,
            tipoConcepts: conceptScope.tipoConcepts
          },
          meta: {
            version: 'v1',
            source: 'aurora-control-escolar-canonical',
            fallback: false,
            plantel,
            bridgeAgentId,
            ciclo,
            academicPlacementSource: 'base-projection',
            groupSource: 'control-escolar-canonical'
          }
        }
      }

      const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit || DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE))
      const offset = decodeCursor(query.cursor)
      if (offset % limit !== 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'INVALID_CURSOR',
          message: 'El cursor no coincide con el tamaño de página solicitado.'
        })
      }
      const page = Math.floor(offset / limit) + 1
      const filters = {
        ...query,
        agentId: bridgeAgentId,
        plantel: bridgeAgentId,
        ciclo,
        cicloKey: ciclo,
        concepts: conceptScope.concepts.join(',') || undefined,
        tipoConcepts: conceptScope.tipoConcepts.join(',') || undefined,
        externalApi: true,
        all: '',
        mode: '',
        page,
        limit
      }
      const result = await runWithBridgeAgentId(
        bridgeAgentId,
        async () => await fetchControlEscolarStudentsWithCanonicalGroups(bridgeAgentId, filters)
      )
      const data = Array.isArray(result?.data) ? result.data : []
      const total = Number(result?.pagination?.total || data.length || 0)
      const nextOffset = offset + data.length < total ? offset + limit : null

      return {
        data,
        pagination: {
          limit,
          nextCursor: nextOffset === null ? null : encodeCursor(nextOffset),
          total
        },
        catalogs: result?.catalogs || {},
        controlScope: {
          plantel,
          bridgeAgentId,
          ciclo,
          concepts: conceptScope.concepts,
          tipoConcepts: conceptScope.tipoConcepts
        },
        meta: {
          version: 'v1',
          source: 'aurora-control-escolar-canonical',
          fallback: false,
          plantel,
          bridgeAgentId,
          ciclo,
          academicPlacementSource: 'base-projection',
          groupSource: 'control-escolar-canonical'
        }
      }
    } catch (error: any) {
      lastError = error
    }
  }

  throw canonicalScopeError(plantel, ciclo, lastError)
}

export const readCanonicalExternalControlEscolarStudents = async (query: any = {}) =>
  await runCanonicalScope(query)

export const readCanonicalExternalControlEscolarAllStudents = async (query: any = {}) =>
  await runCanonicalScope(query, { all: true })

const readCanonicalDetailInPlantel = async (query: any, matricula: string) => {
  const result = await readCanonicalExternalControlEscolarStudents({
    ...query,
    search: matricula,
    q: matricula,
    status: '',
    grado: '',
    group: '',
    grupo: '',
    nivel: '',
    quality: '',
    calidad: '',
    missing: '',
    recent: '',
    cursor: '',
    limit: 100
  })
  const student = (Array.isArray(result?.data) ? result.data : []).find(
    (entry: any) => canonicalMatricula(entry?.matricula) === matricula
  )
  if (!student) {
    throw createError({
      statusCode: 404,
      statusMessage: 'STUDENT_NOT_FOUND',
      message: `No se encontró la matrícula ${matricula} en Control Escolar.`
    })
  }
  return {
    data: student,
    meta: result.meta,
    controlScope: result.controlScope
  }
}

export const readCanonicalExternalControlEscolarStudentDetail = async (
  query: any = {},
  matriculaValue: unknown
) => {
  const matricula = canonicalMatricula(matriculaValue)
  if (!matricula) {
    throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })
  }

  const requestedPlantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  if (requestedPlantel) {
    return await readCanonicalDetailInPlantel({ ...query, plantel: requestedPlantel }, matricula)
  }

  let lastInfrastructureError: any = null
  let successfulScope = false
  for (const plantel of EXTERNAL_CONTROL_ESCOLAR_PLANTELES) {
    try {
      successfulScope = true
      return await readCanonicalDetailInPlantel({ ...query, plantel }, matricula)
    } catch (error: any) {
      if (Number(error?.statusCode || 0) === 404) continue
      successfulScope = false
      lastInfrastructureError = error
    }
  }

  if (lastInfrastructureError && !successfulScope) throw lastInfrastructureError
  throw createError({
    statusCode: 404,
    statusMessage: 'STUDENT_NOT_FOUND',
    message: `No se encontró la matrícula ${matricula} en Control Escolar.`
  })
}
''', encoding='utf-8')

presenter = ROOT / 'server/utils/control-escolar-external-snapshot-presenter.ts'
replace_once(
    presenter,
    "const normalizeSnapshotResponseData = (response: any) => {",
    "export const normalizeControlEscolarExternalResponse = (response: any) => {",
    'export shared public response normalizer',
)
replace_once(
    presenter,
    "  const response = normalizeSnapshotResponseData(responseValue)",
    "  const response = normalizeControlEscolarExternalResponse(responseValue)",
    'use exported normalizer',
)
presenter_text = presenter.read_text(encoding='utf-8')
if 'withExternalCanonicalMeta' in presenter_text:
    raise SystemExit('canonical presenter already exists')
presenter.write_text(
    presenter_text + r'''

export const withExternalCanonicalMeta = (responseValue: any, query: any = {}) => {
  const response = normalizeControlEscolarExternalResponse(responseValue)
  return {
    ...(response || {}),
    meta: {
      ...(response?.meta || {}),
      source: 'aurora-control-escolar-canonical',
      fallback: false,
      freshRequested: true,
      cachePolicy: 'control-escolar-canonical-primary'
    }
  }
}
''',
    encoding='utf-8',
)

snapshot = ROOT / 'server/utils/control-escolar-external-snapshot.ts'
replace_once(
    snapshot,
    "  warmExternalControlEscolarStudentScope\n} from './control-escolar-external-view'",
    "  warmExternalControlEscolarStudentScope,\n  writeControlEscolarExternalStudentView\n} from './control-escolar-external-view'",
    'import canonical snapshot writer',
)
replace_once(
    snapshot,
    "import { withExternalSnapshotMeta } from './control-escolar-external-snapshot-presenter'",
    "import { withExternalCanonicalMeta, withExternalSnapshotMeta } from './control-escolar-external-snapshot-presenter'\nimport {\n  readCanonicalExternalControlEscolarAllStudents,\n  readCanonicalExternalControlEscolarStudentDetail,\n  readCanonicalExternalControlEscolarStudents\n} from './control-escolar-external-canonical'",
    'import canonical Control Escolar reader',
)
replace_once(
    snapshot,
    "const publicFailure = (error: any) => ({\n  statusCode: Number(error?.statusCode || error?.status || error?.httpStatus || 502) || 502,\n  statusMessage: clean(error?.statusMessage || error?.code || error?.name || 'AURORA_ERROR', 120),\n  message: clean(error?.message || error?.statusMessage || 'Error interno de Aurora.', 1000),\n  code: clean(error?.data?.code || error?.code || error?.statusMessage || '', 120) || null\n})",
    "const publicFailure = (error: any) => ({\n  statusCode: Number(error?.statusCode || error?.status || error?.httpStatus || 502) || 502,\n  statusMessage: clean(error?.statusMessage || error?.code || error?.name || 'AURORA_ERROR', 120),\n  message: clean(error?.message || error?.statusMessage || 'Error interno de Aurora.', 1000),\n  code: clean(error?.data?.code || error?.code || error?.statusMessage || '', 120) || null\n})\n\nconst withCanonicalFallbackMeta = (response: any, error: any) => ({\n  ...(response || {}),\n  meta: {\n    ...(response?.meta || {}),\n    source: 'aurora-control-escolar-central-snapshot-fallback',\n    fallback: true,\n    primarySource: 'aurora-control-escolar-canonical',\n    cachePolicy: 'control-escolar-canonical-primary',\n    primaryFailure: publicFailure(error)\n  }\n})",
    'canonical fallback metadata',
)

students_block = r'''export const readExternalSnapshotStudents = async (query: any = {}) => {
  let canonicalFailure: any = null
  try {
    const canonical = await readCanonicalExternalControlEscolarStudents(query)
    const { controlScope: _controlScope, ...publicResponse } = canonical
    return withExternalCanonicalMeta(publicResponse, query)
  } catch (error: any) {
    canonicalFailure = error
  }

  const ready = await assertExternalControlEscolarSnapshotReady(query)
  const response = withExternalSnapshotMeta(await readExternalControlEscolarStudents(query), query)
  const fallback = await overlayCanonicalMatriculaGroups(withRefreshFailureMeta(response, ready.refreshFailure))
  return withCanonicalFallbackMeta(fallback, canonicalFailure)
}

'''
replace_block(
    snapshot,
    'export const readExternalSnapshotStudents = async (query: any = {}) => {',
    'export const readExternalSnapshotChanges = async (query: any = {}) => {',
    students_block,
    'canonical students primary',
)

changes_block = r'''export const readExternalSnapshotChanges = async (query: any = {}) => {
  let canonicalFailure: any = null
  try {
    const canonical = await readCanonicalExternalControlEscolarAllStudents(query)
    const scope = canonical.controlScope
    await writeControlEscolarExternalStudentView(
      scope.bridgeAgentId,
      {
        ...query,
        plantel: scope.bridgeAgentId,
        agentId: scope.bridgeAgentId,
        ciclo: scope.ciclo,
        cicloKey: scope.ciclo,
        concepts: scope.concepts.join(',') || undefined,
        tipoConcepts: scope.tipoConcepts.join(',') || undefined,
        all: 'snapshot',
        mode: 'snapshot'
      },
      canonical.data,
      { canonical: true, source: 'aurora-control-escolar-canonical' }
    )
    const response = withExternalSnapshotMeta(
      await readExternalControlEscolarChanges({
        ...query,
        plantel: scope.plantel,
        ciclo: scope.ciclo,
        cicloKey: scope.ciclo,
        concepts: scope.concepts.join(',') || undefined
      }),
      query
    )
    return {
      ...response,
      meta: {
        ...(response?.meta || {}),
        source: 'aurora-control-escolar-canonical-change-feed',
        fallback: false,
        cachePolicy: 'control-escolar-canonical-primary'
      }
    }
  } catch (error: any) {
    canonicalFailure = error
  }

  const ready = await assertExternalControlEscolarSnapshotReady(query)
  const fallback = withExternalSnapshotMeta(
    withRefreshFailureMeta(await readExternalControlEscolarChanges(query), ready.refreshFailure),
    query
  )
  return withCanonicalFallbackMeta(fallback, canonicalFailure)
}

'''
replace_block(
    snapshot,
    'export const readExternalSnapshotChanges = async (query: any = {}) => {',
    'export const readExternalSnapshotStudentDetail = async (query: any = {}, matriculaValue: unknown) => {',
    changes_block,
    'canonical change feed sync',
)

# Prepend canonical detail lookup while preserving the proven snapshot fallback body.
replace_once(
    snapshot,
    "export const readExternalSnapshotStudentDetail = async (query: any = {}, matriculaValue: unknown) => {\n  const matricula = canonicalMatricula(matriculaValue)",
    "export const readExternalSnapshotStudentDetail = async (query: any = {}, matriculaValue: unknown) => {\n  let canonicalFailure: any = null\n  try {\n    const canonical = await readCanonicalExternalControlEscolarStudentDetail(query, matriculaValue)\n    const { controlScope: _controlScope, ...publicResponse } = canonical\n    return withExternalCanonicalMeta(publicResponse, query)\n  } catch (error: any) {\n    canonicalFailure = error\n  }\n\n  const presentFallback = async (response: any) =>\n    withCanonicalFallbackMeta(await overlayCanonicalMatriculaGroups(response), canonicalFailure)\n\n  const matricula = canonicalMatricula(matriculaValue)",
    'canonical detail primary',
)
replace_once(
    snapshot,
    "    return await overlayCanonicalMatriculaGroups(withRefreshFailureMeta(withExternalSnapshotMeta(await readExternalControlEscolarStudentDetail(query, matricula), query), ready.refreshFailure))",
    "    return await presentFallback(withRefreshFailureMeta(withExternalSnapshotMeta(await readExternalControlEscolarStudentDetail(query, matricula), query), ready.refreshFailure))",
    'detail fallback for explicit plantel',
)
replace_once(
    snapshot,
    "      return await overlayCanonicalMatriculaGroups(withRefreshFailureMeta(withExternalSnapshotMeta(await readExternalControlEscolarStudentDetail({ ...query, plantel: scope.plantel }, matricula), query), scope.refreshFailure))",
    "      return await presentFallback(withRefreshFailureMeta(withExternalSnapshotMeta(await readExternalControlEscolarStudentDetail({ ...query, plantel: scope.plantel }, matricula), query), scope.refreshFailure))",
    'detail fallback for global search',
)
replace_once(
    snapshot,
    "      academicPlacementSource: 'central-student-snapshot',\n      groupSource: 'central-matricula-live-overlay',",
    "      academicPlacementSource: clean(student?.academicPlacementSource, 120) || (response?.meta?.fallback ? 'central-student-snapshot-fallback' : 'base-projection'),\n      groupSource: response?.meta?.fallback ? 'central-matricula-live-overlay' : 'control-escolar-canonical',",
    'academic endpoint source metadata',
)

verify = ROOT / 'scripts/verify-academic-source.mjs'
replace_once(
    verify,
    "const controlEscolarPath = join(root, 'server/utils/control-escolar.ts')\nconst text = await readFile(controlEscolarPath, 'utf8')",
    "const controlEscolarPath = join(root, 'server/utils/control-escolar.ts')\nconst externalCanonicalPath = join(root, 'server/utils/control-escolar-external-canonical.ts')\nconst externalSnapshotPath = join(root, 'server/utils/control-escolar-external-snapshot.ts')\nconst [text, externalCanonicalText, externalSnapshotText] = await Promise.all([\n  readFile(controlEscolarPath, 'utf8'),\n  readFile(externalCanonicalPath, 'utf8'),\n  readFile(externalSnapshotPath, 'utf8')\n])",
    'load public API academic source files',
)
replace_once(
    verify,
    "if (failures.length) {",
    "if (!externalCanonicalText.includes('fetchControlEscolarStudentsWithCanonicalGroups')) {\n  failures.push('server/utils/control-escolar-external-canonical.ts: la API pública debe reutilizar el resolver canónico de Control Escolar')\n}\nif (!externalCanonicalText.includes('readBestConceptosConfigPayload') || !externalCanonicalText.includes('parseEnrollmentConceptsForScope')) {\n  failures.push('server/utils/control-escolar-external-canonical.ts: la API pública debe resolver la misma configuración de inscripción que Control Escolar')\n}\nif (!externalSnapshotText.includes('readCanonicalExternalControlEscolarStudents(query)')) {\n  failures.push('server/utils/control-escolar-external-snapshot.ts: el snapshot no puede ser la fuente primaria de alumnos públicos')\n}\nif (!externalSnapshotText.includes('readCanonicalExternalControlEscolarStudentDetail(query, matriculaValue)')) {\n  failures.push('server/utils/control-escolar-external-snapshot.ts: el detalle/academic público debe usar Control Escolar canónico primero')\n}\n\nif (failures.length) {",
    'guard public API canonical source',
)
replace_once(
    verify,
    "console.log('Fuente académica válida: Control Escolar no lee matricula.grado ni matricula.nivel para resolver la colocación vigente.')",
    "console.log('Fuente académica válida: Control Escolar y la API pública comparten la misma proyección canónica de grado, grupo, ciclo y alcance de inscripción.')",
    'verification success message',
)

# Guard the intended surface: no schema, UI, auth, or consumer changes.
expected = {
    'server/utils/control-escolar-external-canonical.ts',
    'server/utils/control-escolar-external-snapshot.ts',
    'server/utils/control-escolar-external-snapshot-presenter.ts',
    'scripts/verify-academic-source.mjs',
}
for path in expected:
    if not (ROOT / path).exists():
        raise SystemExit(f'missing expected file after patch: {path}')
