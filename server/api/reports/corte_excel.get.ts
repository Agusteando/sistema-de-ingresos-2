import { runWithBridgeAgentId } from '../../utils/db'
import { loadCurrentUserCorteCaja } from '../../utils/corte-caja'
import { buildProtectedXlsx } from '../../utils/xlsx'

const safeFilePart = (value: unknown) => String(value || 'usuario')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 60) || 'usuario'

const formatDate = (value: unknown) => {
  if (!value) return ''
  const dateKey = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10)
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : dateKey
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const filters = getQuery(event)
  const user = event.context.user
  const result = await loadCurrentUserCorteCaja(user, filters)
  const periodLabel = result.filtros.inicio && result.filtros.fin
    ? `${result.filtros.inicio} a ${result.filtros.fin}`
    : 'Periodo completo del ciclo'

  const workbook = buildProtectedXlsx({
    sheetName: 'Corte de Caja',
    title: 'Corte de Caja',
    subtitle: 'Hoja protegida contra edición. Solo contiene movimientos del usuario autenticado.',
    metaLines: [
      `Usuario: ${result.usuario.nombre} (${result.usuario.email})`,
      `Ciclo: ${result.filtros.ciclo} | Periodo: ${periodLabel} | Plantel: ${result.filtros.plantel}`
    ],
    headers: [
      'Folio',
      'Fecha',
      'Matrícula',
      'Documento',
      'Mes',
      'Alumno',
      'Concepto',
      'Forma de pago',
      'Plantel',
      'Monto (MXN)'
    ],
    rows: result.rows.map(row => [
      Number(row.folio || 0),
      formatDate(row.fecha),
      row.matricula,
      Number(row.documento || 0),
      row.mesReal || row.mes,
      row.nombreCompleto,
      row.conceptoNombre,
      row.formaDePago,
      row.scopePlantel || row.plantel || '',
      Number(row.monto || 0)
    ]),
    numericColumns: [0, 3],
    currencyColumns: [9],
    totals: [
      ...result.totales.map(total => ({ label: total.formaDePago, value: total.total })),
      { label: 'Importe total', value: result.total }
    ],
    creator: `${result.usuario.nombre} <${result.usuario.email}>`
  })

  const today = new Date().toISOString().slice(0, 10)
  const filename = `Corte_de_Caja_${safeFilePart(result.usuario.nombre)}_${today}.xlsx`
  const encodedFilename = encodeURIComponent(filename)

  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`)
  setHeader(event, 'Content-Length', String(workbook.length))
  setHeader(event, 'Cache-Control', 'private, no-store')
  return workbook
}))
