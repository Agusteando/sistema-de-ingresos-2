import { query, runWithBridgeAgentId } from '../../../utils/db'
import {
  normalizeControlEscolarPage,
  normalizeControlEscolarPageSize,
  resolveControlEscolarTarget,
  studentMissingFields
} from '../../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const target = resolveControlEscolarTarget(event)
  const params = getQuery(event)
  const page = normalizeControlEscolarPage(params.page)
  const pageSize = normalizeControlEscolarPageSize(params.pageSize)
  const offset = (page - 1) * pageSize
  const q = String(params.q || '').trim()
  const estatus = String(params.estatus || '').trim()
  const nivel = String(params.nivel || '').trim()
  const grado = String(params.grado || '').trim()
  const grupo = String(params.grupo || '').trim()
  const missing = String(params.missing || '').trim()

  return await runWithBridgeAgentId(target.agentId, async () => {
    const where: string[] = ['A.plantel = ?']
    const values: any[] = [target.plantel]

    if (q) {
      const like = `%${q}%`
      where.push(`(
        A.nombreCompleto LIKE ? OR
        A.matricula = ? OR
        A.curp LIKE ? OR
        A.telefono LIKE ? OR
        A.correo LIKE ? OR
        A.\`Nombre del padre o tutor\` LIKE ?
      )`)
      values.push(like, q, like, like, like, like)
    }

    if (estatus) {
      where.push('A.estatus = ?')
      values.push(estatus)
    }

    if (nivel) {
      where.push('A.nivel = ?')
      values.push(nivel)
    }

    if (grado) {
      where.push('A.grado = ?')
      values.push(grado)
    }

    if (grupo) {
      where.push('A.grupo = ?')
      values.push(grupo)
    }

    if (missing === 'curp') where.push(`(A.curp IS NULL OR TRIM(A.curp) = '')`)
    if (missing === 'telefono') where.push(`(A.telefono IS NULL OR TRIM(A.telefono) = '')`)
    if (missing === 'correo') where.push(`(A.correo IS NULL OR TRIM(A.correo) = '')`)
    if (missing === 'tutor') where.push(`(A.\`Nombre del padre o tutor\` IS NULL OR TRIM(A.\`Nombre del padre o tutor\`) = '')`)
    if (missing === 'nacimiento') where.push(`(A.\`Fecha de nacimiento\` IS NULL OR TRIM(CAST(A.\`Fecha de nacimiento\` AS CHAR)) = '')`)
    if (missing === 'incompletos') {
      where.push(`(
        A.curp IS NULL OR TRIM(A.curp) = '' OR
        A.telefono IS NULL OR TRIM(A.telefono) = '' OR
        A.\`Nombre del padre o tutor\` IS NULL OR TRIM(A.\`Nombre del padre o tutor\`) = ''
      )`)
    }

    const whereClause = where.join(' AND ')
    const [countRow] = await query<any[]>(`
      SELECT COUNT(*) AS total
      FROM base A
      WHERE ${whereClause}
    `, values)

    const rows = await query<any[]>(`
      SELECT
        A.matricula,
        A.nombreCompleto,
        A.apellidoPaterno,
        A.apellidoMaterno,
        A.nombres,
        A.curp,
        A.genero,
        A.\`Fecha de nacimiento\` AS birth,
        A.\`Nombre del padre o tutor\` AS padre,
        A.telefono,
        A.correo,
        A.plantel,
        A.nivel,
        A.grado,
        A.grupo,
        A.ciclo,
        A.estatus,
        Prev.previous_matricula AS matriculaAnterior,
        Next.successor_matricula AS matriculaSiguiente
      FROM base A
      LEFT JOIN alumno_matricula_links Prev ON Prev.successor_matricula = A.matricula
      LEFT JOIN alumno_matricula_links Next ON Next.previous_matricula = A.matricula
      WHERE ${whereClause}
      ORDER BY A.estatus = 'Activo' DESC, A.nombreCompleto ASC, A.matricula ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `, values)

    const students = rows.map(row => ({
      ...row,
      agentId: target.agentId,
      missingFields: studentMissingFields(row)
    }))

    return {
      agentId: target.agentId,
      page,
      pageSize,
      total: Number(countRow?.total || 0),
      students
    }
  })
})
