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

const excelSafeText = (value: unknown) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .trim()

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

  // The detailed API already returned the exact student arrays shown in the UI.
  // Flatten them before XLSX generation so the export never depends on a second
  // plantel-code lookup (aliases such as CT/PREET and CM/PREEM cannot drop rows).
  const workbookGroups = (result.groups || []).map((group: any) => {
    const students = (group?.planteles || [])
      .flatMap((row: any) => Array.isArray(row?.students) ? row.students : [])
      .map((student: any) => ({
        matricula: excelSafeText(student?.matricula),
        nombre: excelSafeText(student?.nombre),
        grado: excelSafeText(student?.grado),
        grupo: excelSafeText(student?.grupo),
      }))

    const expectedRows = Number(group?.totalAlumnos || 0)
    if (expectedRows > 0 && students.length === 0) {
      throw createError({
        statusCode: 500,
        message: `El Taller ${excelSafeText(group?.nombre || group?.clave)} tiene ${expectedRows} alumno(s) en pantalla, pero la exportación no recibió sus filas.`,
      })
    }

    return {
      ...group,
      planteles: [{
        plantel,
        alumnos: expectedRows,
        students,
      }],
    }
  })

  const expectedAssignments = workbookGroups.reduce((sum: number, group: any) => sum + Number(group?.totalAlumnos || 0), 0)
  const exportedRows = workbookGroups.reduce((sum: number, group: any) => (
    sum + ((group?.planteles?.[0]?.students || []).length)
  ), 0)

  if (expectedAssignments > 0 && exportedRows === 0) {
    throw createError({
      statusCode: 500,
      message: 'El reporte tiene alumnos en pantalla, pero no fue posible obtener las filas para Excel. Actualiza el reporte e inténtalo de nuevo.',
    })
  }

  const workbook = buildTalleresInstitutionalXlsx({
    plantel,
    plantelNombre: PLANTEL_NAMES[plantel] || `Plantel ${plantel}`,
    cicloLabel: formatCicloLabel(result.ciclo),
    groups: workbookGroups,
    generatedAt: result.generatedAt,
  })

  const filename = `Talleres_${safeFilePart(plantel)}_${safeFilePart(result.ciclo)}.xlsx`
  const encodedFilename = encodeURIComponent(filename)

  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`)
  setHeader(event, 'Content-Length', String(workbook.length))
  setHeader(event, 'Cache-Control', 'private, no-store')
  return send(event, workbook)
})
