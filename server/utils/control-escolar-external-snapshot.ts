import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { normalizeGroupIdentity } from '../../shared/utils/group'
import { runWithBridgeAgentId } from './db'
import { fetchControlEscolarStudentsWithCanonicalGroups } from './control-escolar-groups'
import { controlEscolarCentralQuery } from './control-escolar-central'
import {
  buildExternalControlEscolarScope,
  ensureControlEscolarExternalViewSchema,
  getExternalStudentPlanteles,
  readExternalControlEscolarChanges,
  warmExternalControlEscolarStudentScope
} from './control-escolar-external-view'
import {
  controlEscolarBridgeAgentCandidates,
  normalizeExternalControlEscolarPlantel
} from './control-escolar-plantel-routing'
import { withExternalSnapshotMeta } from './control-escolar-external-snapshot-presenter'

const EXTERNAL_VIEW_TABLE = 'control_external_student_view'
const VIEW_VERSION = 'control-escolar-student-view-v1'
const MAX_PAGE_SIZE = 500
const FRESH_REQUEST_MAX_AGE_MS = 60_000
const FALLBACK_SNAPSHOT_MAX_AGE_MS = 168 * 60 * 60 * 1000
const STALE_IF_ERROR_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const clean = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const canonicalMatricula = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')
const normalizeSearch = (value: unknown) => clean(value, 1000).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const publicFailure = (error: any) => ({
  statusCode: Number(error?.statusCode || error?.status || error?.response?.status || 500) || 500,
  code: clean(error?.data?.code || error?.code || error?.statusMessage || error?.name || 'AURORA_ERROR', 120),
  message: clean(error?.message || error?.statusMessage || 'Aurora no pudo consultar Control Escolar.', 700)
})

const snapshotUnavailable = (plantel: string, ciclo: string) => createError({
  statusCode: 503,
  statusMessage: 'AURORA_STUDENT_SNAPSHOT_NOT_READY',
  message: `El snapshot central de ${plantel} para ciclo ${ciclo} todavía no está disponible.`,
  data: {
    code: 'AURORA_STUDENT_SNAPSHOT_NOT_READY',
    plantel,
    ciclo,
    retryable: true,
    source: 'central-snapshot'
  }
})

const timestamp = (value: unknown) => {
  if (!value) return Number.NaN
  const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime()
  return Number.isFinite(time) ? time : Number.NaN
}

const snapshotExpired = (row: any, now = Date.now()) => {
  if (!row?.scope_key) return true
  const expiresAt = timestamp(row.expires_at)
  if (Number.isFinite(expiresAt)) return now >= expiresAt
  const generatedAt = timestamp(row.generated_at)
  return !Number.isFinite(generatedAt) || now - generatedAt >= FALLBACK_SNAPSHOT_MAX_AGE_MS
}

const snapshotBeyondStaleIfErrorWindow = (row: any, now = Date.now()) => {
  if (!row?.scope_key) return true
  const generatedAt = timestamp(row.generated_at)
  return !Number.isFinite(generatedAt) || now - generatedAt >= STALE_IF_ERROR_MAX_AGE_MS
}

const snapshotExpiredError = (plantel: string, ciclo: string, row: any, refreshFailure: any = null) => {
  const generatedAt = timestamp(row?.generated_at)
  const expiresAt = timestamp(row?.expires_at)
  return createError({
    statusCode: 503,
    statusMessage: 'AURORA_STUDENT_SNAPSHOT_TOO_OLD',
    message: `El snapshot central de ${plantel} para ciclo ${ciclo} ya expiró y no pudo renovarse.`,
    data: {
      code: 'AURORA_STUDENT_SNAPSHOT_TOO_OLD',
      plantel,
      ciclo,
      retryable: true,
      source: 'central-snapshot',
      generatedAt: Number.isFinite(generatedAt) ? new Date(generatedAt).toISOString() : null,
      expiresAt: Number.isFinite(expiresAt) ? new Date(expiresAt).toISOString() : null,
      refreshFailure
    }
  })
}

const wantsFreshSnapshot = (query: any = {}) =>
  ['1', 'true', 'yes', 'fresh'].includes(clean(query.fresh, 20).toLowerCase())

const snapshotNeedsWarm = (row: any, query: any = {}) => {
  if (!row?.scope_key) return true

  const now = Date.now()
  const generatedAt = timestamp(row.generated_at)
  if (!Number.isFinite(generatedAt)) return true
  if (snapshotExpired(row, now)) return true

  const ageMs = now - generatedAt
  if (wantsFreshSnapshot(query) && ageMs > FRESH_REQUEST_MAX_AGE_MS) return true

  const staleAt = timestamp(row.stale_after)
  return Number.isFinite(staleAt) && now >= staleAt
}

const readLatestSnapshotScope = async (scope: ReturnType<typeof buildExternalControlEscolarScope>) => {
  const params: any[] = [scope.plantel, scope.cicloKey, VIEW_VERSION]
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

/**
 * Snapshot readiness remains exclusively for the external change feed. Current
 * roster/detail/academic reads below deliberately bypass this view and call the
 * exact canonical Control Escolar service used by Aurora's operator screen.
 */
export const assertExternalControlEscolarSnapshotReady = async (query: any = {}) => {
  const scope = buildExternalControlEscolarScope(query)
  if (!scope.plantel) {
    throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  }
  if (!scope.cicloKey) {
    throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })
  }

  await ensureControlEscolarExternalViewSchema()

  let row = await readLatestSnapshotScope(scope)
  let refreshFailure: any = null
  if (snapshotNeedsWarm(row, query)) {
    try {
      await warmExternalControlEscolarStudentScope({
        ...query,
        plantel: scope.plantel,
        ciclo: scope.cicloKey,
        cicloKey: scope.cicloKey
      })
      row = await readLatestSnapshotScope(scope)
    } catch (error) {
      if (!row?.scope_key) throw error
      refreshFailure = publicFailure(error)
    }
  }

  if (!row?.scope_key) throw snapshotUnavailable(scope.plantel, scope.cicloKey)
  if (snapshotExpired(row)) {
    if (snapshotBeyondStaleIfErrorWindow(row)) {
      throw snapshotExpiredError(scope.plantel, scope.cicloKey, row, refreshFailure)
    }
    refreshFailure ||= {
      statusCode: 503,
      code: 'AURORA_STUDENT_REFRESH_DID_NOT_ADVANCE',
      message: 'Aurora no pudo renovar el padrón; se sirve el último snapshot Aurora disponible.'
    }
  }
  return { scope, row, refreshFailure }
}

const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ offset })).toString('base64url')
const decodeCursor = (value: unknown) => {
  const text = clean(value, 500)
  if (!text) return 0
  try {
    const parsed = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
    const offset = Number(parsed?.offset || 0)
    return Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0
  } catch {
    return 0
  }
}

const sanitizeCanonicalStudent = (student: any) => {
  const copy = { ...(student || {}) }
  delete copy.huskyPassPlaintext
  delete copy.rawPhoto
  delete copy.centralMatriculaRaw
  delete copy.Control_Escolar_RAW_JSON
  delete copy.raw

  copy.display = {
    ...(copy.display && typeof copy.display === 'object' ? copy.display : {}),
    nombre: copy.nombreCompleto || copy.fullName || '',
    gradoGrupo: [copy.grado, copy.group || copy.grupo].filter(Boolean).join(' '),
    plantelNivel: [copy.plantel, copy.nivel].filter(Boolean).join(' · '),
    estado: copy.status || '',
    ciclo: copy.cicloBase || ''
  }
  copy.padre = {
    nombreCompleto: copy.fatherName || '',
    nombres: copy.nombrePadre || '',
    apellidoPaterno: copy.apellidoPaternoPadre || '',
    apellidoMaterno: copy.apellidoMaternoPadre || '',
    telefono: copy.telefonoPadre || '',
    correo: copy.emailPadre || ''
  }
  copy.madre = {
    nombreCompleto: copy.motherName || '',
    nombres: copy.nombreMadre || '',
    apellidoPaterno: copy.apellidoPaternoMadre || '',
    apellidoMaterno: copy.apellidoMaternoMadre || '',
    telefono: copy.telefonoMadre || '',
    correo: copy.emailMadre || ''
  }
  copy.contactoPrincipal = {
    nombre: [copy.fatherName, copy.motherName].filter(Boolean).join(' / '),
    telefono: copy.telefonoPadre || copy.telefonoMadre || copy.phone || '',
    correo: copy.emailPadre || copy.emailMadre || copy.email || ''
  }
  copy.viewVersion = VIEW_VERSION
  return copy
}

const safeCanonicalMeta = (plantel: string, ciclo: string, bridgeAgentId: string, source: any, rows: number) => {
  const cacheFreshness = clean(source?.cacheFreshness, 80) || 'control-escolar'
  return {
    version: 'v1',
    viewVersion: VIEW_VERSION,
    source: 'aurora-control-escolar-canonical',
    sourceMode: clean(source?.phase, 80) || null,
    freshness: cacheFreshness,
    fallback: cacheFreshness !== 'live-bridge',
    generatedAt: source?.cacheRefreshedAt || null,
    plantel,
    ciclo,
    bridgeAgentId,
    rows
  }
}

const canonicalScopeError = (plantel: string, ciclo: string, failures: any[]) => createError({
  statusCode: Number(failures.at(-1)?.statusCode || 503) || 503,
  statusMessage: 'AURORA_CONTROL_ESCOLAR_SCOPE_UNAVAILABLE',
  message: `Aurora no pudo consultar Control Escolar para ${plantel} en el ciclo ${ciclo}.`,
  data: {
    code: 'AURORA_CONTROL_ESCOLAR_SCOPE_UNAVAILABLE',
    plantel,
    ciclo,
    source: 'control-escolar-canonical',
    failures
  }
})

const loadCanonicalControlEscolarScope = async (
  query: any = {},
  options: { search?: string; full?: boolean } = {}
) => {
  const plantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  const ciclo = normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || '')
  if (!plantel) {
    throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  }
  if (!ciclo) {
    throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })
  }

  const failures: any[] = []
  for (const bridgeAgentId of controlEscolarBridgeAgentCandidates(plantel)) {
    const full = options.full !== false
    const filters = {
      ...query,
      plantel: bridgeAgentId,
      agentId: bridgeAgentId,
      ciclo,
      cicloKey: ciclo,
      externalApi: true,
      search: options.search || '',
      q: '',
      status: '',
      grado: '',
      grupo: '',
      group: '',
      nivel: '',
      quality: '',
      calidad: '',
      missing: '',
      recent: '',
      all: full ? '1' : '',
      mode: full ? 'index' : '',
      page: 1,
      limit: full ? MAX_PAGE_SIZE : 100
    }

    try {
      const result: any = await runWithBridgeAgentId(
        bridgeAgentId,
        async () => await fetchControlEscolarStudentsWithCanonicalGroups(bridgeAgentId, filters)
      )
      return {
        plantel,
        ciclo,
        bridgeAgentId,
        rows: Array.isArray(result?.data) ? result.data : [],
        catalogs: result?.catalogs || { niveles: [], grados: [], grupos: [], gruposPorGrado: {} },
        source: result?.source || {}
      }
    } catch (error: any) {
      failures.push({ bridgeAgentId, ...publicFailure(error) })
    }
  }

  throw canonicalScopeError(plantel, ciclo, failures)
}

const matchesExternalStatus = (student: any, value: unknown) => {
  const requested = clean(value, 80).toLowerCase()
  if (!requested || requested === 'all' || requested === 'todos') return true
  const status = clean(student?.status, 80).toLowerCase()
  const enrollmentState = clean(student?.enrollmentState, 80).toLowerCase()
  if (['activo', 'activos', 'active'].includes(requested)) return status === 'activo'
  if (['baja', 'bajas'].includes(requested)) {
    return status === 'baja' || enrollmentState === 'baja' || enrollmentState === 'baja_inscrita'
  }
  if (['inscrito', 'inscritos'].includes(requested)) return enrollmentState === 'inscrito'
  if (['no_inscrito', 'no_inscritos'].includes(requested)) return enrollmentState === 'no_inscrito'
  if (['interno', 'internos'].includes(requested)) return enrollmentState === 'inscrito' && clean(student?.tipoIngresoValue, 80).toLowerCase() === 'interno'
  if (['externo', 'externos'].includes(requested)) return enrollmentState === 'inscrito' && clean(student?.tipoIngresoValue, 80).toLowerCase() !== 'interno'
  return enrollmentState === requested
}

const filterCanonicalStudents = (students: any[], query: any = {}) => {
  const search = normalizeSearch(query.search || query.q || '')
  const grado = clean(query.grado, 80).toLowerCase()
  const grupo = normalizeGroupIdentity(query.grupo || query.group || '')
  const nivel = clean(query.nivel, 80).toLowerCase()

  return students
    .filter((student) => {
      if (!matchesExternalStatus(student, query.status)) return false
      if (grado && grado !== 'all' && grado !== 'todos' && clean(student?.grado, 80).toLowerCase() !== grado) return false
      if (grupo && normalizeGroupIdentity(student?.group || student?.grupo || '') !== grupo) return false
      if (nivel && nivel !== 'all' && nivel !== 'todos' && clean(student?.nivel, 80).toLowerCase() !== nivel) return false
      if (!search) return true
      const haystack = normalizeSearch([
        student?.matricula,
        student?.studentId,
        student?.fullName,
        student?.nombreCompleto,
        student?.nombres,
        student?.apellidoPaterno,
        student?.apellidoMaterno,
        student?.curp,
        student?.fatherName,
        student?.motherName,
        student?.telefonoPadre,
        student?.telefonoMadre,
        student?.emailPadre,
        student?.emailMadre
      ].filter(Boolean).join(' '))
      return haystack.includes(search)
    })
    .sort((left, right) =>
      clean(left?.nombreCompleto || left?.fullName, 255)
        .localeCompare(clean(right?.nombreCompleto || right?.fullName, 255), 'es', { sensitivity: 'base' })
      || canonicalMatricula(left?.matricula).localeCompare(canonicalMatricula(right?.matricula), 'es')
    )
}

const loadFilteredCanonicalStudents = async (query: any = {}) => {
  const scope = await loadCanonicalControlEscolarScope(query, { full: true })
  const rows = filterCanonicalStudents(scope.rows, query).map(sanitizeCanonicalStudent)
  return { ...scope, rows }
}

/**
 * Kept under the historical export name for API compatibility. It now reads
 * the same canonical Control Escolar service as /api/control-escolar/students:
 * live Bridge/base first, centralized matricula overlay, canonical groups, and
 * the same verified Control Escolar fallback when the live Bridge is unavailable.
 */
export const readExternalSnapshotStudents = async (query: any = {}) => {
  const scope = await loadFilteredCanonicalStudents(query)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit || 100) || 100))
  const offset = decodeCursor(query.cursor)
  const data = scope.rows.slice(offset, offset + limit)
  const nextOffset = offset + data.length
  return {
    data,
    pagination: {
      limit,
      nextCursor: nextOffset < scope.rows.length ? encodeCursor(nextOffset) : null,
      total: scope.rows.length
    },
    catalogs: scope.catalogs,
    meta: safeCanonicalMeta(scope.plantel, scope.ciclo, scope.bridgeAgentId, scope.source, data.length)
  }
}

export const readExternalSnapshotChanges = async (query: any = {}) => {
  await assertExternalControlEscolarSnapshotReady(query)
  return withExternalSnapshotMeta(await readExternalControlEscolarChanges(query), query)
}

const readCanonicalStudentForPlantel = async (query: any, plantel: string, matricula: string) => {
  const scope = await loadCanonicalControlEscolarScope(
    { ...query, plantel },
    { search: matricula, full: false }
  )
  const student = scope.rows.find((row: any) => canonicalMatricula(row?.matricula || row?.studentId) === matricula)
  if (!student) return { scope, student: null }
  return { scope, student: sanitizeCanonicalStudent(student) }
}

export const readExternalSnapshotStudentDetail = async (query: any = {}, matriculaValue: unknown) => {
  const matricula = canonicalMatricula(matriculaValue)
  if (!matricula) {
    throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })
  }

  const requestedPlantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  if (requestedPlantel) {
    const { scope, student } = await readCanonicalStudentForPlantel(query, requestedPlantel, matricula)
    if (!student) {
      throw createError({
        statusCode: 404,
        statusMessage: 'STUDENT_NOT_FOUND',
        message: `No se encontró la matrícula ${matricula} en Control Escolar para ${requestedPlantel}.`
      })
    }
    return {
      data: student,
      meta: safeCanonicalMeta(scope.plantel, scope.ciclo, scope.bridgeAgentId, scope.source, 1)
    }
  }

  let reachableScopes = 0
  const failures: any[] = []
  for (const plantel of getExternalStudentPlanteles()) {
    try {
      const { scope, student } = await readCanonicalStudentForPlantel(query, plantel, matricula)
      reachableScopes += 1
      if (student) {
        return {
          data: student,
          meta: safeCanonicalMeta(scope.plantel, scope.ciclo, scope.bridgeAgentId, scope.source, 1)
        }
      }
    } catch (error: any) {
      failures.push({ plantel, ...publicFailure(error) })
    }
  }

  if (!reachableScopes) {
    throw createError({
      statusCode: 503,
      statusMessage: 'AURORA_CONTROL_ESCOLAR_UNAVAILABLE',
      message: 'Aurora no pudo consultar ningún plantel de Control Escolar.',
      data: { code: 'AURORA_CONTROL_ESCOLAR_UNAVAILABLE', failures }
    })
  }

  throw createError({
    statusCode: 404,
    statusMessage: 'STUDENT_NOT_FOUND',
    message: `No se encontró la matrícula ${matricula} en Control Escolar.`
  })
}

export const readAllExternalSnapshotStudents = async (query: any = {}) => {
  const scope = await loadFilteredCanonicalStudents(query)
  return {
    data: scope.rows,
    catalogs: scope.catalogs,
    meta: {
      ...safeCanonicalMeta(scope.plantel, scope.ciclo, scope.bridgeAgentId, scope.source, scope.rows.length),
      rows: scope.rows.length
    }
  }
}

export const readExternalSnapshotAcademicPlacement = async (query: any = {}, matriculaValue: unknown) => {
  const ciclo = normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || '')
  if (!ciclo) {
    throw createError({ statusCode: 400, statusMessage: 'CICLO_INVALID', message: 'El ciclo escolar no es válido.' })
  }

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
      academicPlacementSource: 'control-escolar-canonical',
      groupSource: 'control-escolar-canonical',
      generatedAt: response?.meta?.generatedAt || null
    }
  }
}
