import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { canonicalTallerKey } from '../../shared/utils/talleresServicios'
import { getTrustedAuthUser, normalizePlantel } from './auth-session'
import {
  canonicalTalleresPlantel,
  readTalleresSnapshotRoster,
  TALLERES_SNAPSHOT_PLANTELES,
  TALLERES_SNAPSHOT_VIEW_VERSION,
} from './talleres-snapshot'

const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const matriculaKey = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')

const errorMessage = (error: any) => String(
  error?.data?.message
  || error?.statusMessage
  || error?.message
  || 'No fue posible consultar este plantel.'
).trim()

const assignmentsFor = (student: any) => {
  if (Array.isArray(student?.asignaciones) && student.asignaciones.length) return student.asignaciones
  if (Array.isArray(student?.talleres) && student.talleres.length) return student.talleres
  return Array.isArray(student?.servicios) ? student.servicios : []
}

const assignmentKey = (value: any) => canonicalTallerKey(
  typeof value === 'string'
    ? value
    : (value?.clave || value?.servicioClave || value?.nombre || value?.servicio)
)

const toReportStudent = (student: any) => ({
  matricula: matriculaKey(student?.matricula),
  nombre: clean(
    student?.nombreCompleto
    || student?.fullName
    || [student?.nombres, student?.apellidoPaterno, student?.apellidoMaterno].filter(Boolean).join(' '),
    220,
  ),
  grado: clean(student?.grado, 80),
  grupo: clean(student?.grupo || student?.group, 40).toUpperCase(),
  ...(student?.baja || clean(student?.status, 40).toLowerCase() === 'withdrawn' ? { baja: true } : {}),
})

const compareStudents = (left: any, right: any) => (
  String(left?.grado || '').localeCompare(String(right?.grado || ''), 'es', { numeric: true, sensitivity: 'base' })
  || String(left?.grupo || '').localeCompare(String(right?.grupo || ''), 'es', { numeric: true, sensitivity: 'base' })
  || String(left?.nombre || '').localeCompare(String(right?.nombre || ''), 'es', { sensitivity: 'base' })
  || String(left?.matricula || '').localeCompare(String(right?.matricula || ''), 'es', { numeric: true })
)

// Talleres Vue canonicalizes exactly these campus families. Keep the Aurora
// report on that same campus contract so both products see the same roster.
export const normalizeTalleresReportPlantel = (value: unknown) => {
  const normalized = normalizePlantel(value)
  return canonicalTalleresPlantel(normalized)
}

const summarizeRoster = (roster: any, plantel: string, includeStudents: boolean) => {
  const catalog = new Map<string, any>()
  for (const item of Array.isArray(roster?.catalog) ? roster.catalog : []) {
    if (Number(item?.activo ?? 1) === 0) continue
    const clave = canonicalTallerKey(item?.clave || item?.servicio_clave || item?.nombre || item?.servicio_nombre)
    if (!clave) continue
    const current = catalog.get(clave)
    const normalized = {
      clave,
      nombre: clean(item?.nombre || item?.servicio_nombre || clave, 180),
      imagen: clean(item?.imagen || item?.imagen_url, 500),
      orden: Number(item?.orden || 9999),
    }
    if (!current || normalized.orden < current.orden) catalog.set(clave, normalized)
  }

  const membersByService = new Map<string, Map<string, any>>()
  for (const student of Array.isArray(roster?.students) ? roster.students : []) {
    const matricula = matriculaKey(student?.matricula)
    if (!matricula) continue

    for (const assignment of assignmentsFor(student)) {
      const clave = assignmentKey(assignment)
      if (!clave || !catalog.has(clave)) continue
      const members = membersByService.get(clave) || new Map<string, any>()
      if (!members.has(matricula)) members.set(matricula, student)
      membersByService.set(clave, members)
    }
  }

  return Array.from(membersByService.entries())
    .map(([clave, members]) => {
      const item = catalog.get(clave)
      const students = includeStudents
        ? Array.from(members.values()).map(toReportStudent).filter((student) => student.nombre).sort(compareStudents)
        : undefined
      return {
        clave,
        nombre: item?.nombre || clave,
        imagen: item?.imagen || '',
        alumnos: members.size,
        orden: Number(item?.orden || 9999),
        ...(includeStudents ? { students } : {}),
      }
    })
    .filter((item) => item.alumnos > 0)
    .sort((left, right) => left.orden - right.orden || left.nombre.localeCompare(right.nombre, 'es'))
    .map(({ orden: _orden, ...item }) => item)
}

export const loadTalleresReport = async ({
  event,
  ciclo,
  requestedPlantel,
  includeStudents = false,
}: {
  event: any
  ciclo?: unknown
  requestedPlantel?: unknown
  includeStudents?: boolean
}) => {
  const user = await getTrustedAuthUser(event)
  const cycle = normalizeCicloKey(ciclo)
  const officialOrder = new Map(TALLERES_SNAPSHOT_PLANTELES.map((plantel, index) => [plantel, index]))

  const rawSessionPlanteles = user.isSuperAdmin
    ? [...TALLERES_SNAPSHOT_PLANTELES]
    : (Array.isArray(user.plantelesList) ? user.plantelesList : [])

  const sessionPlanteles = Array.from(new Set(
    rawSessionPlanteles
      .map(normalizeTalleresReportPlantel)
      .filter((plantel) => plantel && officialOrder.has(plantel))
  )).sort((left, right) => Number(officialOrder.get(left) ?? 999) - Number(officialOrder.get(right) ?? 999))

  if (!sessionPlanteles.length) {
    throw createError({
      statusCode: 403,
      message: 'La sesión no tiene planteles disponibles dentro del tablero oficial de Talleres.',
    })
  }

  const requested = normalizeTalleresReportPlantel(requestedPlantel)
  if (includeStudents && !requested) {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel para consultar las listas institucionales.' })
  }

  let allowedPlanteles = sessionPlanteles
  if (requested) {
    if (!sessionPlanteles.includes(requested)) {
      throw createError({ statusCode: 403, message: 'El plantel solicitado no está dentro del alcance del usuario.' })
    }
    allowedPlanteles = [requested]
  }

  const summaries: any[] = []
  const failures: Array<{ plantel: string, message: string }> = []
  const sourceMeta: any[] = []

  // This is deliberately the same materialized roster consumed by
  // /api/external/v1/talleres/roster and therefore by talleres-vue.
  for (const plantel of allowedPlanteles) {
    try {
      const roster = await readTalleresSnapshotRoster({ plantel, ciclo: cycle })
      const source = (Array.isArray(roster?.meta?.sources) ? roster.meta.sources : [])
        .find((item: any) => canonicalTalleresPlantel(item?.plantel) === plantel) || null
      sourceMeta.push({
        plantel,
        source: clean(source?.source || roster?.source, 255),
        generatedAt: source?.generatedAt || roster?.meta?.generatedAt || null,
        freshness: source?.freshness || null,
        assignmentsComplete: roster?.assignmentResolution?.complete !== false,
      })
      summaries.push({
        plantel,
        talleres: summarizeRoster(roster, plantel, includeStudents),
      })
    } catch (error: any) {
      failures.push({ plantel, message: errorMessage(error) })
    }
  }

  if (!summaries.length) {
    throw createError({
      statusCode: 502,
      message: failures[0]?.message || 'No fue posible consultar el roster oficial de Talleres.',
    })
  }

  const grouped = new Map<string, any>()
  for (const summary of summaries) {
    for (const taller of summary.talleres || []) {
      const clave = canonicalTallerKey(taller?.clave || taller?.nombre)
      if (!clave) continue
      const current = grouped.get(clave) || {
        clave,
        nombre: clean(taller?.nombre || clave, 180),
        imagen: clean(taller?.imagen, 500),
        totalAlumnos: 0,
        planteles: [],
      }
      const alumnos = Number(taller?.alumnos || 0)
      current.totalAlumnos += alumnos
      current.planteles.push({
        plantel: summary.plantel,
        alumnos,
        ...(includeStudents ? { students: Array.isArray(taller?.students) ? taller.students : [] } : {}),
      })
      grouped.set(clave, current)
    }
  }

  const groups = Array.from(grouped.values())
    .map((group) => ({
      ...group,
      planteles: group.planteles.sort((left: any, right: any) => (
        allowedPlanteles.indexOf(left.plantel) - allowedPlanteles.indexOf(right.plantel)
      )),
    }))
    .sort((left, right) => right.totalAlumnos - left.totalAlumnos || left.nombre.localeCompare(right.nombre, 'es'))

  return {
    ok: true,
    source: 'talleres-roster-v2',
    sourceViewVersion: TALLERES_SNAPSHOT_VIEW_VERSION,
    ciclo: cycle,
    planteles: allowedPlanteles,
    groups,
    totals: {
      talleres: groups.length,
      planteles: allowedPlanteles.length,
      asignaciones: groups.reduce((sum, group) => sum + Number(group.totalAlumnos || 0), 0),
    },
    sourceMeta,
    failures: failures.sort((left, right) => allowedPlanteles.indexOf(left.plantel) - allowedPlanteles.indexOf(right.plantel)),
    generatedAt: new Date().toISOString(),
  }
}
