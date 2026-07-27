import { runWithBridgeAgentId, query } from '../../utils/db'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const id = Number(event.context.params?.id)
  if (!id) {
    throw createError({ statusCode: 400, message: 'Identificador de documento no proporcionado.' })
  }

  const [doc] = await query<any[]>(
    `
      SELECT D.documento
      FROM documentos D
      WHERE D.documento = ?
      LIMIT 1
    `,
    [id]
  )

  if (!doc) {
    throw createError({ statusCode: 404, message: 'Documento no encontrado.' })
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
