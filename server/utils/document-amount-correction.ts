import { query } from './db'
import { parseDocumentMonths, schoolMonthLabel } from '../../shared/utils/documentMonths'
import { legacyProjectedAmount, resolveProjectedAmount } from './monto-final'
import { amountToCents, centsToAmount, paymentFloorCents } from '../../shared/utils/documentAmountCorrection'
import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { getDocumentoPeriodoSchema } from './documento-periods'

const active = (value: unknown) => String(value || '').trim().toLowerCase() === 'activo'
const monthOf = (value: unknown) => String(value ?? '').trim().toLowerCase() === 'ev' ? 1 : Number.parseInt(String(value), 10)
const moneyCents = (value: unknown) => amountToCents(Number(value || 0).toFixed(2)) || 0

export const readDocumentAmountCorrection = async (documento: number, requestedCycle?: unknown) => {
  const [doc] = await query<any[]>(`
    SELECT documento, matricula, conceptoNombre, concepto, costo, montoFinal, ciclo,
           plazo, meses, eventual, estatus, beca, becaNombre, becaTipos, becaMotivo,
           becaMonto, becaPorcentaje
      FROM documentos
     WHERE documento = ?
     LIMIT 1
  `, [documento])
  if (!doc) throw createError({ statusCode: 404, message: 'Documento no encontrado.' })
  if (!active(doc.estatus)) throw createError({ statusCode: 409, message: 'El documento ya no está activo.' })
  if (requestedCycle && normalizeCicloKey(doc.ciclo) !== normalizeCicloKey(requestedCycle)) {
    throw createError({ statusCode: 409, message: 'El documento pertenece a otro ciclo. Actualiza el estado de cuenta.' })
  }

  const isEventual = ['1', 'true', 'si', 'sí', 'yes'].includes(String(doc.eventual ?? '').trim().toLowerCase())
  const applicableMonths = isEventual ? [1] : parseDocumentMonths(doc.plazo, doc.meses)
  if (!applicableMonths.length) {
    throw createError({ statusCode: 409, message: 'El documento no tiene meses válidos para corregir.' })
  }
  const periodSchema = await getDocumentoPeriodoSchema()
  const [periods, payments] = await Promise.all([
    query<any[]>(`
      SELECT id, start_mes, end_mes, concepto_id, conceptoNombre, accion, costo, montoFinal, ${periodSchema.hasDiferenciaMonto ? 'diferencia_monto' : '0 AS diferencia_monto'}
        FROM documento_concepto_periodos
       WHERE documento = ? AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'activo'
       ORDER BY start_mes DESC, id DESC
    `, [documento]),
    query<any[]>(`
      SELECT mes, monto, folio
        FROM referenciasdepago
       WHERE documento = ? AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'vigente'
       ORDER BY folio ASC
    `, [documento])
  ])

  const paidByMonth = new Map<number, number>()
  for (const payment of payments) {
    const month = monthOf(payment?.mes)
    if (!Number.isFinite(month) || month <= 0) continue
    paidByMonth.set(month, (paidByMonth.get(month) || 0) + moneyCents(payment?.monto))
  }

  const months = applicableMonths.flatMap((mes: number) => {
    const period = periods.find((item: any) => mes >= Number(item.start_mes || 1)
      && (item.end_mes == null || mes <= Number(item.end_mes)))
    if (String(period?.accion || '').trim().toLowerCase() === 'cancelacion') return []
    const amount = resolveProjectedAmount(doc, period)
    const paidCents = paidByMonth.get(mes) || 0
    const editable = !period || String(period.accion || '').trim().toLowerCase() !== 'cambio'
    return [{
      editable,
      mes,
      label: isEventual ? 'Cargo único' : schoolMonthLabel(mes),
      periodId: Number(period?.id || 0) || null,
      conceptoNombre: String(period?.conceptoNombre || doc.conceptoNombre || ''),
      currentAmount: centsToAmount(moneyCents(amount.amount)),
      paid: centsToAmount(paidCents),
      paidCents,
      // Concept-transition differences stay intact; the change only corrects the base amount.
      difference: centsToAmount(moneyCents(period?.diferencia_monto || 0)),
    }]
  })
  if (!months.length) throw createError({ statusCode: 409, message: 'Este documento no tiene cargos activos.' })
  // Existing cambio periods have their own montoFinal: this operation only edits
  // documentos.montoFinal, never overrides a deliberate later concept change.
  const editableMonths = months.filter(month => month.editable)
  const activeChangePeriods = periods.filter((row: any) => String(row?.accion || '').toLowerCase() === 'cambio')
  const previousDocumentAmount = doc.montoFinal == null
    ? legacyProjectedAmount(doc.costo, doc.beca)
    : Number(doc.montoFinal)
  return {
    documento: Number(doc.documento),
    matricula: String(doc.matricula || ''),
    ciclo: normalizeCicloKey(doc.ciclo),
    conceptoNombre: String(doc.conceptoNombre || ''),
    isEventual,
    recurring: !isEventual && months.length > 1,
    originalStoredAmount: doc.montoFinal == null ? null : centsToAmount(moneyCents(doc.montoFinal)),
    montoAnterior: centsToAmount(moneyCents(previousDocumentAmount)),
    minimumAllowed: centsToAmount(paymentFloorCents(editableMonths)),
    changeable: editableMonths.length > 0,
    excludedMonths: months.length - editableMonths.length,
    months,
    totalPaid: centsToAmount(editableMonths.reduce((sum: number, month: any) => sum + month.paidCents, 0)),
    affectedMonths: editableMonths.length,
    activeChangePeriods: activeChangePeriods.map((row: any) => ({
      id: row.id, start_mes: row.start_mes, end_mes: row.end_mes,
      concepto_id: row.concepto_id, conceptoNombre: row.conceptoNombre,
      costo: row.costo, montoFinal: row.montoFinal,
    })),
    previousScholarship: {
      beca: doc.beca,
      becaMonto: doc.becaMonto,
      becaPorcentaje: doc.becaPorcentaje,
    },
  }
}
