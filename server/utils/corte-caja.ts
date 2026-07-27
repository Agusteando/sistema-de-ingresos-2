import { normalizeCicloKey, type CicloInput } from '../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo, plantelCandidatesForProjectedScope } from '../../shared/utils/grado'
import { query } from './db'
import { hydrateFinancialConceptNames } from './financial-concept'
import type { AuthSessionUser } from './auth-session'

type CorteCajaFilters = {
  inicio?: unknown
  fin?: unknown
  plantel?: unknown
  ciclo?: CicloInput
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
  instituto?: unknown
  usuario?: string | null
  usuario_email?: string | null
  gradoBase?: string | null
  nivelBase?: string | null
  cicloBase?: string | null
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

const normalizeOwnerValue = (value: unknown) => String(value || '').trim().toLowerCase()

const normalizeDateFilter = (value: unknown) => {
  const normalized = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

const currentUserOwnerClause = (user: AuthSessionUser) => {
  const email = normalizeOwnerValue(user.email)

  if (!email) {
    throw createError({ statusCode: 401, message: 'La sesión no tiene un correo válido para generar el corte.' })
  }

  // Fail closed: display names are not unique enough to authorize a financial
  // report. New and safely backfilled rows use usuario_email. The only legacy
  // fallback accepted here is an exact email already stored in usuario.
  return {
    sql: `(
      LOWER(TRIM(COALESCE(r.usuario_email, ''))) = ?
      OR (
        COALESCE(TRIM(r.usuario_email), '') = ''
        AND LOWER(TRIM(COALESCE(r.usuario, ''))) = ?
      )
    )`,
    params: [email, email]
  }
}

export const loadCurrentUserCorteCaja = async (
  user: AuthSessionUser,
  filters: CorteCajaFilters = {}
) => {
  if (!user?.hasFinancialAccess) {
    throw createError({ statusCode: 403, message: 'No tiene permisos financieros para acceder a este reporte.' })
  }

  const cicloKey = normalizeCicloKey(filters.ciclo || '2025')
  const inicio = normalizeDateFilter(filters.inicio)
  const fin = normalizeDateFilter(filters.fin)
  const requestedPlantel = String(filters.plantel || '').trim().toUpperCase()
  const ownerClause = currentUserOwnerClause(user)

  let where = "r.estatus = 'Vigente' AND COALESCE(r.depurado, 0) = 0 AND r.ciclo = ?"
  const params: any[] = [cicloKey]

  if (inicio && fin) {
    where += ' AND DATE(r.fecha) BETWEEN ? AND ?'
    params.push(inicio, fin)
  }

  const scopePlantel = (!user.isSuperAdmin || user.active_plantel !== 'GLOBAL')
    ? user.active_plantel
    : requestedPlantel

  if (scopePlantel) {
    const plantelCandidates = plantelCandidatesForProjectedScope(scopePlantel)
    where += ` AND COALESCE(A.plantel, r.plantel) IN (${plantelCandidates.map(() => '?').join(',')})`
    params.push(...plantelCandidates)
  }

  where += ` AND ${ownerClause.sql}`
  params.push(...ownerClause.params)

  const rawRows = await query<CorteCajaRow[]>(`
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
      r.instituto,
      r.usuario,
      r.usuario_email,
      A.grado as gradoBase,
      A.nivel as nivelBase,
      A.ciclo as cicloBase,
      COALESCE(A.plantel, r.plantel) as scopePlantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${where}
    ORDER BY r.fecha DESC, r.folio ASC
  `, params)

  const rows = rawRows.filter(row => (
    isInProjectedPlantelScopeForCiclo(
      row.gradoBase,
      row.scopePlantel,
      row.cicloBase,
      cicloKey,
      row.nivelBase,
      scopePlantel || 'GLOBAL'
    )
  ))

  await hydrateFinancialConceptNames(rows, { ciclo: cicloKey })

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
      ciclo: cicloKey,
      inicio: inicio || null,
      fin: fin || null,
      plantel: scopePlantel || 'GLOBAL'
    }
  }
}
