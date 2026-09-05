import { formatCicloLabel } from '../../../shared/utils/ciclo'
import { buildTalleresInstitutionalXlsxV2 } from '../../utils/talleres-institutional-xlsx-v2'
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

const cleanWorkbookText = (value: unknown, max = 240) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

const studentKey = (student: any) => {
  const matricula = cleanWorkbookText(student?.matricula, 64).toUpperCase().replace(/\s+/g, '')
  if (matricula) return `M:${matricula}`
  return `N:${cleanWorkbookText(student?.nombre, 220)}|${cleanWorkbookText(student?.grado, 80)}|${cleanWorkbookText(student?.grupo, 40)}`
}

const studentsForExport = (group: any) => {
  const seen = new Set<string>()
  const students = (group?.planteles || [])
    .flatMap((campus: any) => Array.isArray(campus?.students) ? campus.students : [])
    .map((student: any) => ({
      matricula: cleanWorkbookText(student?.matricula, 64),
      nombre: cleanWorkbookText(student?.nombre, 220),
      grado: cleanWorkbookText(student?.grado, 80),
      grupo: cleanWorkbookText(student?.grupo, 40).toUpperCase(),
    }))
    .filter((student: any) => {
      const key = studentKey(student)
      if (!student.nombre || seen.has(key)) return false
      seen.add(key)
      return true
    })

  return students.sort((left: any, right: any) => (
    left.grado.localeCompare(right.grado, 'es', { numeric: true, sensitivity: 'base' })
    || left.grupo.localeCompare(right.grupo, 'es', { numeric: true, sensitivity: 'base' })
    || left.nombre.localeCompare(right.nombre, 'es', { sensitivity: 'base' })
  ))
}

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

  const groups = (result.groups || []).map((group: any) => ({
    ...group,
    planteles: [{
      plantel,
      alumnos: Number(group?.totalAlumnos || 0),
      students: studentsForExport(group),
    }],
  }))

  const sourceAssignments = (result.groups || []).reduce(
    (sum: number, group: any) => sum + Number(group?.totalAlumnos || 0),
    0,
  )
  const exportedRows = groups.reduce(
    (sum: number, group: any) => sum + Number(group?.planteles?.[0]?.students?.length || 0),
    0,
  )

  if (sourceAssignments > 0 && exportedRows === 0) {
    throw createError({
      statusCode: 500,
      message: 'El reporte tiene alumnos, pero no fue posible preparar sus filas para Excel. Intenta nuevamente.',
    })
  }

  const workbook = buildTalleresInstitutionalXlsxV2({
    plantel,
    plantelNombre: PLANTEL_NAMES[plantel] || `Plantel ${plantel}`,
    cicloLabel: formatCicloLabel(result.ciclo),
    groups,
    generatedAt: result.generatedAt,
  })

  const filename = `Talleres_${safeFilePart(plantel)}_${safeFilePart(result.ciclo)}.xlsx`
  const encodedFilename = encodeURIComponent(filename)

  // Send the XLSX as raw bytes. Avoid H3/Nitro body serialization for binary OOXML.
  event.node.res.statusCode = 200
  event.node.res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  event.node.res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`)
  event.node.res.setHeader('Content-Length', String(workbook.length))
  event.node.res.setHeader('Cache-Control', 'private, no-store')
  event.node.res.setHeader('X-Content-Type-Options', 'nosniff')
  event.node.res.end(workbook)
})
