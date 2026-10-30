import { resolveSharedConceptLink, loadPublicSharedConceptReport } from '../../../../utils/public-concept-links'
import { buildProtectedXlsx } from '../../../../utils/protected-xlsx'

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store, private')
  setHeader(event, 'Referrer-Policy', 'no-referrer')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow, noarchive')
  const token = String(getRouterParam(event, 'token') || '')
  const link = await resolveSharedConceptLink(token)
  const data = await loadPublicSharedConceptReport(link)
  const labels: Record<string,string> = { movements: 'Con concepto', missing: 'Sin concepto', debtors: 'Deudores' }
  const title = 'Resumen institucional por concepto'
  const workbook = buildProtectedXlsx({
    sheetName: 'Alumnos',
    title,
    subtitle: data.conceptos.join(', ') || 'Concepto ' + link.conceptoId,
    metaLines: [
      'Modalidad: ' + labels[link.modo],
      'Ciclo: ' + link.ciclo,
      (data.cobertura.parcial ? 'SUBTOTAL DISPONIBLE: ' : 'Alumnos: ') + data.resumen.alumnos,
      'Cobertura: ' + data.cobertura.disponibles + ' de ' + data.cobertura.solicitados + ' planteles',
      ...(data.cobertura.parcial ? ['NO DISPONIBLES (no incluidos en el total ni el listado): ' + data.cobertura.noDisponibles.join(', ')] : []),
      'Consulta: ' + data.generatedAt,
    ],
    headers: ['Matrícula', 'Alumno', 'Nivel', 'Grado', 'Grupo', 'Sección', 'Plantel'],
    rows: data.rows.map((student:any) => [student.matricula,student.nombreCompleto,student.nivel,student.grado,student.grupo,student.seccion,student.plantel]),
    columnWidths: [18,42,19,16,15,23,21],
    tableName: 'ResumenConceptoPublico',
  })
  const filename = 'Resumen_institucional_concepto_' + link.conceptoId + '.xlsx'
  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', 'attachment; filename="' + filename + '"')
  setHeader(event, 'Content-Length', String(workbook.length))
  return workbook
})
