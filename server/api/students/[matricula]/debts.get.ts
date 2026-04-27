import { query } from '../../../utils/db'
import dayjs from 'dayjs'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../../shared/utils/grado'

const normalizePaymentMethod = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const isDepuracionPayment = (payment: any) => (
  normalizePaymentMethod(payment.formaDePago) === 'depuracion' &&
  (String(payment.depurado) === '1' || payment.depurado === true)
)

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const { ciclo = '2025', lateFeeActive = 'true' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  if (!matricula) throw createError({ statusCode: 400, message: 'Matrícula requerida' })

  const [studentRef] = await query<any[]>(
    `SELECT matricula, plantel, grado as gradoBase, ciclo as cicloBase FROM base WHERE matricula = ? LIMIT 1`,
    [matricula.trim()]
  )

  if (!studentRef) return []

  const user = event.context.user
  if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
    if (String(studentRef.plantel || '') !== String(user.active_plantel || '')) return []
  }

  if (isOutOfScopeForPlantelCiclo(studentRef.gradoBase, studentRef.plantel, studentRef.cicloBase, cicloKey)) {
    return []
  }

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
      
      const pagosAplicadosDelMes = pagosDelMes.filter(p => !isDepuracionPayment(p))
      const depuracionesDelMes = pagosDelMes.filter(isDepuracionPayment)
      const pagosTotalMes = pagosAplicadosDelMes.reduce((sum, p) => sum + parseFloat(p.monto), 0)
      const depuradoTotalMes = depuracionesDelMes
        .reduce((sum, p) => sum + parseFloat(p.monto), 0)
      const resueltoTotalMes = pagosTotalMes + depuradoTotalMes
      const hasRecargoManual = pagosDelMes.some(p => String(p.recargo) === '1')

      let subtotal = totalOriginal
      let saldoAntes = subtotal - resueltoTotalMes

      const monthOffset = mes > 5 ? (mes - 6) : (mes + 6)
      const limitDate = dayjs().year(today.year()).month(monthOffset).date(12)
      const isLate = today.isAfter(limitDate)

      if (lateFeeActive === 'true' && !isEventual && (hasRecargoManual || (isLate && saldoAntes > 10))) {
        subtotal = Math.trunc(totalOriginal * 1.1)
        saldoAntes = subtotal - resueltoTotalMes
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
        pagosRegistrados: pagosTotalMes,
        resuelto: resueltoTotalMes,
        pagosDepurados: depuradoTotalMes,
        saldo: saldoAntes,
        beca,
        porcentajePagado: subtotal > 0 ? Math.min(100, (resueltoTotalMes * 100) / subtotal).toFixed(1) : 100,
        porcentajePagoReal: subtotal > 0 ? Math.min(100, (pagosTotalMes * 100) / subtotal).toFixed(1) : 100,
        porcentajeDepurado: subtotal > 0 ? Math.min(100, (depuradoTotalMes * 100) / subtotal).toFixed(1) : 0,
        isLate,
        hasRecargo: subtotal > totalOriginal,
        historialPagos: pagosDelMes.map(p => ({
          ...p,
          depurado: isDepuracionPayment(p)
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
