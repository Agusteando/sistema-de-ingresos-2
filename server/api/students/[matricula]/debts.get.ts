import { query } from '../../../utils/db'
import dayjs from 'dayjs'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const { ciclo = '2024', lateFeeActive = 'true' } = getQuery(event)
  if (!matricula) throw createError({ statusCode: 400, message: 'Matrícula requerida' })

  const documentos = await query<any[]>(`
    SELECT d.documento, d.matricula, d.costo, d.meses, d.beca, d.ciclo, d.conceptoNombre, d.eventual
    FROM documentos d
    WHERE d.matricula = ? AND d.ciclo = ? AND d.estatus = 'Vigente'
  `, [matricula, ciclo])

  const pagosRows = await query<any[]>(`
    SELECT folio, documento, mes, recargo, monto, fecha, formaDePago
    FROM referenciasdepago
    WHERE matricula = ? AND ciclo = ? AND estatus = 'Vigente'
  `, [matricula, ciclo])

  const debts = []
  const today = dayjs()

  for (const doc of documentos) {
    const isEventual = String(doc.eventual) === '1'
    const costoBase = parseFloat(doc.costo) || 0
    const beca = parseFloat(doc.beca) || 0
    const totalOriginal = ((100 - beca) * costoBase) / 100
    const plazos = parseInt(doc.meses) || 1

    for (let mes = 1; mes <= plazos; mes++) {
      const mesStr = String(mes)
      const pagosDelMes = pagosRows.filter(p => String(p.documento) === String(doc.documento) && String(p.mes) === mesStr)
      const pagosTotalMes = pagosDelMes.reduce((sum, p) => sum + parseFloat(p.monto), 0)
      const hasRecargoManual = pagosDelMes.some(p => String(p.recargo) === '1')

      let subtotal = totalOriginal
      let saldoAntes = subtotal - pagosTotalMes

      const monthOffset = mes > 5 ? (mes - 6) : (mes + 6)
      const limitDate = dayjs().year(today.year()).month(monthOffset).date(12)
      const isLate = today.isAfter(limitDate)

      if (lateFeeActive === 'true' && !isEventual && (hasRecargoManual || (isLate && saldoAntes > 10))) {
        subtotal = Math.trunc(totalOriginal * 1.1)
        saldoAntes = subtotal - pagosTotalMes
      }
      if (saldoAntes < 0) saldoAntes = 0

      debts.push({
        documento: doc.documento,
        conceptoNombre: doc.conceptoNombre,
        mes: mesStr,
        mesLabel: isEventual ? 'Cargo Único' : `Mensualidad ${mesStr}`,
        costoOriginal: totalOriginal,
        subtotal,
        pagos: pagosTotalMes,
        saldo: saldoAntes,
        beca,
        porcentajePagado: subtotal > 0 ? Math.min(100, (pagosTotalMes * 100) / subtotal).toFixed(1) : 100,
        isLate,
        hasRecargo: subtotal > totalOriginal,
        historialPagos: pagosDelMes
      })
    }
  }

  return debts
})