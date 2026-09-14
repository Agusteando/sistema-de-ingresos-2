import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { refreshTalleresSnapshots } from '../../../../utils/talleres-snapshot'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  const body = await readBody(event).catch(() => ({}))
  const rawPlanteles = Array.isArray(body?.planteles)
    ? body.planteles
    : String(body?.planteles || body?.plantel || '').split(',').map((value) => value.trim()).filter(Boolean)
  const input = {
    ciclo: body?.ciclo,
    force: body?.force !== false,
    planteles: rawPlanteles,
  }

  let result: any = await refreshTalleresSnapshots(input)

  // La ruta primaria de Talleres usa /warm antes de leer el roster. Si otro
  // refresco ya posee el lock del plantel, esperar aquí evita que el primer
  // intento continúe con el snapshot anterior. El snapshot existente sigue
  // siendo el fallback si la fuente autoritativa realmente falla.
  if (input.force && rawPlanteles.length === 1) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const refreshInProgress = (Array.isArray(result?.results) ? result.results : [])
        .some((row: any) => row?.reason === 'refresh_in_progress')
      if (!refreshInProgress) break
      await wait(500)
      result = await refreshTalleresSnapshots(input)
    }
  }

  return result
})
