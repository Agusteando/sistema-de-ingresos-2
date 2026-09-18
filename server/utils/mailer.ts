import { existsSync, readFileSync } from 'node:fs'
import { google } from 'googleapis'

export type MailAttachment = {
  filename: string
  content: Buffer | Uint8Array | ArrayBuffer | string
  contentType?: string
  disposition?: 'attachment' | 'inline'
  contentId?: string
}

type CredentialDocument = {
  client_email?: unknown
  private_key?: unknown
}

type CredentialCandidate = {
  source: string
  value: unknown
}

type GoogleServiceAccountCredentials = {
  email: string
  privateKey: string
  source: string
}

export type MailDeliveryResult = {
  success: true
  sender: string
  messageId: string
  credentialSource: string
}

class GoogleServiceAccountConfigurationError extends Error {
  missing: string[]

  constructor(message: string, missing: string[] = []) {
    super(message)
    this.name = 'GoogleServiceAccountConfigurationError'
    this.missing = missing
  }
}

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()

const normalizePrivateKey = (value: unknown) => {
  let raw = String(value || '').trim()
  if (
    raw.length >= 2
    && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
  ) {
    raw = raw.slice(1, -1)
  }
  return raw.replace(/\\n/g, '\n').trim()
}

const decodeBase64 = (value: string) => {
  try {
    return Buffer.from(value, 'base64').toString('utf8').trim()
  } catch {
    return ''
  }
}

const parseCredentialDocument = (raw: unknown): CredentialDocument | null => {
  const initial = String(raw || '').trim()
  if (!initial) return null

  const queue = [initial]
  const seen = new Set<string>()

  while (queue.length) {
    const candidate = String(queue.shift() || '').trim()
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)

    try {
      const parsed = JSON.parse(candidate) as CredentialDocument | string
      if (typeof parsed === 'string') queue.push(parsed)
      else if (parsed && typeof parsed === 'object') return parsed
    } catch {
      // It may be base64-encoded JSON; try that below.
    }

    const decoded = decodeBase64(candidate)
    if (decoded && decoded !== candidate && (decoded.startsWith('{') || decoded.startsWith('"{'))) {
      queue.push(decoded)
    }
  }

  return null
}

const readCredentialFile = (value: unknown): CredentialDocument | null => {
  const path = String(value || '').trim()
  if (!path || !existsSync(path)) return null
  try {
    return parseCredentialDocument(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

const firstValue = (candidates: CredentialCandidate[]) => {
  for (const candidate of candidates) {
    const value = String(candidate.value || '').trim()
    if (value) return { value, source: candidate.source }
  }
  return { value: '', source: '' }
}

const firstCredentialDocument = () => {
  const inlineCandidates: CredentialCandidate[] = [
    { source: 'GOOGLE_SERVICE_ACCOUNT_JSON', value: process.env.GOOGLE_SERVICE_ACCOUNT_JSON },
    { source: 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64', value: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 },
    { source: 'GOOGLE_SERVICE_ACCOUNT_CREDENTIALS', value: process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS },
    { source: 'GOOGLE_SERVICE_ACCOUNT', value: process.env.GOOGLE_SERVICE_ACCOUNT },
    { source: 'GOOGLE_CREDENTIALS', value: process.env.GOOGLE_CREDENTIALS },
    { source: 'GOOGLE_CREDENTIALS_JSON', value: process.env.GOOGLE_CREDENTIALS_JSON },
    { source: 'GOOGLE_CREDENTIALS_BASE64', value: process.env.GOOGLE_CREDENTIALS_BASE64 },
    { source: 'GOOGLE_APPLICATION_CREDENTIALS_JSON', value: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON },
    { source: 'GOOGLE_APPLICATION_CREDENTIALS_BASE64', value: process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64 },
    { source: 'GCP_SERVICE_ACCOUNT_JSON', value: process.env.GCP_SERVICE_ACCOUNT_JSON },
    { source: 'GCP_SERVICE_ACCOUNT_CREDENTIALS', value: process.env.GCP_SERVICE_ACCOUNT_CREDENTIALS },
    { source: 'GOOGLE_SERVICE_ACCOUNT_KEY', value: process.env.GOOGLE_SERVICE_ACCOUNT_KEY }
  ]

  for (const candidate of inlineCandidates) {
    const document = parseCredentialDocument(candidate.value)
    if (document) return { document, source: candidate.source }
  }

  const applicationCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS
  const inlineDocument = parseCredentialDocument(applicationCredentials)
  if (inlineDocument) return { document: inlineDocument, source: 'GOOGLE_APPLICATION_CREDENTIALS:inline' }

  const fileDocument = readCredentialFile(applicationCredentials)
  if (fileDocument) return { document: fileDocument, source: 'GOOGLE_APPLICATION_CREDENTIALS:file' }

  return null
}

const decodePrivateKeyBase64 = (...values: unknown[]) => {
  for (const value of values) {
    const decoded = decodeBase64(String(value || '').trim())
    if (/-----BEGIN PRIVATE KEY-----/.test(decoded)) return decoded
  }
  return ''
}

const resolveGoogleServiceAccountCredentials = (): GoogleServiceAccountCredentials => {
  const credentialDocument = firstCredentialDocument()
  const privateKeyVariable = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.NUXT_GOOGLE_PRIVATE_KEY
  const privateKeyDocument = parseCredentialDocument(privateKeyVariable)
  const document = credentialDocument?.document || privateKeyDocument
  const documentSource = credentialDocument?.source || (privateKeyDocument ? 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:json' : '')

  const directEmail = firstValue([
    { source: 'GOOGLE_SERVICE_ACCOUNT_EMAIL', value: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL },
    { source: 'NUXT_GOOGLE_SERVICE_ACCOUNT_EMAIL', value: process.env.NUXT_GOOGLE_SERVICE_ACCOUNT_EMAIL },
    { source: 'GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL', value: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL },
    { source: 'GOOGLE_CLIENT_EMAIL', value: process.env.GOOGLE_CLIENT_EMAIL },
    { source: 'GOOGLE_CLOUD_SERVICE_ACCOUNT_EMAIL', value: process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_EMAIL },
    { source: 'GCP_SERVICE_ACCOUNT_EMAIL', value: process.env.GCP_SERVICE_ACCOUNT_EMAIL },
    { source: 'GCP_CLIENT_EMAIL', value: process.env.GCP_CLIENT_EMAIL },
    { source: 'GCLOUD_SERVICE_ACCOUNT_EMAIL', value: process.env.GCLOUD_SERVICE_ACCOUNT_EMAIL }
  ])

  const directPrivateKey = firstValue([
    { source: 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', value: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY },
    { source: 'GOOGLE_PRIVATE_KEY', value: process.env.GOOGLE_PRIVATE_KEY },
    { source: 'NUXT_GOOGLE_PRIVATE_KEY', value: process.env.NUXT_GOOGLE_PRIVATE_KEY },
    { source: 'GOOGLE_CLOUD_PRIVATE_KEY', value: process.env.GOOGLE_CLOUD_PRIVATE_KEY },
    { source: 'GCP_SERVICE_ACCOUNT_PRIVATE_KEY', value: process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY },
    { source: 'GCP_PRIVATE_KEY', value: process.env.GCP_PRIVATE_KEY }
  ])

  const encodedPrivateKey = decodePrivateKeyBase64(
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64,
    process.env.GOOGLE_PRIVATE_KEY_BASE64,
    process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64
  )

  const email = normalizeEmail(document?.client_email || directEmail.value)
  const privateKey = normalizePrivateKey(document?.private_key || directPrivateKey.value || encodedPrivateKey)
  const source = documentSource
    || [directEmail.source, directPrivateKey.source].filter(Boolean).join('+')
    || (encodedPrivateKey ? 'private-key-base64' : 'unconfigured')

  return { email, privateKey, source }
}

const assertGoogleServiceAccountCredentials = (credentials: GoogleServiceAccountCredentials) => {
  const missing: string[] = []
  if (!credentials.email) missing.push('service-account client_email')
  if (!credentials.privateKey) missing.push('service-account private_key')

  if (missing.length) {
    throw new GoogleServiceAccountConfigurationError(
      `Missing Google service-account configuration: ${missing.join(', ')}`,
      missing
    )
  }

  if (!/^[^@\s]+@[^@\s]+\.gserviceaccount\.com$/i.test(credentials.email)) {
    throw new GoogleServiceAccountConfigurationError('Google service-account client_email is invalid.')
  }

  if (
    !/-----BEGIN PRIVATE KEY-----/.test(credentials.privateKey)
    || !/-----END PRIVATE KEY-----/.test(credentials.privateKey)
  ) {
    throw new GoogleServiceAccountConfigurationError('Google service-account private_key is malformed.')
  }
}

const configuredAdminSender = () => normalizeEmail(
  process.env.GOOGLE_ADMIN_EMAIL
  || process.env.NUXT_ADMIN_EMAIL_TO_IMPERSONATE
  || process.env.GCP_ADMIN_SUBJECT
  || 'desarrollo.tecnologico@casitaiedis.edu.mx'
)

const buildJwt = (credentials: GoogleServiceAccountCredentials, subject: string) => new google.auth.JWT({
  email: credentials.email,
  key: credentials.privateKey,
  scopes: ['https://www.googleapis.com/auth/gmail.send'],
  subject
})

const encodeHeader = (value: string) => `=?utf-8?B?${Buffer.from(value).toString('base64')}?=`
const encodeRawMessage = (message: string) => Buffer.from(message, 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const sanitizeHeaderValue = (value: string) => String(value || '').replace(/[\r\n]+/g, ' ').trim()
const sanitizeFilename = (value: string) => String(value || 'attachment').replace(/[\r\n"]/g, '_')
const chunkBase64 = (value: string) => value.replace(/(.{76})/g, '$1\r\n')

const htmlToText = (html: string) => String(html || '')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>/gi, '\n\n')
  .replace(/<\/tr>/gi, '\n')
  .replace(/<\/td>/gi, '  ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ')
  .replace(/\n\s+/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

const normalizeAttachmentContent = (content: MailAttachment['content']) => {
  if (Buffer.isBuffer(content)) return content.toString('base64')
  if (content instanceof ArrayBuffer) return Buffer.from(content).toString('base64')
  if (ArrayBuffer.isView(content)) {
    return Buffer.from(content.buffer, content.byteOffset, content.byteLength).toString('base64')
  }

  const raw = String(content || '')
  const compact = raw.replace(/\s+/g, '')
  if (compact && /^[A-Za-z0-9+/]+={0,2}$/.test(compact) && compact.length % 4 === 0) {
    try {
      const decoded = Buffer.from(compact, 'base64')
      if (decoded.length > 0 && decoded.toString('base64').replace(/=+$/, '') === compact.replace(/=+$/, '')) {
        return compact
      }
    } catch {}
  }
  return Buffer.from(raw, 'utf8').toString('base64')
}

const formatSenderHeader = (sender?: string, senderName?: string) => {
  const email = sanitizeHeaderValue(sender || '')
  if (!email) return ''
  const name = sanitizeHeaderValue(senderName || '')
  return name ? `${encodeHeader(name)} <${email}>` : email
}

const baseHeaders = ({ to, sender, senderName, subject }: { to: string; sender?: string; senderName?: string; subject: string }) => [
  `To: ${sanitizeHeaderValue(to)}`,
  sender ? `From: ${formatSenderHeader(sender, senderName)}` : '',
  `Subject: ${encodeHeader(sanitizeHeaderValue(subject))}`,
  'MIME-Version: 1.0'
].filter(Boolean)

const buildAlternativePart = ({ html, text, boundary }: { html: string; text: string; boundary: string }) => [
  `--${boundary}`,
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: 8bit',
  '',
  text,
  '',
  `--${boundary}`,
  'Content-Type: text/html; charset=utf-8',
  'Content-Transfer-Encoding: 8bit',
  '',
  html,
  '',
  `--${boundary}--`
]

const sanitizeContentId = (value: string) => String(value || '').replace(/[<>\r\n]/g, '').trim()

const buildBinaryPart = (attachment: MailAttachment) => {
  const filename = sanitizeFilename(attachment.filename)
  const contentType = sanitizeHeaderValue(attachment.contentType || 'application/octet-stream')
  const contentId = sanitizeContentId(attachment.contentId || '')
  const inline = attachment.disposition === 'inline' && Boolean(contentId)

  if (inline) {
    return [
      `Content-Type: ${contentType}`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${contentId}>`,
      `X-Attachment-Id: ${contentId}`,
      'Content-Disposition: inline',
      '',
      chunkBase64(normalizeAttachmentContent(attachment.content)),
    ]
  }

  return [
    `Content-Type: ${contentType}; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    chunkBase64(normalizeAttachmentContent(attachment.content)),
  ]
}

const buildMessage = ({
  to,
  sender,
  senderName,
  subject,
  html,
  text,
  attachments = []
}: {
  to: string
  sender?: string
  senderName?: string
  subject: string
  html: string
  text?: string
  attachments?: MailAttachment[]
}) => {
  const safeText = String(text || '').trim() || htmlToText(html)
  const htmlBoundary = `aurora_alt_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const inlineAttachments = attachments.filter((attachment) => (
    attachment.disposition === 'inline' && Boolean(sanitizeContentId(attachment.contentId || ''))
  ))
  const regularAttachments = attachments.filter((attachment) => !inlineAttachments.includes(attachment))

  const alternativePart = [
    `Content-Type: multipart/alternative; boundary="${htmlBoundary}"`,
    '',
    ...buildAlternativePart({ html, text: safeText, boundary: htmlBoundary }),
  ]

  let bodyPart = alternativePart
  if (inlineAttachments.length) {
    const relatedBoundary = `aurora_related_${Date.now()}_${Math.random().toString(16).slice(2)}`
    bodyPart = [
      `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
      '',
      `--${relatedBoundary}`,
      ...alternativePart,
      '',
    ]

    for (const attachment of inlineAttachments) {
      bodyPart.push(
        `--${relatedBoundary}`,
        ...buildBinaryPart(attachment),
        '',
      )
    }
    bodyPart.push(`--${relatedBoundary}--`)
  }

  if (!regularAttachments.length) {
    return [
      ...baseHeaders({ to, sender, senderName, subject }),
      ...bodyPart,
    ].join('\r\n')
  }

  const mixedBoundary = `aurora_mixed_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const parts = [
    ...baseHeaders({ to, sender, senderName, subject }),
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    ...bodyPart,
    '',
  ]

  for (const attachment of regularAttachments) {
    parts.push(
      `--${mixedBoundary}`,
      ...buildBinaryPart(attachment),
      '',
    )
  }

  parts.push(`--${mixedBoundary}--`)
  return parts.join('\r\n')
}

const sendWithSenderCandidates = async ({
  to,
  subject,
  html,
  text,
  attachments,
  senderCandidates,
  senderName,
}: {
  to: string
  subject: string
  html: string
  text?: string
  attachments: MailAttachment[]
  senderCandidates: string[]
  senderName?: string
}): Promise<MailDeliveryResult> => {
  const credentials = resolveGoogleServiceAccountCredentials()
  assertGoogleServiceAccountCredentials(credentials)

  const candidates = senderCandidates
    .map(normalizeEmail)
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)

  if (!candidates.length) {
    throw new Error('No se configuró un remitente de Google Workspace para el correo.')
  }

  let lastError: any = null

  for (const sender of candidates) {
    try {
      const auth = buildJwt(credentials, sender)
      const gmail = google.gmail({ version: 'v1', auth })
      const raw = encodeRawMessage(buildMessage({ to, sender, senderName, subject, html, text, attachments }))
      const response = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
      const messageId = String(response?.data?.id || '').trim()
      if (!messageId) throw new Error('Gmail aceptó la solicitud pero no devolvió un messageId.')

      return {
        success: true,
        sender,
        messageId,
        credentialSource: credentials.source,
      }
    } catch (error) {
      lastError = error
    }
  }

  console.error('Mail Error:', lastError)
  throw lastError || new Error('No fue posible enviar el correo con ningún remitente configurado.')
}

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  fromUserEmail?: string,
  attachments: MailAttachment[] = [],
  text?: string
) => {
  const senderCandidates = [
    String(fromUserEmail || '').trim(),
    configuredAdminSender(),
  ]

  return await sendWithSenderCandidates({ to, subject, html, text, attachments, senderCandidates })
}

/**
 * Sends strictly as the authenticated Workspace user. Unlike sendEmail, this
 * function never falls back to the configured administrator.
 */
export const sendEmailFromUser = async (
  to: string,
  subject: string,
  html: string,
  fromUserEmail: string,
  attachments: MailAttachment[] = [],
  text?: string,
  fromUserName?: string
) => {
  const sender = normalizeEmail(fromUserEmail)
  if (!sender) throw new Error('No se proporcionó el correo del usuario remitente.')

  return await sendWithSenderCandidates({
    to,
    subject,
    html,
    text,
    attachments,
    senderCandidates: [sender],
    senderName: String(fromUserName || '').trim() || undefined,
  })
}
