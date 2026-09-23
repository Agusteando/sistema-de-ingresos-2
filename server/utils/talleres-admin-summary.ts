import { normalizeCicloKey } from '../../shared/utils/ciclo'
import {
  canonicalTallerKey,
  finalTallerSeed,
  parseServiciosCsv,
  shouldIncludeDirectTallerAssignment,
  shouldIncludeFinancialTallerAssignment,
} from '../../shared/utils/talleresServicios'
import { fetchControlEscolarStudents, runControlEscolar } from './control-escolar'
import { controlEscolarBridgeAgentCandidates, normalizeExternalControlEscolarPlantel } from './control-escolar-plantel-routing'
import { readAuthoritativeTalleresCatalog } from './talleres-catalog-authority'
import { readTalleresSnapshotRoster } from './talleres-snapshot'
import {
  readConceptMappedServiciosForMatriculas,
} from './talleres-servicios'
import { readTalleresAssignmentSummaries } from './talleres-contracts'

const text = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const matriculaKey = (value: unknown) => text(value, 64).toUpperCase().replace(/\s+/g, '')

export type TalleresAdminStudentRow = {
  matricula: string
  nombre: string
  grado: string
  grupo: string
}

export type TalleresAdminSummaryRow = {
  clave: string
  nombre: string
  imagen: string
  alumnos: number
  students?: TalleresAdminStudentRow[]
}

const toStudentRow = (student: any, matricula: string): TalleresAdminStudentRow => {
  const nombre = text(
    student?.fullName
    || student?.nombreCompleto
    || [student?.nombres, student?.apellidoPaterno, student?.apellidoMaterno].filter(Boolean).join(' '),
    220,
  )

  return {
    matricula,
    nombre,
    grado: text(student?.grado, 80),
    grupo: text(student?.grupo || student?.group, 40).toUpperCase(),
  }
}

const compareStudentRows = (left: TalleresAdminStudentRow, right: TalleresAdminStudentRow) => (
  left.grado.localeCompare(right.grado, 'es', { numeric: true, sensitivity: 'base' })
  || left.grupo.localeCompare(right.grupo, 'es', { numeric: true, sensitivity: 'base' })
  || left.nombre.localeCompare(right.nombre, 'es', { sensitivity: 'base' })
  || left.matricula.localeCompare(right.matricula, 'es', { numeric: true })
)


const bridgeErrorCode = (error: any) => text(
  error?.data?.diagnostic?.code
  || error?.data?.data?.diagnostic?.code
  || error?.diagnostic?.code
  || error?.code,
  120,
).toUpperCase()

const isBridgeAvailabilityError = (error: any) => {
  const code = bridgeErrorCode(error)
  const status = Number(error?.statusCode || error?.data?.statusCode || error?.data?.diagnostic?.status || 0)
  return code.startsWith('DB_BRIDGE_') && status >= 500
}

const readSummaryFromCurrentSnapshot = async ({
  publicPlantel,
  cycle,
  includeStudents,
}: {
  publicPlantel: string
  cycle: string
  includeStudents: boolean
}) => {
  const roster: any = await readTalleresSnapshotRoster({ plantel: publicPlantel, ciclo: cycle })
  const source = (Array.isArray(roster?.meta?.sources) ? roster.meta.sources : [])[0] || null
  if (roster?.assignmentResolution?.complete !== true || source?.ok !== true || source?.freshness !== 'fresh') {
    throw createError({
      statusCode: 503,
      statusMessage: 'TALLERES_SUMMARY_SNAPSHOT_NOT_CURRENT',
      message: `Aurora no tiene un snapshot completo y vigente de Talleres para ${publicPlantel}.`,
    })
  }

  const catalog = new Map<string, any>()
  for (const item of (Array.isArray(roster?.catalog) ? roster.catalog : [])) {
    const key = canonicalTallerKey(item?.clave || item?.servicio_clave || item?.nombre || item?.servicio_nombre)
    if (!key || Number(item?.activo ?? 1) === 0) continue
    catalog.set(key, item)
  }

  // Talleres membership is its own domain. School-level baja/status metadata
  // must never veto a current workshop/service assignment.
  const students = Array.isArray(roster?.students) ? roster.students : []
  const studentsByMatricula = new Map<string, any>()
  const counts = new Map<string, Set<string>>()

  const ensureCount = (value: unknown, matricula: string) => {
    const key = canonicalTallerKey(value)
    if (!key || !matricula || !catalog.has(key)) return
    const members = counts.get(key) || new Set<string>()
    members.add(matricula)
    counts.set(key, members)
  }

  for (const student of students) {
    const matricula = matriculaKey(student?.matricula)
    if (!matricula) continue
    if (includeStudents) studentsByMatricula.set(matricula, student)

    const assignments = Array.isArray(student?.asignaciones) && student.asignaciones.length
      ? student.asignaciones
      : (Array.isArray(student?.talleres) && student.talleres.length
          ? student.talleres
          : (Array.isArray(student?.servicios) ? student.servicios : []))

    for (const assignment of assignments) {
      const value = typeof assignment === 'string'
        ? assignment
        : (assignment?.clave || assignment?.nombre || assignment?.servicio)
      ensureCount(value, matricula)
    }
  }

  const talleres: TalleresAdminSummaryRow[] = Array.from(counts.entries())
    .map(([clave, members]) => {
      const item = catalog.get(clave)
      const seed = finalTallerSeed(clave)
      const detailRows = includeStudents
        ? Array.from(members)
            .map((matricula) => toStudentRow(studentsByMatricula.get(matricula), matricula))
            .sort(compareStudentRows)
        : undefined

      return {
        clave,
        nombre: text(item?.nombre || item?.servicio_nombre || seed?.nombre || clave, 160),
        imagen: text(item?.imagen || item?.imagen_url || seed?.imagen || `/talleres-servicios/${clave}.svg`, 500),
        alumnos: members.size,
        orden: Number(item?.orden || seed?.orden || 9999),
        ...(includeStudents ? { students: detailRows } : {}),
      }
    })
    .filter((item) => item.alumnos > 0)
    .sort((left, right) => left.orden - right.orden || left.nombre.localeCompare(right.nombre, 'es'))
    .map(({ orden: _orden, ...item }) => item)

  const uniqueStudents = new Set<string>()
  for (const members of counts.values()) {
    for (const matricula of members) uniqueStudents.add(matricula)
  }

  return {
    ok: true,
    plantel: publicPlantel,
    ciclo: cycle,
    talleres,
    totals: {
      talleres: talleres.length,
      alumnos: uniqueStudents.size,
    },
    generatedAt: source?.generatedAt || roster?.meta?.generatedAt || new Date().toISOString(),
  }
}

export const readTalleresAdminSummary = async ({
  event,
  plantel,
  ciclo,
  includeStudents = false,
}: {
  event: any
  plantel: unknown
  ciclo?: unknown
  includeStudents?: boolean
}) => {
  const publicPlantel = text(plantel, 40).toUpperCase()
  if (!publicPlantel || publicPlantel === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel para consultar Talleres.' })
  }

  const cycle = normalizeCicloKey(ciclo)
  const canonicalSource = normalizeExternalControlEscolarPlantel(publicPlantel) || publicPlantel
  const routedCandidates = controlEscolarBridgeAgentCandidates(publicPlantel)
  const sourceCandidates = routedCandidates.length ? routedCandidates : [canonicalSource]

  const readFromSource = async (sourcePlantel: string) => await runControlEscolar(event, sourcePlantel, async () => {
    const studentsResult = await fetchControlEscolarStudents(sourcePlantel, {
      plantel: sourcePlantel,
      agentId: sourcePlantel,
      ciclo: cycle,
      cicloKey: cycle,
      all: '1',
      limit: 10000,
    })
    // Do not filter by school-level baja/status here. A student belongs in this
    // summary whenever a current workshop/service assignment says so.
    const students = Array.isArray(studentsResult?.data) ? studentsResult.data : []
    const matriculas = students.map((student: any) => matriculaKey(student?.matricula)).filter(Boolean)

    const [catalogResult, financialAssignments, assignmentSummaries] = await Promise.all([
      readAuthoritativeTalleresCatalog(),
      readConceptMappedServiciosForMatriculas({ matriculas, ciclo: cycle, plantel: publicPlantel }),
      readTalleresAssignmentSummaries(matriculas),
    ])

    const catalog = new Map<string, any>()
    for (const item of catalogResult.catalog || []) {
      const key = canonicalTallerKey(item?.servicio_clave || item?.servicio_nombre)
      if (!key || Number(item?.activo ?? 1) === 0) continue
      catalog.set(key, item)
    }

    const counts = new Map<string, Set<string>>()
    const ensureCount = (value: unknown, matricula: string) => {
      const key = canonicalTallerKey(value)
      if (!key || !matricula || !catalog.has(key)) return
      const members = counts.get(key) || new Set<string>()
      members.add(matricula)
      counts.set(key, members)
    }

    for (const student of students) {
      const matricula = matriculaKey(student?.matricula)
      if (!matricula) continue

      const history = assignmentSummaries.result.get(matricula) || {}
      const financial = financialAssignments.result.get(matricula) || []
      const financialKeys = new Set(financial
        .map((assignment) => canonicalTallerKey(assignment?.clave || assignment?.nombre))
        .filter(Boolean))

      for (const direct of parseServiciosCsv(student?.servicio)) {
        if (!shouldIncludeDirectTallerAssignment({ value: direct, financialKeys, history })) continue
        ensureCount(direct, matricula)
      }
      for (const assignment of financial) {
        if (!shouldIncludeFinancialTallerAssignment({ value: assignment?.clave || assignment?.nombre, history })) continue
        ensureCount(assignment?.clave || assignment?.nombre, matricula)
      }
    }

    const studentsByMatricula = new Map<string, any>()
    if (includeStudents) {
      for (const student of students) {
        const matricula = matriculaKey(student?.matricula)
        if (matricula) studentsByMatricula.set(matricula, student)
      }
    }

    const talleres: TalleresAdminSummaryRow[] = Array.from(counts.entries())
      .map(([clave, members]) => {
        const item = catalog.get(clave)
        const seed = finalTallerSeed(clave)
        const detailRows = includeStudents
          ? Array.from(members)
              .map((matricula) => toStudentRow(studentsByMatricula.get(matricula), matricula))
              .sort(compareStudentRows)
          : undefined

        return {
          clave,
          nombre: text(item?.servicio_nombre || seed?.nombre || clave, 160),
          imagen: text(item?.imagen_url || seed?.imagen || `/talleres-servicios/${clave}.svg`, 500),
          alumnos: members.size,
          orden: Number(item?.orden || seed?.orden || 9999),
          ...(includeStudents ? { students: detailRows } : {}),
        }
      })
      .filter((item) => item.alumnos > 0)
      .sort((left, right) => left.orden - right.orden || left.nombre.localeCompare(right.nombre, 'es'))
      .map(({ orden: _orden, ...item }) => item)

    const uniqueStudents = new Set<string>()
    for (const members of counts.values()) {
      for (const matricula of members) uniqueStudents.add(matricula)
    }

    return {
      ok: true,
      plantel: publicPlantel,
      ciclo: cycle,
      talleres,
      totals: {
        talleres: talleres.length,
        alumnos: uniqueStudents.size,
      },
      generatedAt: new Date().toISOString(),
    }
  })

  let lastError: any = null
  const sourceErrors: any[] = []
  for (const sourcePlantel of sourceCandidates) {
    try {
      return await readFromSource(sourcePlantel)
    } catch (error: any) {
      lastError = error
      sourceErrors.push(error)
    }
  }

  if (sourceErrors.length && sourceErrors.every(isBridgeAvailabilityError)) {
    return await readSummaryFromCurrentSnapshot({ publicPlantel, cycle, includeStudents })
  }

  throw lastError || createError({ statusCode: 502, message: `No se pudo consultar Talleres de ${publicPlantel}.` })
}
