import { getTrustedAuthUser } from '../../utils/auth-session'
import { fetchCentralMatriculaOverlays } from '../../utils/central-matricula-overlay'

export default defineEventHandler(async (event) => {
  await getTrustedAuthUser(event)
  const body = await readBody(event).catch(() => ({}))
  const matriculas = Array.isArray(body?.matriculas) ? body.matriculas : []
  const normalized = Array.from(new Set(
    matriculas
      .map((value: any) => String(value || '').trim())
      .filter(Boolean)
  ))

  try {
    const overlays = await fetchCentralMatriculaOverlays(normalized)
    const items = Array.from(overlays.values())
    return {
      ok: true,
      source: 'CONTROL_ESCOLAR_MYSQL.matricula',
      requested: normalized.length,
      found: items.length,
      overlays: items
    }
  } catch (error: any) {
    console.warn('[Matricula Overlay] bulk central lookup unavailable', {
      count: normalized.length,
      message: error?.message || error
    })
    return {
      ok: false,
      source: 'CONTROL_ESCOLAR_MYSQL.matricula',
      requested: normalized.length,
      found: 0,
      overlays: [],
      message: 'No se pudo consultar matrícula centralizada.'
    }
  }
})
