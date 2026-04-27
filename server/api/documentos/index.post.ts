import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../shared/utils/grado'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const cicloKey = normalizeCicloKey(body.ciclo)
  const user = event.context.user

  const [studentRef] = await query<any[]>(
    `SELECT matricula, plantel, grado as gradoBase, ciclo as cicloBase FROM base WHERE matricula = ? LIMIT 1`,
    [body.matricula]
  )

  if (!studentRef) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  }

  if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
    if (String(studentRef.plantel || '') !== String(user.active_plantel || '')) {
      throw createError({ statusCode: 403, message: 'Alumno fuera del plantel activo.' })
    }
  }

  if (isOutOfScopeForPlantelCiclo(studentRef.gradoBase, studentRef.plantel, studentRef.cicloBase, cicloKey)) {
    throw createError({ statusCode: 409, message: 'Alumno fuera del alcance del plantel para este ciclo.' })
  }
  
  const [conceptoRef] = await query<any[]>(`SELECT concepto FROM conceptos WHERE id = ?`, [body.conceptoId])
  const conceptoNombre = conceptoRef ? conceptoRef.concepto : 'Cargo'
  const meses = Math.max(1, Number(body.meses) || 1)
  const plazoLegacy = Array.from({ length: meses }, (_, i) => i + 1).join(',')

  const result = await query<any>(`
    INSERT INTO documentos (concepto, conceptoNombre, matricula, costo, plazo, meses, beca, ciclo, eventual, responsable, estatus)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin', 'Activo')
  `, [
    body.conceptoId, conceptoNombre, body.matricula, body.costo, plazoLegacy, 
    meses, body.beca || 0, cicloKey, body.eventual ? 1 : 0
  ])
  
  return { success: true, documento: result.insertId }
})
