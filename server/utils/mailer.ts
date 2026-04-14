import { google } from 'googleapis'

export const sendEmail = async (to: string, subject: string, html: string) => {
  const config = useRuntimeConfig()
  if (!config.googleServiceAccountEmail || !config.googlePrivateKey) return true

  try {
    const auth = new google.auth.JWT({
      email: config.googleServiceAccountEmail,
      key: config.googlePrivateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/gmail.send']
    })
    const gmail = google.gmail({ version: 'v1', auth })
    const messageParts = [
      `To: ${to}`,
      `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      html
    ]
    const encodedMessage = Buffer.from(messageParts.join('\n')).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodedMessage } })
    return true
  } catch (error) {
    console.error('Mail Error:', error)
    throw error
  }
}