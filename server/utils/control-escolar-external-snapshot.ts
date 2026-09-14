import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { controlEscolarCentralQuery } from './control-escolar-central'
import {
  buildExternalControlEscolarScope,
  ensureControlEscolarExternalViewSchema,
  getExternalStudentPlanteles,
  readExternalControlEscolarChanges,
  readExternalControlEscolarStudentDetail,
  readExternalControlEscolarStudents,
  warmExternalControlEscolarStudentScope
} from './control-escolar-external-view'
import { normalizeExternalControlEscolarPlantel } from './control-escolar-plantel-routing'
import { withExternalSnapshotMeta } from './control-escolar-external-snapshot-presenter'

const EXTERNAL_VIEW_TABLE = 'control_external_student_view'
const VIEW_VERSION = 'control-escolar-student-view-v1'
const MAX_PAGE_SIZE = 500
const FRESH_REQUEST_MAX_AGE_MS = 60_000

const clean = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const canonicalMatricula = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')
const publicFailure = (error: any) => ({
  statusCode: Number(error?.statusCode || error?.status || error?.response?.status || 500) || 500,
  code: clean(error?.data?.code || error?.code || error?.statusMessage || error?.name || 'AURORA_ERROR', 120),
  message: clean(error?.message || error?.statusMessage || 'Aurora no pudo actualizar el snapshot central solicitado.', 700)
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

const wantsFreshSnapshot = (query: any = {}) =>
  ['1', 'true', 'yes', 'fresh'].includes(clean(query.fresh, 20).toLowerCase())

const snapshotNeedsWarm = (row: any, query: any = {}) => {
  if (!row?.scope_key) return true
  if (!wantsFreshSnapshot(query)) return false
  const generatedAt = row?.generated_at ? new Date(row.generated_at).getTime() : Number.NaN
  return !Number.isFinite(generatedAt) || Date.now() - generatedAt > FRESH_REQUEST_MAX_AGE_MS
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

const readCanonicalMatriculaGroups = async (students: any[]) => {
  const matriculas = Array.from(new Set(
    students
      .map((student) => canonicalMatricula(student?.matricula || student?.studentId))
      .filter(Boolean)
  ))
  const groups = new Map<string, string>()
  if (!matriculas.length) return groups

  const placeholders = matriculas.map(() => '?').join(',')
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT matricula, grupo
     FROM matricula
     WHERE UPPER(TRIM(matricula)) IN (${placeholders})`,
    matriculas
  )

  rows.forEach((row) => {
    const matricula = canonicalMatricula(row?.matricula)
    if (!matricula) return
    // matricula.grupo is intentionally authoritative for the current group.
    // An empty value is also authoritative and must not resurrect a stale
    // group from an old Control Escolar snapshot.
    groups.set(matricula, clean(row?.grupo, 80))
  })
  return groups
}

const overlayCanonicalMatriculaGroups = async (response: any) => {
  const responseData = response?.data
  const students = Array.isArray(responseData)
    ? responseData
    : responseData && typeof responseData === 'object'
      ? [responseData]
      : []
  if (!students.length) return response

  const groups = await readCanonicalMatriculaGroups(students)
  if (!groups.size) return response

  const applyGroup = (student: any) => {
    const matricula = canonicalMatricula(student?.matricula || student?.studentId)
    if (!groups.has(matricula)) return student
    const grupo = groups.get(matricula) ?? ''
    return {
      ...student,
      group: grupo,
      grupo,
      matriculaGrupo: grupo,
      display: {
        ...(student?.display && typeof student.display === 'object' ? student.display : {}),
        gradoGrupo: [clean(student?.grado, 80), grupo].filter(Boolean).join(' ')
      }
    }
  }

  return {
    ...(response || {}),
    data: Array.isArray(responseData) ? responseData.map(applyGroup) : applyGroup(responseData),
    meta: {
      ...(response?.meta || {}),
      groupSource: 'matricula.grupo-live'
    }
  }
}

const withRefreshFailureMeta = (response: any, refreshFailure: any) => ({
  ...(response || {}),
  meta: {
    ...(response?.meta || {}),
    refreshFailed: Boolean(refreshFailure),
    refreshFailure: refreshFailure || null
  }
})

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
      // A failed refresh must not erase a previously valid roster. If there is
      // no snapshot at all, propagate the real Aurora/Bridge failure instead.
      if (!row?.scope_key) throw error
      refreshFailure = publicFailure(error)
    }
  }

  if (!row?.scope_key) throw snapshotUnavailable(scope.plantel, scope.cicloKey)
  return { scope, row, refreshFailure }
}

export const readExternalSnapshotStudents = async (query: any = {}) => {
  const ready = await assertExternalControlEscolarSnapshotReady(query)
  const response = withExternalSnapshotMeta(await readExternalControlEscolarStudents(query), query)
  return await overlayCanonicalMatriculaGroups(withRefreshFailureMeta(response, ready.refreshFailure))
}

export const readExternalSnapshotChanges = async (query: any = {}) => {
  await assertExternalControlEscolarSnapshotReady(query)
  return withExternalSnapshotMeta(await readExternalControlEscolarChanges(query), query)
}

export const readExternalSnapshotStudentDetail = async (query: any = {}, matriculaValue: unknown) => {
  const matricula = canonicalMatricula(matriculaValue)
  if (!matricula) {
    throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })
  }

  const requestedPlantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  if (requestedPlantel) {
    const ready = await assertExternalControlEscolarSnapshotReady({ ...query, plantel: requestedPlantel })
    const response = withExternalSnapshotMeta(
      await readExternalControlEscolarStudentDetail({ ...query, plantel: requestedPlantel }, matricula),
      query
    )
    return await overlayCanonicalMatriculaGroups(withRefreshFailureMeta(response, ready.refreshFailure))
  }

  let readyScopes = 0
  for (const plantel of getExternalStudentPlanteles()) {
    try {
      const ready = await assertExternalControlEscolarSnapshotReady({ ...query, plantel })
      readyScopes += 1
      try {
        const response = withExternalSnapshotMeta(
          await readExternalControlEscolarStudentDetail({ ...query, plantel }, matricula),
          query
        )
        return await overlayCanonicalMatriculaGroups(withRefreshFailureMeta(response, ready.refreshFailure))
      } catch (error: any) {
        if (Number(error?.statusCode || 0) !== 404) throw error
      }
    } catch (error: any) {
      if (String(error?.statusMessage || error?.data?.code || '') !== 'AURORA_STUDENT_SNAPSHOT_NOT_READY') throw error
    }
  }

  if (!readyScopes) {
    throw createError({
      statusCode: 503,
      statusMessage: 'AURORA_STUDENT_SNAPSHOTS_NOT_READY',
      message: 'Los snapshots centrales de Control Escolar todavía no están disponibles.',
      data: { code: 'AURORA_STUDENT_SNAPSHOTS_NOT_READY', retryable: true, source: 'central-snapshot' }
    })
  }

  throw createError({
    statusCode: 404,
    statusMessage: 'STUDENT_NOT_FOUND',
    message: `No se encontró la matrícula ${matricula} en los snapshots centrales disponibles.`
  })
}

export const readAllExternalSnapshotStudents = async (query: any = {}) => {
  const plantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  if (!plantel) {
    throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  }

  const data: any[] = []
  let cursor = ''
  let firstResponse: any = null

  do {
    const response = await readExternalSnapshotStudents({
      ...query,
      plantel,
      limit: MAX_PAGE_SIZE,
      cursor
    })
    firstResponse ||= response
    data.push(...(Array.isArray(response?.data) ? response.data : []))
    cursor = clean(response?.pagination?.nextCursor, 500)
  } while (cursor)

  return {
    data,
    catalogs: firstResponse?.catalogs || { niveles: [], grados: [], grupos: [], gruposPorGrado: {} },
    meta: {
      ...(firstResponse?.meta || {}),
      rows: data.length
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
      academicPlacementSource: 'central-student-snapshot',
      groupSource: response?.meta?.groupSource || 'matricula.grupo-live',
      generatedAt: response?.meta?.generatedAt || null
    }
  }
}
