import { runWithBridgeAgentId } from '../../utils/db'
import { createNoAdeudoToken, buildNoAdeudoValidationUrl, resolveNoAdeudoStudentContext } from '../../utils/noAdeudo'
import { generateNoAdeudoCartaPdf } from '../../utils/noAdeudoCartaPdf'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

const safeFilePart = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'alumno'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
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
    debtTotal: context.debt.total,
    preview: String(preview) !== '0'
  })

  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `inline; filename="carta-no-adeudo-preview-${safeFilePart(context.student.matricula)}.pdf"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return pdf
}))
