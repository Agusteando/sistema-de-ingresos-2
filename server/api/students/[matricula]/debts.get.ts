import { query } from '../../../utils/db'
import dayjs from 'dayjs'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const { ciclo = '2025', lateFeeActive = 'true' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  if (!matricula) throw createError({ statusCode: 400, message: 'Matrícula requerida' })

  const documentos = await query<any[]>(`
    SELECT d.documento, d.matricula, d.costo, d.meses, d.plazo, d.beca, d.ciclo, d.conceptoNombre, d.eventual
    FROM documentos d
    WHERE d.matricula = ? AND d.ciclo = ? AND d.estatus = 'Vigente'
  `, [matricula.trim(), cicloKey])

  const pagosRows = await query<any[]>(`
    SELECT folio, documento, mes, recargo, monto, fecha, formaDePago
    FROM referenciasdepago
    WHERE matricula = ? AND ciclo = ? AND estatus = 'Vigente'
  `, [matricula.trim(), cicloKey])

  const debts = []
  const today = dayjs()

  const spanishMonths = [
    'Septiembre', 'Octubre', 'Noviembre', 'Diciembre', 
    'Enero', 'Febrero', 'Marzo', 'Abril', 
    'Mayo', 'Junio', 'Julio', 'Agosto'
  ]

  for (const doc of documentos) {
    const isEventual = String(doc.eventual) === '1'
    const costoBase = parseFloat(doc.costo) || 0
    const beca = parseFloat(doc.beca) || 0
    const totalOriginal = ((100 - beca) * costoBase) / 100
    
    // Defensively parse plazos to avoid NaN or array string parsing issues
    let plazos = 1;
    if (doc.meses) {
      if (String(doc.meses).startsWith('[')) {
        try { plazos = JSON.parse(doc.meses).length } catch(e){}
      } else {
        plazos = parseInt(doc.meses) || 1
      }
    } else if (doc.plazo && String(doc.plazo).startsWith('[')) {
      try { plazos = JSON.parse(doc.plazo).length } catch(e){}
    }

    for (let mes = 1; mes <= plazos; mes++) {
      const mesStr = isEventual ? 'ev' : String(mes)
      
      // Support matching mes by strict string, or fallback to the numeric representation
      const pagosDelMes = pagosRows.filter(p => 
        String(p.documento) === String(doc.documento) && 
        (String(p.mes) === mesStr || String(p.mes) === String(mes))
      )
      
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

      const mesLabel = isEventual ? 'Cargo Único' : (spanishMonths[mes - 1] || `Mensualidad ${mes}`)

      debts.push({
        documento: doc.documento,
        conceptoNombre: doc.conceptoNombre,
        mes: mesStr, // Pass the parsed mes value ('ev' or numeric string) for reliable future binding
        mesLabel,
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

  console.info('[EstadoCuentaDebug] Estado de Cuenta DB result', {
    matricula: matricula.trim(),
    selectedCicloRaw: ciclo,
    normalizedCicloKey: cicloKey,
    apiQueryCiclo: cicloKey,
    returnedDocumentosCount: documentos.length,
    returnedReferenciasCount: pagosRows.length,
    renderedConceptosCount: debts.length
  })

  return debts
})
