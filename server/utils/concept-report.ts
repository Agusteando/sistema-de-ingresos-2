import { getBridgeAgentId, getDbTransport, query, runWithBridgeAgentId } from './db'
import { automaticSchoolCycleKey, formatCicloLabel, normalizeCicloKey } from '../../shared/utils/ciclo'
import { normalizeCurp } from '../../shared/utils/curp'
import { omitRawFinancialAcademicFields, resolveFinancialAcademicPlacement } from './financial-academic-placement'
import { hydrateFinancialConceptNames, loadFinancialConceptMap } from './financial-concept'
import { PAYMENT_REGISTERING_USER_KEY_SQL, formatPaymentUserLabel, normalizePaymentUserKeys } from './payment-user'
import { fetchCentralMatriculaOverlays } from './central-matricula-overlay'
import { birthDateFromCurp } from './student-identity-report'
import { PLANTELES_LIST } from '../../utils/constants'
import { parseEnrollmentConceptsForPlantelHistory, parseEnrollmentConceptsForScope } from '../../shared/utils/studentPresentation'
import { readBestConceptosConfigPayload } from './conceptos-config'
import { fetchControlEscolarEnrolledStudents } from './control-escolar'
import { getDeudoresGlobal } from './deudores'
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

const financialConceptPredicate = (alias: string, count: number) =>
  `CAST(${alias}.concepto AS CHAR) IN (${Array.from({ length: count }, () => '?').join(', ')})`

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
  const { inicio, fin, plantel, ciclo = automaticSchoolCycleKey() } = filters || {}
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

  const whereParts = [financialConceptPredicate('r', conceptoIds.length)]
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


const conceptReportMode = (filters: Record<string, unknown>) => {
  const value = firstQueryValue(filters?.modo ?? filters?.mode).toLowerCase()
  if (['missing', 'sin-concepto', 'sin_concepto', 'faltantes'].includes(value)) return 'missing'
  if (['debtors', 'deudores', 'deudor', 'adeudos'].includes(value)) return 'debtors'
  return 'movements'
}

const resolveMissingConceptPlantel = (user: any, requestedPlantel: unknown) => {
  const active = normalizePlantel(user?.active_plantel)
  if (active && active !== 'GLOBAL') {
    if (!PLANTELES_LIST.includes(active)) {
      throw createError({ statusCode: 400, message: 'El plantel activo no es válido.' })
    }
    return active
  }

  if (!user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para consultar otro plantel.' })
  }

  const requested = normalizePlantel(firstQueryValue(requestedPlantel))
  if (!requested || requested === 'GLOBAL' || !PLANTELES_LIST.includes(requested)) {
    throw createError({
      statusCode: 400,
      message: 'Seleccione un plantel para consultar alumnos inscritos sin el concepto.'
    })
  }

  return requested
}

const resolveDebtorConceptPlantel = (user: any, requestedPlantel: unknown) => {
  const active = normalizePlantel(user?.active_plantel)
  if (active && active !== 'GLOBAL') {
    if (!PLANTELES_LIST.includes(active)) {
      throw createError({ statusCode: 400, message: 'El plantel activo no es válido.' })
    }
    return active
  }

  if (!user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para consultar otro plantel.' })
  }

  const requested = normalizePlantel(firstQueryValue(requestedPlantel))
  if (!requested || requested === 'GLOBAL' || !PLANTELES_LIST.includes(requested)) {
    throw createError({
      statusCode: 400,
      message: 'Seleccione un plantel para consultar deudores por concepto.'
    })
  }

  return requested
}

const normalizeDebtThreshold = (value: unknown) => {
  const raw = firstQueryValue(value)
  if (!raw) return 0
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createError({ statusCode: 400, message: 'El umbral de adeudo debe ser un monto igual o mayor a 0.' })
  }
  return Math.round(parsed * 100) / 100
}

const CONCEPT_EVIDENCE_CHUNK_SIZE = 400

type CanonicalEnrollmentScope = {
  enrollmentConceptIds: string[]
  tipoIngresoConceptIds: string[]
}

const resolveCanonicalEnrollmentScope = async (ciclo: string, plantel: string): Promise<CanonicalEnrollmentScope> => {
  const enrollmentConfig = await readBestConceptosConfigPayload()
  const enrollmentConceptIds = parseEnrollmentConceptsForScope(enrollmentConfig, { ciclo, plantel })
  if (!enrollmentConceptIds.length) {
    throw createError({
      statusCode: 409,
      message: `No hay conceptos de inscripción configurados para ${formatCicloLabel(ciclo)} en ${plantel}. No se generó el reporte para evitar una población incorrecta.`,
    })
  }

  const tipoIngresoConceptIds = parseEnrollmentConceptsForPlantelHistory(enrollmentConfig, { plantel })
  return {
    enrollmentConceptIds,
    tipoIngresoConceptIds: tipoIngresoConceptIds.length ? tipoIngresoConceptIds : enrollmentConceptIds,
  }
}

const loadStudentsWithAnySelectedConcept = async (
  user: any,
  plantel: string,
  matriculas: string[],
  conceptoIds: number[],
) => {
  const result = new Set<string>()
  const uniqueMatriculas = Array.from(new Set(matriculas.map(value => String(value || '').trim()).filter(Boolean)))
  const conceptStrings = conceptoIds.map(String)
  const paymentScope = resolvePaymentScope(user, plantel)

  for (let index = 0; index < uniqueMatriculas.length; index += CONCEPT_EVIDENCE_CHUNK_SIZE) {
    const chunk = uniqueMatriculas.slice(index, index + CONCEPT_EVIDENCE_CHUNK_SIZE)
    const matriculaPlaceholders = chunk.map(() => '?').join(', ')
    const whereParts = [
      `r.matricula IN (${matriculaPlaceholders})`,
      financialConceptPredicate('r', conceptStrings.length),
    ]
    const params: any[] = [...chunk, ...conceptStrings]

    if (paymentScope.where) {
      whereParts.push(paymentScope.where)
      params.push(...paymentScope.params)
    }

    // Eligibility for "Sin concepto" is the exact complement of normal
    // Reporte por concepto within the enrolled population. The normal financial
    // report identifies a concept exclusively through referenciasdepago.concepto
    // and does not require r.ciclo to match the catalog cycle. Selected concept
    // IDs already identify the intended concepts; adding a cycle predicate here
    // creates false faltantes for legacy rows whose ciclo is blank or normalized
    // differently. Any ledger row for ANY selected concept excludes the student.
    const rows = await query<any[]>(`
      SELECT DISTINCT r.matricula
      FROM referenciasdepago r
      LEFT JOIN base A ON A.matricula = r.matricula
      WHERE ${whereParts.join(' AND ')}
    `, params)

    rows.forEach((row: any) => {
      const matricula = String(row?.matricula || '').trim().toUpperCase()
      if (matricula) result.add(matricula)
    })
  }

  return result
}

const displayStudentName = (row: any) => {
  const direct = String(row?.fullName || row?.nombreCompleto || '').trim()
  if (direct) return direct
  return [
    String(row?.nombres || '').trim(),
    String(row?.apellidoPaterno || '').trim(),
    String(row?.apellidoMaterno || '').trim(),
  ].filter(Boolean).join(' ')
}

export const loadMissingConceptReport = async (user: any, filters: Record<string, unknown>) => {
  if (!user?.hasFinancialAccess) {
    throw createError({ statusCode: 403, message: 'No tiene permisos financieros para acceder a este reporte.' })
  }

  const ciclo = normalizeCicloKey(filters?.ciclo as any)
  const plantel = resolveMissingConceptPlantel(user, filters?.plantel)

  return await runWithBridgeAgentId(plantel, async () => {
    const context = await resolveConceptReportContext(user, {
      ciclo,
      plantel,
      conceptoIds: filters?.conceptoIds ?? filters?.conceptoId,
    })

    // Reuse the same enrollment configuration and the same normalized
    // Control Escolar enrollmentState used by Aurora's normal student UI.
    // Reportes must not invent a second definition of who is enrolled.
    const enrollmentScope = await resolveCanonicalEnrollmentScope(ciclo, plantel)
    const enrolledRows = await fetchControlEscolarEnrolledStudents(plantel, {
      ciclo,
      concepts: enrollmentScope.enrollmentConceptIds.join(','),
      tipoConcepts: enrollmentScope.tipoIngresoConceptIds.join(','),
    })
    const matriculas = enrolledRows.map((row: any) => String(row?.matricula || '').trim()).filter(Boolean)
    const studentsWithSelectedConcept = await loadStudentsWithAnySelectedConcept(user, plantel, matriculas, context.conceptoIds)

    const selectedConcepts = context.conceptos.map((concept: any) => ({
      id: Number(concept.id),
      concepto: String(concept.concepto || `Concepto financiero #${concept.id}`),
    }))
    const missingByGrade = new Map<string, number>()
    let studentsWithAny = 0

    const rows = enrolledRows.flatMap((row: any) => {
      const matricula = String(row?.matricula || '').trim()
      // This is intentionally a single student-level anti-join against the UNION
      // of every selected concept. Having one selected concept is enough to exclude
      // the student; only students with none of them remain.
      if (studentsWithSelectedConcept.has(matricula.toUpperCase())) {
        studentsWithAny += 1
        return []
      }

      const curp = normalizeCurp(row?.curp)
      const grado = String(row?.grado || '').trim()
      const nivel = String(row?.nivel || '').trim()
      const gradeKey = [nivel, grado].filter(Boolean).join(' · ') || 'Sin grado'
      missingByGrade.set(gradeKey, (missingByGrade.get(gradeKey) || 0) + 1)

      return [{
        matricula,
        nombres: String(row?.nombres || '').trim(),
        apellidoPaterno: String(row?.apellidoPaterno || '').trim(),
        apellidoMaterno: String(row?.apellidoMaterno || '').trim(),
        nombreCompleto: displayStudentName(row),
        nivel,
        grado,
        grupo: String(row?.group || row?.grupo || '').trim(),
        curp,
        fechaNacimiento: birthDateFromCurp(curp),
        plantel: String(row?.plantel || row?.basePlantel || plantel).trim().toUpperCase(),
        ciclo,
        conceptosFaltantes: selectedConcepts,
        conceptosFaltantesTexto: selectedConcepts.map(item => item.concepto).join(', '),
        faltantes: selectedConcepts.length,
      }]
    })

    const collator = new Intl.Collator('es-MX', { sensitivity: 'base', numeric: true })
    rows.sort((left: any, right: any) => (
      collator.compare(String(left.nivel || ''), String(right.nivel || '')) ||
      collator.compare(String(left.grado || ''), String(right.grado || '')) ||
      collator.compare(String(left.apellidoPaterno || ''), String(right.apellidoPaterno || '')) ||
      collator.compare(String(left.apellidoMaterno || ''), String(right.apellidoMaterno || '')) ||
      collator.compare(String(left.nombres || ''), String(right.nombres || ''))
    ))

    const studentsWithoutAny = rows.length
    const coverage = enrolledRows.length > 0
      ? Math.round((studentsWithAny / enrolledRows.length) * 1000) / 10
      : 0
    const missingConceptMatches = studentsWithoutAny * selectedConcepts.length
    const presentConceptMatches = enrolledRows.length - studentsWithoutAny

    return {
      modo: 'missing',
      concepto: context.concepto,
      conceptos: context.conceptos,
      rows,
      filtros: {
        plantel,
        ciclo,
        cicloLabel: formatCicloLabel(ciclo),
        conceptoIds: context.conceptoIds,
      },
      resumen: {
        inscritos: enrolledRows.length,
        alumnos: studentsWithoutAny,
        sinNinguno: studentsWithoutAny,
        conAlguno: studentsWithAny,
        // Keep compatibility aliases consumed by existing print/export views.
        completos: studentsWithAny,
        conceptosEsperados: enrolledRows.length,
        conceptosPresentes: presentConceptMatches,
        conceptosFaltantes: missingConceptMatches,
        asignacionesEsperadas: enrolledRows.length,
        asignacionesPresentes: presentConceptMatches,
        asignacionesFaltantes: missingConceptMatches,
        cobertura: coverage,
        conceptos: selectedConcepts.map((concept: any) => ({
          ...concept,
          faltantes: studentsWithoutAny,
        })),
        grados: Array.from(missingByGrade.entries())
          .map(([grado, total]) => ({ grado, total }))
          .sort((a, b) => Number(b.total || 0) - Number(a.total || 0) || collator.compare(a.grado, b.grado)),
      },
    }
  })
}

export const loadDebtorConceptReport = async (user: any, filters: Record<string, unknown>) => {
  if (!user?.hasFinancialAccess) {
    throw createError({ statusCode: 403, message: 'No tiene permisos financieros para acceder a este reporte.' })
  }

  const ciclo = normalizeCicloKey(filters?.ciclo as any)
  const plantel = resolveDebtorConceptPlantel(user, filters?.plantel)
  const threshold = normalizeDebtThreshold(filters?.threshold ?? filters?.umbral)

  return await runWithBridgeAgentId(plantel, async () => {
    const context = await resolveConceptReportContext(user, {
      ciclo,
      plantel,
      conceptoIds: filters?.conceptoIds ?? filters?.conceptoId,
    })
    const selectedIds = new Set(context.conceptoIds.map(Number))
    const conceptNameById = new Map(context.conceptos.map((concept: any) => [
      Number(concept.id),
      String(concept.concepto || `Concepto financiero #${concept.id}`),
    ]))

    const debtRows = await getDeudoresGlobal({
      ciclo,
      plantel,
      userEmail: user?.email,
      includeDesglose: true,
      conceptoIds: context.conceptoIds,
    })

    const studentRows = new Map<string, {
      matricula: string
      nombreCompleto: string
      nivel: string
      grado: string
      grupo: string
      plantel: string
      saldoPendiente: number
      totalCargos: number
      totalPagado: number
      fechaLimitePago: string
      conceptos: Map<number, {
        id: number
        concepto: string
        saldo: number
        cargos: number
        pagado: number
        periodos: string[]
      }>
    }>()

    debtRows
      .filter((row: any) => Boolean(row?.isDeudor))
      .forEach((row: any) => {
        const matricula = String(row?.matricula || '').trim()
        if (!matricula) return

        const current = studentRows.get(matricula) || {
          matricula,
          nombreCompleto: String(row?.nombreCompleto || '').trim(),
          nivel: String(row?.nivel || '').trim(),
          grado: String(row?.grado || '').trim(),
          grupo: String(row?.grupo || '').trim(),
          plantel: String(row?.plantel || plantel).trim().toUpperCase(),
          saldoPendiente: 0,
          totalCargos: 0,
          totalPagado: 0,
          fechaLimitePago: '',
          conceptos: new Map<number, {
            id: number
            concepto: string
            saldo: number
            cargos: number
            pagado: number
            periodos: string[]
          }>(),
        }

        current.saldoPendiente += Number(row?.saldoPendiente || 0)
        current.totalCargos += Number(row?.totalCargos || 0)
        current.totalPagado += Number(row?.totalPagado || 0)
        const rowDeadline = String(row?.fechaLimitePago || '').trim()
        if (rowDeadline && (!current.fechaLimitePago || rowDeadline < current.fechaLimitePago)) {
          current.fechaLimitePago = rowDeadline
        }

        ;(row?.desglose || []).forEach((item: any) => {
          const id = Number(item?.conceptoId || 0)
          if (!selectedIds.has(id)) return
          const saldo = Number(item?.saldo || 0)
          if (saldo <= 0) return

          const concept = current.conceptos.get(id) || {
            id,
            concepto: conceptNameById.get(id) || String(item?.conceptoNombre || `Concepto financiero #${id}`),
            saldo: 0,
            cargos: 0,
            pagado: 0,
            periodos: [],
          }
          concept.saldo += saldo
          concept.cargos += Number(item?.subtotal || 0)
          concept.pagado += Number(item?.pagado || 0)
          const periodo = String(item?.mesLabel || item?.mesCargo || '').trim()
          if (periodo && !concept.periodos.includes(periodo)) concept.periodos.push(periodo)
          current.conceptos.set(id, concept)
        })

        studentRows.set(matricula, current)
      })

    const rows = Array.from(studentRows.values())
      .map((row) => {
        const conceptosPendientes = Array.from(row.conceptos.values())
          .map(item => ({
            ...item,
            saldo: Math.round(item.saldo * 100) / 100,
            cargos: Math.round(item.cargos * 100) / 100,
            pagado: Math.round(item.pagado * 100) / 100,
          }))
          .sort((a, b) => b.saldo - a.saldo || a.concepto.localeCompare(b.concepto, 'es', { sensitivity: 'base' }))

        return {
          matricula: row.matricula,
          nombreCompleto: row.nombreCompleto,
          nivel: row.nivel,
          grado: row.grado,
          grupo: row.grupo,
          plantel: row.plantel,
          saldoPendiente: Math.round(row.saldoPendiente * 100) / 100,
          totalCargos: Math.round(row.totalCargos * 100) / 100,
          totalPagado: Math.round(row.totalPagado * 100) / 100,
          fechaLimitePago: row.fechaLimitePago,
          conceptosPendientes,
          conceptosPendientesTexto: conceptosPendientes.map(item => item.concepto).join(', '),
        }
      })
      .filter(row => row.saldoPendiente > threshold && row.conceptosPendientes.length > 0)
      .sort((left, right) => (
        right.saldoPendiente - left.saldoPendiente ||
        left.nombreCompleto.localeCompare(right.nombreCompleto, 'es', { sensitivity: 'base' })
      ))

    const conceptSummaryMap = new Map<number, {
      id: number
      concepto: string
      alumnos: Set<string>
      saldo: number
      cargos: number
      pagado: number
    }>()

    rows.forEach((row) => {
      row.conceptosPendientes.forEach((item) => {
        const summary = conceptSummaryMap.get(item.id) || {
          id: item.id,
          concepto: item.concepto,
          alumnos: new Set<string>(),
          saldo: 0,
          cargos: 0,
          pagado: 0,
        }
        summary.alumnos.add(row.matricula)
        summary.saldo += item.saldo
        summary.cargos += item.cargos
        summary.pagado += item.pagado
        conceptSummaryMap.set(item.id, summary)
      })
    })

    const totalSaldo = rows.reduce((sum: number, row: any) => sum + Number(row.saldoPendiente || 0), 0)
    const totalCargos = rows.reduce((sum: number, row: any) => sum + Number(row.totalCargos || 0), 0)
    const totalPagado = rows.reduce((sum: number, row: any) => sum + Number(row.totalPagado || 0), 0)
    const conceptos = Array.from(conceptSummaryMap.values())
      .map(item => ({
        id: item.id,
        concepto: item.concepto,
        alumnos: item.alumnos.size,
        saldo: Math.round(item.saldo * 100) / 100,
        cargos: Math.round(item.cargos * 100) / 100,
        pagado: Math.round(item.pagado * 100) / 100,
      }))
      .sort((a, b) => b.saldo - a.saldo || a.concepto.localeCompare(b.concepto, 'es', { sensitivity: 'base' }))

    return {
      modo: 'debtors',
      concepto: context.concepto,
      conceptos: context.conceptos,
      rows,
      filtros: {
        plantel,
        ciclo,
        cicloLabel: formatCicloLabel(ciclo),
        conceptoIds: context.conceptoIds,
        threshold,
      },
      resumen: {
        alumnos: rows.length,
        saldoPendiente: Math.round(totalSaldo * 100) / 100,
        totalCargos: Math.round(totalCargos * 100) / 100,
        totalPagado: Math.round(totalPagado * 100) / 100,
        threshold,
        conceptos,
      },
    }
  })
}

export const loadConceptReport = async (user: any, filters: Record<string, unknown>) => {
  const mode = conceptReportMode(filters)
  if (mode === 'missing') return await loadMissingConceptReport(user, filters)
  if (mode === 'debtors') return await loadDebtorConceptReport(user, filters)

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
      A.nombres AS nombresBase,
      A.apellidoPaterno AS apellidoPaternoBase,
      A.apellidoMaterno AS apellidoMaternoBase,
      A.curp AS curpBase,
      ${PAYMENT_PLANTEL_SQL} AS scopePlantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${where}
    ORDER BY r.fecha DESC, r.folio DESC
  `, params)

  // Match the Alumno report's identity source contract: Bridge `base` owns the
  // student names and academic placement, while central matrícula may enrich CURP only.
  // A central outage must never remove a financial movement from this report.
  let centralMatricula = new Map<string, any>()
  try {
    centralMatricula = await fetchCentralMatriculaOverlays(rawRows.map((row) => String(row.matricula || '')))
  } catch {
    // Bridge data remains sufficient for the report and is authoritative for placement.
  }

  // Deliberately no status/cycle/projected-plantel post-filter here. Every ledger row that
  // matches the user's explicit concept/date/user filters must survive into the report.
  const rows = rawRows.map((row) => {
    const academic = resolveFinancialAcademicPlacement(row, row.ciclo)
    const montoRegistrado = Number(row.monto || 0)
    const montoAplicado = resolvePaymentAppliedAmount(row)
    const matriculaKey = String(row.matricula || '').trim().toUpperCase()
    const centralCurp = normalizeCurp(centralMatricula.get(matriculaKey)?.student?.curp)
    const resolvedCurp = centralCurp || normalizeCurp(row.curpBase)
    const {
      nombresBase,
      apellidoPaternoBase,
      apellidoMaternoBase,
      curpBase: _curpBase,
      ...safeRow
    } = omitRawFinancialAcademicFields(row)

    return {
      ...safeRow,
      ...academic,
      nombres: String(nombresBase || '').trim(),
      apellidoPaterno: String(apellidoPaternoBase || '').trim(),
      apellidoMaterno: String(apellidoMaternoBase || '').trim(),
      curp: resolvedCurp,
      fechaNacimiento: birthDateFromCurp(resolvedCurp),
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
    modo: 'movements',
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
  const whereParts = paymentScope.where ? [paymentScope.where] : []
  const params = [...paymentScope.params]
  const requestedCiclo = firstQueryValue(filters?.ciclo)

  if (requestedCiclo) {
    const cicloKey = normalizeCicloKey(requestedCiclo)
    const cicloLabel = formatCicloLabel(cicloKey)
    whereParts.push('CAST(r.ciclo AS CHAR) IN (?, ?)')
    params.push(cicloKey, cicloLabel)
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''
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
  `, params)

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
