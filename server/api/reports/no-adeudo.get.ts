import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { displayGrado } from '../../../shared/utils/grado'
import { PLANTELES_LIST } from '../../../utils/constants'
import { normalizePlantel } from '../../utils/auth-session'
import { fetchCentralMatriculaOverlays } from '../../utils/central-matricula-overlay'
import { controlEscolarCentralQuery } from '../../utils/control-escolar-central'

const NO_ADEUDO_TABLE = 'no_adeudo_deudor_cartas'
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
  const search = firstQueryValue(query.search).slice(0, 120)

  if (inicio && fin && inicio > fin) {
    throw createError({ statusCode: 400, message: 'La fecha inicial no puede ser posterior a la fecha final.' })
  }

  const where: string[] = []
  const params: any[] = []

  if (scopePlantel) {
    where.push('plantel = ?')
    params.push(scopePlantel)
  }
  if (ciclo) {
    where.push('ciclo = ?')
    params.push(ciclo)
  }
  if (inicio) {
    where.push('DATE(sent_at) >= ?')
    params.push(inicio)
  }
  if (fin) {
    where.push('DATE(sent_at) <= ?')
    params.push(fin)
  }
  if (search) {
    const like = `%${search}%`
    where.push('(matricula LIKE ? OR folio LIKE ? OR sent_by_name LIKE ? OR sent_by_email LIKE ?)')
    params.push(like, like, like, like)
  }

  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT
      plantel,
      matricula,
      ciclo,
      folio,
      DATE_FORMAT(sent_at, '%Y-%m-%d %H:%i:%s') AS sentAt,
      sent_by_name AS sentByName,
      sent_by_email AS sentByEmail
    FROM \`${NO_ADEUDO_TABLE}\`
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY sent_at DESC, plantel ASC, matricula ASC
  `, params)

  const centralOverlays = await fetchCentralMatriculaOverlays(rows.map((row) => String(row.matricula || '')))
  const enrichedRows = rows.map((row) => {
    const matriculaKey = String(row.matricula || '').trim().toUpperCase()
    const centralStudent = centralOverlays.get(matriculaKey)?.student
    const grado = String(centralStudent?.grado || '').trim()
    return {
      ...row,
      grado: grado ? displayGrado(grado) : ''
    }
  })

  const students = new Set<string>()
  const senders = new Set<string>()
  const planteles = new Set<string>()

  for (const row of enrichedRows) {
    students.add(`${String(row.plantel || '').trim()}::${String(row.matricula || '').trim()}`)
    const sender = String(row.sentByEmail || row.sentByName || '').trim().toLowerCase()
    if (sender) senders.add(sender)
    const plantel = String(row.plantel || '').trim().toUpperCase()
    if (plantel) planteles.add(plantel)
  }

  return {
    rows: enrichedRows,
    summary: {
      total: enrichedRows.length,
      students: students.size,
      senders: senders.size,
      planteles: planteles.size,
      lastSentAt: rows[0]?.sentAt || ''
    },
    scope: {
      plantel: scopePlantel || 'GLOBAL',
      canFilterPlantel
    }
  }
})
