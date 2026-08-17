import { runWithBridgeAgentId, query } from '../../utils/db'
import { markRecargoConceptAsService, setRecargoPolicyActive } from '../../utils/recargo-config'

const normalizeBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  return ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const conceptoId = Number(body?.conceptoId || 0)
  if (!Number.isInteger(conceptoId) || conceptoId <= 0) {
    throw createError({ statusCode: 400, message: 'Concepto inválido.' })
  }

  const [concept] = await query<any[]>(`SELECT id FROM conceptos WHERE id = ? LIMIT 1`, [conceptoId])
  if (!concept) {
    throw createError({ statusCode: 404, message: 'Concepto no encontrado.' })
  }

  const user = event.context.user
  const updatedBy = String(user?.email || user?.name || 'Sistema').trim()
  const markAsService = normalizeBoolean(body?.servicio)

  if (!markAsService && (body?.activo === undefined || body?.activo === null)) {
    throw createError({ statusCode: 400, message: 'Configuración de recargo requerida.' })
  }

  const policy = markAsService
    ? await markRecargoConceptAsService({ conceptoId, updatedBy })
    : await setRecargoPolicyActive({
        conceptoId,
        activo: normalizeBoolean(body?.activo),
        updatedBy,
      })

  return {
    ok: true,
    policy: {
      conceptoId: policy.conceptoId,
      activo: policy.activo,
      servicio: policy.esServicio,
      porcentaje: policy.porcentaje,
      diaLimite: policy.diaLimite,
      pendingSync: policy.pendingSync,
    },
  }
}))
