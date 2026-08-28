import { buildControlEscolarExportWorkbook } from '../../utils/control-escolar-export'
import { resolveControlEscolarAuth, runControlEscolar } from '../../utils/control-escolar'
import { CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS, CONTROL_ESCOLAR_REPORT_FIELD_KEYS } from '../../../shared/constants/controlEscolarReport'

const requestedFields = (value: unknown) => {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined
  const fields = String(raw)
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)
  const invalid = fields.filter((field) => !CONTROL_ESCOLAR_REPORT_FIELD_KEYS.has(field))
  if (invalid.length) {
    throw createError({ statusCode: 400, message: 'El reporte contiene campos no permitidos.' })
  }
  const unique = Array.from(new Set(fields))
  if (!unique.length) throw createError({ statusCode: 400, message: 'Selecciona al menos un campo para el reporte.' })
  return unique
}

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)
  const selectedFields = requestedFields(queryParams.fields) || CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS

  return await runControlEscolar(event, auth.agentId, async () => {
    const { workbook, filename } = await buildControlEscolarExportWorkbook(auth.agentId, queryParams as Record<string, any>, {
      includeSensitive: true,
      filenamePrefix: 'control-escolar',
      titlePrefix: 'IECS-IEDIS · Control Escolar',
      selectedFields,
    })
    setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseHeader(event, 'Content-Length', workbook.length)
    return workbook
  })
})
