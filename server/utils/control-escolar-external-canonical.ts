import { runWithBridgeAgentId } from './db'
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
  statusCode: Number(error?.statusCode || error?.response?.status || 500) || 500,
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
