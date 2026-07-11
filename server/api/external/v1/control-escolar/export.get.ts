import { getQuery } from 'h3'
import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { buildControlEscolarExportWorkbook } from '../../../../utils/control-escolar-export'
import { runControlEscolar } from '../../../../utils/control-escolar'

const clean = (value: unknown, max = 80) => String(value ?? '').trim().slice(0, max)

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  const query = getQuery(event)
  const plantel = clean(query.plantel || query.agentId, 40).toUpperCase()
  const ciclo = clean(query.ciclo || query.cicloKey, 20).match(/\d{4}/)?.[0] || ''
  if (!plantel) throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  if (!ciclo) throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })

  return await runControlEscolar(event, plantel, async () => {
    const { workbook, filename } = await buildControlEscolarExportWorkbook(plantel, { ...query, ciclo, cicloKey: ciclo }, {
      includeSensitive: false,
      filenamePrefix: 'matricula-actual',
      titlePrefix: 'Matrícula actual'
    })
    setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseHeader(event, 'Content-Length', workbook.length)
    return workbook
  })
})
