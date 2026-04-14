import { query } from '../../../utils/db'
import dayjs from 'dayjs'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const { ciclo = '2024', lateFeeActive = 'true' } = getQuery(event)
  
  if (!matricula) throw createError({ statusCode: 400, statusMessage: 'Matrícula requerida' })

  // Get raw documents
  const documentos = await query<any[]>(`
    SELECT d.documento, d.matricula, d.costo, d.meses, d.beca, d.ciclo, c.concepto as conceptoNombre, c.plazo
    FROM documentos d
    LEFT JOIN conceptos c ON d.conceptoId = c.id
    WHERE d.matricula = ? AND d.ciclo = ?
  `, [matricula, ciclo])

  // Get all valid payments for these documents
  const pagosRows = await query<any[]>(`
    SELECT documento, mes, recargo, monto, modificador
    FROM referenciasdepago
    WHERE matricula = ? AND ciclo = ? AND estatus = 'Vigente'
  `, [matricula, ciclo])

  const debts = []
  const today = dayjs()

  // Reverse engineer logic: loop through each document and its configured months
  for (const doc of documentos) {
    const totalDocumentoOriginal = ((100 - parseFloat(doc.beca || '0')) * parseFloat(doc.costo)) / 100
    const plazos = doc.meses || 1

    for (let mes = 1; mes <= plazos; mes++) {
      const pagosDelMes = pagosRows.filter(p => p.documento === doc.documento && p.mes === mes)
      const pagosTotalMes = pagosDelMes.reduce((sum, p) => sum + parseFloat(p.monto), 0)
      const hasRecargoManual = pagosDelMes.some(p => p.recargo === 1)

      let subtotal = totalDocumentoOriginal
      let saldoAntes = subtotal - pagosTotalMes

      // Recargo logic (10% penalty if after 12th of the month and balance > 10)
      // Note: Legacy mapped month 1 to August, 2 to September... 
      // simplified representation matching standard expectations but respecting legacy core logic
      const limitDate = dayjs().year(today.year()).month(mes > 5 ? (mes - 6) : (mes + 6)).date(12)
      const isLate = today.isAfter(limitDate)

      if (lateFeeActive === 'true' && (hasRecargoManual || (isLate && saldoAntes > 10))) {
        subtotal = Math.trunc(totalDocumentoOriginal * 1.1)
        saldoAntes = subtotal - pagosTotalMes
      }

      if (saldoAntes < 0) saldoAntes = 0

      debts.push({
        documento: doc.documento,
        conceptoNombre: doc.conceptoNombre,
        mes,
        mesLabel: `Mes ${mes}`,
        costoOriginal: totalDocumentoOriginal,
        subtotal,
        pagos: pagosTotalMes,
        saldo: saldoAntes,
        beca: doc.beca || 0,
        porcentajePagado: subtotal > 0 ? Math.min(100, (pagosTotalMes * 100) / subtotal).toFixed(1) : 100,
        isLate,
        hasRecargo: subtotal > totalDocumentoOriginal
      })
    }
  }

  return debts
})