import { google } from 'googleapis'

export type MailAttachment = {
  filename: string
  content: Buffer | string
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
const encodeRawMessage = (message: string) => Buffer.from(message).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const normalizeAttachmentContent = (content: Buffer | string) => Buffer.isBuffer(content)
  ? content.toString('base64')
  : Buffer.from(String(content), 'base64').toString('base64') === String(content).replace(/\s+/g, '')
    ? String(content).replace(/\s+/g, '')
    : Buffer.from(String(content)).toString('base64')

const buildMessage = ({
  to,
  sender,
  subject,
  html,
  attachments = []
}: {
  to: string
  sender?: string
  subject: string
  html: string
  attachments?: MailAttachment[]
}) => {
  if (!attachments.length) {
    return [
      `To: ${to}`,
      sender ? `From: ${sender}` : '',
      `Subject: ${encodeHeader(subject)}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      html
    ].filter(Boolean).join('\n')
  }

  const mixedBoundary = `aurora_mixed_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const htmlBoundary = `aurora_html_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const parts = [
    `To: ${to}`,
    sender ? `From: ${sender}` : '',
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${htmlBoundary}"`,
    '',
    `--${htmlBoundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    '',
    `--${htmlBoundary}--`,
  ].filter(Boolean)

  attachments.forEach((attachment) => {
    const filename = String(attachment.filename || 'attachment').replace(/[\r\n"]/g, '_')
    const contentType = attachment.contentType || 'application/octet-stream'
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${contentType}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      normalizeAttachmentContent(attachment.content).replace(/(.{76})/g, '$1\n'),
      ''
    )
  })

  parts.push(`--${mixedBoundary}--`)
  return parts.join('\n')
}

export const sendEmail = async (to: string, subject: string, html: string, fromUserEmail?: string, attachments: MailAttachment[] = []) => {
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
      const raw = encodeRawMessage(buildMessage({ to, sender, subject, html, attachments }))
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
      return true
    } catch (error) {
      lastError = error
    }
  }

  console.error('Mail Error:', lastError)
  throw lastError
}
