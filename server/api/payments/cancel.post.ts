import { isDepurationAdjustment } from '../../utils/payment-audit'
import { notifyDocumentAmountCorrection } from '../../utils/telegram-document-audit'
import { runWithBridgeAgentId, query } from '../../utils/db'
import { restoreStockForCanceledPayment } from '../../utils/conceptos-stock'

const getCancellationRequestsTable = async () => {
  const candidates = ['solicitudescancelaciones', 'solicitudesCancelaciones']

  for (const candidate of candidates) {
    const rows = await query<any[]>(`SHOW TABLES LIKE ?`, [candidate])

    if (rows.length > 0) {
      return candidate
    }
  }

  return 'solicitudescancelaciones'
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const user = event.context.user

  const [pago] = await query<any[]>(
    `SELECT * FROM referenciasdepago WHERE folio = ? LIMIT 1`,
    [Number(body.folio)]
  )

  if (!pago) {
    throw createError({ statusCode: 404, message: 'Pago no encontrado en el sistema.' })
  }

  const status = String(pago.estatus || '').trim().toLowerCase()
  if (status === 'cancelada' || status === 'cancelado') {
    throw createError({ statusCode: 409, message: 'Este pago ya fue cancelado.' })
  }

  const isDepuration = isDepurationAdjustment(pago)
  if (isDepuration && !user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo superadministradores pueden revertir una depuración.' })
  }
  if (isDepuration && String(body.motivo || '').trim().length < 8) {
    throw createError({ statusCode: 400, message: 'La reversión de una depuración requiere motivo.' })
  }

  if (user.isSuperAdmin || body.force_direct) {
    const result: any = await query(
      `UPDATE referenciasdepago
       SET estatus = 'Cancelada', cancelada_por = ?
       WHERE folio = ? AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'vigente'`,
      [user.name, pago.folio]
    )

    if (Number(result?.affectedRows || 0) !== 1) {
      throw createError({ statusCode: 409, message: 'El pago cambió de estado antes de completar la cancelación.' })
    }

    let stock: any = { restored: false }
    try {
      stock = await restoreStockForCanceledPayment(pago, user)
    } catch (error: any) {
      console.error('[Conceptos Stock] Pago cancelado, pero no se pudo restaurar stock:', error)
      stock = { restored: false, error: error?.message || 'No se pudo restaurar stock.' }
    }

    if (isDepuration) {
      const notification = await notifyDocumentAmountCorrection(
        `*Depuración revertida* · ${user.name || user.email}\nFolio: ${pago.folio} · Documento: ${pago.documento} · Mes: ${pago.mes}\nMonto: ${Number(pago.monto || 0).toFixed(2)} · Motivo: ${String(body.motivo || '').trim().slice(0, 400)}`
      )
      if (!notification.delivered) console.error('[Depuracion] Reversal Telegram failed', { folio: pago.folio, notification })
    }
    return { success: true, status: 'canceled', folio: pago.folio, stock }
  }

  const cancellationRequestsTable = await getCancellationRequestsTable()

  await query(
    `
      INSERT INTO ${cancellationRequestsTable} (
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
}))
