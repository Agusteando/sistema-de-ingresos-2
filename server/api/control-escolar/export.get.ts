import { fetchControlEscolarExportRows, resolveControlEscolarAuth, runControlEscolar } from '../../utils/control-escolar'

const csvCell = (value: unknown) => {
  const raw = Array.isArray(value) ? value.join('|') : String(value ?? '')
  const escaped = raw.replace(/"/g, '""')
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
}

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)

  return await runControlEscolar(event, auth.agentId, async () => {
    const rows = await fetchControlEscolarExportRows(auth.agentId, queryParams)
    const columns = [
      ['plantel', 'Plantel'],
      ['matricula', 'Matrícula'],
      ['fullName', 'Nombre completo'],
      ['curp', 'CURP'],
      ['phone', 'Teléfono'],
      ['email', 'Email'],
      ['status', 'Estado'],
      ['nivel', 'Nivel'],
      ['grado', 'Grado'],
      ['group', 'Grupo'],
      ['guardianName', 'Tutor/responsable'],
      ['missingFields', 'Datos faltantes'],
      ['overlayExists', 'Tiene fila matricula'],
      ['updatedAt', 'Última actualización']
    ] as const

    const meta = [
      `Control Escolar - ${auth.agentId}`,
      `Filtros: ${Object.entries(queryParams).filter(([key, value]) => key !== 'agentId' && value).map(([key, value]) => `${key}=${value}`).join('; ') || 'sin filtros'}`,
      `Exportado: ${new Date().toISOString()}`,
      ''
    ]
    const header = columns.map(([, label]) => csvCell(label)).join(',')
    const body = rows.map((row: any) => columns.map(([key]) => csvCell(row[key])).join(',')).join('\n')
    const csv = `\uFEFF${meta.map(csvCell).join('\n')}\n${header}\n${body}`

    setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="control-escolar-${auth.agentId}-${new Date().toISOString().slice(0, 10)}.csv"`)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return csv
  })
})
