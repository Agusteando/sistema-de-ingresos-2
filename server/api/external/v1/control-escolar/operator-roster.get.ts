import crypto from 'node:crypto'
import { getQuery } from 'h3'
import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { readBestConceptosConfigPayload } from '../../../../utils/conceptos-config'
import { runWithBridgeAgentId } from '../../../../utils/db'
import { controlEscolarCentralQuery } from '../../../../utils/control-escolar-central'
import { normalizeCicloKey } from '../../../../../shared/utils/ciclo'
import {
  normalizeEnrollmentConceptIds,
  normalizeEnrollmentPlantelKey,
  parseEnrollmentConceptsForPlantelHistory,
  parseEnrollmentConceptsForScope
} from '../../../../../shared/utils/studentPresentation'
import {
  controlEscolarBridgeAgentCandidates,
  normalizeExternalControlEscolarPlantel
} from '../../../../utils/control-escolar-plantel-routing'
import { fetchControlEscolarStudentsWithCanonicalGroups } from '../../../../utils/control-escolar-groups'
import {
  controlEscolarRosterIdentityKeys,
  duplicateControlEscolarRosterIdentities,
  selectControlEscolarUiInscritos
} from '../../../../../shared/utils/controlEscolarRosterParity'

const MAX_ALL_ROWS = 25000
const clean = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)

const explicitCurrentConcepts = (query: any = {}) =>
  normalizeEnrollmentConceptIds(query.concepts || query.enrollmentConcepts || query.conceptIds || '')

const explicitTipoConcepts = (query: any = {}) =>
  normalizeEnrollmentConceptIds(query.tipoConcepts || query.tipoIngresoConcepts || '')

const parseJson = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'object') return value as Record<string, any>
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

const readLatestUiSnapshotTrace = async (plantel: string, ciclo: string) => {
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT created_at, total_students, payload, source_base, source_flow
     FROM control_escolar_audit_events
     WHERE event_type = 'page_snapshot'
       AND plantel = ?
       AND ciclo = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [plantel, ciclo]
  ).catch(() => [])

  const row = rows[0]
  if (!row) return null
  const payload = parseJson(row.payload) || {}
  const counters = payload?.counters || {}
  const inscritos = Number(counters?.inscritos ?? counters?.totalInscritos)
  const totalRows = Number(payload?.totalRows ?? row?.total_students)
  const visibleRows = Number(payload?.visibleRows)

  return {
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    inscritos: Number.isFinite(inscritos) ? inscritos : null,
    totalRows: Number.isFinite(totalRows) ? totalRows : null,
    visibleRows: Number.isFinite(visibleRows) ? visibleRows : null,
    sourceBase: clean(row.source_base, 180),
    sourceFlow: clean(row.source_flow, 180)
  }
}

const resolveOperatorConceptScope = async (query: any, bridgeAgentId: string, ciclo: string) => {
  let concepts = explicitCurrentConcepts(query)
  let tipoConcepts = explicitTipoConcepts(query)

  if (!concepts.length || !tipoConcepts.length) {
    const config = await readBestConceptosConfigPayload()
    const plantel = normalizeEnrollmentPlantelKey(bridgeAgentId)
    if (!concepts.length) concepts = parseEnrollmentConceptsForScope(config, { ciclo, plantel })
    if (!tipoConcepts.length) tipoConcepts = parseEnrollmentConceptsForPlantelHistory(config, { plantel })
  }

  if (!tipoConcepts.length) tipoConcepts = [...concepts]
  return {
    concepts: Array.from(new Set(concepts)),
    tipoConcepts: Array.from(new Set(tipoConcepts))
  }
}

const safeStudent = (student: any, publicPlantel: string) => ({
  matricula: clean(student?.matricula || student?.studentId, 64),
  studentId: clean(student?.studentId || student?.matricula, 64),
  plantel: publicPlantel,
  basePlantel: clean(student?.basePlantel || student?.plantel, 40),
  nombreCompleto: clean(student?.nombreCompleto || student?.fullName, 255),
  fullName: clean(student?.fullName || student?.nombreCompleto, 255),
  nombres: clean(student?.nombres, 120),
  apellidoPaterno: clean(student?.apellidoPaterno, 120),
  apellidoMaterno: clean(student?.apellidoMaterno, 120),
  curp: clean(student?.curp, 18),
  nivel: clean(student?.nivel, 80),
  grado: clean(student?.grado, 80),
  grupo: clean(student?.group || student?.grupo, 80),
  group: clean(student?.group || student?.grupo, 80),
  status: clean(student?.status, 80),
  baja: Number(student?.baja || 0) === 1 ? 1 : 0,
  statusSource: clean(student?.statusSource, 40),
  enrollmentState: clean(student?.enrollmentState, 80),
  cicloBase: clean(student?.cicloBase, 20),
  updatedAt: student?.updatedAt || null
})

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)

  const query = getQuery(event)
  const plantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  const ciclo = normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || '')

  if (!plantel) {
    throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  }
  if (!ciclo) {
    throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })
  }

  let lastError: any = null
  for (const bridgeAgentId of controlEscolarBridgeAgentCandidates(plantel)) {
    try {
      const conceptScope = await resolveOperatorConceptScope(query, bridgeAgentId, ciclo)
      if (!conceptScope.concepts.length) {
        throw new Error(`No se resolvieron conceptos de inscripción para ${bridgeAgentId} ciclo ${ciclo}.`)
      }

      // This is intentionally the same request shape used by
      // pages/control-escolar.vue -> buildIndexQuery(): all=1 with the exact
      // enrollment concept scope. Do not set externalApi here; that would
      // change operator membership semantics by adding external sections.
      const filters = {
        agentId: bridgeAgentId,
        ciclo,
        concepts: conceptScope.concepts.join(','),
        tipoConcepts: conceptScope.tipoConcepts.join(','),
        page: 1,
        limit: 500,
        all: '1'
      }

      const result: any = await runWithBridgeAgentId(
        bridgeAgentId,
        async () => await fetchControlEscolarStudentsWithCanonicalGroups(bridgeAgentId, filters)
      )

      const operatorRows = Array.isArray(result?.data) ? result.data : []
      const enrolledRows = selectControlEscolarUiInscritos(operatorRows)
      const identityKeys = controlEscolarRosterIdentityKeys(enrolledRows)
      const duplicates = duplicateControlEscolarRosterIdentities(enrolledRows)

      if (duplicates.length) {
        throw new Error(`Control Escolar devolvió matrículas inscritas duplicadas: ${duplicates.slice(0, 8).join(', ')}.`)
      }

      const data = enrolledRows.map((student: any) => safeStudent(student, plantel))
      const fingerprint = crypto
        .createHash('sha256')
        .update(identityKeys.join('\n'))
        .digest('hex')
      const enrolledStatusBaja = enrolledRows
        .filter((student: any) => clean(student?.status, 80).toLowerCase() === 'baja')
        .map((student: any) => clean(student?.matricula || student?.studentId, 64))
        .filter(Boolean)
        .sort((left: string, right: string) => left.localeCompare(right, 'es', { numeric: true }))
      const latestUiSnapshot = await readLatestUiSnapshotTrace(bridgeAgentId, ciclo)

      return {
        data,
        pagination: {
          total: data.length,
          limit: Math.max(data.length, 1),
          nextCursor: null
        },
        meta: {
          version: 'control-escolar-ui-roster-v1',
          source: 'control-escolar-ui-index',
          plantel,
          bridgeAgentId,
          ciclo,
          concepts: conceptScope.concepts,
          tipoConcepts: conceptScope.tipoConcepts,
          operatorRowsTotal: operatorRows.length,
          inscritosTotal: data.length,
          fingerprint,
          enrolledStatusBajaCount: enrolledStatusBaja.length,
          enrolledStatusBaja,
          latestUiSnapshot,
          generatedAt: new Date().toISOString()
        }
      }
    } catch (error: any) {
      lastError = error
    }
  }

  throw createError({
    statusCode: Number(lastError?.statusCode || lastError?.response?.status || 502) || 502,
    statusMessage: 'AURORA_CONTROL_ESCOLAR_UI_ROSTER_UNAVAILABLE',
    message: `Aurora no pudo resolver el padrón de Control Escolar visible para ${plantel} en ciclo ${ciclo}.`,
    data: {
      code: 'AURORA_CONTROL_ESCOLAR_UI_ROSTER_UNAVAILABLE',
      plantel,
      ciclo,
      cause: clean(lastError?.statusMessage || lastError?.code || lastError?.message || 'control_escolar_unavailable', 240)
    }
  })
})
