import { query } from '../../utils/db'

export default defineEventHandler(async () => {
  const [template] = await query<any[]>(
    `SELECT code, subject, html_template, updated_at, updated_by FROM cobranza_email_templates WHERE code = 'deudores_recordatorio' LIMIT 1`
  )
  return template || null
})
