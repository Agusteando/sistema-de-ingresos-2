import { PLANTELES_LIST } from '../../utils/constants'
import { normalizeCicloKey, formatCicloLabel } from '../../shared/utils/ciclo'
import { resolveProjectedAmount } from './monto-final'
import { resolvePaymentConceptSnapshot } from './payment-concept'
import {
  checkBridgeAgentAvailability,
  getDbTransport,
  query,
  runRawSqlStatement,
  runWithBridgeAgentId
} from './db'
import {
  findTallerServicioForConcept,
  readCentralMatriculaServicios,
  resolveServiciosWithCatalog
} from './talleres-servicios'

const MONTH_LABELS = [
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto'
]

const text = (value: unknown, maxLength = 500) => String(value ?? '').trim().slice(0, maxLength)
const upper = (value: unknown, maxLength = 64) => text(value, maxLength).toUpperCase()
const money = (value: unknown) => Number(Number(value || 0).toFixed(2))

const cicloQueryValues = (cicloKey: string) => {
  const key = text(cicloKey, 20)
  const numeric = Number(key)
  return Array.from(new Set([
    key,
    Number.isFinite(numeric) ? `${key}-${numeric + 1}` : ''
  ].filter(Boolean)))
}

const cicloInClause = (values: string[]) => values.map(() => '?').join(',')

const currentMexicoDate = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(new Date())
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value || 0)
  const now = new Date()
  const year = value('year') || now.getFullYear()
  const month = value('month') || (now.getMonth() + 1)
  const day = value('day') || now.getDate()
  return { year, month, day, key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
}

const getSchoolMonthForCycle = (date: ReturnType<typeof currentMexicoDate>, cycleStartYear: number) => {
  if (date.year < cycleStartYear || (date.year === cycleStartYear && date.month < 9)) return 0
  if (date.year === cycleStartYear && date.month >= 9) return date.month - 8
  if (date.year === cycleStartYear + 1 && date.month <= 8) return date.month + 4
  return 12
}

const periodDeadline = (cycleStartYear: number, schoolMonth: number) => {
  const normalized = Math.min(12, Math.max(1, schoolMonth))
  const calendarYear = normalized <= 4 ? cycleStartYear : cycleStartYear + 1
  const calendarMonth = normalized <= 4 ? normalized + 8 : normalized - 4
  return `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-12`
}

const normalizeDateKey = (value: unknown) => {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const raw = String(value).trim()
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!match) return ''
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

const parsePlazos = (plazoRaw: unknown, mesesRaw: unknown) => {
  const raw = text(plazoRaw || mesesRaw || '1', 500)
  if (!raw) return 1
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      return Math.max(1, Array.isArray(parsed) ? parsed.length : 1)
    } catch {
      return 1
    }
  }
  if (raw.includes(',')) return Math.max(1, raw.split(',').filter(Boolean).length)
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

const expectedPeriodsForDocument = (doc: any, currentSchoolMonth: number, cycleStartYear: number) => {
  if (String(doc?.eventual || '') === '1') {
    const month = Math.max(1, currentSchoolMonth || 1)
    return [{
      key: 'ev',
      number: 1,
      label: 'Cargo único',
      dueDate: periodDeadline(cycleStartYear, month),
      paymentKeys: ['ev', '1']
    }]
  }

  const plazos = Math.min(12, Math.max(1, parsePlazos(doc?.plazo, doc?.meses)))
  return Array.from({ length: plazos }, (_, index) => {
    const number = index + 1
    return {
      key: String(number),
      number,
      label: MONTH_LABELS[index] || `Mensualidad ${number}`,
      dueDate: periodDeadline(cycleStartYear, number),
      paymentKeys: [String(number)]
    }
  })
}

const configuredAgents = () => {
  const configured = text(process.env.HUSKY_PASS_BRIDGE_AGENT_IDS || process.env.DEUDORES_BRIDGE_AGENT_IDS, 500)
    .split(',')
    .map(value => upper(value, 40))
    .filter(Boolean)
  const fallback = configured.length ? configured : PLANTELES_LIST
  return Array.from(new Set(fallback.map(value => upper(value, 40)).filter(Boolean)))
}

const orderAgentsForMatricula = (matricula: string) => {
  const agents = configuredAgents()
  const preferred = agents
    .filter(agent => matricula.startsWith(agent))
    .sort((left, right) => right.length - left.length)
  const rest = agents.filter(agent => !preferred.includes(agent))
  return [...preferred, ...rest]
}

const findStudentInAgent = async (agentId: string, matricula: string) => {
  try {
    return await runWithBridgeAgentId(agentId, async () => {
      const rows = await runRawSqlStatement<any[]>(`
        SELECT matricula, nombreCompleto, nivel, grado, grupo, plantel, ciclo, estatus
        FROM base
        WHERE UPPER(TRIM(matricula)) = ?
        LIMIT 1
      `, [matricula])
      return rows[0] || null
    })
  } catch {
    return null
  }
}

const resolveBridgeSource = async (matricula: string) => {
  const agents = orderAgentsForMatricula(matricula)
  for (const agentId of agents) {
    const availability = await checkBridgeAgentAvailability(agentId, { timeoutMs: 1200 })
    if (!availability.online) continue
    const student = await findStudentInAgent(agentId, matricula)
    if (student) return { type: 'bridge' as const, agentId, student }
  }

  throw createError({
    statusCode: 503,
    statusMessage: 'FUENTE_FINANCIERA_NO_DISPONIBLE',
    message: 'La fuente financiera de Aurora no está disponible para esta matrícula.',
    data: { code: 'FUENTE_FINANCIERA_NO_DISPONIBLE' }
  })
}

const getActivePeriod = (periods: any[], documentId: number, mesNumber: number) => {
  return periods.find((period) => {
    if (Number(period.documento) !== documentId) return false
    const start = Number(period.start_mes || 1)
    const end = period.end_mes == null ? Number.POSITIVE_INFINITY : Number(period.end_mes)
    return mesNumber >= start && mesNumber <= end
  }) || null
}

const conceptSnapshot = (doc: any, period: any) => {
  try {
    return resolvePaymentConceptSnapshot(doc, period)
  } catch {
    return {
      concepto: text(period?.concepto_id || doc?.concepto, 40),
      conceptoNombre: text(period?.conceptoNombre || doc?.conceptoNombre || 'Concepto escolar', 160)
    }
  }
}

const readMappedService = async (conceptoId: unknown, ciclo: string, plantel: unknown) => {
  try {
    return await findTallerServicioForConcept({ conceptoId, ciclo, plantel })
  } catch {
    return null
  }
}

const readCentralServices = async (matricula: string) => {
  try {
    const current = await readCentralMatriculaServicios(matricula)
    const resolved = await resolveServiciosWithCatalog(current.servicios)
    return resolved.servicios.map((servicio) => ({
      clave: servicio.clave,
      nombre: servicio.nombre,
      imagen: servicio.imagen,
      estado: 'activo' as const,
      source: servicio.source
    }))
  } catch {
    return []
  }
}

const serviceRank = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'pagado') return 3
  if (normalized === 'pendiente') return 2
  return 1
}

const uniqueServices = (services: any[]) => {
  const byKey = new Map<string, any>()
  for (const service of services) {
    const key = upper(service?.clave || service?.nombre, 80)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing || serviceRank(service.estado) > serviceRank(existing.estado)) byKey.set(key, service)
  }
  return Array.from(byKey.values()).sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
}

const readAccountInCurrentSource = async ({ matricula, ciclo, source }: { matricula: string, ciclo: string, source: any }) => {
  const [student] = await query<any[]>(`
    SELECT matricula, nombreCompleto, nivel, grado, grupo, plantel, ciclo, estatus
    FROM base
    WHERE UPPER(TRIM(matricula)) = ?
    LIMIT 1
  `, [matricula])

  if (!student) {
    throw createError({
      statusCode: 404,
      statusMessage: 'MATRICULA_NO_ENCONTRADA',
      message: 'No se encontró la matrícula solicitada.',
      data: { code: 'MATRICULA_NO_ENCONTRADA', matricula }
    })
  }

  const cicloValues = cicloQueryValues(ciclo)
  const docs = await query<any[]>(`
    SELECT documento, matricula, costo, montoFinal, meses, plazo, beca, concepto, conceptoNombre, eventual, ciclo, estatus
    FROM documentos
    WHERE CAST(ciclo AS CHAR) IN (${cicloInClause(cicloValues)})
      AND UPPER(TRIM(CAST(matricula AS CHAR))) = ?
      AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'activo'
    ORDER BY documento ASC
  `, [...cicloValues, matricula])
  const docIds = docs.map(doc => Number(doc.documento)).filter(Boolean)

  const periods = docIds.length
    ? await query<any[]>(`
      SELECT id, documento, start_mes, end_mes, concepto_id, conceptoNombre, costo, montoFinal, accion, estatus
      FROM documento_concepto_periodos
      WHERE documento IN (${docIds.map(() => '?').join(',')}) AND estatus = 'Activo'
      ORDER BY documento ASC, start_mes DESC, id DESC
    `, docIds)
    : []

  const payments = await query<any[]>(`
    SELECT folio, folio_plantel, documento, mes, mesReal, concepto, conceptoNombre, monto, importeTotal,
           saldoAntes, saldoDespues, pagos, pagosDespues, fecha, formaDePago, estatus, depurado,
           pago_otro_plantel, plantel_pago, ciclo
    FROM referenciasdepago
    WHERE CAST(ciclo AS CHAR) IN (${cicloInClause(cicloValues)})
      AND UPPER(TRIM(CAST(matricula AS CHAR))) = ?
      AND estatus IN ('Vigente', 'Pendiente', 'PendienteConciliacion', 'PorConciliar')
    ORDER BY fecha DESC, folio DESC
    LIMIT 240
  `, [...cicloValues, matricula])

  const paymentsByDocumentPeriod = new Map<string, any[]>()
  for (const payment of payments) {
    const key = `${Number(payment.documento || 0)}:${String(payment.mes || '').trim().toLowerCase()}`
    const list = paymentsByDocumentPeriod.get(key) || []
    list.push(payment)
    paymentsByDocumentPeriod.set(key, list)
  }

  const date = currentMexicoDate()
  const cycleStartYear = Number(ciclo) || date.year
  const currentSchoolMonth = getSchoolMonthForCycle(date, cycleStartYear)
  const conceptos: any[] = []
  const mappedServices: any[] = []

  for (const doc of docs) {
    const documentId = Number(doc.documento)
    for (const expected of expectedPeriodsForDocument(doc, currentSchoolMonth, cycleStartYear)) {
      const period = getActivePeriod(periods, documentId, expected.number)
      if (period?.accion === 'cancelacion') continue

      const snapshot = conceptSnapshot(doc, period)
      const projected = resolveProjectedAmount({ ...doc, concepto: snapshot.concepto, conceptoNombre: snapshot.conceptoNombre }, period)
      const paymentRows = expected.paymentKeys.flatMap(key => paymentsByDocumentPeriod.get(`${documentId}:${key}`) || [])
      const paidRows = paymentRows.filter(row => String(row.estatus) === 'Vigente')
      const pendingRows = paymentRows.filter(row => String(row.estatus) !== 'Vigente')
      const paid = money(paidRows.reduce((sum, row) => sum + Number(row.monto || 0), 0))
      const pendingConciliation = money(pendingRows.reduce((sum, row) => sum + Number(row.monto || 0), 0))
      const total = money(projected.amount)
      const balance = money(Math.max(0, total - paid))
      const paidAt = paidRows.map(row => normalizeDateKey(row.fecha)).filter(Boolean).sort().at(-1) || null
      const mapped = await readMappedService(snapshot.concepto, ciclo, student.plantel)
      const status = balance <= 0
        ? 'paid'
        : expected.dueDate < date.key
          ? 'overdue'
          : 'pending'

      if (mapped && status === 'paid') {
        mappedServices.push({ ...mapped, estado: 'pagado', paidAt, documento: documentId, folios: paidRows.map(row => Number(row.folio)).filter(Boolean) })
      } else if (mapped) {
        mappedServices.push({ ...mapped, estado: balance > 0 ? 'pendiente' : 'activo', documento: documentId })
      }

      conceptos.push({
        id: `${documentId}-${expected.key}`,
        documento: documentId,
        concepto: text(snapshot.concepto, 40) || null,
        conceptoNombre: text(snapshot.conceptoNombre, 160) || 'Concepto escolar',
        titulo: text(snapshot.conceptoNombre, 160) || 'Concepto escolar',
        descripcion: mapped ? mapped.nombre : (String(doc.eventual) === '1' ? 'Cargo único' : 'Colegiatura y servicios escolares'),
        categoria: mapped ? 'taller_servicio' : (String(doc.eventual) === '1' ? 'servicio' : 'colegiatura'),
        mes: expected.key,
        periodo: expected.label,
        fechaLimite: expected.dueDate,
        estatus: status,
        monto: total,
        pagado: paid,
        saldo: balance,
        pendienteConciliacion,
        pagadoEn: paidAt,
        recibos: paidRows.map(row => Number(row.folio)).filter(Boolean),
        servicio: mapped
      })
    }
  }

  const recibos = payments
    .filter(row => String(row.estatus) === 'Vigente')
    .map(row => ({
      folio: Number(row.folio),
      folioPlantel: row.folio_plantel ? text(row.folio_plantel, 80) : null,
      documento: Number(row.documento || 0) || null,
      conceptoNombre: text(row.conceptoNombre, 160) || 'Pago registrado',
      periodo: text(row.mesReal || row.mes, 80) || null,
      monto: money(row.monto),
      importeTotal: money(row.importeTotal || row.monto),
      fecha: normalizeDateKey(row.fecha) || null,
      formaDePago: text(row.formaDePago, 80) || null,
      saldoAntes: money(row.saldoAntes),
      saldoDespues: money(row.saldoDespues),
      otroPlantel: Number(row.pago_otro_plantel || 0) === 1,
      plantelPago: row.plantel_pago ? text(row.plantel_pago, 40) : null
    }))

  const centralServices = await readCentralServices(matricula)
  const servicios = uniqueServices([...mappedServices, ...centralServices])
  const balanceDue = money(conceptos.reduce((sum, item) => sum + Number(item.saldo || 0), 0))
  const overdueBalance = money(conceptos.filter(item => item.estatus === 'overdue').reduce((sum, item) => sum + Number(item.saldo || 0), 0))
  const pendingConciliation = money(conceptos.reduce((sum, item) => sum + Number(item.pendienteConciliacion || 0), 0))
  const paidThisCycle = money(recibos.reduce((sum, row) => sum + Number(row.monto || 0), 0))
  const totalCharges = money(conceptos.reduce((sum, item) => sum + Number(item.monto || 0), 0))

  return {
    ok: true,
    matricula,
    ciclo: {
      clave: ciclo,
      nombre: formatCicloLabel(ciclo)
    },
    alumno: {
      nombre: text(student.nombreCompleto, 180) || null,
      plantel: text(student.plantel, 40) || null,
      nivel: text(student.nivel, 80) || null,
      grado: text(student.grado, 80) || null,
      grupo: text(student.grupo, 80) || null,
      activo: upper(student.estatus, 40) === 'ACTIVO'
    },
    saldos: {
      moneda: 'MXN',
      totalCargos: totalCharges,
      pendiente: balanceDue,
      vencido: overdueBalance,
      pagadoCiclo: paidThisCycle,
      pendienteConciliacion
    },
    conteos: {
      pendientes: conceptos.filter(item => item.estatus === 'pending').length,
      vencidos: conceptos.filter(item => item.estatus === 'overdue').length,
      pagados: conceptos.filter(item => item.estatus === 'paid').length,
      recibos: recibos.length,
      servicios: servicios.length
    },
    conceptos,
    recibos,
    servicios,
    consultadoEn: new Date().toISOString(),
    fuente: source
  }
}

export const readExternalHuskyPassAccount = async (queryParams: Record<string, any>) => {
  const matricula = upper(queryParams.matricula)
  if (!matricula) {
    throw createError({
      statusCode: 400,
      statusMessage: 'MATRICULA_REQUERIDA',
      message: 'La matrícula es requerida.',
      data: { code: 'MATRICULA_REQUERIDA' }
    })
  }

  const ciclo = normalizeCicloKey(queryParams.ciclo)

  if (getDbTransport() === 'direct') {
    return await readAccountInCurrentSource({ matricula, ciclo, source: { tipo: 'direct' } })
  }

  const source = await resolveBridgeSource(matricula)
  return await runWithBridgeAgentId(source.agentId, async () => await readAccountInCurrentSource({
    matricula,
    ciclo,
    source: { tipo: source.type, agentId: source.agentId }
  }))
}
