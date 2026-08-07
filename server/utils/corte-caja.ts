import { PLANTELES_LIST } from '../../utils/constants'
import { query } from './db'
import { hydrateFinancialConceptNames } from './financial-concept'
import type { AuthSessionUser } from './auth-session'

type CorteCajaFilters = {
  inicio?: unknown
  fin?: unknown
  plantel?: unknown
  ciclo?: unknown
}

type CorteCajaLoadOptions = {
  userKeys?: unknown
}

export type CorteCajaRow = {
  folio: number
  folio_plantel?: string | null
  fecha: Date | string
  fechaPago?: Date | string | null
  matricula: string
  documento: number
  mes: string
  mesReal?: string | null
  nombreCompleto: string
  concepto: string
  conceptoNombre: string
  monto: number | string
  importeTotal?: number | string | null
  saldoAntes?: number | string | null
  saldoDespues?: number | string | null
  pagos?: number | string | null
  pagosDespues?: number | string | null
  montoLetra?: string | null
  montoAplicado: number
  formaDePago: string
  plantel?: string | null
  plantel_pago?: string | null
  instituto?: unknown
  ciclo?: string | null
  estatus?: string | null
  estatusCorte: string
  cancelada_por?: string | null
  depurado?: unknown
  pago_otro_plantel?: unknown
  usuario?: string | null
  usuario_email?: string | null
  scopePlantel?: string | null
}

export type CorteCajaTotal = {
  formaDePago: string
  total: number
}

export type CorteCajaGroupedRow = {
  fecha: string
  formaDePago: string
  categoria: string
  estatus: string
  transacciones: number
  montoRegistrado: number
  total: number
}

export type CorteCajaUserOption = {
  key: string
  nombre: string
  email: string
  label: string
  movimientos: number
  total: number
}

type CorteCajaContext = {
  inicio: string
  fin: string
  scopePlantel: string
  where: string
  params: any[]
}

const normalizeDateFilter = (value: unknown) => {
  const normalized = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

const normalizePlantel = (value: unknown) => String(value || '').trim().toUpperCase()

const toMexicoDateKey = (value: unknown) => {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(value)
    const part = (type: string) => parts.find(item => item.type === type)?.value || ''
    return `${part('year')}-${part('month')}-${part('day')}`
  }
  return String(value).trim().slice(0, 10)
}

const resolveCortePlantel = (user: AuthSessionUser, requestedPlantelValue: unknown) => {
  const activePlantel = normalizePlantel(user.active_plantel)

  if (activePlantel && activePlantel !== 'GLOBAL') {
    if (!PLANTELES_LIST.includes(activePlantel)) {
      throw createError({ statusCode: 400, message: 'El plantel activo no es válido.' })
    }
    return activePlantel
  }

  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para una vista consolidada.' })
  }

  const requestedPlantel = normalizePlantel(requestedPlantelValue)
  if (!requestedPlantel || requestedPlantel === 'GLOBAL' || !PLANTELES_LIST.includes(requestedPlantel)) {
    throw createError({ statusCode: 400, message: 'Seleccione un plantel para generar el corte de caja.' })
  }

  return requestedPlantel
}

// Un pago normal pertenece al plantel del alumno/documento. Si fue registrado como
// pago en otro plantel, el corte debe contabilizarlo donde se recibió físicamente el dinero.
const PAYMENT_PLANTEL_SQL = `CASE
  WHEN COALESCE(r.pago_otro_plantel, 0) = 1
    AND NULLIF(TRIM(r.plantel_pago), '') IS NOT NULL
    THEN UPPER(TRIM(r.plantel_pago))
  ELSE UPPER(COALESCE(
    NULLIF(TRIM(r.plantel), ''),
    NULLIF(TRIM(A.plantel), ''),
    NULLIF(TRIM(r.plantel_pago), '')
  ))
END`

// La bitácora conserva ambas fechas, pero el periodo del corte se determina por la
// fecha efectiva del pago. fecha_original permanece como la fecha de registro inmutable.
const PAYMENT_REGISTERED_AT_SQL = 'COALESCE(r.fecha_original, r.fecha)'
const PAYMENT_EFFECTIVE_AT_SQL = 'r.fecha'

const REGISTERING_USER_KEY_SQL = `CASE
  WHEN NULLIF(TRIM(r.usuario_email), '') IS NOT NULL
    THEN CONCAT('email:', LOWER(TRIM(r.usuario_email)))
  WHEN NULLIF(TRIM(r.usuario), '') IS NOT NULL
    THEN CONCAT('name:', LOWER(TRIM(r.usuario)))
  ELSE 'unknown:'
END`

const CANCELED_STATUS_SQL = `LOWER(TRIM(COALESCE(CAST(r.estatus AS CHAR), ''))) IN (
  'cancelada', 'cancelado', 'cancelled', 'canceled'
)`

const DEPURATION_ADJUSTMENT_SQL = `(
  COALESCE(r.depurado, 0) = 1
  AND LOWER(TRIM(COALESCE(r.formaDePago, ''))) IN ('depuracion', 'depuración')
  AND COALESCE(r.pago_otro_plantel, 0) = 0
)`

const APPLIED_AMOUNT_SQL = `CASE
  WHEN ${CANCELED_STATUS_SQL} THEN 0
  WHEN ${DEPURATION_ADJUSTMENT_SQL} THEN 0
  ELSE COALESCE(r.monto, 0)
END`

export const normalizeCorteUserKeys = (value: unknown): string[] => {
  let source: unknown[] = Array.isArray(value)
    ? value
    : (value === null || value === undefined ? [] : [value])

  if (source.length === 1 && typeof source[0] === 'string' && source[0].trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(source[0])
      if (Array.isArray(parsed)) source = parsed
    } catch {
      source = []
    }
  }

  const keys = source
    .map(item => String(item || '').trim())
    .filter(key => /^(email:|name:|unknown:)/.test(key) && key.length <= 320)

  return Array.from(new Set(keys))
}

const formatUserLabel = (nameValue: unknown, emailValue: unknown) => {
  const nombre = String(nameValue || '').trim()
  const email = String(emailValue || '').trim().toLowerCase()

  if (nombre && email && nombre.toLowerCase() !== email) return `${nombre} (${email})`
  return email || nombre || 'No identificado'
}

const normalizeText = (value: unknown) => String(value || '').trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

const isCanceledPayment = (row: CorteCajaRow) => {
  const status = normalizeText(row.estatus)
  return ['cancelada', 'cancelado', 'cancelled', 'canceled'].includes(status)
}

const isDepurationAdjustment = (row: CorteCajaRow) => {
  const depurado = ['1', 'true'].includes(String(row.depurado ?? '').trim().toLowerCase())
  const otherCampus = ['1', 'true'].includes(String(row.pago_otro_plantel ?? '').trim().toLowerCase())
  return depurado && normalizeText(row.formaDePago) === 'depuracion' && !otherCampus
}

const resolveAuditStatus = (row: CorteCajaRow) => {
  if (isCanceledPayment(row)) return 'Cancelado'
  if (isDepurationAdjustment(row)) return 'Depuración'
  return String(row.estatus || 'Vigente').trim() || 'Vigente'
}

const resolveAppliedAmount = (row: CorteCajaRow) => {
  if (isCanceledPayment(row) || isDepurationAdjustment(row)) return 0
  return Number(row.monto || 0)
}

const resolveCorteContext = async (user: AuthSessionUser, filters: CorteCajaFilters): Promise<CorteCajaContext> => {
  if (!user?.hasFinancialAccess) {
    throw createError({ statusCode: 403, message: 'No tiene permisos financieros para acceder a este reporte.' })
  }

  const [clock] = await query<Array<{ currentDate: string }>>(
    `SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS currentDate`
  )
  const currentDate = String(clock?.currentDate || new Date().toISOString().slice(0, 10))
  const requestedInicio = normalizeDateFilter(filters.inicio)
  const requestedFin = normalizeDateFilter(filters.fin)
  const inicio = requestedInicio || requestedFin || currentDate
  const fin = requestedFin || requestedInicio || currentDate

  if (inicio > fin) {
    throw createError({ statusCode: 400, message: 'La fecha de apertura no puede ser posterior a la fecha de cierre.' })
  }

  const scopePlantel = resolveCortePlantel(user, filters.plantel)
  const where = `
    ${PAYMENT_PLANTEL_SQL} = ?
    AND DATE(${PAYMENT_EFFECTIVE_AT_SQL}) BETWEEN ? AND ?
  `
  const params: any[] = [scopePlantel, inicio, fin]

  return { inicio, fin, scopePlantel, where, params }
}

export const loadPlantelCorteCajaUsers = async (
  user: AuthSessionUser,
  filters: CorteCajaFilters = {}
) => {
  const context = await resolveCorteContext(user, filters)
  const rows = await query<Array<{
    usuarioKey: string
    nombre: string | null
    email: string | null
    movimientos: number | string
    total: number | string
  }>>(`
    SELECT
      ${REGISTERING_USER_KEY_SQL} AS usuarioKey,
      MAX(NULLIF(TRIM(r.usuario), '')) AS nombre,
      MAX(NULLIF(TRIM(r.usuario_email), '')) AS email,
      COUNT(*) AS movimientos,
      COALESCE(SUM(${APPLIED_AMOUNT_SQL}), 0) AS total
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${context.where}
    GROUP BY ${REGISTERING_USER_KEY_SQL}
  `, context.params)

  const usuarios: CorteCajaUserOption[] = rows
    .map(row => ({
      key: String(row.usuarioKey || 'unknown:'),
      nombre: String(row.nombre || '').trim(),
      email: String(row.email || '').trim().toLowerCase(),
      label: formatUserLabel(row.nombre, row.email),
      movimientos: Number(row.movimientos || 0),
      total: Number(row.total || 0)
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))

  return {
    usuarios,
    filtros: {
      inicio: context.inicio,
      fin: context.fin,
      plantel: context.scopePlantel
    }
  }
}

export const loadPlantelCorteCaja = async (
  user: AuthSessionUser,
  filters: CorteCajaFilters = {},
  options: CorteCajaLoadOptions = {}
) => {
  const context = await resolveCorteContext(user, filters)
  const selectedUserKeys = normalizeCorteUserKeys(options.userKeys)
  let where = context.where
  const params = [...context.params]

  if (selectedUserKeys.length) {
    where += ` AND ${REGISTERING_USER_KEY_SQL} IN (${selectedUserKeys.map(() => '?').join(', ')})`
    params.push(...selectedUserKeys)
  }

  const rows = await query<CorteCajaRow[]>(`
    SELECT
      r.folio,
      r.folio_plantel,
      ${PAYMENT_REGISTERED_AT_SQL} AS fecha,
      ${PAYMENT_EFFECTIVE_AT_SQL} AS fechaPago,
      r.matricula,
      r.documento,
      r.mes,
      r.mesReal,
      r.nombreCompleto,
      r.concepto,
      r.conceptoNombre,
      r.monto,
      r.importeTotal,
      r.saldoAntes,
      r.saldoDespues,
      r.pagos,
      r.pagosDespues,
      r.montoLetra,
      r.formaDePago,
      r.plantel,
      r.plantel_pago,
      r.instituto,
      r.ciclo,
      r.estatus,
      r.cancelada_por,
      r.depurado,
      r.pago_otro_plantel,
      r.usuario,
      r.usuario_email,
      ${PAYMENT_PLANTEL_SQL} AS scopePlantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${where}
    ORDER BY ${PAYMENT_EFFECTIVE_AT_SQL} DESC, ${PAYMENT_REGISTERED_AT_SQL} DESC, r.folio ASC
  `, params)

  const rowsByCycle = new Map<string, CorteCajaRow[]>()
  rows.forEach((row) => {
    const cycle = String(row.ciclo || '').trim()
    const cycleRows = rowsByCycle.get(cycle) || []
    cycleRows.push(row)
    rowsByCycle.set(cycle, cycleRows)
  })
  await Promise.all(Array.from(rowsByCycle.entries()).map(([ciclo, cycleRows]) => (
    hydrateFinancialConceptNames(cycleRows, { ciclo: ciclo || undefined })
  )))

  rows.forEach((row) => {
    row.estatusCorte = resolveAuditStatus(row)
    row.montoAplicado = resolveAppliedAmount(row)
  })

  const totalsMap = new Map<string, number>()
  const groupedMap = new Map<string, CorteCajaGroupedRow>()

  rows.forEach((row) => {
    const paymentMethod = String(row.formaDePago || 'Sin especificar')
    const registeredAmount = Number(row.monto || 0)
    const appliedAmount = Number(row.montoAplicado || 0)
    totalsMap.set(paymentMethod, (totalsMap.get(paymentMethod) || 0) + appliedAmount)

    const fecha = toMexicoDateKey(row.fechaPago)
    const categoria = String(row.conceptoNombre || 'Sin concepto')
    const estatus = row.estatusCorte
    const key = `${fecha}|${paymentMethod}|${categoria}|${estatus}`
    const current = groupedMap.get(key) || {
      fecha,
      formaDePago: paymentMethod,
      categoria,
      estatus,
      transacciones: 0,
      montoRegistrado: 0,
      total: 0
    }

    current.transacciones += 1
    current.montoRegistrado += registeredAmount
    current.total += appliedAmount
    groupedMap.set(key, current)
  })

  const totales = Array.from(totalsMap.entries())
    .map(([formaDePago, total]) => ({ formaDePago, total }))
    .sort((a, b) => a.formaDePago.localeCompare(b.formaDePago, 'es'))

  const grouped = Array.from(groupedMap.values())
    .sort((a, b) => {
      const dateDiff = new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      return dateDiff || Number(b.montoRegistrado || 0) - Number(a.montoRegistrado || 0)
    })

  const totalRegistrado = rows.reduce((sum, row) => sum + Number(row.monto || 0), 0)
  const total = rows.reduce((sum, row) => sum + Number(row.montoAplicado || 0), 0)

  return {
    rows,
    grouped,
    totales,
    total,
    totalRegistrado,
    totalNoAplicado: totalRegistrado - total,
    usuario: {
      nombre: String(user.name || user.email),
      email: String(user.email || '')
    },
    filtros: {
      inicio: context.inicio,
      fin: context.fin,
      plantel: context.scopePlantel
    }
  }
}
