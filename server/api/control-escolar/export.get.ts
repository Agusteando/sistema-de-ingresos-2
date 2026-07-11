import { buildControlEscolarExportWorkbook } from '../../utils/control-escolar-export'
import { resolveControlEscolarAuth, runControlEscolar } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)

  return await runControlEscolar(event, auth.agentId, async () => {
    const { workbook, filename } = await buildControlEscolarExportWorkbook(auth.agentId, queryParams as Record<string, any>, {
      includeSensitive: true,
      filenamePrefix: 'control-escolar',
      titlePrefix: 'Control Escolar'
    })
    setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseHeader(event, 'Content-Length', workbook.length)
    return workbook
  })
})
