import { query } from '../../../utils/db'
import { normalizeCicloForTipoIngreso, resolveTipoIngreso, tipoIngresoToInternoValue } from '../../../../shared/utils/tipoIngreso'

export default defineEventHandler(async (event) => {
  const matricula = String(event.context.params?.matricula || '').trim()
  if (!matricula) throw createError({ statusCode: 400, message: 'Matrícula requerida' })

  const body = await readBody(event)
  const ingresoCiclo = normalizeCicloForTipoIngreso(body?.ciclo)
  if (!ingresoCiclo) throw createError({ statusCode: 400, message: 'Ciclo de ingreso inválido' })

  const user = event.context.user
  const [student] = await query<any[]>(`
    SELECT matricula, plantel, grado AS gradoBase, ciclo AS cicloBase, ciclo, interno AS internoBase
    FROM base
    WHERE matricula = ?
    LIMIT 1
  `, [matricula])

  if (!student) throw createError({ statusCode: 404, message: 'Alumno no encontrado' })

  if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
    if (String(student.plantel || '') !== String(user.active_plantel || '')) {
      throw createError({ statusCode: 403, message: 'No tienes acceso a este alumno' })
    }
  }

  await query(`UPDATE base SET ciclo = ?, interno = 0 WHERE matricula = ?`, [ingresoCiclo, matricula])

  const targetCiclo = normalizeCicloForTipoIngreso(body?.targetCiclo) || ingresoCiclo
  const tipoIngreso = resolveTipoIngreso({
    ...student,
    ciclo: ingresoCiclo,
    cicloBase: ingresoCiclo,
    internoBase: 0
  }, targetCiclo)

  return {
    success: true,
    student: {
      matricula,
      ciclo: ingresoCiclo,
      cicloBase: ingresoCiclo,
      internoBase: 0,
      internoLegacy: 0,
      interno: tipoIngresoToInternoValue(tipoIngreso),
      tipoIngreso
    }
  }
})
