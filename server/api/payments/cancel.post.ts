import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const user = event.context.user

  const [pago] = await query<any[]>(
    `SELECT * FROM referenciasdepago WHERE folio = ? LIMIT 1`,
    [Number(body.folio)]
  )

  if (!pago) {
    throw createError({ statusCode: 404, message: 'Pago no encontrado en el sistema.' })
  }

  if (user.role === 'global' || body.force_direct) {
    await query(
      `UPDATE referenciasdepago SET estatus = 'Cancelada', cancelada_por = ? WHERE folio = ?`,
      [user.name, pago.folio]
    )

    return { success: true, status: 'canceled' }
  }

  await query(
    `
      INSERT INTO solicitudescancelaciones (
        folio, motivo, monto, nombreCompleto, conceptoNombre, usuario, usuarioId, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      pago.folio,
      body.motivo || 'Solicitud generada por operador',
      Number(pago.monto),
      pago.nombreCompleto,
      pago.conceptoNombre,
      user.name,
      0,
      'pendiente'
    ]
  )

  return { success: true, status: 'pending' }
})