import { PLANTELES_LIST } from '../../../../utils/constants'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import {
  emailAddressValidationMessage,
  normalizeEmailAddress,
} from '../../../../shared/utils/email'
import {
  getTrustedAuthUser,
  normalizePlantel,
} from '../../../utils/auth-session'
import { logControlEscolarAuditEvent } from '../../../utils/control-escolar-audit'
import {
  runControlEscolar,
  updateControlEscolarStudent,
} from '../../../utils/control-escolar'

const FAMILY_EMAIL_FIELDS = ['emailPadre', 'emailMadre'] as const
const VALID_PLANTELES = new Set(PLANTELES_LIST)

const resolveFinancialPlantel = (user: Awaited<ReturnType<typeof getTrustedAuthUser>>, requested: unknown) => {
  const requestedPlantel = normalizePlantel(requested)
  const activePlantel = normalizePlantel(user.active_plantel)
  const fallbackPlantel = activePlantel && activePlantel !== 'GLOBAL'
    ? activePlantel
    : normalizePlantel(user.auth_home_plantel)
  const plantel = requestedPlantel || fallbackPlantel

  if (!plantel || plantel === 'GLOBAL' || !VALID_PLANTELES.has(plantel)) {
    throw createError({
      statusCode: 400,
      message: 'Selecciona un plantel específico para actualizar los correos familiares.',
    })
  }

  const allowedFinancialPlanteles = new Set(
    (user.financialPlantelesList || []).map(normalizePlantel),
  )
  if (!user.isSuperAdmin && !allowedFinancialPlanteles.has(plantel)) {
    throw createError({
      statusCode: 403,
      message: 'No tiene permisos financieros para actualizar alumnos de este plantel.',
    })
  }

  return plantel
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const user = await getTrustedAuthUser(event)
  if (!user.isSuperAdmin && !user.hasFinancialAccess) {
    throw createError({
      statusCode: 403,
      message: 'No tiene permisos administrativos para actualizar correos familiares.',
    })
  }

  const matricula = String(event.context.params?.matricula || '').trim().toUpperCase()
  if (!matricula) {
    throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  }

  const body = await readBody(event).catch(() => ({}))
  const providedFields = FAMILY_EMAIL_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(body || {}, field),
  )
  if (!providedFields.length) {
    throw createError({
      statusCode: 400,
      message: 'Proporciona al menos un correo familiar para actualizar.',
    })
  }

  const patch = Object.fromEntries(
    providedFields.map((field) => {
      const value = normalizeEmailAddress(body?.[field])
      const validationMessage = emailAddressValidationMessage(value)
      if (validationMessage) {
        const parentLabel = field === 'emailPadre' ? 'padre' : 'madre'
        throw createError({
          statusCode: 400,
          message: `Correo de ${parentLabel}: ${validationMessage}`,
        })
      }
      return [field, value]
    }),
  )

  const plantel = resolveFinancialPlantel(user, body?.plantel || body?.agentId)
  const ciclo = normalizeCicloKey(body?.ciclo || body?.cicloKey || body?.targetCiclo)

  return await runControlEscolar(event, plantel, async () => {
    const result = await updateControlEscolarStudent(
      plantel,
      matricula,
      patch,
      user,
      { ciclo, cicloKey: ciclo, targetCiclo: ciclo },
    )
    const updatedStudent: any = result?.student || null

    logControlEscolarAuditEvent({
      eventType: 'student_update',
      plantel,
      ciclo,
      matricula,
      user,
      summary: `Administración actualizó correos familiares de ${matricula}`,
      source: {
        base: updatedStudent?.sourceBase || updatedStudent?.baseSource || '',
        flow: 'financial_parent_email_update',
      },
      payload: {
        fields: providedFields,
        actorDomain: 'financial',
      },
    }).catch((error: any) => {
      console.warn('[Control Escolar Audit] Financial family email audit skipped', error?.message || error)
    })

    return {
      success: true,
      emails: patch,
      student: updatedStudent,
    }
  })
})
