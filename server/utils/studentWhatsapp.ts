import { query } from './db'
import { fetchCentralMatriculaOverlays } from './central-matricula-overlay'
import { plantelCandidatesForProjectedScope } from '../../shared/utils/grado'
import { resolveFinancialFamilyContact } from '../../shared/utils/familyContact'

const MAX_BULK_RECIPIENTS = 250

export const normalizeWhatsappMatriculas = (values: unknown) => {
  const input = Array.isArray(values) ? values : []
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of input) {
    const matricula = String(value || '').trim()
    if (!matricula) continue
    const key = matricula.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(matricula)
    if (output.length > MAX_BULK_RECIPIENTS) {
      throw createError({ statusCode: 400, statusMessage: `Máximo ${MAX_BULK_RECIPIENTS} alumnos por envío.` })
    }
  }

  return output
}

const normalizeMexicoWhatsappNumber = (value: unknown) => {
  const raw = String(value || '').trim()
  let digits = raw.replace(/\D+/g, '')
  if (!digits) return ''

  const explicitlyInternational = raw.startsWith('+') || digits.startsWith('00')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if ((digits.startsWith('044') || digits.startsWith('045')) && digits.length === 13) digits = digits.slice(3)
  if (digits.startsWith('01') && digits.length === 12) digits = digits.slice(2)
  if (digits.startsWith('521') && digits.length === 13) digits = `52${digits.slice(3)}`
  if (digits.length === 10) return `52${digits}`
  if (digits.startsWith('52') && digits.length === 12) return digits
  if (explicitlyInternational && digits.length >= 11 && digits.length <= 15) return digits

  return ''
}

const maskWhatsappNumber = (digits: string) => {
  if (!digits) return ''
  const local = digits.startsWith('52') && digits.length >= 12 ? digits.slice(-10) : digits
  if (local.length <= 4) return local
  return `••••••${local.slice(-4)}`
}

const studentRowsForScope = async (matriculas: string[], user: any) => {
  if (!matriculas.length) return []

  const params: any[] = [...matriculas]
  let sql = `
    SELECT matricula, nombreCompleto, telefono, correo, plantel, \`Nombre del padre o tutor\` AS padre
    FROM base
    WHERE UPPER(TRIM(CAST(matricula AS CHAR))) IN (${matriculas.map(() => '?').join(', ')})
  `
  params.splice(0, params.length, ...matriculas.map(matricula => matricula.toUpperCase()))

  const scopedToPlantel = !user?.isSuperAdmin || String(user?.active_plantel || '').toUpperCase() !== 'GLOBAL'
  if (scopedToPlantel) {
    const planteles = plantelCandidatesForProjectedScope(user?.active_plantel)
    if (!planteles.length) return []
    sql += ` AND plantel IN (${planteles.map(() => '?').join(', ')})`
    params.push(...planteles)
  }

  return await query<any[]>(sql, params)
}

export const resolveStudentWhatsappAudience = async (values: unknown, user: any) => {
  const matriculas = normalizeWhatsappMatriculas(values)
  if (!matriculas.length) {
    throw createError({ statusCode: 400, statusMessage: 'Selecciona al menos un alumno.' })
  }

  const rows = await studentRowsForScope(matriculas, user)
  const rowMap = new Map(rows.map(row => [String(row.matricula || '').trim().toUpperCase(), row]))

  let overlays = new Map<string, any>()
  try {
    overlays = await fetchCentralMatriculaOverlays(rows.map(row => String(row.matricula || '')))
  } catch (error) {
    console.warn('[WhatsApp bulk] Control escolar contact overlay unavailable:', (error as any)?.message || error)
  }

  const recipients: any[] = []
  const groupMap = new Map<string, { chatId: string; phoneMasked: string; matriculas: string[]; names: string[] }>()

  for (const requestedMatricula of matriculas) {
    const key = requestedMatricula.toUpperCase()
    const row = rowMap.get(key)
    if (!row) {
      recipients.push({
        matricula: requestedMatricula,
        nombreCompleto: requestedMatricula,
        status: 'not_found',
        phoneMasked: ''
      })
      continue
    }

    const overlay = overlays.get(String(row.matricula || '').trim().toUpperCase())
    const source = {
      ...row,
      ...(overlay?.student || {}),
      matricula: row.matricula,
      nombreCompleto: overlay?.student?.nombreCompleto || row.nombreCompleto,
      centralMatricula: overlay?.student || null
    }
    const family = resolveFinancialFamilyContact(source)
    const normalizedPhone = normalizeMexicoWhatsappNumber(family.phone || row.telefono)
    const chatId = normalizedPhone ? `${normalizedPhone}@c.us` : ''
    const recipient = {
      matricula: String(row.matricula || requestedMatricula),
      nombreCompleto: String(source.nombreCompleto || row.nombreCompleto || requestedMatricula),
      status: chatId ? 'ready' : 'missing_phone',
      phoneMasked: maskWhatsappNumber(normalizedPhone)
    }
    recipients.push(recipient)

    if (!chatId) continue
    const existing = groupMap.get(chatId)
    if (existing) {
      existing.matriculas.push(recipient.matricula)
      existing.names.push(recipient.nombreCompleto)
    } else {
      groupMap.set(chatId, {
        chatId,
        phoneMasked: recipient.phoneMasked,
        matriculas: [recipient.matricula],
        names: [recipient.nombreCompleto]
      })
    }
  }

  const groups = Array.from(groupMap.values())
  const reachableStudents = recipients.filter(recipient => recipient.status === 'ready').length
  const missingPhone = recipients.filter(recipient => recipient.status === 'missing_phone').length
  const notFound = recipients.filter(recipient => recipient.status === 'not_found').length

  return {
    matriculas,
    recipients,
    groups,
    chatIds: groups.map(group => group.chatId),
    summary: {
      selected: matriculas.length,
      reachableStudents,
      chats: groups.length,
      missingPhone,
      notFound,
      deduplicated: Math.max(0, reachableStudents - groups.length)
    }
  }
}
