import { google } from 'googleapis'

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

export const sendEmail = async (to: string, subject: string, html: string, fromUserEmail?: string) => {
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

      const messageParts = [
        `To: ${to}`,
        sender ? `From: ${sender}` : '',
        `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        html
      ].filter(Boolean)

      const encodedMessage = Buffer.from(messageParts.join('\n')).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

      await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodedMessage } })
      return true
    } catch (error) {
      lastError = error
    }
  }

  console.error('Mail Error:', lastError)
  throw lastError
}
