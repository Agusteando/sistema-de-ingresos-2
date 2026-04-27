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
    WHERE d.matricula = ? AND d.ciclo = ? AND d.estatus = 'Activo'
  `, [matricula.trim(), cicloKey])

  const pagosRows = await query<any[]>(`
    SELECT folio, documento, mes, recargo, monto, fecha, formaDePago, conceptoNombre, estatus, depurado, depurado_por, depurado_fecha
    FROM referenciasdepago
    WHERE matricula = ? AND ciclo = ? AND estatus = 'Vigente'
  `, [matricula.trim(), cicloKey])

  const periodRows = documentos.length
    ? await query<any[]>(`
        SELECT id, documento, start_mes, end_mes, concepto_id, conceptoNombre, costo, accion, estatus
        FROM documento_concepto_periodos
        WHERE documento IN (${documentos.map(() => '?').join(',')}) AND estatus = 'Activo'
        ORDER BY documento ASC, start_mes ASC, id ASC
      `, documentos.map(doc => doc.documento))
    : []

  const periodsByDocument = new Map<number, any[]>()
  periodRows.forEach((period) => {
    const key = Number(period.documento)
    const list = periodsByDocument.get(key) || []
    list.push(period)
    periodsByDocument.set(key, list)
  })

  const debts = []
  const today = dayjs()

  const spanishMonths = [
    'Septiembre', 'Octubre', 'Noviembre', 'Diciembre', 
    'Enero', 'Febrero', 'Marzo', 'Abril', 
    'Mayo', 'Junio', 'Julio', 'Agosto'
  ]

  for (const doc of documentos) {
    const isEventual = String(doc.eventual) === '1'
    const beca = parseFloat(doc.beca) || 0
    
    let plazos = 1
    const plazoRaw = doc.plazo || doc.meses
    if (plazoRaw) {
      const plazoStr = String(plazoRaw).trim()
      if (plazoStr.startsWith('[')) {
        try { plazos = JSON.parse(plazoStr).length || 1 } catch(e) {}
      } else if (plazoStr.includes(',')) {
        plazos = plazoStr.split(',').filter(Boolean).length || 1
      } else {
        plazos = parseInt(plazoStr) || 1
      }
    }

    for (let mes = 1; mes <= plazos; mes++) {
      const mesStr = isEventual ? 'ev' : String(mes)
      const mesNumber = isEventual ? 1 : mes
      const activePeriod = (periodsByDocument.get(Number(doc.documento)) || []).find((period) => {
        const startMes = Number(period.start_mes || 1)
        const endMes = period.end_mes == null ? Number.POSITIVE_INFINITY : Number(period.end_mes)
        return mesNumber >= startMes && mesNumber <= endMes
      })

      if (activePeriod?.accion === 'cancelacion') continue

      const conceptoNombre = activePeriod?.conceptoNombre || doc.conceptoNombre
      const costoBase = activePeriod?.costo != null ? parseFloat(activePeriod.costo) : (parseFloat(doc.costo) || 0)
      const totalOriginal = ((100 - beca) * costoBase) / 100
      
      // Support matching mes by strict string, or fallback to the numeric representation
      const pagosDelMes = pagosRows.filter(p => 
        String(p.documento) === String(doc.documento) && 
        (String(p.mes) === mesStr || String(p.mes) === String(mes))
      )
      
      const pagosTotalMes = pagosDelMes.reduce((sum, p) => sum + parseFloat(p.monto), 0)
      const depuradoTotalMes = pagosDelMes
        .filter(p => String(p.depurado) === '1' || p.depurado === true)
        .reduce((sum, p) => sum + parseFloat(p.monto), 0)
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
        conceptoNombre,
        mes: mesStr, // Pass the parsed mes value ('ev' or numeric string) for reliable future binding
        mesLabel,
        costoOriginal: totalOriginal,
        subtotal,
        pagos: pagosTotalMes,
        pagosDepurados: depuradoTotalMes,
        saldo: saldoAntes,
        beca,
        porcentajePagado: subtotal > 0 ? Math.min(100, (pagosTotalMes * 100) / subtotal).toFixed(1) : 100,
        porcentajeDepurado: pagosTotalMes > 0 ? Math.min(100, (depuradoTotalMes * 100) / pagosTotalMes).toFixed(1) : 0,
        isLate,
        hasRecargo: subtotal > totalOriginal,
        historialPagos: pagosDelMes.map(p => ({
          ...p,
          depurado: String(p.depurado) === '1' || p.depurado === true
        }))
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
