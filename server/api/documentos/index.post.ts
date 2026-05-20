import { runWithBridgeAgentId, query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo } from '../../../shared/utils/grado'
import { isWholeMoney } from '../../utils/monto-final'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const cicloKey = normalizeCicloKey(body.ciclo)
  const user = event.context.user

  const [studentRef] = await query<any[]>(
    `SELECT matricula, plantel, nivel as nivelBase, grado as gradoBase, ciclo as cicloBase FROM base WHERE matricula = ? LIMIT 1`,
    [body.matricula]
  )

  if (!studentRef) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  }

  const isScopedToActivePlantel = !user.isSuperAdmin || (user.isSuperAdmin && user.active_plantel !== 'GLOBAL')
  const isProjectedInScope = isInProjectedPlantelScopeForCiclo(
    studentRef.gradoBase,
    studentRef.plantel,
    studentRef.cicloBase,
    cicloKey,
    studentRef.nivelBase,
    isScopedToActivePlantel ? user.active_plantel : 'GLOBAL'
  )

  if (!isProjectedInScope) {
    throw createError({ statusCode: isScopedToActivePlantel ? 403 : 409, message: 'Alumno fuera del alcance del plantel para este ciclo.' })
  }
  
  const [conceptoRef] = await query<any[]>(`SELECT concepto FROM conceptos WHERE id = ?`, [body.conceptoId])
  const conceptoNombre = conceptoRef ? conceptoRef.concepto : 'Cargo'
  const meses = Math.max(1, Number(body.meses) || 1)
  const plazoLegacy = Array.from({ length: meses }, (_, i) => i + 1).join(',')
  const montoFinal = Number(body.montoFinal)

  if (!isWholeMoney(montoFinal)) {
    throw createError({ statusCode: 400, message: 'El monto final debe ser un numero entero, sin decimales.' })
  }

  const result = await query<any>(`
    INSERT INTO documentos (concepto, conceptoNombre, matricula, costo, montoFinal, plazo, meses, beca, ciclo, eventual, responsable, estatus)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin', 'Activo')
  `, [
    body.conceptoId, conceptoNombre, body.matricula, body.costo, montoFinal, plazoLegacy, 
    meses, body.beca || 0, cicloKey, body.eventual ? 1 : 0
  ])
  
  return { success: true, documento: result.insertId }
}))
