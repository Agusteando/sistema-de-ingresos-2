import { getControlEscolarFacets, listControlEscolarStudents, runControlEscolarForAgent } from '../../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const requestQuery = getQuery(event)

  return await runControlEscolarForAgent(event, requestQuery.agentId as string, async (agentId) => {
    const [list, facets] = await Promise.all([
      listControlEscolarStudents({
        agentId,
        search: requestQuery.search as string,
        status: requestQuery.status as string,
        missingData: requestQuery.missingData as string,
        program: requestQuery.program as string,
        nivel: requestQuery.nivel as string,
        group: requestQuery.group as string,
        recentlyUpdated: requestQuery.recentlyUpdated as string,
        page: requestQuery.page as string,
        limit: requestQuery.limit as string
      }),
      getControlEscolarFacets(agentId)
    ])

    return { ...list, filters: facets }
  })
})
