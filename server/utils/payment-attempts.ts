import { query } from './db'
import { classifyPaymentAttemptRows, validPaymentAttemptId } from './payment-attempt-id.mjs'

export type PaymentAttemptRow = {
  folio: number
  referencia: string
  matricula: string
  estatus: string
  stock_movement_id?: number | null
}

// Read actual committed rows, never inferred matches based on time, amount or operator.
export const readPaymentAttempt = async (id: string, matricula: string, ciclo: string, expectedDigest?: string) => {
  const reference = validPaymentAttemptId(id)
  if (!reference) return { status: 'missing' as const, folios: [] as number[], rows: [] as PaymentAttemptRow[] }
  const rows = await query<PaymentAttemptRow[]>(`
    SELECT folio, referencia, matricula, estatus, stock_movement_id
    FROM referenciasdepago
    WHERE ciclo = ? AND matricula = ? AND referencia LIKE ?
    ORDER BY folio ASC
  `, [ciclo, matricula, `${reference}:%`])
  return classifyPaymentAttemptRows(rows, reference, matricula, expectedDigest)
}
