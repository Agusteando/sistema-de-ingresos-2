import { query } from './db'
import { resolveProjectedAmount } from './monto-final'

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

const ACTION_SEQUENCE = [
  { action: 'correo_recordatorio', thresholdDay: 13, label: 'Correo de recordatorio' },
  { action: 'reporte_deudores', thresholdDay: 14, label: 'Corte de deudores' },
  { action: 'whatsapp_contacto', thresholdDay: 20, label: 'Seguimiento por WhatsApp' },
  { action: 'carta_suspension', thresholdDay: 27, label: 'Carta de suspensión' }
]

const END_OF_MONTH_ACTION = { action: 'llamada_telefonica', label: 'Llamada de cierre' }

const isEventual = (doc: any) => String(doc?.eventual || '') === '1'

const getCycleStartYear = (ciclo: string, fallbackYear: number) => {
  const parsed = Number.parseInt(String(ciclo || '').match(/\d{4}/)?.[0] || '', 10)
  return Number.isFinite(parsed) ? parsed : fallbackYear
}

const getSchoolMonthForCycle = ({
  year,
  month,
  cycleStartYear
}: {
  year: number,
  month: number,
  cycleStartYear: number
}) => {
  if (year < cycleStartYear || (year === cycleStartYear && month < 9)) return 0
  if (year === cycleStartYear && month >= 9) return month - 8
  if (year === cycleStartYear + 1 && month <= 8) return month + 4
  return 12
}

const getSchoolPeriodDeadline = (cycleStartYear: number, schoolMonth: number) => {
  const normalized = Math.min(12, Math.max(1, schoolMonth))
  const calendarYear = normalized <= 4 ? cycleStartYear : cycleStartYear + 1
  const calendarMonth = normalized <= 4 ? normalized + 8 : normalized - 4
  return `${calendarYear}-${padDatePart(calendarMonth)}-12`
}

const isPastPaymentDeadline = (deadline: string, currentDateKey: string) => {
  return Boolean(deadline) && deadline < currentDateKey
}

const getDuePeriods = (doc: any, currentSchoolMonth: number, currentDateKey: string, cycleStartYear: number) => {
  if (currentSchoolMonth < 1) return []

  if (isEventual(doc)) {
    const fechaLimitePago = getSchoolPeriodDeadline(cycleStartYear, currentSchoolMonth)
    if (!isPastPaymentDeadline(fechaLimitePago, currentDateKey)) return []

    return [{
      mesCargo: 'ev',
      mesCobranza: currentSchoolMonth,
      mesLabel: 'Cargo único',
      fechaLimitePago,
      paymentKeys: ['ev', '1']
    }]
  }

  const plazos = parsePlazos(doc.plazo, doc.meses)
  const dueUntil = Math.min(plazos, currentSchoolMonth)

  return Array.from({ length: dueUntil }, (_, index) => {
    const mes = index + 1
    const fechaLimitePago = getSchoolPeriodDeadline(cycleStartYear, mes)
    return {
      mesCargo: String(mes),
      mesCobranza: currentSchoolMonth,
      mesLabel: spanishMonths[index] || `Mensualidad ${mes}`,
      fechaLimitePago,
      paymentKeys: [String(mes)]
    }
  }).filter(period => isPastPaymentDeadline(period.fechaLimitePago, currentDateKey))
}

const padDatePart = (value: number) => String(value).padStart(2, '0')

const getLastDayOfMonth = (year: number, month: number) => {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

const getCobranzaDateParts = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    day: 'numeric',
    month: 'numeric'
  }).formatToParts(new Date())

  const value = (type: string) => Number(parts.find(part => part.type === type)?.value || 0)
  const now = new Date()
  const year = value('year') || now.getFullYear()
  const month = value('month') || (now.getMonth() + 1)
  const day = value('day') || now.getDate()
  const lastDay = getLastDayOfMonth(year, month)

  return {
    year,
    month,
    day,
    lastDay,
    currentDateKey: `${year}-${padDatePart(month)}-${padDatePart(day)}`,
    standardPaymentLimit: `${year}-${padDatePart(month)}-12`
  }
}

const normalizeDateKey = (value: unknown) => {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)

  const raw = String(value).trim()
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!match) return ''

  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

const stageByDay = (day: number, lastDay: number) => {
  const isMonthClose = day >= lastDay

  if (day <= 12) {
    return {
      stage: 'periodo_pago',
      stageLabel: 'Periodo de pago',
      actionToday: null,
      deudorOficial: false,
      isMonthClose,
      accionesEsperadas: []
    }
  }

  if (day === 13) {
    return {
      stage: 'recordatorio_correo',
      stageLabel: 'Recordatorio por correo',
      actionToday: 'correo_recordatorio',
      deudorOficial: false,
      isMonthClose,
      accionesEsperadas: ACTION_SEQUENCE.filter(item => item.thresholdDay <= day)
    }
  }

  if (day === 14) {
    return {
      stage: 'corte_deudores',
      stageLabel: 'Corte de deudores',
      actionToday: 'reporte_deudores',
      deudorOficial: false,
      isMonthClose,
      accionesEsperadas: ACTION_SEQUENCE.filter(item => item.thresholdDay <= day)
    }
  }

  if (day >= 15 && day <= 19) {
    return {
      stage: 'corte_deudores',
      stageLabel: 'Corte vigente',
      actionToday: null,
      deudorOficial: false,
      isMonthClose,
      accionesEsperadas: ACTION_SEQUENCE.filter(item => item.thresholdDay <= day)
    }
  }

  if (day === 20) {
    return {
      stage: 'seguimiento_whatsapp',
      stageLabel: 'Seguimiento por WhatsApp',
      actionToday: 'whatsapp_contacto',
      deudorOficial: false,
      isMonthClose,
      accionesEsperadas: ACTION_SEQUENCE.filter(item => item.thresholdDay <= day)
    }
  }

  if (day >= 21 && day <= 26) {
    return {
      stage: 'seguimiento_whatsapp',
      stageLabel: 'Seguimiento activo',
      actionToday: null,
      deudorOficial: false,
      isMonthClose,
      accionesEsperadas: ACTION_SEQUENCE.filter(item => item.thresholdDay <= day)
    }
  }

  if (day === 27) {
    return {
      stage: 'carta_suspension',
      stageLabel: 'Carta de suspensión',
      actionToday: 'carta_suspension',
      deudorOficial: false,
      isMonthClose,
      accionesEsperadas: ACTION_SEQUENCE.filter(item => item.thresholdDay <= day)
    }
  }

  if (isMonthClose) {
    return {
      stage: 'cierre_mes',
      stageLabel: 'Cierre de mes',
      actionToday: 'llamada_telefonica',
      deudorOficial: true,
      isMonthClose,
      accionesEsperadas: [...ACTION_SEQUENCE, END_OF_MONTH_ACTION]
    }
  }

  return {
    stage: 'pre_cierre',
    stageLabel: 'Preparación de cierre',
    actionToday: null,
    deudorOficial: false,
    isMonthClose,
    accionesEsperadas: ACTION_SEQUENCE.filter(item => item.thresholdDay <= day)
  }
}

const money = (value: unknown) => Number(Number(value || 0).toFixed(2))

const shouldExposeBreakdownItem = (item: any) => {
  return Number(item.saldo || 0) > 0 ||
    Number(item.pendienteConciliacion || 0) > 0 ||
    Number(item.beca || 0) >= 100
}

export const getDeudoresGlobal = async ({
  ciclo,
  plantel,
  userEmail,
  includeDesglose = true,
  matricula
}: {
  ciclo: string,
  plantel?: string,
  userEmail?: string,
  includeDesglose?: boolean,
  matricula?: string
}) => {
  let documentos: any[] = []
  const matriculaFiltro = String(matricula || '').trim()

  if (matriculaFiltro) {
    const alumnosActivos = await query<any[]>(`
      SELECT matricula, nombreCompleto, grado, grupo, plantel, correo, telefono, \`Nombre del padre o tutor\` as padre
      FROM base
      WHERE estatus = 'Activo' AND matricula = ? ${plantel ? 'AND plantel = ?' : ''}
    `, plantel ? [matriculaFiltro, plantel] : [matriculaFiltro])

    if (!alumnosActivos.length) return []

    const alumno = alumnosActivos[0]
    const docs = await query<any[]>(`
      SELECT documento, matricula, costo, montoFinal, meses, plazo, beca, conceptoNombre, eventual
      FROM documentos
      WHERE ciclo = ? AND estatus = 'Activo' AND matricula = ?
    `, [ciclo, matriculaFiltro])

    documentos = docs.map(doc => ({ ...doc, ...alumno }))
  } else if (plantel) {
    const alumnosActivos = await query<any[]>(`
      SELECT matricula, nombreCompleto, grado, grupo, plantel, correo, telefono, \`Nombre del padre o tutor\` as padre
      FROM base
      WHERE estatus = 'Activo' AND plantel = ?
    `, [plantel])

    if (!alumnosActivos.length) return []

    const alumnosByMatricula = new Map<string, any>(alumnosActivos.map(alumno => [String(alumno.matricula), alumno]))
    const matriculasPlantel = [...alumnosByMatricula.keys()]
    const docs = await query<any[]>(`
      SELECT documento, matricula, costo, montoFinal, meses, plazo, beca, conceptoNombre, eventual
      FROM documentos
      WHERE ciclo = ? AND estatus = 'Activo' AND matricula IN (${matriculasPlantel.map(() => '?').join(',')})
    `, [ciclo, ...matriculasPlantel])

    documentos = docs
      .map(doc => ({ ...doc, ...alumnosByMatricula.get(String(doc.matricula)) }))
      .filter(doc => doc.nombreCompleto)
  } else {
    const docs = await query<any[]>(`
      SELECT documento, matricula, costo, montoFinal, meses, plazo, beca, conceptoNombre, eventual
      FROM documentos
      WHERE ciclo = ? AND estatus = 'Activo'
    `, [ciclo])

    if (!docs.length) return []

    const matriculasDocs = [...new Set(docs.map(doc => String(doc.matricula)))]
    const alumnosActivos = await query<any[]>(`
      SELECT matricula, nombreCompleto, grado, grupo, plantel, correo, telefono, \`Nombre del padre o tutor\` as padre
      FROM base
      WHERE estatus = 'Activo' AND matricula IN (${matriculasDocs.map(() => '?').join(',')})
    `, matriculasDocs)
    const alumnosByMatricula = new Map<string, any>(alumnosActivos.map(alumno => [String(alumno.matricula), alumno]))

    documentos = docs
      .map(doc => ({ ...doc, ...alumnosByMatricula.get(String(doc.matricula)) }))
      .filter(doc => doc.nombreCompleto)
  }

  if (!documentos.length) return []

  const docIds = documentos.map(doc => Number(doc.documento))
  const matriculas = [...new Set(documentos.map(doc => String(doc.matricula)))]
  const cobranzaDate = getCobranzaDateParts()
  const cycleStartYear = getCycleStartYear(ciclo, cobranzaDate.year)
  const currentSchoolMonth = getSchoolMonthForCycle({
    year: cobranzaDate.year,
    month: cobranzaDate.month,
    cycleStartYear
  })
  const { day, lastDay, currentDateKey, standardPaymentLimit: calendarPaymentLimit } = cobranzaDate
  const standardPaymentLimit = currentSchoolMonth > 0
    ? getSchoolPeriodDeadline(cycleStartYear, currentSchoolMonth)
    : calendarPaymentLimit
  const flow = stageByDay(day, lastDay)
  const paymentMeses = ['ev', ...Array.from({ length: Math.max(0, currentSchoolMonth) }, (_, index) => String(index + 1))]

  const [periodRows, pagosRows, excepciones, observaciones, eventos] = await Promise.all([
    query<any[]>(`
      SELECT documento, start_mes, end_mes, costo, montoFinal, accion, estatus
      FROM documento_concepto_periodos
      WHERE documento IN (${docIds.map(() => '?').join(',')}) AND estatus = 'Activo'
      ORDER BY documento ASC, start_mes ASC, id ASC
    `, docIds),
    query<any[]>(`
      SELECT matricula, documento, mes, monto, estatus
      FROM referenciasdepago
      WHERE ciclo = ?
        AND matricula IN (${matriculas.map(() => '?').join(',')})
        AND documento IN (${docIds.map(() => '?').join(',')})
        AND mes IN (${paymentMeses.map(() => '?').join(',')})
        AND estatus IN ('Vigente', 'Pendiente', 'PendienteConciliacion', 'PorConciliar')
    `, [ciclo, ...matriculas, ...docIds, ...paymentMeses]),
    query<any[]>(`
      SELECT matricula, mes, fecha_limite_especial, activa, motivo
      FROM cobranza_excepciones
      WHERE ciclo = ? AND activa = 1 AND matricula IN (${matriculas.map(() => '?').join(',')})
    `, [ciclo, ...matriculas]),
    query<any[]>(`
      SELECT matricula, texto, usuario, fecha
      FROM cobranza_observaciones
      WHERE ciclo = ? AND matricula IN (${matriculas.map(() => '?').join(',')})
      ORDER BY fecha DESC
    `, [ciclo, ...matriculas]),
    query<any[]>(`
      SELECT matricula, mes, accion, fecha, usuario
      FROM cobranza_eventos
      WHERE ciclo = ? AND matricula IN (${matriculas.map(() => '?').join(',')})
      ORDER BY fecha DESC
    `, [ciclo, ...matriculas])
  ])

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

  const bucket = new Map<string, any>()

  documentos.forEach((doc) => {
    const beca = Number.parseFloat(doc.beca || 0)
    const periods = getDuePeriods(doc, currentSchoolMonth, currentDateKey, cycleStartYear)

    for (const periodo of periods) {
      const mesCargoNumber = periodo.mesCargo === 'ev' ? 1 : Number(periodo.mesCargo)
      const activePeriod = (periodByDoc.get(Number(doc.documento)) || []).find((period) => {
        const startMes = Number(period.start_mes || 1)
        const endMes = period.end_mes == null ? Number.POSITIVE_INFINITY : Number(period.end_mes)
        return mesCargoNumber >= startMes && mesCargoNumber <= endMes
      })
      if (activePeriod?.accion === 'cancelacion') continue

      const projected = resolveProjectedAmount(doc, activePeriod)
      const costoBase = projected.baseCost
      const subtotal = projected.amount

      const pagos = periodo.paymentKeys.flatMap((mesKey) => pagosByKey.get(`${doc.matricula}-${doc.documento}-${mesKey}`) || [])
      const pagosVigentes = pagos.filter(p => String(p.estatus) === 'Vigente')
      const pagosPendientesConciliacion = pagos.filter(p => String(p.estatus) !== 'Vigente')

      const pagado = pagosVigentes.reduce((sum, p) => sum + Number.parseFloat(p.monto || 0), 0)
      const pendienteConciliacion = pagosPendientesConciliacion.reduce((sum, p) => sum + Number.parseFloat(p.monto || 0), 0)
      const saldo = Math.max(0, subtotal - pagado)

      const excepcionMes = (excepcionByKey.get(`${doc.matricula}-${periodo.mesCobranza}`) || []).find((e) => {
        const limite = normalizeDateKey(e.fecha_limite_especial)
        return Boolean(limite) && limite >= currentDateKey
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
        fechaLimitePago: periodo.fechaLimitePago || standardPaymentLimit,
        accionesRealizadas: [],
        observaciones: obsByMatricula.get(String(doc.matricula)) || []
      }

      if (!existing.fechaLimiteEspecialVigente && periodo.fechaLimitePago && periodo.fechaLimitePago > normalizeDateKey(existing.fechaLimitePago)) {
        existing.fechaLimitePago = periodo.fechaLimitePago
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
        existing.excepcion = {
          ...excepcionMes,
          fecha_limite_especial: normalizeDateKey(excepcionMes.fecha_limite_especial)
        }
        existing.fechaLimitePago = normalizeDateKey(excepcionMes.fecha_limite_especial) || existing.fechaLimitePago
      }

      if (includeDesglose) {
        existing.desglose.push({
          documento: doc.documento,
          conceptoNombre: doc.conceptoNombre,
          mesCargo: periodo.mesCargo,
          mesLabel: periodo.mesLabel,
          costoBase: money(costoBase),
          beca: money(beca),
          subtotal: money(subtotal),
          pagado: money(pagado),
          pendienteConciliacion: money(pendienteConciliacion),
          saldo: money(saldo)
        })
      }

      const evts = eventByKey.get(key) || []
      existing.accionesRealizadas = evts
      existing.ultimoMovimiento = evts[0]?.fecha || existing.observaciones[0]?.fecha || null
      existing.ultimoUsuario = evts[0]?.usuario || userEmail || null

      bucket.set(key, existing)
    }
  })

  return [...bucket.values()].map((row) => {
    row.todoCubiertoPorBeca100 = row.totalAntesBeca > 0 && row.conceptosCobrables === 0 && row.conceptosConBeca100 > 0

    const saldoPendiente = Number(row.saldoPendiente || 0)
    const noEsDeudorPorSaldo = saldoPendiente <= 0
    const noEsDeudorPorBeca = row.todoCubiertoPorBeca100
    const noEsDeudorPorConciliacion = !noEsDeudorPorSaldo && row.pagoPendienteConciliacion
    const noEsDeudorPorExcepcion = !noEsDeudorPorSaldo && !noEsDeudorPorConciliacion && row.fechaLimiteEspecialVigente
    const isDeudor = !(noEsDeudorPorSaldo || noEsDeudorPorConciliacion || noEsDeudorPorExcepcion)
    const completedActions = new Set((row.accionesRealizadas || []).map((evt: any) => String(evt.accion)))
    const accionesEsperadas = isDeudor ? flow.accionesEsperadas : []
    const accionesPendientes = accionesEsperadas.filter((item: any) => !completedActions.has(item.action))
    const desgloseVisible = includeDesglose ? (row.desglose || []).filter(shouldExposeBreakdownItem) : []
    const estatusFlujoLabel = isDeudor && flow.stage === 'periodo_pago'
      ? 'Adeudo vencido'
      : (isDeudor ? flow.stageLabel : 'Sin adeudo exigible')

    return {
      ...row,
      saldoPendiente: Number(saldoPendiente.toFixed(2)),
      saldoColegiatura: Number(saldoPendiente.toFixed(2)),
      saldoConceptos: Number(saldoPendiente.toFixed(2)),
      totalCargos: money(row.totalCargos),
      totalAntesBeca: money(row.totalAntesBeca),
      totalPagado: money(row.totalPagado),
      totalPendienteConciliacion: money(row.totalPendienteConciliacion),
      desglose: desgloseVisible,
      desgloseCorte: flow.stage === 'corte_deudores' || day >= 14 ? desgloseVisible : [],
      estatusFlujo: isDeudor ? flow.stage : 'sin_adeudo',
      estatusFlujoLabel,
      accionHoy: isDeudor ? flow.actionToday : null,
      deudorOficial: isDeudor ? flow.deudorOficial : false,
      isDeudor,
      corteDeudores: isDeudor && day >= 14,
      cierreProceso: isDeudor && flow.isMonthClose,
      diaCobranza: day,
      mesCobranza: currentSchoolMonth,
      ultimoDiaMes: lastDay,
      fechaCobranza: currentDateKey,
      fechaLimitePago: row.fechaLimitePago,
      fechaLimiteEspecial: row.excepcion?.fecha_limite_especial || null,
      notaFechaLimiteEspecial: row.excepcion?.motivo || '',
      accionesEsperadas,
      accionesPendientes,
      proximaAccion: accionesPendientes[0]?.action || null,
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
