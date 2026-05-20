import { runWithBridgeAgentId, query } from '../../utils/db'
import { isInProjectedPlantelScopeForCiclo } from '../../../shared/utils/grado'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const id = Number(event.context.params?.id)
  const user = event.context.user

  if (!id) {
    throw createError({ statusCode: 400, message: 'Identificador de documento no proporcionado.' })
  }

  const [doc] = await query<any[]>(
    `
      SELECT
        D.documento, D.ciclo, D.matricula,
        B.plantel, B.nivel as nivelBase, B.grado as gradoBase, B.ciclo as cicloBase
      FROM documentos D
      LEFT JOIN base B ON B.matricula = D.matricula
      WHERE D.documento = ?
      LIMIT 1
    `,
    [id]
  )

  if (!doc) {
    throw createError({ statusCode: 404, message: 'Documento no encontrado.' })
  }

  const isScopedToActivePlantel = !user.isSuperAdmin || (user.isSuperAdmin && user.active_plantel !== 'GLOBAL')

  if (!isInProjectedPlantelScopeForCiclo(
    doc.gradoBase,
    doc.plantel,
    doc.cicloBase,
    normalizeCicloKey(doc.ciclo),
    doc.nivelBase,
    isScopedToActivePlantel ? user.active_plantel : 'GLOBAL'
  )) {
    throw createError({ statusCode: isScopedToActivePlantel ? 403 : 409, message: 'Alumno fuera del alcance del plantel para este ciclo.' })
  }

  const [associatedPayment] = await query<any[]>(
    `
      SELECT folio
      FROM referenciasdepago
      WHERE documento = ? AND estatus = 'Vigente'
      LIMIT 1
    `,
    [id]
  )

  if (associatedPayment) {
    throw createError({ statusCode: 409, message: 'Bloqueo de eliminación: Existen pagos vigentes aplicados a este concepto.' })
  }

  await query(
    `UPDATE documentos SET estatus = 'Cancelado' WHERE documento = ?`,
    [id]
  )

  return { success: true }
}))
