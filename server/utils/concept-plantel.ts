import { conceptBelongsToPlantel, conceptPlantelLabel } from '../../shared/utils/conceptPlantel'
import { normalizePlantel } from '../../shared/utils/grado'

export const assertConceptBelongsToStudentPlantel = (input: {
  conceptoId?: unknown
  conceptoNombre?: unknown
  conceptoPlantel?: unknown
  studentPlantel?: unknown
}) => {
  if (conceptBelongsToPlantel(input.conceptoPlantel, input.studentPlantel)) return

  throw createError({
    statusCode: 409,
    statusMessage: 'CONCEPTO_OTRO_PLANTEL',
    message: 'Este concepto corresponde a otro plantel.',
    data: {
      code: 'CONCEPTO_OTRO_PLANTEL',
      conceptoId: Number(input.conceptoId || 0) || null,
      concepto: String(input.conceptoNombre || '').trim(),
      conceptoPlantel: conceptPlantelLabel(input.conceptoPlantel),
      studentPlantel: normalizePlantel(input.studentPlantel),
    },
  })
}
