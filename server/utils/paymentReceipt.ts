import { MAX_COMBINED_RECEIPT_PAYMENTS } from '../../shared/constants/paymentReceipt'
import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { calculatePromotedGrado, displayGrado } from '../../shared/utils/grado'
import { query } from './db'


export const resolveReceiptAcademicPlacement = (student: any, receiptCycle: unknown) => {
  if (!student) {
    return { grado: '', nivel: '' }
  }

  const projected = calculatePromotedGrado(
    student.grado,
    student.plantel,
    student.ciclo,
    receiptCycle,
    student.nivel,
  )

  return {
    grado: displayGrado(projected.grado),
    nivel: projected.nivel,
  }
}

export const normalizeReceiptFolios = (value: unknown): number[] => {
  const rawValues = Array.isArray(value)
    ? value.flatMap((folio) => String(folio ?? '').split(','))
    : String(value ?? '').split(',')

  return Array.from(new Set(rawValues
    .map((folio) => Number(folio.trim()))
    .filter((folio) => Number.isInteger(folio) && folio > 0)))
}

export const loadActiveReceiptPayments = async (value: unknown) => {
  const folios = normalizeReceiptFolios(value)

  if (!folios.length) {
    return { folios, items: [] as any[], matricula: '' }
  }
  if (folios.length > MAX_COMBINED_RECEIPT_PAYMENTS) {
    throw createError({
      statusCode: 400,
      message: `Solo se pueden combinar hasta ${MAX_COMBINED_RECEIPT_PAYMENTS} pagos por recibo.`,
    })
  }

  const rows = await query<any[]>(
    `SELECT * FROM referenciasdepago WHERE folio IN (?) AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'vigente'`,
    [folios],
  )

  if (!rows.length) {
    return { folios, items: [] as any[], matricula: '' }
  }

  const returnedFolios = new Set(rows.map((row) => Number(row.folio)))
  if (folios.some((folio) => !returnedFolios.has(folio))) {
    throw createError({
      statusCode: 409,
      message: 'Uno o más pagos seleccionados ya no están vigentes. Actualiza el estado de cuenta y vuelve a seleccionarlos.',
    })
  }

  const matriculas = Array.from(new Set(rows
    .map((row) => String(row.matricula || '').trim())
    .filter(Boolean)))
  if (matriculas.length !== 1) {
    throw createError({
      statusCode: 400,
      message: 'Un recibo combinado solo puede incluir pagos del mismo alumno.',
    })
  }

  const ciclos = Array.from(new Set(rows
    .map((row) => normalizeCicloKey(row.ciclo))
    .filter(Boolean)))
  if (ciclos.length > 1) {
    throw createError({
      statusCode: 400,
      message: 'Un recibo combinado solo puede incluir pagos del mismo ciclo escolar.',
    })
  }

  const rowsByFolio = new Map<number, any>()
  rows.forEach((row) => rowsByFolio.set(Number(row.folio), row))

  return {
    folios,
    items: folios.map((folio) => rowsByFolio.get(folio)).filter(Boolean),
    matricula: matriculas[0],
  }
}