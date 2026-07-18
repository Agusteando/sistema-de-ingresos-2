import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { displayGrado, normalizeNivelEscolar } from '../../../shared/utils/grado'
import { resolveFinancialFamilyContact } from '../../../shared/utils/familyContact'
import { PLANTELES_LIST } from '../../../utils/constants'
import { normalizePlantel } from '../../utils/auth-session'
import { fetchCentralMatriculaOverlays } from '../../utils/central-matricula-overlay'
import { controlEscolarCentralQuery } from '../../utils/control-escolar-central'
import { query as bridgeQuery, runWithBridgeAgentId } from '../../utils/db'
import {
  assertNoAdeudoBridgeTablesAvailable,
  NO_ADEUDO_HISTORY_TABLE,
  NO_ADEUDO_MARK_TABLE
} from '../../utils/no-adeudo-history'

const VALID_PLANTELES = new Set(PLANTELES_LIST)

const firstQueryValue = (value: unknown) => {
  if (Array.isArray(value)) return firstQueryValue(value[0])
  return value === null || value === undefined ? '' : String(value).trim()
}

const normalizeDate = (value: unknown, label: string) => {
  const normalized = firstQueryValue(value)
  if (!normalized) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createError({ statusCode: 400, message: `${label} debe usar el formato AAAA-MM-DD.` })
  }
  return normalized
}

const parseRecipientEmails = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return Array.from(new Set(parsed.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)))
    }
  } catch {
    // Compatibilidad con valores delimitados si el dato fue cargado manualmente.
  }

  return Array.from(new Set(
    raw.split(/[;,\n]+/).map((email) => email.trim().toLowerCase()).filter(Boolean)
  ))
}

const displayNivel = (value: unknown) => {
  const normalized = normalizeNivelEscolar(value)
  if (normalized) return normalized
  const text = String(value || '').trim()
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : ''
}

const recipientModeLabel = (value: unknown) => {
  const mode = String(value || '').trim().toLowerCase()
  if (mode === 'parents') return 'Padres / tutores'
  if (mode === 'control') return 'Control Escolar'
  if (mode === 'parents_control') return 'Padres y Control Escolar'
  return ''
}

const isMissingLegacyMarkTable = (error: any) => {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || error?.sqlMessage || '')
  return code === 'ER_NO_SUCH_TABLE' || (
    /no_adeudo_deudor_cartas/i.test(message) && /doesn.?t exist|no existe/i.test(message)
  )
}

type ReportFilters = {
  ciclo: string
  inicio: string
  fin: string
}

const buildScopedWhere = (alias: string, plantel: string, filters: ReportFilters) => {
  const prefix = alias ? `${alias}.` : ''
  const where = [`${prefix}plantel = ?`]
  const params: any[] = [plantel]

  if (filters.ciclo) {
    where.push(`${prefix}ciclo = ?`)
    params.push(filters.ciclo)
  }
  if (filters.inicio) {
    where.push(`DATE(${prefix}sent_at) >= ?`)
    params.push(filters.inicio)
  }
  if (filters.fin) {
    where.push(`DATE(${prefix}sent_at) <= ?`)
    params.push(filters.fin)
  }

  return { where, params }
}

const fetchBridgeReportRows = async (plantel: string, filters: ReportFilters) => {
  return await runWithBridgeAgentId(plantel, async () => {
    await assertNoAdeudoBridgeTablesAvailable()

    const historyFilter = buildScopedWhere('h', plantel, filters)
    const markFilter = buildScopedWhere('m', plantel, filters)
    const [historyRows, markRows] = await Promise.all([
      bridgeQuery<any[]>(`
        SELECT
          h.id,
          h.plantel,
          h.matricula,
          h.student_name AS studentName,
          h.tutor_name AS tutorName,
          h.nivel,
          h.grado,
          h.grupo,
          h.ciclo,
          h.folio,
          h.recipient_emails AS recipientEmailsRaw,
          h.recipient_mode AS recipientMode,
          h.had_debt AS hadDebt,
          h.debt_total AS debtTotal,
          DATE_FORMAT(h.sent_at, '%Y-%m-%d %H:%i:%s') AS sentAt,
          h.sent_by_name AS sentByName,
          h.sent_by_email AS sentByEmail,
          'captured' AS recordStatus
        FROM \`${NO_ADEUDO_HISTORY_TABLE}\` h
        WHERE ${historyFilter.where.join(' AND ')}
      `, historyFilter.params),
      bridgeQuery<any[]>(`
        SELECT
          NULL AS id,
          m.plantel,
          m.matricula,
          '' AS studentName,
          '' AS tutorName,
          '' AS nivel,
          '' AS grado,
          '' AS grupo,
          m.ciclo,
          m.folio,
          '' AS recipientEmailsRaw,
          '' AS recipientMode,
          NULL AS hadDebt,
          NULL AS debtTotal,
          DATE_FORMAT(m.sent_at, '%Y-%m-%d %H:%i:%s') AS sentAt,
          m.sent_by_name AS sentByName,
          m.sent_by_email AS sentByEmail,
          'bridge_mark' AS recordStatus
        FROM \`${NO_ADEUDO_MARK_TABLE}\` m
        WHERE ${markFilter.where.join(' AND ')}
      `, markFilter.params)
    ])

    const capturedFolios = new Set(historyRows.map((row) => [
      String(row.plantel || '').trim().toUpperCase(),
      String(row.matricula || '').trim().toUpperCase(),
      String(row.ciclo || '').trim(),
      String(row.folio || '').trim()
    ].join('::')))

    const unmatchedMarks = markRows.filter((row) => !capturedFolios.has([
      String(row.plantel || '').trim().toUpperCase(),
      String(row.matricula || '').trim().toUpperCase(),
      String(row.ciclo || '').trim(),
      String(row.folio || '').trim()
    ].join('::')))

    return [...historyRows, ...unmatchedMarks]
  })
}

const fetchLegacyExternalRows = async (planteles: string[], filters: ReportFilters) => {
  if (!planteles.length) return []

  const where = [`m.plantel IN (${planteles.map(() => '?').join(', ')})`]
  const params: any[] = [...planteles]
  if (filters.ciclo) {
    where.push('m.ciclo = ?')
    params.push(filters.ciclo)
  }
  if (filters.inicio) {
    where.push('DATE(m.sent_at) >= ?')
    params.push(filters.inicio)
  }
  if (filters.fin) {
    where.push('DATE(m.sent_at) <= ?')
    params.push(filters.fin)
  }

  return await controlEscolarCentralQuery<any[]>(`
    SELECT
      NULL AS id,
      m.plantel,
      m.matricula,
      '' AS studentName,
      '' AS tutorName,
      '' AS nivel,
      '' AS grado,
      '' AS grupo,
      m.ciclo,
      m.folio,
      '' AS recipientEmailsRaw,
      '' AS recipientMode,
      NULL AS hadDebt,
      NULL AS debtTotal,
      DATE_FORMAT(m.sent_at, '%Y-%m-%d %H:%i:%s') AS sentAt,
      m.sent_by_name AS sentByName,
      m.sent_by_email AS sentByEmail,
      'external_legacy' AS recordStatus
    FROM \`${NO_ADEUDO_MARK_TABLE}\` m
    WHERE ${where.join(' AND ')}
  `, params)
}

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user?.hasFinancialAccess) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para consultar este reporte.' })
  }

  const requestQuery = getQuery(event)
  const requestedPlantel = normalizePlantel(firstQueryValue(requestQuery.plantel))
  if (requestedPlantel && requestedPlantel !== 'GLOBAL' && !VALID_PLANTELES.has(requestedPlantel)) {
    throw createError({ statusCode: 400, message: 'Plantel inválido.' })
  }

  const canFilterPlantel = Boolean(user.isSuperAdmin && user.active_plantel === 'GLOBAL')
  const authorizedPlanteles: string[] = Array.from(new Set<string>(
    (user.financialPlantelesList || user.plantelesList || [])
      .map(normalizePlantel)
      .filter((plantel: string) => VALID_PLANTELES.has(plantel))
  ))
  const activePlantel = normalizePlantel(user.active_plantel)
  const scopePlanteles: string[] = canFilterPlantel
    ? (requestedPlantel && requestedPlantel !== 'GLOBAL' ? [requestedPlantel] : authorizedPlanteles)
    : [activePlantel].filter((plantel) => VALID_PLANTELES.has(plantel))

  if (!scopePlanteles.length) {
    throw createError({ statusCode: 403, message: 'La sesión no tiene planteles financieros disponibles para este reporte.' })
  }
  if (scopePlanteles.some((plantel) => !authorizedPlanteles.includes(plantel))) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para consultar el plantel solicitado.' })
  }

  const cicloInput = firstQueryValue(requestQuery.ciclo)
  const filters: ReportFilters = {
    ciclo: cicloInput ? normalizeCicloKey(cicloInput) : '',
    inicio: normalizeDate(requestQuery.inicio, 'La fecha inicial'),
    fin: normalizeDate(requestQuery.fin, 'La fecha final')
  }
  const search = firstQueryValue(requestQuery.search).slice(0, 120).toLowerCase()

  if (filters.inicio && filters.fin && filters.inicio > filters.fin) {
    throw createError({ statusCode: 400, message: 'La fecha inicial no puede ser posterior a la fecha final.' })
  }

  const bridgeGroups = await Promise.all(scopePlanteles.map((plantel) => fetchBridgeReportRows(plantel, filters)))
  const bridgeRows = bridgeGroups.flat()
  const warnings: string[] = []
  let legacyRows: any[] = []

  try {
    legacyRows = await fetchLegacyExternalRows(scopePlanteles, filters)
  } catch (error: any) {
    if (!isMissingLegacyMarkTable(error)) {
      console.error('[No Adeudo Report] No se pudo consultar la marca histórica externa:', error?.message || error)
      warnings.push('No se pudo consultar el histórico anterior almacenado en Control Escolar. Los envíos nuevos del bridge sí están incluidos.')
    }
  }

  const bridgeKeys = new Set(bridgeRows.map((row) => [
    String(row.plantel || '').trim().toUpperCase(),
    String(row.matricula || '').trim().toUpperCase(),
    String(row.ciclo || '').trim(),
    String(row.folio || '').trim()
  ].join('::')))
  const uniqueLegacyRows = legacyRows.filter((row) => !bridgeKeys.has([
    String(row.plantel || '').trim().toUpperCase(),
    String(row.matricula || '').trim().toUpperCase(),
    String(row.ciclo || '').trim(),
    String(row.folio || '').trim()
  ].join('::')))

  const sourceRows = [...bridgeRows, ...uniqueLegacyRows]
  let centralOverlays = new Map<string, any>()
  try {
    centralOverlays = await fetchCentralMatriculaOverlays(sourceRows.map((row) => String(row.matricula || '')))
  } catch (error: any) {
    console.error('[No Adeudo Report] No se pudo enriquecer el reporte con matrícula central:', error?.message || error)
    warnings.push('No se pudo enriquecer el reporte con datos actuales de matrícula. Los registros nuevos conservan la información capturada al enviarse.')
  }

  let enrichedRows = sourceRows.map((row) => {
    const matriculaKey = String(row.matricula || '').trim().toUpperCase()
    const centralStudent = centralOverlays.get(matriculaKey)?.student || {}
    const familyContact = resolveFinancialFamilyContact(centralStudent)
    const capturedRecipients = parseRecipientEmails(row.recipientEmailsRaw)
    const studentName = String(
      row.studentName ||
      centralStudent.nombreCompleto ||
      centralStudent.nombreCompletoAlumno ||
      centralStudent.fullName ||
      ''
    ).trim()
    const tutorName = String(row.tutorName || familyContact.tutorName || '').trim()
    const gradoRaw = String(row.grado || centralStudent.grado || '').trim()
    const nivelRaw = String(row.nivel || centralStudent.nivel || '').trim()
    const grupo = String(row.grupo || centralStudent.grupo || '').trim()
    const recordStatus = row.recordStatus === 'captured' ? 'captured' : String(row.recordStatus || 'external_legacy')

    return {
      id: row.id || null,
      plantel: String(row.plantel || '').trim().toUpperCase(),
      matricula: matriculaKey,
      studentName,
      tutorName,
      nivel: displayNivel(nivelRaw),
      grado: gradoRaw ? displayGrado(gradoRaw) : '',
      grupo,
      ciclo: String(row.ciclo || '').trim(),
      folio: String(row.folio || '').trim(),
      recipientEmails: capturedRecipients,
      recipientMode: String(row.recipientMode || '').trim(),
      recipientModeLabel: recipientModeLabel(row.recipientMode),
      hadDebt: row.hadDebt === null || row.hadDebt === undefined ? null : Boolean(Number(row.hadDebt)),
      debtTotal: row.debtTotal === null || row.debtTotal === undefined ? null : Number(row.debtTotal || 0),
      sentAt: String(row.sentAt || '').trim(),
      sentByName: String(row.sentByName || '').trim(),
      sentByEmail: String(row.sentByEmail || '').trim().toLowerCase(),
      recordStatus,
      recipientDataExact: recordStatus === 'captured'
    }
  })

  if (search) {
    enrichedRows = enrichedRows.filter((row) => [
      row.plantel,
      row.matricula,
      row.studentName,
      row.tutorName,
      row.nivel,
      row.grado,
      row.grupo,
      row.ciclo,
      row.folio,
      row.recipientModeLabel,
      row.sentByName,
      row.sentByEmail,
      ...row.recipientEmails
    ].some((value) => String(value || '').toLowerCase().includes(search)))
  }

  enrichedRows.sort((left, right) => {
    const dateCompare = String(right.sentAt).localeCompare(String(left.sentAt))
    if (dateCompare) return dateCompare
    return `${left.plantel}-${left.matricula}`.localeCompare(`${right.plantel}-${right.matricula}`)
  })

  const students = new Set<string>()
  const senders = new Set<string>()
  const recipients = new Set<string>()
  const reportPlanteles = new Set<string>()
  let incomplete = 0

  for (const row of enrichedRows) {
    students.add(`${row.plantel}::${row.matricula}`)
    const sender = String(row.sentByEmail || row.sentByName || '').trim().toLowerCase()
    if (sender) senders.add(sender)
    row.recipientEmails.forEach((email) => recipients.add(email))
    if (row.plantel) reportPlanteles.add(row.plantel)
    if (!row.recipientDataExact) incomplete += 1
  }

  return {
    rows: enrichedRows,
    summary: {
      total: enrichedRows.length,
      students: students.size,
      senders: senders.size,
      recipients: recipients.size,
      planteles: reportPlanteles.size,
      incomplete,
      lastSentAt: enrichedRows[0]?.sentAt || ''
    },
    warnings,
    scope: {
      plantel: scopePlanteles.length === 1 ? scopePlanteles[0] : 'GLOBAL',
      canFilterPlantel
    }
  }
})
