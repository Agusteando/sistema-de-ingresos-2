import { getTrustedAuthUser, normalizePlantel } from '../../utils/auth-session'
import { readTalleresAdminSummary } from '../../utils/talleres-admin-summary'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { PLANTELES_LIST } from '../../../utils/constants'

const errorMessage = (error: any) => String(
  error?.data?.message
  || error?.statusMessage
  || error?.message
  || 'No fue posible consultar este plantel.'
).trim()

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  const query = getQuery(event)
  const ciclo = normalizeCicloKey(query.ciclo)
  const allowedPlanteles = (user.isSuperAdmin ? PLANTELES_LIST : user.plantelesList)
    .map(normalizePlantel)
    .filter((plantel, index, values) => plantel && plantel !== 'GLOBAL' && values.indexOf(plantel) === index)

  if (!allowedPlanteles.length) {
    throw createError({ statusCode: 403, message: 'La sesión no tiene planteles disponibles para este reporte.' })
  }

  const summaries: any[] = []
  const failures: Array<{ plantel: string, message: string }> = []

  // runControlEscolar binds the selected bridge agent to the request context.
  // Keep campus reads sequential so one request never races two agent scopes.
  for (const plantel of allowedPlanteles) {
    try {
      summaries.push(await readTalleresAdminSummary({ event, plantel, ciclo }))
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
      current.planteles.push({ plantel: summary.plantel, alumnos })
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
    ciclo,
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
})
