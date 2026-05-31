import crypto from 'node:crypto'
import dayjs from 'dayjs'
import { query } from './db'
import { fetchCentralMatriculaOverlay } from './central-matricula-overlay'
import { resolveProjectedAmount } from './monto-final'
import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo } from '../../shared/utils/grado'
import { escapeHtml } from './cobranzaEmail'
import { generateNoAdeudoCartaPdf } from './noAdeudoCartaPdf'
import { sendEmail, type MailAttachment } from './mailer'

type RuntimeNoAdeudoConfig = {
  noAdeudoControlEscolarTo?: string
  noAdeudoAdminFrom?: string
  noAdeudoBlockOnDebt?: string | boolean
  noAdeudoVerifyBaseUrl?: string
  noAdeudoSignatureSecret?: string
  googlePrivateKey?: string
  adminEmailToImpersonate?: string
}

type NoAdeudoTokenPayload = {
  v: 1
  typ: 'no_adeudo'
  m: string
  n: string
  c: string
  p: string
  gg: string
  by: string
  be: string
  at: string
  f: string
  pv?: 1
}

export type NoAdeudoStudentContext = {
  student: Record<string, any>
  debt: {
    total: number
    hasDebt: boolean
    concepts: Array<{ documento: string; conceptoNombre: string; mesLabel: string; saldo: number }>
  }
  recipients: {
    parents: string[]
    control: string[]
    all: string[]
  }
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const normalizeText = (value: unknown) => String(value || '').trim()
const normalizeMatricula = (value: unknown) => normalizeText(value).toUpperCase()
const normalizeEmail = (value: unknown) => normalizeText(value).toLowerCase()
const unique = <T>(values: T[]) => Array.from(new Set(values.filter(Boolean)))
const formatMoney = (value: unknown) => Number(value || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const safeFilePart = (value: unknown) => normalizeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 90) || 'alumno'

const getNoAdeudoConfig = () => useRuntimeConfig() as unknown as RuntimeNoAdeudoConfig

const parseBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value
  return ['1', 'true', 'yes', 'si', 'sí'].includes(String(value || '').trim().toLowerCase())
}

const splitEmails = (value: unknown) => String(value || '')
  .split(/[;,\n]+/)
  .map(normalizeEmail)
  .filter((email) => emailRegex.test(email))

const parseScopedEmails = (raw: unknown, plantel: string) => {
  const value = String(raw || '').trim()
  if (!value) return [] as string[]

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return unique(parsed.map(normalizeEmail).filter((email) => emailRegex.test(email)))
    if (parsed && typeof parsed === 'object') {
      const source = parsed[plantel] || parsed[plantel.toUpperCase()] || parsed.default || parsed.global || ''
      return splitEmails(Array.isArray(source) ? source.join(',') : source)
    }
  } catch (e) {}

  const scopedEntries = value.split(';').map((entry) => entry.trim()).filter(Boolean)
  const hasScopes = scopedEntries.some((entry) => /[:=]/.test(entry))
  if (hasScopes) {
    const matches: string[] = []
    scopedEntries.forEach((entry) => {
      const [scope, emails] = entry.split(/[:=]/, 2)
      const key = String(scope || '').trim().toUpperCase()
      if ([plantel.toUpperCase(), 'DEFAULT', 'GLOBAL', '*'].includes(key)) matches.push(...splitEmails(emails))
    })
    return unique(matches)
  }

  return unique(splitEmails(value))
}

export const getNoAdeudoSettings = (plantel = '') => {
  const config = getNoAdeudoConfig()
  const normalizedPlantel = normalizeText(plantel).toUpperCase()
  return {
    blockOnDebt: parseBoolean(config.noAdeudoBlockOnDebt),
    controlEmails: parseScopedEmails(config.noAdeudoControlEscolarTo, normalizedPlantel),
    fromAddress: parseScopedEmails(config.noAdeudoAdminFrom, normalizedPlantel)[0] || normalizeEmail(config.adminEmailToImpersonate)
  }
}

const firstEmail = (...values: unknown[]) => {
  for (const value of values) {
    const email = normalizeEmail(value)
    if (emailRegex.test(email)) return email
  }
  return ''
}

const mergeCentralOverlay = async (student: Record<string, any>) => {
  try {
    const overlay = await fetchCentralMatriculaOverlay(student.matricula)
    const central = overlay?.student || null
    if (!central) return student
    return {
      ...student,
      centralMatricula: central,
      nombreCompleto: normalizeText(central.nombreCompleto || central.nombreCompletoAlumno) || student.nombreCompleto,
      curp: normalizeText(central.curp) || student.curp,
      padre: normalizeText(central.padre) || student.padre,
      madre: normalizeText(central.madre) || student.madre,
      emailPadre: firstEmail(central.emailPadre, central.correo) || student.emailPadre,
      emailMadre: firstEmail(central.emailMadre) || student.emailMadre,
      telefonoPadre: normalizeText(central.telefonoPadre) || student.telefonoPadre,
      telefonoMadre: normalizeText(central.telefonoMadre) || student.telefonoMadre,
      direccion: normalizeText(central.direccion) || student.direccion,
    }
  } catch (error) {
    return student
  }
}

const normalizePaymentMethod = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const isDepuracionPayment = (payment: any) => normalizePaymentMethod(payment.formaDePago) === 'depuracion' && (String(payment.depurado) === '1' || payment.depurado === true)

export const calculateNoAdeudoDebt = async (matricula: string, ciclo: string) => {
  const cicloKey = normalizeCicloKey(ciclo)
  const documentos = await query<any[]>(`
    SELECT d.documento, d.matricula, d.costo, d.montoFinal, d.meses, d.plazo, d.ciclo, d.conceptoNombre, d.eventual
    FROM documentos d
    WHERE d.matricula = ? AND d.ciclo = ? AND d.estatus = 'Activo'
  `, [matricula, cicloKey])

  const pagosRows = await query<any[]>(`
    SELECT documento, mes, recargo, monto, formaDePago, estatus, depurado
    FROM referenciasdepago
    WHERE matricula = ? AND ciclo = ? AND estatus = 'Vigente'
  `, [matricula, cicloKey])

  const periodRows = documentos.length
    ? await query<any[]>(`
        SELECT id, documento, start_mes, end_mes, concepto_id, conceptoNombre, costo, montoFinal, accion, estatus
        FROM documento_concepto_periodos
        WHERE documento IN (${documentos.map(() => '?').join(',')}) AND estatus = 'Activo'
        ORDER BY documento ASC, start_mes ASC, id ASC
      `, documentos.map(doc => doc.documento))
    : []

  const periodsByDocument = new Map<number, any[]>()
  periodRows.forEach((period) => {
    const key = Number(period.documento)
    const list = periodsByDocument.get(key) || []
    list.push(period)
    periodsByDocument.set(key, list)
  })

  const today = dayjs()
  const spanishMonths = ['Septiembre', 'Octubre', 'Noviembre', 'Diciembre', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto']
  const concepts: Array<{ documento: string; conceptoNombre: string; mesLabel: string; saldo: number }> = []

  for (const doc of documentos) {
    const isEventual = String(doc.eventual) === '1'
    let plazos = 1
    const plazoRaw = doc.plazo || doc.meses
    if (plazoRaw) {
      const plazoStr = String(plazoRaw).trim()
      if (plazoStr.startsWith('[')) {
        try { plazos = JSON.parse(plazoStr).length || 1 } catch (e) {}
      } else if (plazoStr.includes(',')) plazos = plazoStr.split(',').filter(Boolean).length || 1
      else plazos = parseInt(plazoStr) || 1
    }

    for (let mes = 1; mes <= plazos; mes++) {
      const mesStr = isEventual ? 'ev' : String(mes)
      const mesNumber = isEventual ? 1 : mes
      const activePeriod = (periodsByDocument.get(Number(doc.documento)) || []).find((period) => {
        const startMes = Number(period.start_mes || 1)
        const endMes = period.end_mes == null ? Number.POSITIVE_INFINITY : Number(period.end_mes)
        return mesNumber >= startMes && mesNumber <= endMes
      })
      if (activePeriod?.accion === 'cancelacion') continue

      const conceptoNombre = activePeriod?.conceptoNombre || doc.conceptoNombre || 'Concepto escolar'
      const projected = resolveProjectedAmount(doc, activePeriod)
      const totalOriginal = Number(projected.amount || 0)
      const pagosDelMes = pagosRows.filter(p => String(p.documento) === String(doc.documento) && (String(p.mes) === mesStr || String(p.mes) === String(mes)))
      const pagosTotalMes = pagosDelMes.filter(p => !isDepuracionPayment(p)).reduce((sum, p) => sum + Number(p.monto || 0), 0)
      const depuradoTotalMes = pagosDelMes.filter(isDepuracionPayment).reduce((sum, p) => sum + Number(p.monto || 0), 0)
      const resueltoTotalMes = pagosTotalMes + depuradoTotalMes
      const hasRecargoManual = pagosDelMes.some(p => String(p.recargo) === '1')
      const monthOffset = mes > 5 ? (mes - 6) : (mes + 6)
      const limitDate = dayjs().year(today.year()).month(monthOffset).date(12)
      const isLate = today.isAfter(limitDate)
      let subtotal = totalOriginal
      let saldo = subtotal - resueltoTotalMes
      if (!isEventual && (hasRecargoManual || (isLate && saldo > 10))) {
        subtotal = Math.trunc(totalOriginal * 1.1)
        saldo = subtotal - resueltoTotalMes
      }
      saldo = Math.max(0, Number(saldo || 0))
      if (saldo > 0.01) {
        concepts.push({
          documento: String(doc.documento || ''),
          conceptoNombre,
          mesLabel: isEventual ? 'Cargo Único' : (spanishMonths[mes - 1] || `Mensualidad ${mes}`),
          saldo
        })
      }
    }
  }

  const total = concepts.reduce((sum, item) => sum + Number(item.saldo || 0), 0)
  return { total, hasDebt: total > 0.01, concepts }
}

const assertStudentScope = (event: any, student: Record<string, any>, cicloKey: string) => {
  const user = event.context.user
  const isScopedToActivePlantel = !user.isSuperAdmin || (user.isSuperAdmin && user.active_plantel !== 'GLOBAL')
  const allowed = isInProjectedPlantelScopeForCiclo(
    student.gradoBase || student.grado,
    student.plantel,
    student.cicloBase || student.ciclo,
    cicloKey,
    student.nivelBase || student.nivel,
    isScopedToActivePlantel ? user.active_plantel : 'GLOBAL'
  )
  if (!allowed) throw createError({ statusCode: isScopedToActivePlantel ? 403 : 404, message: 'Alumno fuera del alcance del plantel activo.' })
}

export const resolveNoAdeudoStudentContext = async (event: any, matriculaValue: unknown, cicloValue: unknown): Promise<NoAdeudoStudentContext> => {
  const matricula = normalizeMatricula(matriculaValue)
  const cicloKey = normalizeCicloKey(cicloValue)
  if (!matricula) throw createError({ statusCode: 400, message: 'Matrícula requerida.' })

  const [row] = await query<any[]>(`
    SELECT
      A.matricula, A.nombreCompleto, A.apellidoPaterno, A.apellidoMaterno, A.nombres,
      A.curp, A.grado as gradoBase, A.grado, A.grupo, A.ciclo as cicloBase, A.ciclo,
      A.plantel, A.nivel as nivelBase, A.nivel, A.estatus, A.correo, A.telefono,
      A.\`Nombre del padre o tutor\` as padre
    FROM base A
    WHERE UPPER(TRIM(A.matricula)) = ?
    LIMIT 1
  `, [matricula])

  if (!row) throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  assertStudentScope(event, row, cicloKey)

  const student = await mergeCentralOverlay(row)
  const debt = await calculateNoAdeudoDebt(row.matricula, cicloKey)
  const settings = getNoAdeudoSettings(student.plantel)
  const parents = unique([
    firstEmail(student.emailPadre),
    firstEmail(student.emailMadre),
    firstEmail(student.correo),
  ].filter(Boolean))
  const control = unique(settings.controlEmails)

  return {
    student,
    debt,
    recipients: {
      parents,
      control,
      all: unique([...parents, ...control])
    }
  }
}

export const selectNoAdeudoRecipients = (context: NoAdeudoStudentContext, mode = 'parents_control') => {
  if (mode === 'parents') return context.recipients.parents
  if (mode === 'control') return context.recipients.control
  return context.recipients.all
}

const getSigningSecret = () => {
  const config = getNoAdeudoConfig()
  const explicit = normalizeText(config.noAdeudoSignatureSecret)
  if (explicit) return explicit
  const privateKey = normalizeText(config.googlePrivateKey).replace(/\\n/g, '\n')
  if (privateKey) return privateKey
  return `aurora-no-adeudo:${normalizeText(config.adminEmailToImpersonate) || 'local'}`
}

const base64Url = (input: Buffer | string) => Buffer.from(input).toString('base64url')
const hashHex = (input: string | Buffer) => crypto.createHash('sha256').update(input).digest('hex')

export const createNoAdeudoToken = ({
  student,
  ciclo,
  generatedBy,
  generatedByEmail,
  issuedAt,
  preview = false
}: {
  student: Record<string, any>
  ciclo: string
  generatedBy: string
  generatedByEmail?: string
  issuedAt: Date
  preview?: boolean
}) => {
  const name = normalizeText(student.nombreCompleto || student.nombreCompletoAlumno || student.nombre || student.nombres)
  const fingerprint = hashHex([
    'no_adeudo', normalizeMatricula(student.matricula), name, ciclo, normalizeText(student.plantel), issuedAt.toISOString(), generatedByEmail || generatedBy
  ].join('|')).slice(0, 28)
  const payload: NoAdeudoTokenPayload = {
    v: 1,
    typ: 'no_adeudo',
    m: normalizeMatricula(student.matricula),
    n: name,
    c: normalizeCicloKey(ciclo),
    p: normalizeText(student.plantel),
    gg: [student.nivel || student.nivelBase, student.grado || student.gradoBase, student.grupo].filter(Boolean).join(' · '),
    by: normalizeText(generatedBy),
    be: normalizeEmail(generatedByEmail),
    at: issuedAt.toISOString(),
    f: fingerprint,
    ...(preview ? { pv: 1 as const } : {})
  }
  const encodedPayload = base64Url(JSON.stringify(payload))
  const signature = crypto.createHmac('sha256', getSigningSecret()).update(encodedPayload).digest('base64url')
  const token = `${encodedPayload}.${signature}`
  return { token, payload, verificationHash: hashHex(token) }
}

export const decodeNoAdeudoToken = (token: string) => {
  const [encodedPayload, signature] = String(token || '').split('.')
  if (!encodedPayload || !signature) throw createError({ statusCode: 400, message: 'Token inválido.' })
  const expected = crypto.createHmac('sha256', getSigningSecret()).update(encodedPayload).digest('base64url')
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw createError({ statusCode: 401, message: 'La firma del documento no es válida.' })
  }
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as NoAdeudoTokenPayload
  if (payload.typ !== 'no_adeudo' || payload.v !== 1) throw createError({ statusCode: 400, message: 'Tipo de token inválido.' })
  return { payload, verificationHash: hashHex(`${encodedPayload}.${signature}`) }
}

export const resolveNoAdeudoVerifyBaseUrl = (event: any) => {
  const config = getNoAdeudoConfig()
  const explicit = normalizeText(config.noAdeudoVerifyBaseUrl).replace(/\/+$/, '')
  if (explicit) return explicit
  const url = getRequestURL(event)
  return `${url.protocol}//${url.host}`.replace(/\/+$/, '')
}

export const buildNoAdeudoValidationUrl = (event: any, token: string) => `${resolveNoAdeudoVerifyBaseUrl(event)}/api/no-adeudo/verify/${encodeURIComponent(token)}`

export const renderNoAdeudoEmail = ({ student, ciclo, validationUrl }: { student: Record<string, any>; ciclo: string; validationUrl?: string }) => {
  const studentName = normalizeText(student.nombreCompleto || student.nombreCompletoAlumno || student.nombre || student.nombres) || normalizeText(student.matricula)
  const subject = `Carta de No Adeudo - ${studentName}`
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;max-width:680px;margin:0 auto;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;background:#ffffff;">
    <div style="background:#2f7d38;color:#fff;padding:18px 24px;">
      <h2 style="margin:0;font-size:19px;">Carta de No Adeudo</h2>
      <p style="margin:4px 0 0;font-size:13px;opacity:.92;">Documento administrativo IECS / IEDIS · Ciclo ${escapeHtml(ciclo)}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin-top:0;">Estimado(a) padre, madre o tutor:</p>
      <p>Adjuntamos la Carta de No Adeudo correspondiente a <strong>${escapeHtml(studentName)}</strong>, matrícula <strong>${escapeHtml(student.matricula)}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;">
        <tbody>
          <tr><td style="padding:8px 0;color:#64748b;">Alumno(a)</td><td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(studentName)}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">Matrícula</td><td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(student.matricula)}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">Ciclo escolar</td><td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(ciclo)}</td></tr>
        </tbody>
      </table>
      <p>El documento incluye un código QR firmado. Para validar que no haya sido alterado, escanee el QR y confirme que la identidad visible coincida con la información desplegada.</p>
      ${validationUrl ? `<p style="font-size:12px;color:#64748b;word-break:break-all;">Validación: ${escapeHtml(validationUrl)}</p>` : ''}
      <p style="margin-bottom:0;">Atentamente,<br><strong>Administración Escolar</strong></p>
    </div>
  </div>`
  return { subject, html }
}

export const buildNoAdeudoPreviewPayload = async (event: any, matriculas: unknown[], ciclo: unknown) => {
  const cicloKey = normalizeCicloKey(ciclo)
  const contexts = [] as Array<NoAdeudoStudentContext & { pdfPreviewUrl: string; email: ReturnType<typeof renderNoAdeudoEmail> }>
  for (const matricula of matriculas) {
    const context = await resolveNoAdeudoStudentContext(event, matricula, cicloKey)
    const previewUrl = `/api/no-adeudo/pdf?matricula=${encodeURIComponent(context.student.matricula)}&ciclo=${encodeURIComponent(cicloKey)}&preview=1`
    contexts.push({
      ...context,
      pdfPreviewUrl: previewUrl,
      email: renderNoAdeudoEmail({ student: context.student, ciclo: cicloKey })
    })
  }
  return {
    ok: true,
    ciclo: cicloKey,
    settings: getNoAdeudoSettings(contexts[0]?.student?.plantel || ''),
    total: contexts.length,
    students: contexts.map((item) => ({
      matricula: item.student.matricula,
      nombreCompleto: item.student.nombreCompleto,
      plantel: item.student.plantel,
      grado: item.student.grado || item.student.gradoBase,
      grupo: item.student.grupo,
      debt: item.debt,
      recipients: item.recipients,
      pdfPreviewUrl: item.pdfPreviewUrl,
      email: item.email
    }))
  }
}

export const generateNoAdeudoPdfForContext = (event: any, context: NoAdeudoStudentContext, { preview = false } = {}) => {
  const user = event.context.user || {}
  const issuedAt = new Date()
  const generatedBy = normalizeText(user.name || user.nombre || user.email) || 'Sistema Aurora'
  const generatedByEmail = normalizeEmail(user.email)
  const tokenInfo = createNoAdeudoToken({
    student: context.student,
    ciclo: normalizeCicloKey(getQuery(event).ciclo || context.student.ciclo || ''),
    generatedBy,
    generatedByEmail,
    issuedAt,
    preview
  })
  const validationUrl = buildNoAdeudoValidationUrl(event, tokenInfo.token)
  const pdf = generateNoAdeudoCartaPdf({
    student: context.student,
    ciclo: normalizeCicloKey(getQuery(event).ciclo || context.student.ciclo || ''),
    generatedBy,
    generatedByEmail,
    issuedAt,
    validationUrl,
    verificationToken: tokenInfo.token,
    verificationHash: tokenInfo.verificationHash,
    debtTotal: context.debt.total,
    preview
  })
  return { pdf, validationUrl, issuedAt, ...tokenInfo }
}

export const persistNoAdeudoIssue = async ({
  context,
  ciclo,
  token,
  verificationHash,
  validationUrl,
  issuedAt,
  generatedBy,
  generatedByEmail,
  recipients,
  pdf,
}: {
  context: NoAdeudoStudentContext
  ciclo: string
  token: string
  verificationHash: string
  validationUrl: string
  issuedAt: Date
  generatedBy: string
  generatedByEmail?: string
  recipients: string[]
  pdf: Buffer
}) => {
  await query<any>(`
    INSERT INTO no_adeudo_cartas (
      token, verification_hash, matricula, ciclo, plantel, student_name,
      debt_total, generated_by, generated_by_email, generated_at,
      recipients_json, validation_url, pdf_sha256, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent')
    ON DUPLICATE KEY UPDATE
      debt_total = VALUES(debt_total), generated_by = VALUES(generated_by), generated_by_email = VALUES(generated_by_email),
      generated_at = VALUES(generated_at), recipients_json = VALUES(recipients_json), validation_url = VALUES(validation_url),
      pdf_sha256 = VALUES(pdf_sha256), status = VALUES(status)
  `, [
    token,
    verificationHash,
    context.student.matricula,
    normalizeCicloKey(ciclo),
    context.student.plantel || '',
    context.student.nombreCompleto || '',
    Number(context.debt.total || 0),
    generatedBy,
    generatedByEmail || '',
    dayjs(issuedAt).format('YYYY-MM-DD HH:mm:ss'),
    JSON.stringify(recipients),
    validationUrl,
    hashHex(pdf),
  ])
}

export const sendNoAdeudoForContext = async (event: any, context: NoAdeudoStudentContext, options: { ciclo: string; mode?: string; force?: boolean; blockOnDebt?: boolean }) => {
  const ciclo = normalizeCicloKey(options.ciclo)
  const settings = getNoAdeudoSettings(context.student.plantel)
  const blockOnDebt = options.blockOnDebt ?? settings.blockOnDebt
  if (context.debt.hasDebt && blockOnDebt && !options.force) {
    return { matricula: context.student.matricula, success: false, blocked: true, message: `El alumno aún tiene un adeudo de ${formatMoney(context.debt.total)}.` }
  }
  const recipients = selectNoAdeudoRecipients(context, options.mode || 'parents_control')
  if (!recipients.length) {
    return { matricula: context.student.matricula, success: false, message: 'No hay destinatarios configurados para esta carta.' }
  }

  const user = event.context.user || {}
  const issuedAt = new Date()
  const generatedBy = normalizeText(user.name || user.nombre || user.email) || 'Sistema Aurora'
  const generatedByEmail = normalizeEmail(user.email)
  const tokenInfo = createNoAdeudoToken({ student: context.student, ciclo, generatedBy, generatedByEmail, issuedAt })
  const validationUrl = buildNoAdeudoValidationUrl(event, tokenInfo.token)
  const pdf = generateNoAdeudoCartaPdf({
    student: context.student,
    ciclo,
    generatedBy,
    generatedByEmail,
    issuedAt,
    validationUrl,
    verificationToken: tokenInfo.token,
    verificationHash: tokenInfo.verificationHash,
    debtTotal: context.debt.total,
  })
  const email = renderNoAdeudoEmail({ student: context.student, ciclo, validationUrl })
  const attachments: MailAttachment[] = [{
    filename: `Carta-No-Adeudo-${safeFilePart(context.student.matricula)}.pdf`,
    content: pdf,
    contentType: 'application/pdf'
  }]

  await sendEmail(recipients.join(', '), email.subject, email.html, settings.fromAddress || generatedByEmail, attachments)
  await persistNoAdeudoIssue({
    context,
    ciclo,
    token: tokenInfo.token,
    verificationHash: tokenInfo.verificationHash,
    validationUrl,
    issuedAt,
    generatedBy,
    generatedByEmail,
    recipients,
    pdf
  })

  return {
    matricula: context.student.matricula,
    success: true,
    blocked: false,
    recipients,
    debtTotal: context.debt.total,
    warning: context.debt.hasDebt ? `El alumno aún tiene un adeudo de ${formatMoney(context.debt.total)}. Se generó de todas maneras.` : '',
    validationUrl,
    verificationHash: tokenInfo.verificationHash
  }
}
