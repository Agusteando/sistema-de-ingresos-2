import { getTrustedAuthUser } from '../../../utils/auth-session'
import { fetchCentralMatriculaOverlay } from '../../../utils/central-matricula-overlay'

export default defineEventHandler(async (event) => {
  await getTrustedAuthUser(event)
  const matricula = String(event.context.params?.matricula || '').trim()
  if (!matricula) throw createError({ statusCode: 400, message: 'Matrícula requerida.' })

  try {
    const overlay = await fetchCentralMatriculaOverlay(matricula)
    return {
      ok: true,
      source: 'CONTROL_ESCOLAR_MYSQL.matricula',
      found: Boolean(overlay),
      overlay
    }
  } catch (error: any) {
    console.warn('[Matricula Overlay] central lookup unavailable', {
      matricula,
      message: error?.message || error
    })
    return {
      ok: false,
      source: 'CONTROL_ESCOLAR_MYSQL.matricula',
      found: false,
      overlay: null,
      message: 'No se pudo consultar matrícula centralizada.'
    }
  }
})
