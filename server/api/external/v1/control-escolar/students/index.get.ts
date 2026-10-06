import { withNuevoIngreso } from '../../../../../../shared/utils/nuevoIngreso'
import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { readExternalResilientStudents } from '../../../../../utils/control-escolar-external-resilient'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  const query = getQuery(event)
  const response = await readExternalResilientStudents(event, query)
  return withNuevoIngreso(response, response?.meta?.ciclo || query.ciclo || query.cicloKey || query.schoolYear)
})
