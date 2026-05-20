import { getControlEscolarStudents, runControlEscolarQuery } from '../../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const params = getQuery(event)
  return await runControlEscolarQuery(event, params.agentId, async ({ agentId }) => {
    return await getControlEscolarStudents(agentId, {
      search: String(params.search || ''),
      status: String(params.status || 'all'),
      missing: String(params.missing || 'all'),
      program: String(params.program || ''),
      nivel: String(params.nivel || ''),
      grado: String(params.grado || ''),
      group: String(params.group || ''),
      recentlyUpdated: String(params.recentlyUpdated || ''),
      ciclo: String(params.ciclo || '')
    }, Number(params.page || 1), Number(params.limit || 30))
  })
})
