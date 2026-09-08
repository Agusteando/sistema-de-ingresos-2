import { getQuery } from 'h3'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isValidEmailAddress, normalizeEmailAddress } from '../../../shared/utils/email'
import { getTrustedAuthUser, normalizePlantel } from '../../utils/auth-session'
import { fetchControlEscolarExternalStudentProfile } from '../../utils/control-escolar'
import { runWithBridgeAgentId } from '../../utils/db'
import { loadPaymentReceiptDocument } from '../../utils/paymentReceipt'

const firstText = (...values: unknown[]) => values
  .map((value) => String(value ?? '').trim())
  .find(Boolean) || ''

const contact = (
  key: 'father' | 'mother',
  label: 'Padre' | 'Madre',
  field: 'emailPadre' | 'emailMadre',
  name: unknown,
  email: unknown,
) => {
  const normalizedEmail = normalizeEmailAddress(email)
  return {
    key,
    label,
    field,
    name: String(name ?? '').trim(),
    email: normalizedEmail,
    valid: isValidEmailAddress(normalizedEmail, { allowEmpty: false }),
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin && !user.hasFinancialAccess) {
    throw createError({
      statusCode: 403,
      message: 'No tiene permisos administrativos para consultar correos familiares.',
    })
  }

  return await runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
    const receipt = await loadPaymentReceiptDocument(getQuery(event).folios)
    if (!receipt.folios.length) {
      throw createError({ statusCode: 400, message: 'Faltan los folios del recibo.' })
    }
    if (!receipt.items.length) {
      throw createError({ statusCode: 404, message: 'Recibos no vigentes o no encontrados.' })
    }

    const firstItem: any = receipt.items[0] || {}
    const matricula = String(receipt.matricula || firstItem.matricula || '').trim().toUpperCase()
    const plantel = normalizePlantel(firstItem.plantel || receipt.plantel || user.active_plantel || user.auth_home_plantel)
    const ciclo = normalizeCicloKey(firstItem.ciclo)

    if (!matricula) {
      throw createError({ statusCode: 404, message: 'El recibo no tiene una matrícula asociada.' })
    }
    if (!plantel || plantel === 'GLOBAL') {
      throw createError({ statusCode: 400, message: 'No se pudo determinar el plantel del alumno.' })
    }

    let student: any = null
    try {
      student = await fetchControlEscolarExternalStudentProfile(plantel, matricula)
    } catch (error: any) {
      if (Number(error?.statusCode || 0) !== 404) throw error
    }

    const fatherName = firstText(
      student?.fatherName,
      student?.nombrePadreCompleto,
      [student?.nombrePadre, student?.apellidoPaternoPadre, student?.apellidoMaternoPadre].filter(Boolean).join(' '),
    )
    const motherName = firstText(
      student?.motherName,
      student?.nombreMadreCompleto,
      [student?.nombreMadre, student?.apellidoPaternoMadre, student?.apellidoMaternoMadre].filter(Boolean).join(' '),
    )

    return {
      success: true,
      matricula,
      studentName: firstText(student?.nombreCompleto, student?.fullName, firstItem.nombreCompleto),
      plantel,
      ciclo,
      source: 'control-escolar-central',
      contacts: [
        contact(
          'father',
          'Padre',
          'emailPadre',
          fatherName,
          firstText(student?.emailPadre, student?.correoPadre),
        ),
        contact(
          'mother',
          'Madre',
          'emailMadre',
          motherName,
          firstText(student?.emailMadre, student?.correoMadre),
        ),
      ],
    }
  })
})
