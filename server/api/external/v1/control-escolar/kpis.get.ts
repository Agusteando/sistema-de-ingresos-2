import { getQuery } from 'h3'
import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { fetchControlEscolarKpis, runControlEscolar } from '../../../../utils/control-escolar'

const clean = (value: unknown, max = 80) => String(value ?? '').trim().slice(0, max)

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 30)
  const query = getQuery(event)
  const plantel = clean(query.plantel || query.agentId, 40).toUpperCase()
  const ciclo = clean(query.ciclo || query.cicloKey, 20).match(/\d{4}/)?.[0] || ''
  if (!plantel) throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  if (!ciclo) throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })

  return await runControlEscolar(event, plantel, async () => ({
    data: await fetchControlEscolarKpis(plantel, { ...query, ciclo, cicloKey: ciclo }),
    meta: { plantel, ciclo }
  }))
})
