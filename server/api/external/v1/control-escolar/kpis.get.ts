import { getQuery } from 'h3'
import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { readExternalSnapshotKpis } from '../../../../utils/control-escolar-external-snapshot-kpis'
import { normalizeExternalControlEscolarPlantel } from '../../../../utils/control-escolar-plantel-routing'

const clean = (value: unknown, max = 80) => String(value ?? '').trim().slice(0, max)

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 30)
  const query = getQuery(event)
  const plantel = normalizeExternalControlEscolarPlantel(query.plantel || query.agentId || '')
  const ciclo = clean(query.ciclo || query.cicloKey, 20).match(/\d{4}/)?.[0] || ''
  if (!plantel) throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  if (!ciclo) throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })

  return await readExternalSnapshotKpis({ ...query, plantel, ciclo, cicloKey: ciclo })
})
