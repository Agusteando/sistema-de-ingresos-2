import { encodeCsv, filtersSummary, listControlEscolarStudents, runControlEscolarForAgent } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const requestQuery = getQuery(event)

  return await runControlEscolarForAgent(event, requestQuery.agentId as string, async (agentId) => {
    const list = await listControlEscolarStudents({
      agentId,
      search: requestQuery.search as string,
      status: requestQuery.status as string,
      missingData: requestQuery.missingData as string,
      program: requestQuery.program as string,
      nivel: requestQuery.nivel as string,
      group: requestQuery.group as string,
      recentlyUpdated: requestQuery.recentlyUpdated as string,
      limit: requestQuery.limit as string,
      exportMode: true
    })

    const exportedAt = new Date().toISOString()
    const summary = filtersSummary(requestQuery)
    const csv = encodeCsv(list.rows, [
      ['Control Escolar'],
      ['Plantel', agentId],
      ['Filtros', summary || 'Sin filtros'],
      ['Exportado', exportedAt],
      []
    ])

    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="control-escolar-${agentId}-${exportedAt.slice(0, 10)}.csv"`)
    return csv
  })
})
