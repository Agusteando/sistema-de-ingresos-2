import { MAX_COMBINED_RECEIPT_PAYMENTS } from '../../shared/constants/paymentReceipt'
import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { calculatePromotedGrado, displayGrado } from '../../shared/utils/grado'
import { query } from './db'
import { hydrateFinancialConceptNames } from './financial-concept'
import { institutionNameForPlantel, normalizePlantelCode } from '../../shared/utils/institution'


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
    .sort((left, right) => left - right)
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

  await hydrateFinancialConceptNames(rows, { ciclo: ciclos[0] || undefined })

  const rowsByFolio = new Map<number, any>()
  rows.forEach((row) => rowsByFolio.set(Number(row.folio), row))

  return {
    folios,
    items: folios.map((folio) => rowsByFolio.get(folio)).filter(Boolean),
    matricula: matriculas[0],
  }
}

const resolveReceiptIssuedAt = (items: any[]) => {
  const validDates = items
    .map((item) => new Date(String(item?.fecha || '')))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())

  return validDates[0] || new Date('2000-01-01T00:00:00.000Z')
}

export const loadPaymentReceiptDocument = async (value: unknown) => {
  const { folios, items, matricula } = await loadActiveReceiptPayments(value)

  if (!items.length) {
    return {
      folios,
      matricula,
      items: [] as any[],
      issuedAt: new Date('2000-01-01T00:00:00.000Z'),
      institutionName: institutionNameForPlantel(''),
      plantel: '',
    }
  }

  const [studentData] = await query<any[]>(
    `SELECT grado, grupo, plantel, nivel, ciclo FROM base WHERE matricula = ? LIMIT 1`,
    [matricula]
  )
  const academicPlacement = resolveReceiptAcademicPlacement(studentData, items[0]?.ciclo)
  const documentPlantel = normalizePlantelCode(items[0]?.plantel || studentData?.plantel)
  const issuedAt = resolveReceiptIssuedAt(items)
  const institutionName = institutionNameForPlantel(documentPlantel)

  const receiptItems = items.map((ref) => ({
    folio: ref.folio,
    folio_plantel: ref.folio_plantel,
    documento: ref.documento,
    monto: Number(ref.monto),
    importeTotal: Number(ref.importeTotal),
    saldoAntes: Number(ref.saldoAntes),
    saldoDespues: Number(ref.saldoDespues),
    pagos: Number(ref.pagos),
    pagosDespues: Number(ref.pagosDespues),
    fecha: ref.fecha,
    formaDePago: ref.formaDePago,
    depurado: Number(ref.depurado || 0) === 1,
    pago_otro_plantel: Number(ref.pago_otro_plantel || 0) === 1,
    plantel_pago: ref.plantel_pago || null,
    plantel: normalizePlantelCode(ref.plantel || documentPlantel),
    conceptoNombre: ref.conceptoNombre,
    mes: ref.mes,
    mesReal: ref.mesReal,
    usuario: ref.usuario,
    usuario_email: ref.usuario_email || null,
    nombreCompleto: ref.nombreCompleto,
    matricula: ref.matricula,
    montoLetra: ref.montoLetra,
    instituto: ref.instituto,
    ciclo: ref.ciclo,
    grado: academicPlacement.grado,
    grupo: studentData?.grupo || '',
    nivel: academicPlacement.nivel,
    documentIssuedAt: issuedAt.toISOString(),
    institutionName,
  }))

  return {
    folios,
    matricula,
    items: receiptItems,
    issuedAt,
    institutionName,
    plantel: documentPlantel,
  }
}
