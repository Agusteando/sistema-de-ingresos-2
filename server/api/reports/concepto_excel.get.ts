import { runWithBridgeAgentId } from '../../utils/db'
import { loadConceptReport } from '../../utils/concept-report'
import { buildProtectedXlsx } from '../../utils/protected-xlsx'
import { formatCicloLabel } from '../../../shared/utils/ciclo'

const safeFilePart = (value: unknown) => String(value || 'concepto')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 80) || 'concepto'

const formatDate = (value: unknown) => {
  if (!value) return ''
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value)
  }

  const raw = String(value).trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const result = await loadConceptReport(event.context.user, getQuery(event))
  const cicloLabel = formatCicloLabel(result.filtros.ciclo)
  const conceptName = String(result.concepto?.concepto || 'Concepto')
  const user = event.context.user || {}
  const creatorName = String(user.nombre || user.name || user.email || 'Usuario')
  const creatorEmail = String(user.email || user.usuario_email || '').trim()
  const creator = creatorEmail && creatorEmail.toLowerCase() !== creatorName.toLowerCase()
    ? `${creatorName} <${creatorEmail}>`
    : creatorName

  const rows = result.rows.map(row => [
    Number(row.folio || 0),
    formatDate(row.fecha),
    row.matricula || '',
    result.filtros.ciclo,
    row.grado || '',
    row.nivel || '',
    row.nombreCompleto || '',
    Number(row.documento || 0),
    row.mesReal || row.mes || '',
    row.conceptoNombre || conceptName,
    row.formaDePago || '',
    row.plantel || '',
    Number(row.monto || 0),
  ])

  const periodLine = result.filtros.inicio || result.filtros.fin
    ? `Periodo: ${result.filtros.inicio || 'Inicio'} a ${result.filtros.fin || 'Fin'}`
    : 'Periodo: todos los movimientos del ciclo'

  const workbook = buildProtectedXlsx({
    sheetName: 'Reporte por concepto',
    title: 'Reporte por concepto',
    subtitle: conceptName,
    metaLines: [
      `Ciclo escolar: ${cicloLabel}`,
      `Plantel: ${result.filtros.plantel || 'Todos'}`,
      periodLine,
      `Movimientos: ${result.resumen.transacciones} | Alumnos: ${result.resumen.alumnos}`,
    ],
    headers: [
      'Folio',
      'Fecha',
      'Matrícula',
      'Ciclo',
      'Grado',
      'Nivel',
      'Alumno',
      'Documento',
      'Mes',
      'Concepto',
      'Forma de pago',
      'Plantel',
      'Monto (MXN)',
    ],
    rows,
    numericColumns: [0, 7],
    currencyColumns: [12],
    totals: [
      ...result.resumen.formasPago.map(item => ({ label: item.formaDePago, value: Number(item.total || 0) })),
      { label: 'Importe total', value: Number(result.resumen.total || 0) },
    ],
    creator,
  })

  const filename = `Reporte_concepto_${safeFilePart(conceptName)}_${safeFilePart(result.filtros.ciclo)}.xlsx`
  const encodedFilename = encodeURIComponent(filename)

  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`)
  setHeader(event, 'Content-Length', String(workbook.length))
  setHeader(event, 'Cache-Control', 'private, no-store')
  return workbook
}))
