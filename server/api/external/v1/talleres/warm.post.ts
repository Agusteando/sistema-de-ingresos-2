import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { refreshTalleresSnapshots } from '../../../../utils/talleres-snapshot'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  const body = await readBody(event).catch(() => ({}))
  const rawPlanteles = Array.isArray(body?.planteles)
    ? body.planteles
    : String(body?.planteles || body?.plantel || '').split(',').map((value) => value.trim()).filter(Boolean)
  return await refreshTalleresSnapshots({
    ciclo: body?.ciclo,
    force: body?.force !== false,
    planteles: rawPlanteles,
  })
})
