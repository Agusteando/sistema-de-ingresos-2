import { assertTalleresPortalAccess } from '../../../../../utils/talleres-portal-auth'
import { readTalleresFinancialDiagnosticsForStudent } from '../../../../../utils/talleres-servicios'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')

  const query = getQuery(event)
  return {
    ok: true,
    diagnostics: await readTalleresFinancialDiagnosticsForStudent({
      matricula: query.matricula,
      ciclo: query.ciclo,
      plantel: query.plantel,
    }),
  }
})
