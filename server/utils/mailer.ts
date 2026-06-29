import { google } from 'googleapis'

export type MailAttachment = {
  filename: string
  content: Buffer | Uint8Array | ArrayBuffer | string
  contentType?: string
}

const buildJwt = (subject?: string) => {
  const config = useRuntimeConfig()
  const privateKey = String(config.googlePrivateKey || '').replace(/\\n/g, '\n').replace(/^"|"$/g, '')

  return new google.auth.JWT({
    email: config.googleServiceAccountEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: subject || undefined
  })
}

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

const baseHeaders = ({ to, sender, subject }: { to: string; sender?: string; subject: string }) => [
  `To: ${sanitizeHeaderValue(to)}`,
  sender ? `From: ${sanitizeHeaderValue(sender)}` : '',
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

const buildMessage = ({
  to,
  sender,
  subject,
  html,
  text,
  attachments = []
}: {
  to: string
  sender?: string
  subject: string
  html: string
  text?: string
  attachments?: MailAttachment[]
}) => {
  const safeText = String(text || '').trim() || htmlToText(html)
  const htmlBoundary = `aurora_alt_${Date.now()}_${Math.random().toString(16).slice(2)}`

  if (!attachments.length) {
    return [
      ...baseHeaders({ to, sender, subject }),
      `Content-Type: multipart/alternative; boundary="${htmlBoundary}"`,
      '',
      ...buildAlternativePart({ html, text: safeText, boundary: htmlBoundary })
    ].join('\r\n')
  }

  const mixedBoundary = `aurora_mixed_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const parts = [
    ...baseHeaders({ to, sender, subject }),
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${htmlBoundary}"`,
    '',
    ...buildAlternativePart({ html, text: safeText, boundary: htmlBoundary }),
    ''
  ]

  attachments.forEach((attachment) => {
    const filename = sanitizeFilename(attachment.filename)
    const contentType = sanitizeHeaderValue(attachment.contentType || 'application/octet-stream')
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${contentType}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      chunkBase64(normalizeAttachmentContent(attachment.content)),
      ''
    )
  })

  parts.push(`--${mixedBoundary}--`)
  return parts.join('\r\n')
}

export const sendEmail = async (to: string, subject: string, html: string, fromUserEmail?: string, attachments: MailAttachment[] = [], text?: string) => {
  const config = useRuntimeConfig()
  if (!config.googleServiceAccountEmail || !config.googlePrivateKey) return true

  const senderCandidates = [
    String(fromUserEmail || '').trim(),
    String(config.adminEmailToImpersonate || '').trim(),
    ''
  ].filter((value, idx, arr) => arr.indexOf(value) === idx)

  let lastError: any = null

  for (const sender of senderCandidates) {
    try {
      const auth = buildJwt(sender || undefined)
      const gmail = google.gmail({ version: 'v1', auth })
      const raw = encodeRawMessage(buildMessage({ to, sender, subject, html, text, attachments }))
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
      return true
    } catch (error) {
      lastError = error
    }
  }

  console.error('Mail Error:', lastError)
  throw lastError
}
