import { query } from './db'

const parsePlazos = (plazoRaw: unknown, mesesRaw: unknown) => {
  const raw = String(plazoRaw || mesesRaw || '1').trim()
  if (!raw) return 1
  if (raw.startsWith('[')) {
    try {
      return Math.max(1, JSON.parse(raw).length || 1)
    } catch {
      return 1
    }
  }
  if (raw.includes(',')) return Math.max(1, raw.split(',').filter(Boolean).length)
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

const spanishMonths = [
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  'Enero', 'Febrero', 'Marzo', 'Abril',
  'Mayo', 'Junio', 'Julio', 'Agosto'
]

const isEventual = (doc: any) => String(doc?.eventual || '') === '1'

const getDuePeriods = (doc: any, currentMonth: number) => {
  if (isEventual(doc)) {
    return [{
      mesCargo: 'ev',
      mesCobranza: currentMonth,
      mesLabel: 'Cargo unico',
      paymentKeys: ['ev', '1']
    }]
  }

  const plazos = parsePlazos(doc.plazo, doc.meses)
  const dueUntil = Math.min(plazos, currentMonth)

  return Array.from({ length: dueUntil }, (_, index) => {
    const mes = index + 1
    return {
      mesCargo: String(mes),
      mesCobranza: currentMonth,
      mesLabel: spanishMonths[index] || `Mensualidad ${mes}`,
      paymentKeys: [String(mes)]
    }
  })
}

const stageByDay = (day: number) => {
  if (day <= 12) return { stage: 'sin_gestion', actionToday: null, deudorOficial: false }
  if (day === 13) return { stage: 'seguimiento', actionToday: 'correo_recordatorio', deudorOficial: false }
  if (day === 14) return { stage: 'reporte_actualizado', actionToday: 'reporte_deudores', deudorOficial: false }
  if (day >= 15 && day <= 19) return { stage: 'reporte_actualizado', actionToday: null, deudorOficial: false }
  if (day === 20) return { stage: 'contacto_whatsapp', actionToday: 'whatsapp_contacto', deudorOficial: false }
  if (day >= 21 && day <= 26) return { stage: 'contacto_whatsapp', actionToday: null, deudorOficial: false }
  if (day === 27) return { stage: 'carta_suspension', actionToday: 'carta_suspension', deudorOficial: false }
  return { stage: 'deudor_oficial', actionToday: 'llamada_telefonica', deudorOficial: true }
}

const getCobranzaDateParts = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    day: 'numeric',
    month: 'numeric'
  }).formatToParts(new Date())

  const value = (type: string) => Number(parts.find(part => part.type === type)?.value || 0)
  return {
    day: value('day') || new Date().getDate(),
    month: value('month') || (new Date().getMonth() + 1)
  }
}

export const getDeudoresGlobal = async ({ ciclo, plantel, userEmail }: { ciclo: string, plantel?: string, userEmail?: string }) => {
  const documentos = await query<any[]>(`
    SELECT d.documento, d.matricula, d.costo, d.meses, d.plazo, d.beca, d.conceptoNombre, d.eventual,
      b.nombreCompleto, b.grado, b.grupo, b.plantel, b.correo, b.telefono, b.\`Nombre del padre o tutor\` as padre
    FROM documentos d
    JOIN base b ON b.matricula = d.matricula
    WHERE d.ciclo = ? AND d.estatus = 'Activo' AND b.estatus = 'Activo'
      ${plantel ? ' AND b.plantel = ? ' : ''}
  `, plantel ? [ciclo, plantel] : [ciclo])

  if (!documentos.length) return []

  const docIds = documentos.map(doc => Number(doc.documento))
  const matriculas = [...new Set(documentos.map(doc => String(doc.matricula)))]

  const periodRows = await query<any[]>(`
    SELECT documento, start_mes, end_mes, costo, accion, estatus
    FROM documento_concepto_periodos
    WHERE documento IN (${docIds.map(() => '?').join(',')}) AND estatus = 'Activo'
    ORDER BY documento ASC, start_mes ASC, id ASC
  `, docIds)

  const pagosRows = await query<any[]>(`
    SELECT matricula, documento, mes, monto, estatus
    FROM referenciasdepago
    WHERE ciclo = ?
      AND matricula IN (${matriculas.map(() => '?').join(',')})
      AND estatus IN ('Vigente', 'Pendiente', 'PendienteConciliacion', 'PorConciliar')
  `, [ciclo, ...matriculas])

  const excepciones = await query<any[]>(`
    SELECT matricula, mes, fecha_limite_especial, activa, motivo
    FROM cobranza_excepciones
    WHERE ciclo = ? AND activa = 1 AND matricula IN (${matriculas.map(() => '?').join(',')})
  `, [ciclo, ...matriculas])

  const observaciones = await query<any[]>(`
    SELECT matricula, texto, usuario, fecha
    FROM cobranza_observaciones
    WHERE ciclo = ? AND matricula IN (${matriculas.map(() => '?').join(',')})
    ORDER BY fecha DESC
  `, [ciclo, ...matriculas])

  const eventos = await query<any[]>(`
    SELECT matricula, mes, accion, fecha, usuario
    FROM cobranza_eventos
    WHERE ciclo = ? AND matricula IN (${matriculas.map(() => '?').join(',')})
    ORDER BY fecha DESC
  `, [ciclo, ...matriculas])

  const periodByDoc = new Map<number, any[]>()
  periodRows.forEach((row) => {
    const key = Number(row.documento)
    const list = periodByDoc.get(key) || []
    list.push(row)
    periodByDoc.set(key, list)
  })

  const pagosByKey = new Map<string, any[]>()
  pagosRows.forEach((p) => {
    const key = `${p.matricula}-${p.documento}-${String(p.mes)}`
    const list = pagosByKey.get(key) || []
    list.push(p)
    pagosByKey.set(key, list)
  })

  const excepcionByKey = new Map<string, any[]>()
  excepciones.forEach((e) => {
    const key = `${e.matricula}-${e.mes}`
    const list = excepcionByKey.get(key) || []
    list.push(e)
    excepcionByKey.set(key, list)
  })

  const obsByMatricula = new Map<string, any[]>()
  observaciones.forEach((o) => {
    const list = obsByMatricula.get(o.matricula) || []
    list.push(o)
    obsByMatricula.set(o.matricula, list)
  })

  const eventByKey = new Map<string, any[]>()
  eventos.forEach((evt) => {
    const key = `${evt.matricula}-${evt.mes}`
    const list = eventByKey.get(key) || []
    list.push(evt)
    eventByKey.set(key, list)
  })

  const now = new Date()
  const { month: currentMonth, day } = getCobranzaDateParts()
  const flow = stageByDay(day)

  const bucket = new Map<string, any>()

  documentos.forEach((doc) => {
    const beca = Number.parseFloat(doc.beca || 0)
    const periods = getDuePeriods(doc, currentMonth)

    for (const periodo of periods) {
      const mesCargoNumber = periodo.mesCargo === 'ev' ? 1 : Number(periodo.mesCargo)
      const activePeriod = (periodByDoc.get(Number(doc.documento)) || []).find((period) => {
        const startMes = Number(period.start_mes || 1)
        const endMes = period.end_mes == null ? Number.POSITIVE_INFINITY : Number(period.end_mes)
        return mesCargoNumber >= startMes && mesCargoNumber <= endMes
      })
      if (activePeriod?.accion === 'cancelacion') continue

      const costoBase = activePeriod?.costo != null ? Number.parseFloat(activePeriod.costo) : Number.parseFloat(doc.costo || 0)
      const subtotal = ((100 - beca) * costoBase) / 100

      const pagos = periodo.paymentKeys.flatMap((mesKey) => pagosByKey.get(`${doc.matricula}-${doc.documento}-${mesKey}`) || [])
      const pagosVigentes = pagos.filter(p => String(p.estatus) === 'Vigente')
      const pagosPendientesConciliacion = pagos.filter(p => String(p.estatus) !== 'Vigente')

      const pagado = pagosVigentes.reduce((sum, p) => sum + Number.parseFloat(p.monto || 0), 0)
      const pendienteConciliacion = pagosPendientesConciliacion.reduce((sum, p) => sum + Number.parseFloat(p.monto || 0), 0)
      const saldo = Math.max(0, subtotal - pagado)

      const excepcionMes = (excepcionByKey.get(`${doc.matricula}-${periodo.mesCobranza}`) || []).find((e) => {
        if (!e.fecha_limite_especial) return false
        const limite = new Date(e.fecha_limite_especial)
        return limite >= now
      })

      const key = `${doc.matricula}-${periodo.mesCobranza}`
      const existing = bucket.get(key) || {
        matricula: String(doc.matricula),
        nombreCompleto: doc.nombreCompleto,
        grado: doc.grado,
        grupo: doc.grupo,
        plantel: doc.plantel,
        correo: doc.correo,
        telefono: doc.telefono,
        padre: doc.padre,
        ciclo,
        mes: periodo.mesCobranza,
        saldoPendiente: 0,
        saldoColegiatura: 0,
        saldoConceptos: 0,
        totalCargos: 0,
        totalAntesBeca: 0,
        totalPagado: 0,
        totalPendienteConciliacion: 0,
        desglose: [],
        hasBeca100: false,
        todoCubiertoPorBeca100: false,
        conceptosConBeca100: 0,
        conceptosCobrables: 0,
        pagoPendienteConciliacion: false,
        fechaLimiteEspecialVigente: false,
        excepcion: null,
        accionesRealizadas: [],
        observaciones: obsByMatricula.get(String(doc.matricula)) || []
      }

      existing.saldoPendiente += saldo
      existing.saldoColegiatura += saldo
      existing.saldoConceptos += saldo
      existing.totalCargos += subtotal
      existing.totalAntesBeca += costoBase
      existing.totalPagado += pagado
      existing.totalPendienteConciliacion += pendienteConciliacion
      existing.hasBeca100 = existing.hasBeca100 || beca >= 100
      existing.conceptosConBeca100 += beca >= 100 ? 1 : 0
      existing.conceptosCobrables += subtotal > 0 ? 1 : 0
      existing.pagoPendienteConciliacion = existing.pagoPendienteConciliacion || pagosPendientesConciliacion.length > 0
      if (excepcionMes) {
        existing.fechaLimiteEspecialVigente = true
        existing.excepcion = excepcionMes
      }

      existing.desglose.push({
        documento: doc.documento,
        conceptoNombre: doc.conceptoNombre,
        mesCargo: periodo.mesCargo,
        mesLabel: periodo.mesLabel,
        costoBase,
        beca,
        subtotal,
        pagado,
        pendienteConciliacion,
        saldo
      })

      const evts = eventByKey.get(key) || []
      existing.accionesRealizadas = evts
      existing.ultimoMovimiento = evts[0]?.fecha || existing.observaciones[0]?.fecha || null
      existing.ultimoUsuario = evts[0]?.usuario || userEmail || null

      bucket.set(key, existing)
    }
  })

  return [...bucket.values()].map((row) => {
    row.todoCubiertoPorBeca100 = row.totalAntesBeca > 0 && row.conceptosCobrables === 0 && row.conceptosConBeca100 > 0

    // Orden deterministico: saldo -> beca100 -> conciliacion -> excepcion -> dia.
    const saldoPendiente = Number(row.saldoPendiente || 0)
    const noEsDeudorPorSaldo = saldoPendiente <= 0
    const noEsDeudorPorBeca = row.todoCubiertoPorBeca100
    const noEsDeudorPorConciliacion = !noEsDeudorPorSaldo && row.pagoPendienteConciliacion
    const noEsDeudorPorExcepcion = !noEsDeudorPorSaldo && !noEsDeudorPorConciliacion && row.fechaLimiteEspecialVigente

    const isDeudor = !(noEsDeudorPorSaldo || noEsDeudorPorConciliacion || noEsDeudorPorExcepcion) && day >= 13

    return {
      ...row,
      saldoPendiente: Number(saldoPendiente.toFixed(2)),
      saldoColegiatura: Number(saldoPendiente.toFixed(2)),
      saldoConceptos: Number(saldoPendiente.toFixed(2)),
      estatusFlujo: isDeudor ? flow.stage : 'sin_adeudo',
      accionHoy: isDeudor ? flow.actionToday : null,
      deudorOficial: isDeudor ? flow.deudorOficial : false,
      isDeudor,
      alcance: 'global_conceptos',
      razonesNoDeudor: {
        saldoCero: noEsDeudorPorSaldo,
        beca100: noEsDeudorPorBeca,
        pagoPendienteConciliacion: noEsDeudorPorConciliacion,
        fechaLimiteEspecial: noEsDeudorPorExcepcion
      }
    }
  }).sort((a, b) => b.saldoPendiente - a.saldoPendiente || a.nombreCompleto.localeCompare(b.nombreCompleto, 'es'))
}

export const getDeudoresColeg = getDeudoresGlobal
