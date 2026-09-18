import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const deudoresAction = await readFile(join(root, 'server/api/deudores/actions.post.ts'), 'utf8')

if (!deudoresAction.includes("import { sendEmail } from '../../utils/mailer'")) {
  throw new Error('/deudores no longer imports the shared Aurora mailer.')
}

if (!deudoresAction.includes('await sendEmail(contactStudent.correo, rendered.subject, rendered.html, user?.email)')) {
  throw new Error('/deudores no longer sends reminder email through the shared Aurora mailer.')
}

const { sendEmail } = await import('../server/utils/mailer.ts')

const recipient = String(
  process.env.AURORA_MAIL_TEST_TO || 'desarrollo.tecnologico@casitaiedis.edu.mx'
).trim().toLowerCase()

const sender = String(
  process.env.AURORA_MAIL_TEST_SENDER
    || process.env.GOOGLE_ADMIN_EMAIL
    || process.env.GCP_ADMIN_SUBJECT
    || 'desarrollo.tecnologico@casitaiedis.edu.mx'
).trim().toLowerCase()

if (!/^[^@\s]+@casitaiedis\.edu\.mx$/i.test(recipient)) {
  throw new Error('AURORA_MAIL_TEST_TO must be an institutional test mailbox.')
}

if (!/^[^@\s]+@casitaiedis\.edu\.mx$/i.test(sender)) {
  throw new Error('AURORA_MAIL_TEST_SENDER must be a delegated Google Workspace mailbox.')
}

const marker = `aurora-deudores-${Date.now()}`
const subject = `Aurora /deudores Gmail live smoke · ${marker}`
const text = [
  'Prueba automática de envío real para /deudores.',
  `Marcador: ${marker}`,
  'Este mensaje confirma autenticación del service account, delegación de dominio y entrega aceptada por Gmail API.'
].join('\n')

const html = `
  <div style="font-family:Arial,sans-serif;line-height:1.5;color:#17253a">
    <h2 style="margin:0 0 12px">Aurora · /deudores</h2>
    <p>Prueba automática de envío real.</p>
    <p><strong>Marcador:</strong> ${marker}</p>
    <p>Este mensaje confirma autenticación del service account, delegación de dominio y aceptación por Gmail API.</p>
  </div>
`.trim()

const result = await sendEmail(recipient, subject, html, sender, [], text)

if (!result?.success || !result?.messageId) {
  throw new Error('The /deudores mailer did not return a Gmail messageId.')
}

if (String(result.sender || '').toLowerCase() !== sender) {
  throw new Error(`The Gmail smoke test used an unexpected sender: ${result.sender || 'unknown'}`)
}

console.log(
  `DEUDORES_GMAIL_SMOKE_OK sender=${result.sender} recipient=${recipient} messageId=${result.messageId} marker=${marker} credentials=${result.credentialSource}`
)
