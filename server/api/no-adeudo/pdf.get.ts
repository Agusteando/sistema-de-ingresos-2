import { runWithBridgeAgentId } from '../../utils/db'
import { buildNoAdeudoValidationUrl, createNoAdeudoToken, diagnoseNoAdeudoError, resolveNoAdeudoStudentContext } from '../../utils/noAdeudo'
import { generateNoAdeudoCartaPdf } from '../../utils/noAdeudoCartaPdf'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

const safeFilePart = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'alumno'

const escapeHtml = (value: unknown) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const renderPdfDiagnosticHtml = (diagnostic: ReturnType<typeof diagnoseNoAdeudoError>) => `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Diagnóstico Carta de No Adeudo</title>
  <style>
    body{margin:0;background:#fff1f2;color:#7f1d1d;font-family:Inter,Arial,sans-serif;padding:24px;line-height:1.45}
    .card{max-width:720px;margin:0 auto;border:1px solid #fecaca;border-radius:18px;background:#fff;padding:18px;box-shadow:0 12px 30px rgba(127,29,29,.08)}
    h1{margin:0 0 8px;font-size:20px}.label{margin-top:14px;color:#991b1b;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
    p{margin:6px 0}ul{margin:8px 0 0;padding-left:20px}code{word-break:break-all;background:#fee2e2;border-radius:6px;padding:2px 5px}
  </style>
</head>
<body>
  <div class="card">
    <div class="label">No se pudo renderizar el PDF</div>
    <h1>${escapeHtml(diagnostic.title)}</h1>
    <p>${escapeHtml(diagnostic.detail)}</p>
    ${diagnostic.missing?.length ? `<div class="label">Falta</div><ul>${diagnostic.missing.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    ${diagnostic.action ? `<div class="label">Acción</div><p>${escapeHtml(diagnostic.action)}</p>` : ''}
    ${diagnostic.source || diagnostic.code ? `<div class="label">Fuente</div><p><code>${escapeHtml([diagnostic.source, diagnostic.code].filter(Boolean).join(' · '))}</code></p>` : ''}
  </div>
</body>
</html>`

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  try {
    const { matricula, ciclo = '2025', preview = '1' } = getQuery(event)
    const cicloKey = normalizeCicloKey(ciclo)
    const context = await resolveNoAdeudoStudentContext(event, matricula, cicloKey)
    const user = event.context.user || {}
    const issuedAt = new Date()
    const generatedBy = String(user.name || user.nombre || user.email || 'Sistema Aurora')
    const generatedByEmail = String(user.email || '')
    const tokenInfo = createNoAdeudoToken({
      student: context.student,
      ciclo: cicloKey,
      generatedBy,
      generatedByEmail,
      issuedAt,
      preview: String(preview) !== '0'
    })
    const validationUrl = buildNoAdeudoValidationUrl(event, tokenInfo.token)
    const pdf = generateNoAdeudoCartaPdf({
      student: context.student,
      ciclo: cicloKey,
      generatedBy,
      generatedByEmail,
      issuedAt,
      validationUrl,
      verificationToken: tokenInfo.token,
      verificationHash: tokenInfo.verificationHash,
      debtTotal: 0,
      preview: String(preview) !== '0'
    })

    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(event, 'Content-Disposition', `inline; filename="carta-no-adeudo-preview-${safeFilePart(context.student.matricula)}.pdf"`)
    setHeader(event, 'Cache-Control', 'no-store')
    return pdf
  } catch (error) {
    const diagnostic = diagnoseNoAdeudoError(error, 'PDF de Carta de No Adeudo')
    setResponseStatus(event, diagnostic.statusCode)
    setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
    setHeader(event, 'Cache-Control', 'no-store')
    return renderPdfDiagnosticHtml(diagnostic)
  }
}))
