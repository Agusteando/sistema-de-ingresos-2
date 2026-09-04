import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { PLANTELES_LIST } from '../../utils/constants'
import { getTrustedAuthUser, normalizePlantel } from './auth-session'
import { readTalleresAdminSummary } from './talleres-admin-summary'

const errorMessage = (error: any) => String(
  error?.data?.message
  || error?.statusMessage
  || error?.message
  || 'No fue posible consultar este plantel.'
).trim()

// CT/PREET and CM/PREEM are two names for the same campus in Aurora.
// Reports expose one column/read per physical campus.
export const normalizeTalleresReportPlantel = (value: unknown) => {
  const plantel = normalizePlantel(value)
  if (plantel === 'PREET' || plantel === 'CT') return 'CT'
  if (plantel === 'PREEM' || plantel === 'CM') return 'CM'
  return plantel
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
  const sessionPlanteles = (user.isSuperAdmin ? PLANTELES_LIST : user.plantelesList)
    .map(normalizeTalleresReportPlantel)
    .filter((plantel, index, values) => plantel && plantel !== 'GLOBAL' && values.indexOf(plantel) === index)

  if (!sessionPlanteles.length) {
    throw createError({ statusCode: 403, message: 'La sesión no tiene planteles disponibles para este reporte.' })
  }

  const requested = normalizeTalleresReportPlantel(requestedPlantel)
  if (includeStudents && (!requested || requested === 'GLOBAL')) {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel para consultar las listas institucionales.' })
  }

  let allowedPlanteles = sessionPlanteles
  if (requested && requested !== 'GLOBAL') {
    if (!sessionPlanteles.includes(requested)) {
      throw createError({ statusCode: 403, message: 'El plantel solicitado no está dentro del alcance del usuario.' })
    }
    allowedPlanteles = [requested]
  }

  const summaries: any[] = []
  const failures: Array<{ plantel: string, message: string }> = []

  // runControlEscolar binds the selected bridge agent to the request context.
  // Campus reads stay sequential so one request never races two agent scopes.
  for (const plantel of allowedPlanteles) {
    try {
      summaries.push(await readTalleresAdminSummary({
        event,
        plantel,
        ciclo: cycle,
        includeStudents,
      }))
    } catch (error: any) {
      failures.push({ plantel, message: errorMessage(error) })
    }
  }

  if (!summaries.length) {
    throw createError({
      statusCode: 502,
      message: failures[0]?.message || 'No fue posible consultar Talleres en los planteles disponibles.',
    })
  }

  const grouped = new Map<string, any>()
  for (const summary of summaries.filter(Boolean)) {
    for (const taller of summary.talleres || []) {
      const clave = String(taller?.clave || '').trim()
      if (!clave) continue
      const current = grouped.get(clave) || {
        clave,
        nombre: String(taller?.nombre || clave).trim(),
        imagen: String(taller?.imagen || '').trim(),
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
    ciclo: cycle,
    planteles: allowedPlanteles,
    groups,
    totals: {
      talleres: groups.length,
      planteles: allowedPlanteles.length,
      asignaciones: groups.reduce((sum, group) => sum + Number(group.totalAlumnos || 0), 0),
    },
    failures: failures.sort((left, right) => allowedPlanteles.indexOf(left.plantel) - allowedPlanteles.indexOf(right.plantel)),
    generatedAt: new Date().toISOString(),
  }
}
