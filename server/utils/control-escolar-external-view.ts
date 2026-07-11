import crypto from 'node:crypto'
import { normalizePlantel } from './auth-session'
import { runWithBridgeAgentId } from './db'
import { controlEscolarCentralQuery } from './control-escolar-central'
import { buildControlEscolarScopeDescriptor, type ControlEscolarScopeDescriptor } from './control-escolar-cache'
import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { previousCicloKey } from '../../shared/utils/tipoIngreso'
import { parseEnrollmentConceptIds } from './enrollment-evidence'

const EXTERNAL_VIEW_TABLE = 'control_external_student_view'
const VIEW_VERSION = 'control-escolar-student-view-v1'
const FRESH_MINUTES = 15
const EXPIRED_HOURS = 24
const MAX_LIMIT = 500
const DEFAULT_LIMIT = 100
const SCHEMA_CACHE_MS = 1000 * 60 * 5
const CANONICAL_STUDENT_PLANTELES = ['PREEM', 'PREET', 'GM', 'PM', 'PT', 'SM', 'ST']
const DEFAULT_EXTERNAL_CICLOS = [
  { value: '2025', label: '2025-2026' },
  { value: '2026', label: '2026-2027' }
]
const WARM_LIMIT = 10000

let schemaVerifiedAt = 0
const warmingScopes = new Map<string, Promise<any>>()

const normalizeText = (value: unknown, max = 255) =>
  String(value ?? '').trim().slice(0, max)

const normalizeLower = (value: unknown, max = 255) => normalizeText(value, max).toLowerCase()

const errorStatusCode = (error: any, fallback = 500) => Number(error?.statusCode || error?.status || error?.httpStatus || error?.response?.status || fallback) || fallback

const publicErrorDetails = (error: any) => ({
  statusCode: errorStatusCode(error),
  statusMessage: normalizeText(error?.statusMessage || error?.code || error?.name || 'AURORA_ERROR', 120),
  message: normalizeText(error?.message || error?.statusMessage || 'Error interno de Aurora.', 1000),
  code: normalizeText(error?.data?.code || error?.code || error?.statusMessage || '', 120) || null,
  data: error?.data || null,
  bridgePayload: error?.bridgePayload?.error ? {
    message: normalizeText(error.bridgePayload.error.message, 1000),
    code: normalizeText(error.bridgePayload.error.code, 120) || null,
    errno: error.bridgePayload.error.errno || null,
    sqlState: normalizeText(error.bridgePayload.error.sqlState, 120) || null
  } : null
})

const throwExternalStudentScopeError = (input: {
  statusCode?: number
  statusMessage: string
  message: string
  plantel?: string
  ciclo?: string
  cause?: any
  extra?: Record<string, any>
}) => {
  const causeDetails = input.cause ? publicErrorDetails(input.cause) : null
  throw createError({
    statusCode: input.statusCode || 502,
    statusMessage: input.statusMessage,
    message: input.message,
    data: {
      code: input.statusMessage,
      plantel: input.plantel || null,
      ciclo: input.ciclo || null,
      cause: causeDetails,
      ...(input.extra || {})
    }
  })
}

const toIsoOrNull = (value: unknown) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  const time = date.getTime()
  return Number.isFinite(time) ? date.toISOString() : null
}

const nowDate = () => new Date()

const dateMinutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000)
const dateHoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000)

const computeHash = (value: unknown) =>
  crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex')

const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ offset })).toString('base64url')
const decodeCursor = (value: unknown) => {
  const text = normalizeText(value, 200)
  if (!text) return 0
  try {
    const parsed = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
    const offset = Number(parsed?.offset || 0)
    return Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0
  } catch {
    return 0
  }
}

const sqlLike = (value: string) => `%${value}%`

const normalizeExternalStudentPlantel = (value: unknown) => {
  const plantel = normalizePlantel(value || '')
  if (plantel === 'CT') return 'PREET'
  if (plantel === 'CM') return 'PREEM'
  if (plantel === 'PMA' || plantel === 'PMB') return 'PM'
  return plantel
}

export const getExternalStudentPlanteles = () => [...CANONICAL_STUDENT_PLANTELES]

const requestedPlantelesFromQuery = (query: any = {}) => {
  const raw = query.planteles || query.plantel || ''
  const values = Array.isArray(raw) ? raw : String(raw || '').split(',')
  const planteles = values.map(normalizeExternalStudentPlantel).filter((plantel) => CANONICAL_STUDENT_PLANTELES.includes(plantel))
  return planteles.length ? Array.from(new Set(planteles)) : [...CANONICAL_STUDENT_PLANTELES]
}

const safeJsonParse = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

const sanitizeExternalStudentPayload = (student: any) => {
  const copy = { ...(student || {}) }
  delete copy.huskyPassPlaintext
  delete copy.rawPhoto
  delete copy.centralMatriculaRaw
  delete copy.Control_Escolar_RAW_JSON
  delete copy.raw

  copy.display = {
    nombre: copy.nombreCompleto || copy.fullName || '',
    gradoGrupo: [copy.grado, copy.group].filter(Boolean).join(' '),
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

const buildSearchText = (payload: any) =>
  [
    payload?.matricula,
    payload?.studentId,
    payload?.fullName,
    payload?.nombreCompleto,
    payload?.nombres,
    payload?.apellidoPaterno,
    payload?.apellidoMaterno,
    payload?.curp,
    payload?.fatherName,
    payload?.motherName,
    payload?.nombrePadre,
    payload?.apellidoPaternoPadre,
    payload?.apellidoMaternoPadre,
    payload?.nombreMadre,
    payload?.apellidoPaternoMadre,
    payload?.apellidoMaternoMadre,
    payload?.telefonoPadre,
    payload?.telefonoMadre,
    payload?.emailPadre,
    payload?.emailMadre,
    payload?.phone,
    payload?.email
  ]
    .map((value) => normalizeLower(value, 500))
    .filter(Boolean)
    .join(' ')
    .slice(0, 4000)

const freshnessForRow = (row: any) => {
  const now = Date.now()
  const staleAt = row?.stale_after ? new Date(row.stale_after).getTime() : 0
  const expiresAt = row?.expires_at ? new Date(row.expires_at).getTime() : 0
  if (staleAt && staleAt >= now) return 'fresh'
  if (expiresAt && expiresAt >= now) return 'stale'
  return 'expired'
}

const freshnessRank = (freshnessValues: string[]) => {
  if (!freshnessValues.length) return 'empty'
  if (freshnessValues.includes('expired')) return 'expired'
  if (freshnessValues.includes('stale')) return 'stale'
  return 'fresh'
}

export const ensureControlEscolarExternalViewSchema = async () => {
  if (schemaVerifiedAt && Date.now() - schemaVerifiedAt < SCHEMA_CACHE_MS) return
  const rows = await controlEscolarCentralQuery<Array<{ TABLE_NAME?: string; table_name?: string }>>(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [EXTERNAL_VIEW_TABLE]
  )
  if (!rows.length) {
    throw createError({
      statusCode: 500,
      statusMessage: 'AURORA_VIEW_SCHEMA_MISSING',
      message: 'Falta la tabla control_external_student_view. Ejecuta database/aurora-external-api-schema.sql en la base MySQL central antes de consumir la API externa.'
    })
  }
  schemaVerifiedAt = Date.now()
}

export const buildExternalControlEscolarScope = (input: any = {}) => {
  const plantel = normalizeExternalStudentPlantel(input.plantel || input.agentId || '')
  const cicloKey = normalizeCicloKey(input.ciclo || input.cicloKey || input.schoolYear || '')
  const concepts = parseEnrollmentConceptIds(input.concepts || input.enrollmentConcepts || input.conceptIds || '')
  const previousCiclo = normalizeCicloKey(input.previousCiclo || '') || previousCicloKey(cicloKey)
  const descriptorInput: ControlEscolarScopeDescriptor = {
    cicloKey,
    previousCiclo,
    enrollmentConceptIds: concepts
  }
  const descriptor = buildControlEscolarScopeDescriptor(descriptorInput)
  return {
    plantel,
    cicloKey,
    previousCiclo,
    concepts,
    descriptor,
    hasExplicitConcepts: concepts.length > 0
  }
}

export const writeControlEscolarExternalStudentView = async (
  agentId: string,
  filters: any,
  students: any[],
  source: any = {}
) => {
  const scope = buildExternalControlEscolarScope({ ...filters, plantel: agentId, agentId })
  if (!scope.plantel || !scope.cicloKey || !scope.descriptor.cacheable || !Array.isArray(students)) {
    return { skipped: true, reason: 'scope_not_cacheable' }
  }

  await ensureControlEscolarExternalViewSchema()

  const generatedAt = nowDate()
  const staleAfter = dateMinutesFromNow(FRESH_MINUTES)
  const expiresAt = dateHoursFromNow(EXPIRED_HOURS)
  const rows = students
    .map((student) => sanitizeExternalStudentPayload(student))
    .filter((payload) => normalizeText(payload?.matricula, 64))

  const chunkSize = 250
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')
    const params: any[] = []
    chunk.forEach((payload) => {
      const payloadJson = JSON.stringify(payload)
      params.push(
        scope.descriptor.scopeKey,
        scope.plantel,
        scope.cicloKey,
        scope.previousCiclo,
        scope.descriptor.conceptHash,
        scope.descriptor.conceptIdsPipe,
        VIEW_VERSION,
        normalizeText(payload.matricula, 64),
        normalizeText(payload.nombreCompleto || payload.fullName, 255),
        normalizeText(payload.nivel, 80),
        normalizeText(payload.grado, 80).toLowerCase(),
        normalizeText(payload.group || payload.grupo, 80),
        normalizeText(payload.status, 80),
        normalizeText(payload.enrollmentState, 80),
        normalizeText(payload.tipoIngresoValue || payload.tipoIngreso, 80),
        buildSearchText(payload),
        payloadJson,
        computeHash(payloadJson),
        generatedAt,
        generatedAt,
        staleAfter,
        expiresAt
      )
    })
    await controlEscolarCentralQuery(
      `INSERT INTO ${EXTERNAL_VIEW_TABLE}
        (scope_key, plantel, ciclo_key, previous_ciclo, concept_hash, concept_ids, view_version,
         matricula, nombre_completo, nivel, grado, grupo, status, enrollment_state, tipo_ingreso,
         search_text, payload_json, payload_hash, generated_at, payload_changed_at, stale_after, expires_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         plantel = VALUES(plantel),
         ciclo_key = VALUES(ciclo_key),
         previous_ciclo = VALUES(previous_ciclo),
         concept_hash = VALUES(concept_hash),
         concept_ids = VALUES(concept_ids),
         view_version = VALUES(view_version),
         nombre_completo = VALUES(nombre_completo),
         nivel = VALUES(nivel),
         grado = VALUES(grado),
         grupo = VALUES(grupo),
         status = VALUES(status),
         enrollment_state = VALUES(enrollment_state),
         tipo_ingreso = VALUES(tipo_ingreso),
         search_text = VALUES(search_text),
         payload_json = VALUES(payload_json),
         payload_changed_at = IF(payload_hash <> VALUES(payload_hash), CURRENT_TIMESTAMP, payload_changed_at),
         payload_hash = VALUES(payload_hash),
         generated_at = VALUES(generated_at),
         stale_after = VALUES(stale_after),
         expires_at = VALUES(expires_at),
         updated_at = CURRENT_TIMESTAMP`,
      params
    )
  }

  await controlEscolarCentralQuery(
    `DELETE FROM ${EXTERNAL_VIEW_TABLE}
     WHERE plantel = ? AND scope_key = ? AND view_version = ? AND generated_at < ?`,
    [scope.plantel, scope.descriptor.scopeKey, VIEW_VERSION, generatedAt]
  )

  return {
    success: true,
    rows: rows.length,
    plantel: scope.plantel,
    cicloKey: scope.cicloKey,
    scopeKey: scope.descriptor.scopeKey,
    generatedAt: generatedAt.toISOString(),
    staleAfter: staleAfter.toISOString(),
    expiresAt: expiresAt.toISOString()
  }
}


const findLatestWarmScopeRow = async (scope: any) => {
  const latest = await controlEscolarCentralQuery<any[]>(
    `SELECT scope_key, previous_ciclo, concept_hash, concept_ids, MAX(generated_at) AS generated_at, COUNT(*) AS rows_count
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE plantel = ? AND ciclo_key = ? AND view_version = ?
     GROUP BY scope_key, previous_ciclo, concept_hash, concept_ids
     ORDER BY generated_at DESC
     LIMIT 1`,
    [scope.plantel, scope.cicloKey, VIEW_VERSION]
  )
  return latest[0] || null
}

export const warmExternalControlEscolarStudentScope = async (input: any = {}) => {
  const scope = buildExternalControlEscolarScope(input)
  if (!scope.plantel || !scope.cicloKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'SCOPE_REQUIRED',
      message: 'Plantel y ciclo son obligatorios para preparar la base de alumnos.'
    })
  }
  const warmKey = `${scope.plantel}:${scope.cicloKey}:${scope.descriptor.conceptHash}`
  const existing = warmingScopes.get(warmKey)
  if (existing) return await existing

  const promise = (async () => {
    const { fetchControlEscolarStudents } = await import('./control-escolar')
    const filters = {
      ...input,
      plantel: scope.plantel,
      agentId: scope.plantel,
      ciclo: scope.cicloKey,
      cicloKey: scope.cicloKey,
      previousCiclo: scope.previousCiclo,
      all: 'snapshot',
      mode: 'snapshot',
      limit: WARM_LIMIT,
      search: '',
      q: '',
      status: '',
      grado: '',
      grupo: '',
      group: '',
      quality: '',
      recent: ''
    }
    try {
      const result: any = await runWithBridgeAgentId(scope.plantel, async () => await fetchControlEscolarStudents(scope.plantel, filters))
      const rows = Array.isArray(result?.data) ? result.data : []
      const written = await writeControlEscolarExternalStudentView(scope.plantel, filters, rows, result?.source || { onDemand: true })
      return { ...written, rows: rows.length, plantel: scope.plantel, ciclo: scope.cicloKey }
    } catch (error: any) {
      throwExternalStudentScopeError({
        statusCode: 502,
        statusMessage: 'AURORA_STUDENT_SCOPE_WARM_FAILED',
        message: `Aurora no pudo preparar la base de alumnos de ${scope.plantel} para ciclo ${scope.cicloKey}.`,
        plantel: scope.plantel,
        ciclo: scope.cicloKey,
        cause: error,
        extra: { phase: 'on-demand-warm' }
      })
    }
  })().finally(() => warmingScopes.delete(warmKey))

  warmingScopes.set(warmKey, promise)
  return await promise
}

export const warmExternalControlEscolarStudentScopes = async (input: any = {}) => {
  const planteles = requestedPlantelesFromQuery(input)
  const ciclo = normalizeCicloKey(input.ciclo || input.cicloKey || input.schoolYear || '')
  if (!ciclo) {
    throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })
  }
  const results: any[] = []
  const failures: any[] = []
  for (const plantel of planteles) {
    try {
      results.push(await warmExternalControlEscolarStudentScope({ ...input, plantel, ciclo }))
    } catch (error: any) {
      failures.push({ plantel, ciclo, ...publicErrorDetails(error) })
    }
  }
  if (failures.length) {
    throw createError({
      statusCode: 502,
      statusMessage: 'WARM_STUDENT_SCOPES_FAILED',
      message: `Aurora no pudo preparar la base de alumnos para ${failures.map((failure) => failure.plantel).join(', ')}.`,
      data: { code: 'WARM_STUDENT_SCOPES_FAILED', failures, results }
    })
  }
  return { success: true, results }
}

const resolveScopeForRead = async (input: any = {}) => {
  const scope = buildExternalControlEscolarScope(input)
  if (!scope.plantel) {
    throw createError({
      statusCode: 400,
      statusMessage: 'PLANTEL_REQUIRED',
      message: 'El parámetro plantel es obligatorio para leer alumnos de Control Escolar.'
    })
  }
  if (!scope.cicloKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'CICLO_REQUIRED',
      message: 'El parámetro ciclo es obligatorio. El ciclo escolar cambia el grado visible de cada alumno.'
    })
  }
  await ensureControlEscolarExternalViewSchema()

  if (scope.hasExplicitConcepts) return scope

  let row = await findLatestWarmScopeRow(scope)
  if (!row?.scope_key) {
    await warmExternalControlEscolarStudentScope(input)
    row = await findLatestWarmScopeRow(scope)
  }

  if (!row?.scope_key) {
    return {
      ...scope,
      warmedEmptyScope: true,
      descriptor: {
        ...scope.descriptor,
        cacheable: true
      }
    }
  }

  return {
    ...scope,
    previousCiclo: normalizeText(row.previous_ciclo, 20) || scope.previousCiclo,
    descriptor: {
      ...scope.descriptor,
      scopeKey: normalizeText(row.scope_key, 64),
      conceptHash: normalizeText(row.concept_hash, 64),
      conceptIdsPipe: normalizeText(row.concept_ids, 1000),
      conceptIds: parseEnrollmentConceptIds(row.concept_ids),
      cacheable: true
    },
    resolvedLatestScope: true
  }
}


const sortCatalogValues = (values: string[]) => Array.from(new Set(values.filter(Boolean)))
  .sort((left, right) => left.localeCompare(right, 'es', { numeric: true, sensitivity: 'base' }))

const mergeExternalCatalogs = (catalogs: any[]) => {
  const niveles: string[] = []
  const grados: string[] = []
  const grupos: string[] = []
  const gruposPorGrado: Record<string, string[]> = {}

  catalogs.forEach((catalog) => {
    niveles.push(...(Array.isArray(catalog?.niveles) ? catalog.niveles : []))
    grados.push(...(Array.isArray(catalog?.grados) ? catalog.grados : []))
    grupos.push(...(Array.isArray(catalog?.grupos) ? catalog.grupos : []))
    Object.entries(catalog?.gruposPorGrado || {}).forEach(([grado, values]) => {
      gruposPorGrado[grado] ||= []
      gruposPorGrado[grado].push(...(Array.isArray(values) ? values.map(String) : []))
    })
  })

  Object.keys(gruposPorGrado).forEach((grado) => {
    gruposPorGrado[grado] = sortCatalogValues(gruposPorGrado[grado])
  })

  return {
    niveles: sortCatalogValues(niveles.map(String)),
    grados: sortCatalogValues(grados.map(String)),
    grupos: sortCatalogValues(grupos.map(String)),
    gruposPorGrado
  }
}

const readExternalControlEscolarCatalogs = async (scope: any) => {
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT nivel, grado, grupo, COUNT(*) AS total
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE plantel = ? AND scope_key = ? AND view_version = ?
     GROUP BY nivel, grado, grupo
     ORDER BY grado ASC, grupo ASC`,
    [scope.plantel, scope.descriptor.scopeKey, VIEW_VERSION]
  )

  const gruposPorGrado: Record<string, string[]> = {}
  rows.forEach((row) => {
    const grado = normalizeText(row.grado, 80)
    const grupo = normalizeText(row.grupo, 80)
    if (!grado || !grupo) return
    gruposPorGrado[grado] ||= []
    gruposPorGrado[grado].push(grupo)
  })
  Object.keys(gruposPorGrado).forEach((grado) => {
    gruposPorGrado[grado] = sortCatalogValues(gruposPorGrado[grado])
  })

  return {
    niveles: sortCatalogValues(rows.map((row) => normalizeText(row.nivel, 80))),
    grados: sortCatalogValues(rows.map((row) => normalizeText(row.grado, 80))),
    grupos: sortCatalogValues(rows.map((row) => normalizeText(row.grupo, 80))),
    gruposPorGrado
  }
}

export const refreshExternalControlEscolarStudentViewRow = async (input: any, student: any) => {
  const scope = await resolveScopeForRead(input)
  const payload = sanitizeExternalStudentPayload(student)
  const matricula = normalizeText(payload?.matricula, 64)
  if (!matricula) {
    throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })
  }

  const generatedAt = nowDate()
  const staleAfter = dateMinutesFromNow(FRESH_MINUTES)
  const expiresAt = dateHoursFromNow(EXPIRED_HOURS)
  const payloadJson = JSON.stringify(payload)

  await controlEscolarCentralQuery(
    `INSERT INTO ${EXTERNAL_VIEW_TABLE}
      (scope_key, plantel, ciclo_key, previous_ciclo, concept_hash, concept_ids, view_version,
       matricula, nombre_completo, nivel, grado, grupo, status, enrollment_state, tipo_ingreso,
       search_text, payload_json, payload_hash, generated_at, payload_changed_at, stale_after, expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       nombre_completo = VALUES(nombre_completo),
       nivel = VALUES(nivel),
       grado = VALUES(grado),
       grupo = VALUES(grupo),
       status = VALUES(status),
       enrollment_state = VALUES(enrollment_state),
       tipo_ingreso = VALUES(tipo_ingreso),
       search_text = VALUES(search_text),
       payload_json = VALUES(payload_json),
       payload_changed_at = IF(payload_hash <> VALUES(payload_hash), CURRENT_TIMESTAMP, payload_changed_at),
       payload_hash = VALUES(payload_hash),
       generated_at = VALUES(generated_at),
       stale_after = VALUES(stale_after),
       expires_at = VALUES(expires_at),
       updated_at = CURRENT_TIMESTAMP`,
    [
      scope.descriptor.scopeKey,
      scope.plantel,
      scope.cicloKey,
      scope.previousCiclo,
      scope.descriptor.conceptHash,
      scope.descriptor.conceptIdsPipe,
      VIEW_VERSION,
      matricula,
      normalizeText(payload.nombreCompleto || payload.fullName, 255),
      normalizeText(payload.nivel, 80),
      normalizeText(payload.grado, 80).toLowerCase(),
      normalizeText(payload.group || payload.grupo, 80),
      normalizeText(payload.status, 80),
      normalizeText(payload.enrollmentState, 80),
      normalizeText(payload.tipoIngresoValue || payload.tipoIngreso, 80),
      buildSearchText(payload),
      payloadJson,
      computeHash(payloadJson),
      generatedAt,
      generatedAt,
      staleAfter,
      expiresAt
    ]
  )

  return { success: true, data: payload, meta: buildExternalMeta(scope, { generated_at: generatedAt, stale_after: staleAfter, expires_at: expiresAt }, 1) }
}

export const readExternalControlEscolarStudents = async (query: any = {}) => {
  if (!normalizeExternalStudentPlantel(query.plantel || '')) {
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT))
    const planteles = requestedPlantelesFromQuery(query)
    const results: any[] = []
    const failures: any[] = []
    for (const plantel of planteles) {
      try {
        const result = await readExternalControlEscolarStudents({ ...query, plantel, limit: MAX_LIMIT, cursor: '' })
        results.push(result)
      } catch (error: any) {
        failures.push({ plantel, ...publicErrorDetails(error) })
      }
    }
    if (failures.length) {
      throw createError({
        statusCode: 502,
        statusMessage: 'STUDENT_SCOPE_QUERY_FAILED',
        message: `Aurora no pudo consultar alumnos para ${failures.map((failure) => failure.plantel).join(', ')}.`,
        data: { code: 'STUDENT_SCOPE_QUERY_FAILED', failures }
      })
    }
    const data = results.flatMap((result) => Array.isArray(result?.data) ? result.data : [])
      .sort((a, b) => normalizeText(a?.nombreCompleto || a?.fullName).localeCompare(normalizeText(b?.nombreCompleto || b?.fullName), 'es'))
      .slice(0, limit)
    return {
      data,
      pagination: { limit, nextCursor: null, total: results.reduce((sum, result) => sum + Number(result?.pagination?.total || result?.data?.length || 0), 0) },
      catalogs: mergeExternalCatalogs(results.map((result) => result?.catalogs).filter(Boolean)),
      meta: {
        version: 'v1',
        viewVersion: VIEW_VERSION,
        source: 'warm-cache',
        freshness: freshnessRank(results.map((result) => String(result?.meta?.freshness || '')).filter(Boolean)),
        rows: data.length,
        planteles,
        ciclo: normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || ''),
        scopes: results.map((result) => result?.meta).filter(Boolean)
      }
    }
  }
  const scope = await resolveScopeForRead(query)
  const catalogs = await readExternalControlEscolarCatalogs(scope)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT))
  const offset = decodeCursor(query.cursor)
  const params: any[] = [scope.plantel, scope.descriptor.scopeKey, VIEW_VERSION]
  const whereParts = ['plantel = ?', 'scope_key = ?', 'view_version = ?']

  const search = normalizeLower(query.search || query.q || '', 120)
  if (search) {
    whereParts.push('search_text LIKE ?')
    params.push(sqlLike(search))
  }

  const grado = normalizeLower(query.grado || '', 80)
  if (grado && grado !== 'all' && grado !== 'todos') {
    whereParts.push('grado = ?')
    params.push(grado)
  }

  const grupo = normalizeText(query.grupo || query.group || '', 80)
  if (grupo && grupo !== 'all' && grupo !== 'todos') {
    whereParts.push('grupo = ?')
    params.push(grupo)
  }

  const nivel = normalizeText(query.nivel || '', 80)
  if (nivel && nivel !== 'all' && nivel !== 'todos') {
    whereParts.push('nivel = ?')
    params.push(nivel)
  }

  const status = normalizeText(query.status || '', 80)
  if (status && status !== 'all' && status !== 'todos') {
    if (['activo', 'activos', 'active'].includes(status.toLowerCase())) {
      whereParts.push('status = ?')
      params.push('Activo')
    } else if (['baja', 'bajas'].includes(status.toLowerCase())) {
      whereParts.push('(status = ? OR enrollment_state IN (?, ?))')
      params.push('Baja', 'baja', 'baja_inscrita')
    } else {
      whereParts.push('enrollment_state = ?')
      params.push(status)
    }
  }

  const countRows = await controlEscolarCentralQuery<any[]>(
    `SELECT COUNT(*) AS total,
            MIN(generated_at) AS generated_at,
            MIN(stale_after) AS stale_after,
            MIN(expires_at) AS expires_at
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE ${whereParts.join(' AND ')}`,
    params
  )
  const total = Number(countRows[0]?.total || 0)
  if (!total) {
    return {
      data: [],
      pagination: { limit, nextCursor: null, total: 0 },
      catalogs,
      meta: buildExternalMeta(scope, null, 0)
    }
  }

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT matricula, payload_json, generated_at, stale_after, expires_at
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE ${whereParts.join(' AND ')}
     ORDER BY nombre_completo ASC, matricula ASC
     LIMIT ? OFFSET ?`,
    [...params, limit + 1, offset]
  )

  const pageRows = rows.slice(0, limit)
  const data = pageRows.map((row) => safeJsonParse(row.payload_json)).filter(Boolean)
  const firstMetaRow = pageRows[0] || countRows[0]
  const nextOffset = rows.length > limit ? offset + limit : null
  return {
    data,
    pagination: {
      limit,
      nextCursor: nextOffset === null ? null : encodeCursor(nextOffset),
      total
    },
    catalogs,
    meta: buildExternalMeta(scope, firstMetaRow, total)
  }
}

export const readExternalControlEscolarStudentDetail = async (query: any = {}, matriculaValue: unknown): Promise<any> => {
  if (!normalizeExternalStudentPlantel(query.plantel || '')) {
    const planteles = requestedPlantelesFromQuery(query)
    for (const plantel of planteles) {
      try {
        return await readExternalControlEscolarStudentDetail({ ...query, plantel }, matriculaValue)
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || 0)
        if (statusCode !== 404) throw error
      }
    }
    throw createError({ statusCode: 404, statusMessage: 'STUDENT_NOT_FOUND', message: `No se encontró la matrícula ${normalizeText(matriculaValue, 64)}.` })
  }
  const scope = await resolveScopeForRead(query)
  const matricula = normalizeText(matriculaValue, 64)
  if (!matricula) {
    throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })
  }
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT payload_json, generated_at, stale_after, expires_at
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE plantel = ? AND scope_key = ? AND view_version = ? AND matricula = ?
     LIMIT 1`,
    [scope.plantel, scope.descriptor.scopeKey, VIEW_VERSION, matricula]
  )
  const row = rows[0]
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'STUDENT_NOT_FOUND_IN_WARM_VIEW',
      message: `No se encontró la matrícula ${matricula} en el snapshot cálido de ${scope.plantel} para ciclo ${scope.cicloKey}.`
    })
  }
  return {
    data: safeJsonParse(row.payload_json),
    meta: buildExternalMeta(scope, row, 1)
  }
}

export const readExternalControlEscolarChanges = async (query: any = {}) => {
  const scope = await resolveScopeForRead(query)
  const since = normalizeText(query.since || '', 80)
  if (!since) {
    throw createError({
      statusCode: 400,
      statusMessage: 'SINCE_REQUIRED',
      message: 'El parámetro since es obligatorio para consultar cambios.'
    })
  }
  const sinceDate = new Date(since)
  if (!Number.isFinite(sinceDate.getTime())) {
    throw createError({
      statusCode: 400,
      statusMessage: 'SINCE_INVALID',
      message: 'El parámetro since debe ser una fecha ISO válida.'
    })
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT))
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT matricula, payload_changed_at, updated_at, generated_at
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE plantel = ? AND scope_key = ? AND view_version = ? AND payload_changed_at > ?
     ORDER BY payload_changed_at ASC, matricula ASC
     LIMIT ?`,
    [scope.plantel, scope.descriptor.scopeKey, VIEW_VERSION, sinceDate, limit]
  )
  const last = rows[rows.length - 1]
  return {
    data: rows.map((row) => ({
      matricula: normalizeText(row.matricula, 64),
      changeType: 'updated',
      changedAt: toIsoOrNull(row.payload_changed_at) || toIsoOrNull(row.updated_at) || toIsoOrNull(row.generated_at)
    })),
    nextSince: toIsoOrNull(last?.payload_changed_at) || sinceDate.toISOString(),
    meta: buildExternalMeta(scope, rows[0] || null, rows.length)
  }
}

export const readExternalControlEscolarHealth = async () => {
  await ensureControlEscolarExternalViewSchema()
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT plantel, ciclo_key, scope_key, concept_ids, view_version,
            COUNT(*) AS rows_count,
            MIN(generated_at) AS generated_at,
            MIN(stale_after) AS stale_after,
            MIN(expires_at) AS expires_at,
            MAX(updated_at) AS updated_at
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE view_version = ?
     GROUP BY plantel, ciclo_key, scope_key, concept_ids, view_version
     ORDER BY plantel ASC, ciclo_key DESC, generated_at DESC`,
    [VIEW_VERSION]
  )
  return {
    status: 'ok',
    viewVersion: VIEW_VERSION,
    canonicalPlanteles: CANONICAL_STUDENT_PLANTELES.map((plantel) => ({ plantel })),
    schoolYears: DEFAULT_EXTERNAL_CICLOS,
    scopes: rows.map((row) => ({
      plantel: normalizeText(row.plantel, 40),
      ciclo: normalizeText(row.ciclo_key, 20),
      scopeKey: normalizeText(row.scope_key, 64),
      conceptIds: parseEnrollmentConceptIds(row.concept_ids),
      rows: Number(row.rows_count || 0),
      freshness: freshnessForRow(row),
      generatedAt: toIsoOrNull(row.generated_at),
      staleAfter: toIsoOrNull(row.stale_after),
      expiresAt: toIsoOrNull(row.expires_at),
      updatedAt: toIsoOrNull(row.updated_at)
    }))
  }
}

const buildExternalMeta = (scope: any, row: any, rows: number) => {
  const generatedAt = row?.generated_at || null
  const staleAfter = row?.stale_after || null
  const expiresAt = row?.expires_at || null
  return {
    version: 'v1',
    viewVersion: VIEW_VERSION,
    source: 'warm-cache',
    freshness: row ? freshnessForRow(row) : 'empty',
    rows,
    plantel: scope.plantel,
    ciclo: scope.cicloKey,
    previousCiclo: scope.previousCiclo,
    scopeKey: scope.descriptor.scopeKey,
    conceptIds: scope.descriptor.conceptIds || [],
    resolvedLatestScope: Boolean(scope.resolvedLatestScope),
    generatedAt: toIsoOrNull(generatedAt),
    staleAfter: toIsoOrNull(staleAfter),
    expiresAt: toIsoOrNull(expiresAt)
  }
}
