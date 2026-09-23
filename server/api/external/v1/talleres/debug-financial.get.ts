import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { runWithBridgeAgentId } from '../../../../utils/db'
import { debugFinancialTalleresResolution } from '../../../../utils/talleres-servicios'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')

  const query = getQuery(event)
  const matricula = String(query.matricula || '').trim()
  const plantel = String(query.plantel || '').trim().toUpperCase()
  const ciclo = String(query.ciclo || '').trim()

  if (!matricula || !plantel) {
    throw createError({ statusCode: 400, message: 'Matrícula y plantel son obligatorios.' })
  }

  return await runWithBridgeAgentId(plantel, async () => ({
    ok: true,
    ...(await debugFinancialTalleresResolution({ matricula, plantel, ciclo })),
  }))
})
