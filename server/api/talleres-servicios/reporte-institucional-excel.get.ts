import { formatCicloLabel } from '../../../shared/utils/ciclo'
import { buildTalleresInstitutionalXlsx } from '../../utils/talleres-institutional-xlsx'
import { loadTalleresReport, normalizeTalleresReportPlantel } from '../../utils/talleres-report'

const PLANTEL_NAMES: Record<string, string> = {
  CT: 'Casita Toluca',
  CM: 'Casita Metepec',
  DM: 'Desarrollo Metepec',
  CO: 'Casita Ocoyoacac',
  DC: 'Desarrollo Casita',
  GM: 'Guardería Metepec',
  PM: 'Primaria Metepec',
  PT: 'Primaria Toluca',
  SM: 'Secundaria Metepec',
  ST: 'Secundaria Toluca',
  IS: 'ISSSTE Toluca',
  ISM: 'ISSSTE Metepec',
}

const safeFilePart = (value: unknown) => String(value || 'reporte')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 60) || 'reporte'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const plantel = normalizeTalleresReportPlantel(query.plantel)
  if (!plantel || plantel === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel para descargar el reporte institucional.' })
  }

  const result = await loadTalleresReport({
    event,
    ciclo: query.ciclo,
    requestedPlantel: plantel,
    includeStudents: true,
  })

  const workbook = buildTalleresInstitutionalXlsx({
    plantel,
    plantelNombre: PLANTEL_NAMES[plantel] || `Plantel ${plantel}`,
    cicloLabel: formatCicloLabel(result.ciclo),
    groups: result.groups,
    generatedAt: result.generatedAt,
  })

  const filename = `Talleres_${safeFilePart(plantel)}_${safeFilePart(result.ciclo)}.xlsx`
  const encodedFilename = encodeURIComponent(filename)

  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`)
  setHeader(event, 'Content-Length', String(workbook.length))
  setHeader(event, 'Cache-Control', 'private, no-store')
  return workbook
})
