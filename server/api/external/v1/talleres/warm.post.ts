import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { ensureCurrentTalleresSnapshots } from '../../../../utils/talleres-snapshot'

/**
 * SNAPSHOT CONTRACT — PUBLIC API STAYS v1
 *
 * /warm is an explicit currentness barrier, not a cache hint. It waits until
 * the requested ready snapshot has been rebuilt and verified current. It never
 * returns success merely because an older snapshot exists.
 */
export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  const body = await readBody(event).catch(() => ({}))
  const rawPlanteles = Array.isArray(body?.planteles)
    ? body.planteles
    : String(body?.planteles || body?.plantel || '').split(',').map((value) => value.trim()).filter(Boolean)

  const result = await ensureCurrentTalleresSnapshots({
    ciclo: body?.ciclo,
    planteles: rawPlanteles,
  })

  // Keep the existing v1 result shape additive/backwards-compatible.
  return { ...result, failures: [] }
})
