import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { displayGrado, normalizeNivelEscolar } from '../../../shared/utils/grado'
import { resolveFinancialFamilyContact } from '../../../shared/utils/familyContact'
import { PLANTELES_LIST } from '../../../utils/constants'
import { normalizePlantel } from '../../utils/auth-session'
import { fetchCentralMatriculaOverlays } from '../../utils/central-matricula-overlay'
import { controlEscolarCentralQuery } from '../../utils/control-escolar-central'
import {
  ensureNoAdeudoHistoryTableAvailable,
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

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user?.hasFinancialAccess) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para consultar este reporte.' })
  }

  const query = getQuery(event)
  const requestedPlantel = normalizePlantel(firstQueryValue(query.plantel))
  if (requestedPlantel && requestedPlantel !== 'GLOBAL' && !VALID_PLANTELES.has(requestedPlantel)) {
    throw createError({ statusCode: 400, message: 'Plantel inválido.' })
  }

  const canFilterPlantel = Boolean(user.isSuperAdmin && user.active_plantel === 'GLOBAL')
  const scopePlantel = canFilterPlantel
    ? (requestedPlantel === 'GLOBAL' ? '' : requestedPlantel)
    : normalizePlantel(user.active_plantel)

  const cicloInput = firstQueryValue(query.ciclo)
  const ciclo = cicloInput ? normalizeCicloKey(cicloInput) : ''
  const inicio = normalizeDate(query.inicio, 'La fecha inicial')
  const fin = normalizeDate(query.fin, 'La fecha final')
  const search = firstQueryValue(query.search).slice(0, 120).toLowerCase()

  if (inicio && fin && inicio > fin) {
    throw createError({ statusCode: 400, message: 'La fecha inicial no puede ser posterior a la fecha final.' })
  }

  await ensureNoAdeudoHistoryTableAvailable()

  const buildWhere = (alias: string) => {
    const where: string[] = []
    const params: any[] = []
    const prefix = alias ? `${alias}.` : ''

    if (scopePlantel) {
      where.push(`${prefix}plantel = ?`)
      params.push(scopePlantel)
    }
    if (ciclo) {
      where.push(`${prefix}ciclo = ?`)
      params.push(ciclo)
    }
    if (inicio) {
      where.push(`DATE(${prefix}sent_at) >= ?`)
      params.push(inicio)
    }
    if (fin) {
      where.push(`DATE(${prefix}sent_at) <= ?`)
      params.push(fin)
    }

    return { where, params }
  }

  const historyFilter = buildWhere('h')
  const legacyFilter = buildWhere('m')

  const [historyRows, legacyRows] = await Promise.all([
    controlEscolarCentralQuery<any[]>(`
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
      ${historyFilter.where.length ? `WHERE ${historyFilter.where.join(' AND ')}` : ''}
    `, historyFilter.params),
    controlEscolarCentralQuery<any[]>(`
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
        'legacy' AS recordStatus
      FROM \`${NO_ADEUDO_MARK_TABLE}\` m
      ${legacyFilter.where.length ? `WHERE ${legacyFilter.where.join(' AND ')} AND` : 'WHERE'}
        NOT EXISTS (
          SELECT 1
          FROM \`${NO_ADEUDO_HISTORY_TABLE}\` h
          WHERE h.plantel = m.plantel
            AND h.matricula = m.matricula
            AND h.ciclo = m.ciclo
            AND h.folio = m.folio
        )
    `, legacyFilter.params)
  ])

  const sourceRows = [...historyRows, ...legacyRows]
  const centralOverlays = await fetchCentralMatriculaOverlays(sourceRows.map((row) => String(row.matricula || '')))

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
    const recordStatus = row.recordStatus === 'captured' ? 'captured' : 'legacy'

    return {
      id: row.id || null,
      plantel: String(row.plantel || '').trim().toUpperCase(),
      matricula: String(row.matricula || '').trim().toUpperCase(),
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
  const planteles = new Set<string>()
  let incomplete = 0

  for (const row of enrichedRows) {
    students.add(`${row.plantel}::${row.matricula}`)
    const sender = String(row.sentByEmail || row.sentByName || '').trim().toLowerCase()
    if (sender) senders.add(sender)
    row.recipientEmails.forEach((email) => recipients.add(email))
    if (row.plantel) planteles.add(row.plantel)
    if (!row.recipientDataExact) incomplete += 1
  }

  return {
    rows: enrichedRows,
    summary: {
      total: enrichedRows.length,
      students: students.size,
      senders: senders.size,
      recipients: recipients.size,
      planteles: planteles.size,
      incomplete,
      lastSentAt: enrichedRows[0]?.sentAt || ''
    },
    scope: {
      plantel: scopePlantel || 'GLOBAL',
      canFilterPlantel
    }
  }
})
