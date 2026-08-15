import { getBridgeAgentId, getDbTransport, query } from './db'
import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { omitRawFinancialAcademicFields, resolveFinancialAcademicPlacement } from './financial-academic-placement'
import { hydrateFinancialConceptNames, loadFinancialConceptMap } from './financial-concept'
import { PAYMENT_REGISTERING_USER_KEY_SQL, formatPaymentUserLabel, normalizePaymentUserKeys } from './payment-user'
import {
  PAYMENT_APPLIED_AMOUNT_SQL,
  PAYMENT_PLANTEL_SQL,
  isCanceledPayment,
  isDepurationAdjustment,
  resolvePaymentAppliedAmount,
  resolvePaymentAuditStatus,
} from './payment-audit'

const firstQueryValue = (value: unknown) => {
  if (Array.isArray(value)) return firstQueryValue(value[0])
  return value === null || value === undefined ? '' : String(value).trim()
}

const normalizePlantel = (value: unknown) => String(value || '').trim().toUpperCase()

const normalizeConceptIds = (filters: Record<string, unknown>) => {
  const raw = filters?.conceptoIds ?? filters?.conceptoId
  const values: unknown[] = []

  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collect)
      return
    }

    if (value === null || value === undefined || value === '') return
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return
      if (trimmed.startsWith('[')) {
        try {
          collect(JSON.parse(trimmed))
          return
        } catch {}
      }
      if (trimmed.includes(',')) {
        trimmed.split(',').forEach(collect)
        return
      }
    }
    values.push(value)
  }

  collect(raw)
  return Array.from(new Set(values
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value > 0)))
}

type PaymentScope = {
  scopePlantel: string
  where: string
  params: any[]
}

const resolvePaymentScope = (user: any, requestedPlantel: unknown): PaymentScope => {
  const activePlantel = normalizePlantel(user?.active_plantel)
  const requested = normalizePlantel(firstQueryValue(requestedPlantel))
  const scopePlantel = activePlantel && activePlantel !== 'GLOBAL'
    ? activePlantel
    : (user?.isSuperAdmin ? (requested === 'GLOBAL' ? '' : requested) : activePlantel)

  if (!scopePlantel || scopePlantel === 'GLOBAL') {
    return { scopePlantel: '', where: '', params: [] }
  }

  const bridgeAgent = getDbTransport() === 'bridge'
    ? normalizePlantel(getBridgeAgentId())
    : ''
  const agentOwnsScope = Boolean(bridgeAgent && bridgeAgent === scopePlantel)

  // Same perimeter rule as Corte de caja: when the active bridge agent owns the plantel,
  // that database is already the physical ledger scope. Historical r.plantel/base values
  // are metadata and must never make a payment disappear from the report.
  if (agentOwnsScope) {
    return { scopePlantel, where: '', params: [] }
  }

  return {
    scopePlantel,
    where: `${PAYMENT_PLANTEL_SQL} = ?`,
    params: [scopePlantel],
  }
}

type ConceptReportContext = {
  concepto: any
  conceptos: any[]
  conceptoIds: number[]
  catalogCicloKey: string
  inicioValue: string
  finValue: string
  scopePlantel: string
  where: string
  params: any[]
}

const resolveConceptReportContext = async (user: any, filters: Record<string, unknown>): Promise<ConceptReportContext> => {
  const { inicio, fin, plantel, ciclo = '2025' } = filters || {}
  const catalogCicloKey = normalizeCicloKey(ciclo as any)
  const conceptoIds = normalizeConceptIds(filters || {})

  if (!conceptoIds.length) {
    throw createError({ statusCode: 400, message: 'Seleccione al menos un concepto.' })
  }

  // The catalog is useful metadata, not an eligibility gate. Historical ledger rows must
  // remain reportable even when a concept was removed from the current catalog.
  const resolvedMap = await loadFinancialConceptMap(conceptoIds, catalogCicloKey)
  const bridgeMetadataRows = await query<any[]>(`
    SELECT id, concepto, costo, description, plantel, eventual, plazo
    FROM conceptos
    WHERE id IN (${conceptoIds.map(() => '?').join(', ')})
  `, conceptoIds).catch(() => [])
  const bridgeMetadata = new Map(bridgeMetadataRows.map(row => [Number(row.id), row]))

  const ledgerMetadataRows = await query<any[]>(`
    SELECT
      CAST(r.concepto AS CHAR) AS id,
      MAX(NULLIF(TRIM(r.conceptoNombre), '')) AS concepto,
      COUNT(*) AS movimientos
    FROM referenciasdepago r
    WHERE CAST(r.concepto AS CHAR) IN (${conceptoIds.map(() => '?').join(', ')})
    GROUP BY CAST(r.concepto AS CHAR)
  `, conceptoIds.map(String)).catch(() => [])
  const ledgerMetadata = new Map(ledgerMetadataRows.map(row => [Number(row.id), row]))

  const missingIds = conceptoIds.filter(id => !resolvedMap.has(id) && !bridgeMetadata.has(id) && !ledgerMetadata.has(id))
  if (missingIds.length) {
    throw createError({
      statusCode: 404,
      message: 'Uno o más conceptos seleccionados no existen en el catálogo ni en el historial de pagos.',
    })
  }

  const conceptos = conceptoIds.map((id) => {
    const resolvedConcept = resolvedMap.get(id)
    const metadata = bridgeMetadata.get(id) || {}
    const ledger = ledgerMetadata.get(id) || {}
    const { ciclo: _metadataCiclo, ...safeMetadata } = metadata
    return {
      ...safeMetadata,
      id,
      concepto: resolvedConcept?.concepto || metadata?.concepto || ledger?.concepto || `Concepto financiero #${id}`,
      costo: metadata?.costo ?? resolvedConcept?.costo ?? 0,
      historico: !resolvedConcept && !bridgeMetadata.has(id),
    }
  })

  const inicioValue = firstQueryValue(inicio)
  const finValue = firstQueryValue(fin)
  if (inicioValue && finValue && inicioValue > finValue) {
    throw createError({ statusCode: 400, message: 'La fecha inicial no puede ser posterior a la fecha final.' })
  }

  const whereParts = [`CAST(r.concepto AS CHAR) IN (${conceptoIds.map(() => '?').join(', ')})`]
  const params: any[] = conceptoIds.map(String)

  if (inicioValue) {
    whereParts.push('DATE(r.fecha) >= ?')
    params.push(inicioValue)
  }

  if (finValue) {
    whereParts.push('DATE(r.fecha) <= ?')
    params.push(finValue)
  }

  const paymentScope = resolvePaymentScope(user, plantel)
  if (paymentScope.where) {
    whereParts.push(paymentScope.where)
    params.push(...paymentScope.params)
  }

  return {
    concepto: conceptos.length === 1 ? conceptos[0] : null,
    conceptos,
    conceptoIds,
    catalogCicloKey,
    inicioValue,
    finValue,
    scopePlantel: paymentScope.scopePlantel,
    where: whereParts.join(' AND '),
    params,
  }
}

type MoneyBreakdown = {
  total: number
  montoRegistrado: number
  movimientos: number
}

const addMoneyBreakdown = <T extends MoneyBreakdown>(map: Map<string, T>, key: string, create: () => T, registered: number, applied: number) => {
  const current = map.get(key) || create()
  current.movimientos += 1
  current.montoRegistrado += registered
  current.total += applied
  map.set(key, current)
}

export const loadConceptReport = async (user: any, filters: Record<string, unknown>) => {
  const context = await resolveConceptReportContext(user, filters)
  const selectedUserKeys = normalizePaymentUserKeys(filters?.usuarios)
  let where = context.where
  const params = [...context.params]

  if (selectedUserKeys.length) {
    where += ` AND ${PAYMENT_REGISTERING_USER_KEY_SQL} IN (${selectedUserKeys.map(() => '?').join(', ')})`
    params.push(...selectedUserKeys)
  }

  const rawRows = await query<any[]>(`
    SELECT
      r.folio,
      r.folio_plantel,
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
    ORDER BY r.fecha DESC, r.folio DESC
  `, params)

  // Deliberately no status/cycle/projected-plantel post-filter here. Every ledger row that
  // matches the user's explicit concept/date/user filters must survive into the report.
  const rows = rawRows.map((row) => {
    const academic = resolveFinancialAcademicPlacement(row, row.ciclo)
    const montoRegistrado = Number(row.monto || 0)
    const montoAplicado = resolvePaymentAppliedAmount(row)

    return {
      ...omitRawFinancialAcademicFields(row),
      ...academic,
      estatusReporte: resolvePaymentAuditStatus(row),
      montoRegistrado,
      montoAplicado,
    }
  })

  await hydrateFinancialConceptNames(rows)

  const formasPagoMap = new Map<string, { formaDePago: string } & MoneyBreakdown>()
  const plantelesMap = new Map<string, { plantel: string } & MoneyBreakdown>()
  const conceptosMap = new Map<string, { concepto: string } & MoneyBreakdown>()
  const estatusMap = new Map<string, { estatus: string } & MoneyBreakdown>()
  const alumnos = new Set<string>()
  let totalRegistrado = 0
  let total = 0
  let cancelados = 0
  let depuraciones = 0

  rows.forEach((row) => {
    const registered = Number(row.montoRegistrado || 0)
    const applied = Number(row.montoAplicado || 0)
    const formaDePago = String(row.formaDePago || 'Sin forma de pago')
    const rowPlantel = String(row.scopePlantel || row.plantel || 'Sin plantel')
    const conceptKey = String(row.concepto || '')
    const conceptName = String(row.conceptoNombre || `Concepto ${conceptKey}`)
    const status = String(row.estatusReporte || row.estatus || 'Vigente')

    totalRegistrado += registered
    total += applied
    if (isCanceledPayment(row)) cancelados += 1
    if (isDepurationAdjustment(row)) depuraciones += 1
    alumnos.add(String(row.matricula || ''))

    addMoneyBreakdown(formasPagoMap, formaDePago, () => ({ formaDePago, total: 0, montoRegistrado: 0, movimientos: 0 }), registered, applied)
    addMoneyBreakdown(plantelesMap, rowPlantel, () => ({ plantel: rowPlantel, total: 0, montoRegistrado: 0, movimientos: 0 }), registered, applied)
    addMoneyBreakdown(conceptosMap, conceptKey, () => ({ concepto: conceptName, total: 0, montoRegistrado: 0, movimientos: 0 }), registered, applied)
    addMoneyBreakdown(estatusMap, status, () => ({ estatus: status, total: 0, montoRegistrado: 0, movimientos: 0 }), registered, applied)
  })

  const formasPago = Array.from(formasPagoMap.values())
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
  const planteles = Array.from(plantelesMap.values())
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
  const porConcepto = Array.from(conceptosMap.values())
    .sort((a, b) => Number(b.montoRegistrado || 0) - Number(a.montoRegistrado || 0))
  const estatus = Array.from(estatusMap.values())
    .sort((a, b) => Number(b.movimientos || 0) - Number(a.movimientos || 0))

  return {
    concepto: context.concepto,
    conceptos: context.conceptos,
    rows,
    filtros: {
      plantel: context.scopePlantel || '',
      inicio: context.inicioValue,
      fin: context.finValue,
      conceptoIds: context.conceptoIds,
    },
    resumen: {
      total,
      totalRegistrado,
      totalNoAplicado: totalRegistrado - total,
      transacciones: rows.length,
      alumnos: Array.from(alumnos).filter(Boolean).length,
      cancelados,
      depuraciones,
      formasPago,
      planteles,
      conceptos: porConcepto,
      estatus,
    },
  }
}

export const loadConceptReportUsers = async (user: any, filters: Record<string, unknown>) => {
  const context = await resolveConceptReportContext(user, filters)
  const rows = await query<any[]>(`
    SELECT
      ${PAYMENT_REGISTERING_USER_KEY_SQL} AS usuarioKey,
      MAX(NULLIF(TRIM(r.usuario), '')) AS nombre,
      MAX(NULLIF(TRIM(r.usuario_email), '')) AS email,
      COUNT(*) AS movimientos,
      COALESCE(SUM(COALESCE(r.monto, 0)), 0) AS montoRegistrado,
      COALESCE(SUM(${PAYMENT_APPLIED_AMOUNT_SQL}), 0) AS total
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${context.where}
    GROUP BY ${PAYMENT_REGISTERING_USER_KEY_SQL}
  `, context.params)

  return {
    usuarios: rows
      .map((row) => ({
        key: String(row.usuarioKey || 'unknown:'),
        nombre: String(row.nombre || '').trim(),
        email: String(row.email || '').trim().toLowerCase(),
        label: formatPaymentUserLabel(row.nombre, row.email),
        movimientos: Number(row.movimientos || 0),
        montoRegistrado: Number(row.montoRegistrado || 0),
        total: Number(row.total || 0),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })),
    filtros: {
      plantel: context.scopePlantel || '',
      inicio: context.inicioValue,
      fin: context.finValue,
      conceptoIds: context.conceptoIds,
    },
  }
}

export const loadConceptReportOptions = async (user: any, filters: Record<string, unknown> = {}) => {
  const paymentScope = resolvePaymentScope(user, filters?.plantel)
  const where = paymentScope.where ? `WHERE ${paymentScope.where}` : ''
  const rows = await query<any[]>(`
    SELECT
      CAST(r.concepto AS CHAR) AS id,
      MAX(NULLIF(TRIM(r.conceptoNombre), '')) AS concepto,
      COUNT(*) AS movimientos,
      MIN(DATE(r.fecha)) AS primeraFecha,
      MAX(DATE(r.fecha)) AS ultimaFecha
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    ${where}
    GROUP BY CAST(r.concepto AS CHAR)
  `, paymentScope.params)

  const byId = new Map<number, any>()
  rows.forEach((row) => {
    const id = Number(row.id)
    if (!Number.isInteger(id) || id <= 0) return
    const existing = byId.get(id)
    const conceptName = String(row.concepto || '').trim() || `Concepto financiero #${id}`
    if (!existing || Number(row.movimientos || 0) > Number(existing.movimientos || 0)) {
      byId.set(id, {
        id,
        concepto: conceptName,
        costo: 0,
        description: `Histórico de pagos · ${Number(row.movimientos || 0)} movimiento${Number(row.movimientos || 0) === 1 ? '' : 's'}`,
        plantel: paymentScope.scopePlantel || '',
        eventual: 0,
        plazo: '',
        movimientos: Number(row.movimientos || 0),
        primeraFecha: row.primeraFecha || '',
        ultimaFecha: row.ultimaFecha || '',
        historico: true,
      })
    }
  })

  return Array.from(byId.values())
    .sort((a, b) => String(a.concepto).localeCompare(String(b.concepto), 'es', { sensitivity: 'base' }))
}
