import { buildProtectedXlsx } from '../../utils/protected-xlsx'
import { loadStudentIdentityReport } from '../../utils/student-identity-report'

const safeFilePart = (value: unknown) => String(value || 'reporte')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 60) || 'reporte'

export default defineEventHandler(async (event) => {
  const result = await loadStudentIdentityReport(event.context.user, getQuery(event))

  const workbook = buildProtectedXlsx({
    sheetName: 'Alumnos',
    title: 'Alumnos',
    metaLines: [
      `Plantel: ${result.filtros.plantel} | Ciclo: ${result.filtros.cicloLabel}`,
      `Alumnos: ${result.total}`
    ],
    headers: [
      'Nombres',
      'Apellido paterno',
      'Apellido materno',
      'Grado',
      'CURP',
      'Fecha de nacimiento'
    ],
    rows: result.rows.map(row => [
      row.nombres,
      row.apellidoPaterno,
      row.apellidoMaterno,
      row.grado,
      row.curp,
      row.fechaNacimiento
    ]),
    dateColumns: [5],
    columnWidths: [30, 24, 24, 14, 22, 20],
    tableName: 'Alumnos',
    creator: `${result.usuario.nombre} <${result.usuario.email}>`
  })

  const filename = `Alumnos_${safeFilePart(result.filtros.plantel)}_${safeFilePart(result.filtros.cicloLabel)}.xlsx`
  const encodedFilename = encodeURIComponent(filename)

  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`)
  setHeader(event, 'Content-Length', String(workbook.length))
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'X-Aurora-Students-Count', String(result.total))
  setHeader(event, 'X-Aurora-Students-Source', 'bridge-canonical-population')
  return workbook
})
