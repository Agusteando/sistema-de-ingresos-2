import { PLANTELES_LIST } from '../../utils/constants'
import { getBridgeAgentId, getDbTransport, query } from './db'
import { hydrateFinancialConceptNames } from './financial-concept'
import type { AuthSessionUser } from './auth-session'
import { omitRawFinancialAcademicFields, resolveFinancialAcademicPlacement } from './financial-academic-placement'
import { PAYMENT_REGISTERING_USER_KEY_SQL, formatPaymentUserLabel, normalizePaymentUserKeys } from './payment-user'
import {
  PAYMENT_APPLIED_AMOUNT_SQL,
  PAYMENT_EFFECTIVE_AT_SQL,
  PAYMENT_PLANTEL_SQL,
  PAYMENT_REGISTERED_AT_SQL,
  resolvePaymentAppliedAmount,
  resolvePaymentAuditStatus,
} from './payment-audit'

type CorteCajaFilters = {
  inicio?: unknown
  fin?: unknown
  plantel?: unknown
  ciclo?: unknown
  seccion?: unknown
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
  nivel: string
  grado: string
  estatus?: string | null
  estatusCorte: string
  cancelada_por?: string | null
  depurado?: unknown
  pago_otro_plantel?: unknown
  usuario?: string | null
  usuario_email?: string | null
  scopePlantel?: string | null
}

type CorteCajaDbRow = Omit<CorteCajaRow, 'nivel' | 'grado' | 'estatusCorte' | 'montoAplicado'> & {
  gradoBase?: string | null
  cicloBase?: string | null
  basePlantel?: string | null
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
  sectionId: number | null
  sectionName: string
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

export const normalizeCorteUserKeys = normalizePaymentUserKeys


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
  const bridgeAgent = getDbTransport() === 'bridge'
    ? normalizePlantel(getBridgeAgentId())
    : ''
  const agentOwnsCorteScope = Boolean(bridgeAgent && bridgeAgent === scopePlantel)

  // En producción bridge-first, cada agente/plantel tiene su propia bitácora financiera.
  // Por eso el corte del agente debe incluir TODOS sus movimientos del periodo, aunque el
  // pago conserve otro plantel por matrícula, documento o por cualquier dato histórico.
  // El filtro legado por plantel solo se conserva como resguardo para transporte directo o
  // para un contexto bridge que no corresponda al plantel solicitado.
  let where = agentOwnsCorteScope
    ? `DATE(${PAYMENT_EFFECTIVE_AT_SQL}) BETWEEN ? AND ?`
    : `${PAYMENT_PLANTEL_SQL} = ? AND DATE(${PAYMENT_EFFECTIVE_AT_SQL}) BETWEEN ? AND ?`
  const params: any[] = agentOwnsCorteScope
    ? [inicio, fin]
    : [scopePlantel, inicio, fin]

  const requestedSection = String(filters.seccion || '').trim()
  let sectionId: number | null = null
  let sectionName = ''

  if (requestedSection) {
    const parsedSectionId = Number(requestedSection)
    if (!Number.isInteger(parsedSectionId) || parsedSectionId <= 0) {
      throw createError({ statusCode: 400, message: 'La sección seleccionada no es válida.' })
    }

    const [section] = await query<Array<{ id: number | string; name: string | null }>>(`
      SELECT id, name
      FROM student_custom_sections
      WHERE id = ? AND plantel = ? AND is_active = 1
      LIMIT 1
    `, [parsedSectionId, scopePlantel])

    if (!section) {
      throw createError({ statusCode: 400, message: 'La sección seleccionada ya no está disponible para este plantel.' })
    }

    sectionId = Number(section.id)
    sectionName = String(section.name || '').trim()
    where += ` AND EXISTS (
      SELECT 1
      FROM student_custom_section_memberships CorteSectionMembership
      WHERE CorteSectionMembership.section_id = ?
        AND CorteSectionMembership.matricula = r.matricula
    )`
    params.push(sectionId)
  }

  return { inicio, fin, scopePlantel, sectionId, sectionName, where, params }
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
      ${PAYMENT_REGISTERING_USER_KEY_SQL} AS usuarioKey,
      MAX(NULLIF(TRIM(r.usuario), '')) AS nombre,
      MAX(NULLIF(TRIM(r.usuario_email), '')) AS email,
      COUNT(*) AS movimientos,
      COALESCE(SUM(${PAYMENT_APPLIED_AMOUNT_SQL}), 0) AS total
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${context.where}
    GROUP BY ${PAYMENT_REGISTERING_USER_KEY_SQL}
  `, context.params)

  const usuarios: CorteCajaUserOption[] = rows
    .map(row => ({
      key: String(row.usuarioKey || 'unknown:'),
      nombre: String(row.nombre || '').trim(),
      email: String(row.email || '').trim().toLowerCase(),
      label: formatPaymentUserLabel(row.nombre, row.email),
      movimientos: Number(row.movimientos || 0),
      total: Number(row.total || 0)
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))

  return {
    usuarios,
    filtros: {
      inicio: context.inicio,
      fin: context.fin,
      plantel: context.scopePlantel,
      seccion: context.sectionId ? String(context.sectionId) : '',
      seccionNombre: context.sectionName
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
    where += ` AND ${PAYMENT_REGISTERING_USER_KEY_SQL} IN (${selectedUserKeys.map(() => '?').join(', ')})`
    params.push(...selectedUserKeys)
  }

  const rawRows = await query<CorteCajaDbRow[]>(`
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
      A.grado AS gradoBase,
      A.ciclo AS cicloBase,
      A.plantel AS basePlantel,
      ${PAYMENT_PLANTEL_SQL} AS scopePlantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${where}
    ORDER BY ${PAYMENT_EFFECTIVE_AT_SQL} DESC, ${PAYMENT_REGISTERED_AT_SQL} DESC, r.folio ASC
  `, params)

  const rows: CorteCajaRow[] = rawRows.map((row) => ({
    ...omitRawFinancialAcademicFields(row),
    ...resolveFinancialAcademicPlacement(row, row.ciclo),
    estatusCorte: '',
    montoAplicado: 0,
  })) as CorteCajaRow[]

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
    row.estatusCorte = resolvePaymentAuditStatus(row)
    row.montoAplicado = resolvePaymentAppliedAmount(row)
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
      plantel: context.scopePlantel,
      seccion: context.sectionId ? String(context.sectionId) : '',
      seccionNombre: context.sectionName
    }
  }
}
