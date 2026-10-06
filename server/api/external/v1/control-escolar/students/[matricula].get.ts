import { withNuevoIngreso } from '../../../../../../shared/utils/nuevoIngreso'
import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { readExternalSnapshotStudentDetail } from '../../../../../utils/control-escolar-external-snapshot'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  const query = getQuery(event)
  const response = await readExternalSnapshotStudentDetail(query, getRouterParam(event, 'matricula'))
  return withNuevoIngreso(response, response?.meta?.ciclo || query.ciclo || query.cicloKey || query.schoolYear)
})
