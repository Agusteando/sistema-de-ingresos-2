import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const user = event.context.user
  const folio = Number(body.folio)

  if (!folio) {
    throw createError({ statusCode: 400, message: 'Folio requerido.' })
  }

  const [payment] = await query<any[]>(
    `SELECT folio, depurado FROM referenciasdepago WHERE folio = ? LIMIT 1`,
    [folio]
  )

  if (!payment) {
    throw createError({ statusCode: 404, message: 'Pago no encontrado.' })
  }

  const depurado = typeof body.depurado === 'boolean' ? body.depurado : !Boolean(Number(payment.depurado || 0))

  await query(
    `
      UPDATE referenciasdepago
      SET depurado = ?,
          depurado_por = ?,
          depurado_fecha = ?
      WHERE folio = ?
    `,
    [
      depurado ? 1 : 0,
      depurado ? (user?.name || 'Sistema') : null,
      depurado ? new Date() : null,
      folio
    ]
  )

  return { success: true, folio, depurado }
})
