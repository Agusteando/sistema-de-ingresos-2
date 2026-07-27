import { normalizeCicloKey, type CicloInput } from '../../shared/utils/ciclo'
import { PLANTELES_LIST } from '../../utils/constants'
import { query } from './db'
import { hydrateFinancialConceptNames } from './financial-concept'
import type { AuthSessionUser } from './auth-session'

type CorteCajaFilters = {
  inicio?: unknown
  fin?: unknown
  plantel?: unknown
  ciclo?: CicloInput
}

type CorteCajaLoadOptions = {
  userKeys?: unknown
}

export type CorteCajaRow = {
  folio: number
  fecha: Date | string
  matricula: string
  documento: number
  mes: string
  mesReal?: string | null
  nombreCompleto: string
  concepto: string
  conceptoNombre: string
  monto: number | string
  formaDePago: string
  plantel?: string | null
  plantel_pago?: string | null
  instituto?: unknown
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
  transacciones: number
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
  cicloKey: string
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

const PAYMENT_PLANTEL_SQL = `UPPER(COALESCE(
  NULLIF(TRIM(r.plantel_pago), ''),
  NULLIF(TRIM(r.plantel), ''),
  NULLIF(TRIM(A.plantel), '')
))`

const REGISTERING_USER_KEY_SQL = `CASE
  WHEN NULLIF(TRIM(r.usuario_email), '') IS NOT NULL
    THEN CONCAT('email:', LOWER(TRIM(r.usuario_email)))
  WHEN NULLIF(TRIM(r.usuario), '') IS NOT NULL
    THEN CONCAT('name:', LOWER(TRIM(r.usuario)))
  ELSE 'unknown:'
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

const resolveCorteContext = (user: AuthSessionUser, filters: CorteCajaFilters): CorteCajaContext => {
  if (!user?.hasFinancialAccess) {
    throw createError({ statusCode: 403, message: 'No tiene permisos financieros para acceder a este reporte.' })
  }

  const cicloKey = normalizeCicloKey(filters.ciclo || '2025')
  const inicio = normalizeDateFilter(filters.inicio)
  const fin = normalizeDateFilter(filters.fin)
  const scopePlantel = resolveCortePlantel(user, filters.plantel)

  let where = `
    r.estatus = 'Vigente'
    AND COALESCE(r.depurado, 0) = 0
    AND r.ciclo = ?
    AND ${PAYMENT_PLANTEL_SQL} = ?
  `
  const params: any[] = [cicloKey, scopePlantel]

  if (inicio && fin) {
    where += ' AND DATE(r.fecha) BETWEEN ? AND ?'
    params.push(inicio, fin)
  }

  return { cicloKey, inicio, fin, scopePlantel, where, params }
}

export const loadPlantelCorteCajaUsers = async (
  user: AuthSessionUser,
  filters: CorteCajaFilters = {}
) => {
  const context = resolveCorteContext(user, filters)
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
      COALESCE(SUM(r.monto), 0) AS total
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
      ciclo: context.cicloKey,
      inicio: context.inicio || null,
      fin: context.fin || null,
      plantel: context.scopePlantel
    }
  }
}

export const loadPlantelCorteCaja = async (
  user: AuthSessionUser,
  filters: CorteCajaFilters = {},
  options: CorteCajaLoadOptions = {}
) => {
  const context = resolveCorteContext(user, filters)
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
      r.fecha,
      r.matricula,
      r.documento,
      r.mes,
      r.mesReal,
      r.nombreCompleto,
      r.concepto,
      r.conceptoNombre,
      r.monto,
      r.formaDePago,
      r.plantel,
      r.plantel_pago,
      r.instituto,
      r.usuario,
      r.usuario_email,
      ${PAYMENT_PLANTEL_SQL} as scopePlantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${where}
    ORDER BY r.fecha DESC, r.folio ASC
  `, params)

  await hydrateFinancialConceptNames(rows, { ciclo: context.cicloKey })

  const totalsMap = new Map<string, number>()
  const groupedMap = new Map<string, CorteCajaGroupedRow>()

  rows.forEach((row) => {
    const paymentMethod = String(row.formaDePago || 'Sin especificar')
    const amount = Number(row.monto || 0)
    totalsMap.set(paymentMethod, (totalsMap.get(paymentMethod) || 0) + amount)

    const fecha = row.fecha instanceof Date
      ? row.fecha.toISOString().slice(0, 10)
      : String(row.fecha || '').slice(0, 10)
    const categoria = String(row.conceptoNombre || 'Sin concepto')
    const key = `${fecha}|${paymentMethod}|${categoria}`
    const current = groupedMap.get(key) || {
      fecha,
      formaDePago: paymentMethod,
      categoria,
      transacciones: 0,
      total: 0
    }

    current.transacciones += 1
    current.total += amount
    groupedMap.set(key, current)
  })

  const totales = Array.from(totalsMap.entries())
    .map(([formaDePago, total]) => ({ formaDePago, total }))
    .sort((a, b) => a.formaDePago.localeCompare(b.formaDePago, 'es'))

  const grouped = Array.from(groupedMap.values())
    .sort((a, b) => {
      const dateDiff = new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      return dateDiff || Number(b.total || 0) - Number(a.total || 0)
    })

  return {
    rows,
    grouped,
    totales,
    total: rows.reduce((sum, row) => sum + Number(row.monto || 0), 0),
    usuario: {
      nombre: String(user.name || user.email),
      email: String(user.email || '')
    },
    filtros: {
      ciclo: context.cicloKey,
      inicio: context.inicio || null,
      fin: context.fin || null,
      plantel: context.scopePlantel
    }
  }
}
