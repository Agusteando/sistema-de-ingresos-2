import {
  CONTROL_ESCOLAR_MATRICULA_IMPORT_FIELDS,
  CONTROL_ESCOLAR_MATRICULA_IMPORT_LABELS,
  fetchControlEscolarExportRows,
  resolveControlEscolarAuth,
  runControlEscolar
} from '../../../utils/control-escolar'

const csvCell = (value: unknown) => {
  const raw = Array.isArray(value) ? value.join('|') : String(value ?? '')
  const escaped = raw.replace(/"/g, '""')
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
}

const fieldValue = (row: any, field: string) => {
  if (field === 'grupo') return row.group || ''
  if (field === 'direccion') return row.address || ''
  return row[field] ?? ''
}

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)

  return await runControlEscolar(event, auth.agentId, async () => {
    const rows = await fetchControlEscolarExportRows(auth.agentId, queryParams)
    const columns = CONTROL_ESCOLAR_MATRICULA_IMPORT_FIELDS
    const meta = [
      `Control Escolar matricula DB - ${auth.agentId}`,
      'Importación segura: esta plantilla sólo actualiza/upserta campos de la tabla externa matricula por matrícula. No elimina alumnos.',
      `Exportado: ${new Date().toISOString()}`,
      ''
    ]
    const header = columns.map((field) => csvCell(CONTROL_ESCOLAR_MATRICULA_IMPORT_LABELS[field] || field)).join(',')
    const body = rows.map((row: any) => columns.map((field) => csvCell(fieldValue(row, field))).join(',')).join('\n')
    const csv = `\uFEFF${meta.map(csvCell).join('\n')}\n${header}\n${body}`

    setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="control-escolar-matricula-db-${auth.agentId}-${new Date().toISOString().slice(0, 10)}.csv"`)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return csv
  })
})
