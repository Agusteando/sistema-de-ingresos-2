import { query } from './db'
import { parsePaymentRowReference, validPaymentAttemptId } from './payment-attempt-id.mjs'

export type PaymentAttemptRow = {
  folio: number
  referencia: string
  matricula: string
  estatus: string
  stock_movement_id?: number | null
}

// Read actual committed rows, never inferred matches based on time, amount or operator.
export const readPaymentAttempt = async (id: string, matricula: string, expectedDigest?: string) => {
  const reference = validPaymentAttemptId(id)
  if (!reference) return { status: 'missing' as const, folios: [] as number[], rows: [] as PaymentAttemptRow[] }
  const rows = await query<PaymentAttemptRow[]>(`
    SELECT folio, referencia, matricula, estatus, stock_movement_id
    FROM referenciasdepago
    WHERE referencia LIKE ?
    ORDER BY folio ASC
  `, [`${reference}:%`])
  if (!rows.length) return { status: 'missing' as const, folios: [] as number[], rows: [] as PaymentAttemptRow[] }

  const parsed = rows.map(row => parsePaymentRowReference(row.referencia, reference))
  const digest = parsed[0]?.digest
  const indices = parsed.map(row => row?.index)
  if (!digest || (expectedDigest && expectedDigest !== digest) ||
      rows.some(row => String(row.matricula) !== String(matricula)) ||
      parsed.some(row => !row || row.digest !== digest) ||
      new Set(indices).size !== indices.length ||
      indices.some((index, position) => index !== position)) {
    return { status: 'conflict' as const, folios: [] as number[], rows: [] as PaymentAttemptRow[] }
  }
  if (rows.some(row => String(row.estatus).toLowerCase() !== 'vigente')) {
    return { status: 'cancelled' as const, folios: [] as number[], rows: [] as PaymentAttemptRow[] }
  }
  return { status: 'confirmed' as const, folios: rows.map(row => Number(row.folio)), rows }
}
