const MAX_BULK_RECIPIENTS = 250

export type StudentEmailAudienceOptions = {
  contactSource?: 'selection'
  students?: any[]
}

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const isValidEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))

export const normalizeStudentEmailMatriculas = (values: unknown) => {
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

const selectedStudentRows = (matriculas: string[], students: any[]) => {
  const requested = new Set(matriculas.map((matricula) => matricula.toUpperCase()))
  const rows = new Map<string, any>()

  for (const student of Array.isArray(students) ? students : []) {
    const matricula = String(student?.matricula || '').trim()
    const key = matricula.toUpperCase()
    if (!matricula || !requested.has(key) || rows.has(key)) continue

    rows.set(key, {
      matricula,
      nombreCompleto: String(
        student?.nombreCompleto || student?.fullName || student?.full_name || student?.name || matricula,
      ).trim(),
      emailPadre: student?.emailPadre ?? student?.email_padre ?? student?.correoPadre ?? student?.correo_padre ?? '',
      emailMadre: student?.emailMadre ?? student?.email_madre ?? student?.correoMadre ?? student?.correo_madre ?? '',
      email: student?.email ?? student?.correo ?? '',
      correo: student?.correo ?? '',
      huskyPassEmail: student?.huskyPassEmail ?? student?.husky_pass_email ?? '',
    })
  }

  return matriculas.map((matricula) => rows.get(matricula.toUpperCase())).filter(Boolean)
}

const uniqueStudentEmails = (student: any) => {
  const seen = new Set<string>()
  const values = [
    student?.emailPadre,
    student?.emailMadre,
    student?.email,
    student?.correo,
    student?.huskyPassEmail,
  ]

  return values
    .map(normalizeEmail)
    .filter((email) => {
      if (!isValidEmail(email) || seen.has(email)) return false
      seen.add(email)
      return true
    })
}

export const resolveStudentEmailAudience = async (
  values: unknown,
  user: any,
  options: StudentEmailAudienceOptions = {},
) => {
  const matriculas = normalizeStudentEmailMatriculas(values)
  if (!matriculas.length) {
    throw createError({ statusCode: 400, statusMessage: 'Selecciona al menos un alumno.' })
  }

  if (options.contactSource !== 'selection') {
    throw createError({ statusCode: 400, statusMessage: 'Control Escolar requiere los correos de la selección actual.' })
  }
  if (!user?.hasControlEscolarRole && !user?.isSuperAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'No tiene permisos para enviar correos desde Control Escolar.' })
  }

  const rows = selectedStudentRows(matriculas, options.students || [])
  const rowMap = new Map(rows.map((row) => [String(row.matricula || '').trim().toUpperCase(), row]))
  const recipients: any[] = []
  const groupMap = new Map<string, { email: string; matriculas: string[]; names: string[] }>()
  let totalTargets = 0

  for (const requestedMatricula of matriculas) {
    const row = rowMap.get(requestedMatricula.toUpperCase())
    if (!row) {
      recipients.push({
        matricula: requestedMatricula,
        nombreCompleto: requestedMatricula,
        status: 'not_found',
        emails: [],
      })
      continue
    }

    const emails = uniqueStudentEmails(row)
    recipients.push({
      matricula: String(row.matricula || requestedMatricula),
      nombreCompleto: String(row.nombreCompleto || requestedMatricula),
      status: emails.length ? 'ready' : 'missing_email',
      emails,
    })

    totalTargets += emails.length
    for (const email of emails) {
      const existing = groupMap.get(email)
      if (existing) {
        existing.matriculas.push(String(row.matricula || requestedMatricula))
        existing.names.push(String(row.nombreCompleto || requestedMatricula))
      } else {
        groupMap.set(email, {
          email,
          matriculas: [String(row.matricula || requestedMatricula)],
          names: [String(row.nombreCompleto || requestedMatricula)],
        })
      }
    }
  }

  const groups = Array.from(groupMap.values())
  const reachableStudents = recipients.filter((recipient) => recipient.status === 'ready').length
  const missingEmail = recipients.filter((recipient) => recipient.status === 'missing_email').length
  const notFound = recipients.filter((recipient) => recipient.status === 'not_found').length

  return {
    matriculas,
    recipients,
    groups,
    summary: {
      selected: matriculas.length,
      reachableStudents,
      emails: groups.length,
      missingEmail,
      notFound,
      deduplicated: Math.max(0, totalTargets - groups.length),
    },
  }
}
