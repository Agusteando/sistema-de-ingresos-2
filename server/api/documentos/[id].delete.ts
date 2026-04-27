import { query } from '../../utils/db'
import { isOutOfScopeForPlantelCiclo } from '../../../shared/utils/grado'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const id = Number(event.context.params?.id)
  const user = event.context.user

  if (!id) {
    throw createError({ statusCode: 400, message: 'Identificador de documento no proporcionado.' })
  }

  const [doc] = await query<any[]>(
    `
      SELECT
        D.documento, D.ciclo, D.matricula,
        B.plantel, B.grado as gradoBase, B.ciclo as cicloBase
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

  if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
    if (String(doc.plantel || '') !== String(user.active_plantel || '')) {
      throw createError({ statusCode: 403, message: 'Alumno fuera del plantel activo.' })
    }
  }

  if (isOutOfScopeForPlantelCiclo(doc.gradoBase, doc.plantel, doc.cicloBase, normalizeCicloKey(doc.ciclo))) {
    throw createError({ statusCode: 409, message: 'Alumno fuera del alcance del plantel para este ciclo.' })
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
})
