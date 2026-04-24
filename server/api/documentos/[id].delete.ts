import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = Number(event.context.params?.id)

  if (!id) {
    throw createError({ statusCode: 400, message: 'Identificador de documento no proporcionado.' })
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