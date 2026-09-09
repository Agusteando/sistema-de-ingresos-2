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

const readLatestSnapshotScope = async (
  scope: ReturnType<typeof buildExternalControlEscolarScope>,
  exactScope = true
) => {
  const params: any[] = [scope.plantel, scope.cicloKey, VIEW_VERSION]
  let scopeSql = ''
  if (exactScope && scope.hasExplicitConcepts) {
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

const withoutExplicitEnrollmentScope = (query: any = {}) => {
  const compatibleQuery = { ...(query || {}) }
  delete compatibleQuery.concepts
  delete compatibleQuery.enrollmentConcepts
  delete compatibleQuery.conceptIds
  return compatibleQuery
}

const scheduleExactScopeWarm = (
  query: any,
  scope: ReturnType<typeof buildExternalControlEscolarScope>
) => {
  setTimeout(() => {
    void warmExternalControlEscolarStudentScope({
      ...query,
      plantel: scope.plantel,
      ciclo: scope.cicloKey,
      cicloKey: scope.cicloKey
    }).catch((error: any) => {
      console.warn(
        `[Aurora external snapshot] No se pudo refrescar ${scope.plantel}/${scope.cicloKey}/${scope.descriptor.scopeKey}:`,
        clean(error?.statusMessage || error?.message || error, 500)
      )
    })
  }, 0)
}

const compatibleAvailability = (
  scope: ReturnType<typeof buildExternalControlEscolarScope>,
  row: any
) => ({
  fallback: true,
  fallbackReason: 'requested-scope-not-yet-warmed',
  requestedScopeKey: clean(scope.descriptor.scopeKey, 64) || null,
  servedScopeKey: clean(row?.scope_key, 64) || null,
  refreshPending: true
})

const exactAvailability = (
  scope: ReturnType<typeof buildExternalControlEscolarScope>,
  row: any
) => ({
  fallback: false,
  fallbackReason: null,
  requestedScopeKey: clean(scope.descriptor.scopeKey, 64) || null,
  servedScopeKey: clean(row?.scope_key, 64) || null,
  refreshPending: false
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

  let row = await readLatestSnapshotScope(scope, true)

  // Scope configuration changes must never turn an already available plantel/cycle
  // into a 503. If the exact concept scope has never been warmed, immediately serve
  // the latest compatible snapshot for the same plantel/cycle and warm the new scope
  // asynchronously. This is the last-known-good layer of the external API.
  if (!row?.scope_key && scope.hasExplicitConcepts) {
    const compatibleRow = await readLatestSnapshotScope(scope, false)
    if (compatibleRow?.scope_key) {
      scheduleExactScopeWarm(query, scope)
      return {
        scope,
        row: compatibleRow,
        readQuery: withoutExplicitEnrollmentScope(query),
        availability: compatibleAvailability(scope, compatibleRow)
      }
    }
  }

  if (snapshotNeedsWarm(row, query)) {
    try {
      await warmExternalControlEscolarStudentScope({
        ...query,
        plantel: scope.plantel,
        ciclo: scope.cicloKey,
        cicloKey: scope.cicloKey
      })
      row = await readLatestSnapshotScope(scope, true)
    } catch (error) {
      // A failed refresh must never erase availability. Prefer the exact previous
      // snapshot; if that scope did not exist yet, fall back to any last-known-good
      // snapshot for the same plantel/cycle before considering the API unavailable.
      if (!row?.scope_key) {
        const compatibleRow = await readLatestSnapshotScope(scope, false)
        if (compatibleRow?.scope_key) {
          return {
            scope,
            row: compatibleRow,
            readQuery: withoutExplicitEnrollmentScope(query),
            availability: compatibleAvailability(scope, compatibleRow)
          }
        }
        throw error
      }
    }
  }

  if (!row?.scope_key) throw snapshotUnavailable(scope.plantel, scope.cicloKey)
  return {
    scope,
    row,
    readQuery: query,
    availability: exactAvailability(scope, row)
  }
}

export const readExternalSnapshotStudents = async (query: any = {}) => {
  const ready = await assertExternalControlEscolarSnapshotReady(query)
  return withExternalSnapshotMeta(
    await readExternalControlEscolarStudents(ready.readQuery),
    query,
    ready.availability
  )
}

export const readExternalSnapshotChanges = async (query: any = {}) => {
  const ready = await assertExternalControlEscolarSnapshotReady(query)
  return withExternalSnapshotMeta(
    await readExternalControlEscolarChanges(ready.readQuery),
    query,
    ready.availability
  )
}

export const readExternalSnapshotStudentDetail = async (query: any = {}, matriculaValue: unknown) => {
  const matricula = canonicalMatricula(matriculaValue)
  if (!matricula) {
    throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })
  }

  const requestedPlantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  if (requestedPlantel) {
    const ready = await assertExternalControlEscolarSnapshotReady({ ...query, plantel: requestedPlantel })
    return withExternalSnapshotMeta(
      await readExternalControlEscolarStudentDetail(ready.readQuery, matricula),
      query,
      ready.availability
    )
  }

  let readyScopes = 0
  for (const plantel of getExternalStudentPlanteles()) {
    try {
      const ready = await assertExternalControlEscolarSnapshotReady({ ...query, plantel })
      readyScopes += 1
      try {
        return withExternalSnapshotMeta(
          await readExternalControlEscolarStudentDetail(ready.readQuery, matricula),
          query,
          ready.availability
        )
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
      generatedAt: response?.meta?.generatedAt || null
    }
  }
}
