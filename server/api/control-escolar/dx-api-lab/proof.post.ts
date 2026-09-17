import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { resolveControlEscolarAuth } from '../../../utils/control-escolar'
import { fetchCanonicalExternalSnapshotScope } from '../../../utils/control-escolar-external-canonical-scope'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const body = await readBody(event)
  const auth = await resolveControlEscolarAuth(event, body?.plantel)
  const ciclo = normalizeCicloKey(body?.ciclo || body?.cicloKey || '')
  if (!ciclo) throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })

  const canonical = await fetchCanonicalExternalSnapshotScope({
    plantel: auth.agentId,
    ciclo,
    cicloKey: ciclo
  })

  return {
    plantel: canonical.plantel,
    ciclo: canonical.ciclo,
    source: 'aurora-control-escolar-ui-canonical',
    rows: canonical.rows.map((row: any) => ({
      matricula: String(row?.matricula || '').trim(),
      grado: String(row?.grado || '').trim(),
      grupo: String(row?.grupo || row?.group || '').trim(),
      enrollmentState: String(row?.enrollmentState || '').trim()
    }))
  }
})
