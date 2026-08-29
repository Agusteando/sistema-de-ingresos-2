import { fetchControlEscolarCalculatedAcademicPlacement, fetchControlEscolarStudents, runControlEscolar } from './control-escolar'
import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { readInstitutionalSchoolCycle } from './school-cycle'
import { normalizeCurp } from '../../shared/utils/curp'
import { normalizeServicioClave, parseServiciosCsv } from '../../shared/utils/talleresServicios'
import {
  EXTERNAL_CONTROL_ESCOLAR_PLANTELES,
  controlEscolarBridgeAgentCandidates,
  normalizeExternalControlEscolarPlantel
} from './control-escolar-plantel-routing'

const CANONICAL_PLANTELES = EXTERNAL_CONTROL_ESCOLAR_PLANTELES
const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const canonicalMatricula = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')

export const normalizeExternalLivePlantel = normalizeExternalControlEscolarPlantel


const inferExternalScopeFromMatricula = (matricula: string) => {
  const prefix = canonicalMatricula(matricula).match(/^[A-Z]+/)?.[0] || ''
  return normalizeExternalLivePlantel(prefix)
}


const resolveScope = (query: any = {}) => {
  const plantel = normalizeExternalLivePlantel(query.plantel || query.agentId)
  const ciclo = normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || '')
  if (!plantel) {
    throw createError({ statusCode: 400, statusMessage: 'PLANTEL_INVALID', message: 'El plantel no es válido para Control Escolar.' })
  }
  if (!ciclo) {
    throw createError({ statusCode: 400, statusMessage: 'CICLO_INVALID', message: 'El ciclo escolar no es válido.' })
  }
  return { plantel, ciclo }
}

const encodeCursor = (page: number) => Buffer.from(JSON.stringify({ page })).toString('base64url')
const decodeCursor = (value: unknown) => {
  const cursor = clean(value, 300)
  if (!cursor) return 1
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    const page = Number(parsed?.page || 1)
    return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  } catch {
    return 1
  }
}

const sanitizeStudent = (studentValue: any) => {
  const student = { ...(studentValue || {}) }
  for (const key of [
    'huskyPassPlaintext',
    'rawPhoto',
    'centralMatriculaRaw',
    'Control_Escolar_RAW_JSON',
    'raw',
    'rawBase',
    'rawMatricula',
    'rawUsers'
  ]) delete student[key]

  student.matricula = clean(student.matricula, 64).toUpperCase()
  student.curp = normalizeCurp(student.curp || student.baseCurp) || null
  student.fullName = clean(student.fullName || student.nombreCompleto, 255)
  student.plantel = normalizeExternalLivePlantel(student.plantel || student.basePlantel)
  student.display = {
    nombre: student.fullName,
    gradoGrupo: [student.grado, student.group || student.grupo].filter(Boolean).join(' '),
    plantelNivel: [student.plantel, student.nivel].filter(Boolean).join(' · '),
    estado: clean(student.status, 80),
    ciclo: clean(student.cicloBase || student.ciclo, 20)
  }
  student.padre = {
    nombreCompleto: clean(student.fatherName, 255),
    nombres: clean(student.nombrePadre, 120),
    apellidoPaterno: clean(student.apellidoPaternoPadre, 120),
    apellidoMaterno: clean(student.apellidoMaternoPadre, 120),
    telefono: clean(student.telefonoPadre, 80),
    correo: clean(student.emailPadre, 255)
  }
  student.madre = {
    nombreCompleto: clean(student.motherName, 255),
    nombres: clean(student.nombreMadre, 120),
    apellidoPaterno: clean(student.apellidoPaternoMadre, 120),
    apellidoMaterno: clean(student.apellidoMaternoMadre, 120),
    telefono: clean(student.telefonoMadre, 80),
    correo: clean(student.emailMadre, 255)
  }
  student.contactoPrincipal = {
    nombre: clean([student.fatherName, student.motherName].filter(Boolean).join(' / '), 500),
    telefono: clean(student.telefonoPadre || student.telefonoMadre || student.phone, 80),
    correo: clean(student.emailPadre || student.emailMadre || student.email, 255)
  }
  const servicios = parseServiciosCsv(student.servicio)
  student.servicios = servicios
  student.talleres = servicios.map((nombre) => ({
    clave: normalizeServicioClave(nombre),
    nombre
  }))
  return student
}

const sourceMeta = (source: any, plantel: string, ciclo: string, bridgeAgentId = '') => ({
  source: clean(source?.source || source?.mode || source?.kind || 'aurora-control-escolar', 80),
  freshness: clean(source?.freshness || (source?.cacheRefreshDue ? 'stale' : 'fresh'), 40) || 'fresh',
  plantel,
  ciclo,
  bridgeAgentId: clean(bridgeAgentId, 40) || null,
  generatedAt: source?.generatedAt || source?.updatedAt || new Date().toISOString(),
  staleAfter: source?.staleAfter || null,
  expiresAt: source?.expiresAt || null,
  bridge: Boolean(source?.bridge || source?.bridgeSource || source?.localBridge),
  cacheRows: Number(source?.cacheRows || 0)
})

const runExternalControlEscolarScope = async <T>(
  event: any,
  plantel: string,
  callback: (bridgeAgentId: string) => Promise<T>
) => {
  const candidates = controlEscolarBridgeAgentCandidates(plantel)
  let lastError: any = null

  for (const bridgeAgentId of candidates) {
    try {
      return await runControlEscolar(event, bridgeAgentId, async () => await callback(bridgeAgentId))
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) throw lastError
  throw createError({
    statusCode: 503,
    statusMessage: 'BRIDGE_SCOPE_UNAVAILABLE',
    message: 'No existe una ruta Bridge disponible para el plantel solicitado.'
  })
}

export const readExternalLiveHealth = async () => {
  const cycle = await readInstitutionalSchoolCycle()
  return {
    status: 'ok',
    mode: 'live-bridge',
    canonicalPlanteles: CANONICAL_PLANTELES.map((plantel) => ({ plantel })),
    currentCycle: { value: cycle.key, label: cycle.label },
    schoolYears: cycle.schoolYears.map((item) => ({ value: item.value, label: item.label, isCurrent: item.isCurrent })),
    scopes: []
  }
}

export const readExternalLiveStudents = async (event: any, query: any = {}) => {
  const { plantel, ciclo } = resolveScope(query)
  const page = decodeCursor(query.cursor)
  const limit = Math.min(100, Math.max(25, Number(query.limit || 100) || 100))

  return await runExternalControlEscolarScope(event, plantel, async (bridgeAgentId) => {
    const filters = {
      ...query,
      plantel: bridgeAgentId,
      agentId: bridgeAgentId,
      ciclo,
      cicloKey: ciclo,
      page,
      limit,
      group: query.grupo || query.group || ''
    }
    delete filters.cursor

    const result = await fetchControlEscolarStudents(bridgeAgentId, filters)
    const total = Number(result?.pagination?.total || 0)
    const pages = Number(result?.pagination?.pages || Math.max(1, Math.ceil(total / limit)))
    return {
      data: Array.isArray(result?.data) ? result.data.map(sanitizeStudent) : [],
      pagination: {
        page,
        limit,
        total,
        nextCursor: page < pages ? encodeCursor(page + 1) : null
      },
      catalogs: result?.catalogs || { niveles: [], grados: [], grupos: [], gruposPorGrado: {} },
      meta: sourceMeta(result?.source, plantel, ciclo, bridgeAgentId)
    }
  })
}

export const readExternalLiveStudentDetail = async (event: any, query: any = {}, matriculaValue: unknown) => {
  const { plantel, ciclo } = resolveScope(query)
  const matricula = canonicalMatricula(matriculaValue)
  if (!matricula) {
    throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })
  }

  return await runExternalControlEscolarScope(event, plantel, async (bridgeAgentId) => {
    const academic = await fetchControlEscolarCalculatedAcademicPlacement(bridgeAgentId, matricula, ciclo)
    if (!academic) {
      throw createError({
        statusCode: 404,
        statusMessage: 'STUDENT_ACADEMIC_PLACEMENT_NOT_FOUND',
        message: 'No se encontró una colocación académica calculable para el alumno y ciclo seleccionados.'
      })
    }

    // Rich profile data is optional here. Academic placement must remain
    // available even when the central matricula overlay cannot be read.
    let student: any = null
    let source: any = null
    try {
      const result = await fetchControlEscolarStudents(bridgeAgentId, {
        plantel: bridgeAgentId,
        agentId: bridgeAgentId,
        ciclo,
        cicloKey: ciclo,
        search: matricula,
        page: 1,
        limit: 100
      })
      student = (result?.data || []).find((item: any) => canonicalMatricula(item?.matricula) === matricula) || null
      source = result?.source || null
    } catch {
      student = null
      source = null
    }

    const data = sanitizeStudent({
      ...(student || {}),
      matricula: academic.matricula,
      plantel: academic.plantel,
      nivel: academic.nivel,
      grado: academic.grado,
      group: clean(student?.group || student?.grupo || academic.grupo, 80),
      grupo: clean(student?.grupo || student?.group || academic.grupo, 80),
      ciclo: academic.ciclo,
      academicPlacementSource: 'base-projection'
    })

    return {
      data,
      meta: {
        ...sourceMeta(source, plantel, ciclo, bridgeAgentId),
        academicPlacementSource: 'base-projection',
        academicBaseCycle: academic.baseCiclo,
        academicSourcePlantel: academic.sourcePlantel
      }
    }
  })
}

export const sanitizeExternalLiveStudent = sanitizeStudent


/**
 * Returns the academic placement calculated from the live Bridge `base` row
 * for the requested school cycle. This path deliberately does not load the
 * centralized `matricula.grado` field: grade is projected from base grade +
 * base cycle by Control Escolar's promotion logic.
 */
export const readExternalCalculatedAcademicPlacement = async (
  event: any,
  query: any = {},
  matriculaValue: unknown
) => {
  const matricula = canonicalMatricula(matriculaValue)
  const ciclo = normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || '')
  if (!matricula) {
    throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })
  }
  if (!ciclo) {
    throw createError({ statusCode: 400, statusMessage: 'CICLO_INVALID', message: 'El ciclo escolar no es válido.' })
  }

  const requestedScope = normalizeExternalLivePlantel(query.plantel || query.agentId)
  const inferredScope = inferExternalScopeFromMatricula(matricula)
  const scopes = Array.from(new Set([requestedScope, inferredScope].filter(Boolean)))
  if (!scopes.length) scopes.push(...CANONICAL_PLANTELES)

  let lastError: any = null
  for (const scope of scopes) {
    try {
      const found = await runExternalControlEscolarScope(event, scope, async (bridgeAgentId) => {
        const academic = await fetchControlEscolarCalculatedAcademicPlacement(bridgeAgentId, matricula, ciclo)
        if (!academic) return null
        return {
          data: {
            matricula: academic.matricula,
            ciclo: academic.ciclo,
            plantel: academic.plantel,
            nivel: academic.nivel,
            grado: academic.grado,
            grupo: academic.grupo
          },
          meta: {
            source: 'aurora-control-escolar-base-projection',
            plantel: scope,
            ciclo,
            bridgeAgentId,
            academicPlacementSource: 'base-projection',
            academicBaseCycle: academic.baseCiclo,
            academicSourcePlantel: academic.sourcePlantel,
            generatedAt: new Date().toISOString()
          }
        }
      })
      if (found?.data) return found
    } catch (error) {
      lastError = error
    }
  }

  if (lastError && scopes.length === 1) throw lastError
  throw createError({
    statusCode: 404,
    statusMessage: 'STUDENT_ACADEMIC_PLACEMENT_NOT_FOUND',
    message: 'No se encontró la colocación académica calculada del alumno para el ciclo solicitado.'
  })
}

