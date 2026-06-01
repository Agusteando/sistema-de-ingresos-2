import { runWithBridgeAgentId } from '../../utils/db'
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

type PdfDiagnostic = {
  title: string
  detail: string
  statusCode?: number
  source?: string
  code?: string
  missing?: string[]
  action?: string
}

const diagnosePdfError = async (error: any, source = 'PDF de Carta de No Adeudo'): Promise<PdfDiagnostic> => {
  try {
    const { diagnoseNoAdeudoError } = await import('../../utils/noAdeudo')
    return diagnoseNoAdeudoError(error, source)
  } catch (diagnosticError: any) {
    const message = String(error?.message || error?.statusMessage || 'No se pudo cargar el módulo de Carta de No Adeudo.')
    return {
      title: message && !/^server error$/i.test(message) ? message : 'No se pudo cargar el módulo de Carta de No Adeudo.',
      detail: String(diagnosticError?.message || 'El backend falló antes de cargar el diagnóstico especializado.'),
      statusCode: Number(error?.statusCode || error?.status || 500),
      source,
      code: String(error?.code || diagnosticError?.code || 'NO_ADEUDO_MODULE_LOAD').toUpperCase(),
      action: 'Revisa el log del servidor para identificar el import o dependencia que impide renderizar el PDF.'
    }
  }
}

const renderPdfDiagnosticHtml = (diagnostic: PdfDiagnostic) => `<!doctype html>
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

const pdfErrorResponse = async (event: any, error: any, source?: string) => {
  const diagnostic = await diagnosePdfError(error, source)
  setResponseStatus(event, Number(diagnostic.statusCode || 500))
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')
  return renderPdfDiagnosticHtml(diagnostic)
}

export default defineEventHandler(async (event) => {
  try {
    return await runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
      try {
        const { buildNoAdeudoValidationUrl, createNoAdeudoToken, resolveNoAdeudoStudentContext } = await import('../../utils/noAdeudo')
        const { generateNoAdeudoCartaPdf } = await import('../../utils/noAdeudoCartaPdf')
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
        return await pdfErrorResponse(event, error)
      }
    })
  } catch (error) {
    return await pdfErrorResponse(event, error, 'PDF de Carta de No Adeudo · middleware/bridge')
  }
})
