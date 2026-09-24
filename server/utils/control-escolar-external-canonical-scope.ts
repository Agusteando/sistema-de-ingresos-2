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
  controlEscolarBridgeAgentCandidates,
  normalizeExternalControlEscolarPlantel
} from './control-escolar-plantel-routing'
import { fetchControlEscolarStudentsWithCanonicalGroups } from './control-escolar-groups'

const MAX_ALL_ROWS = 25000
const clean = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const explicitCurrentConcepts = (query: any = {}) => normalizeEnrollmentConceptIds(
  query.concepts || query.enrollmentConcepts || query.conceptIds || ''
)
const explicitTipoConcepts = (query: any = {}) => normalizeEnrollmentConceptIds(
  query.tipoConcepts || query.tipoIngresoConcepts || ''
)
const isBajaStudent = (student: any) => {
  const status = clean(student?.status, 80).toLowerCase()
  const enrollmentState = clean(student?.enrollmentState, 80).toLowerCase()
  return Number(student?.baja || 0) === 1
    || status === 'baja'
    || enrollmentState === 'baja'
    || enrollmentState === 'baja_inscrita'
}

const resolveConceptScope = async (query: any, bridgeAgentId: string, ciclo: string) => {
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

export const fetchCanonicalExternalSnapshotScope = async (query: any = {}) => {
  const plantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  const ciclo = normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || '')
  if (!plantel) throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  if (!ciclo) throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })

  let lastError: any = null
  for (const bridgeAgentId of controlEscolarBridgeAgentCandidates(plantel)) {
    try {
      const conceptScope = await resolveConceptScope(query, bridgeAgentId, ciclo)
      const filters = {
        ...query,
        agentId: bridgeAgentId,
        plantel: bridgeAgentId,
        ciclo,
        cicloKey: ciclo,
        concepts: conceptScope.concepts.join(',') || undefined,
        enrollmentConcepts: conceptScope.concepts.join(',') || undefined,
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
      const result: any = await runWithBridgeAgentId(
        bridgeAgentId,
        async () => await fetchControlEscolarStudentsWithCanonicalGroups(bridgeAgentId, filters)
      )
      const rows = (Array.isArray(result?.data) ? result.data : [])
        .filter((student: any) => !isBajaStudent(student))
      return {
        result: {
          ...result,
          data: rows
        },
        rows,
        plantel,
        bridgeAgentId,
        ciclo,
        concepts: conceptScope.concepts,
        tipoConcepts: conceptScope.tipoConcepts
      }
    } catch (error: any) {
      lastError = error
    }
  }

  throw createError({
    statusCode: Number(lastError?.statusCode || lastError?.response?.status || 502) || 502,
    statusMessage: 'AURORA_CONTROL_ESCOLAR_CANONICAL_UNAVAILABLE',
    message: `Aurora no pudo resolver Control Escolar canónico para ${plantel} en ciclo ${ciclo}.`,
    data: {
      code: 'AURORA_CONTROL_ESCOLAR_CANONICAL_UNAVAILABLE',
      plantel,
      ciclo,
      cause: clean(lastError?.statusMessage || lastError?.code || lastError?.message || 'control_escolar_unavailable', 240)
    }
  })
}
