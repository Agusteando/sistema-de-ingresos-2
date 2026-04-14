import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  const user = event.context.user

  if (method === 'GET') {
    const { q = '', ciclo = '2024', nivel = '', grado = '', grupo = '' } = getQuery(event)
    let whereClause = "A.estatus = 'Activo'"
    const params: any[] = []

    if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
      whereClause += " AND A.plantel = ?"
      params.push(user.active_plantel)
    }

    if (nivel) { whereClause += " AND A.nivel = ?"; params.push(nivel) }
    if (grado) { whereClause += " AND A.grado = ?"; params.push(grado) }
    if (grupo) { whereClause += " AND A.grupo = ?"; params.push(grupo) }

    if (q) {
      whereClause += " AND (A.nombreCompleto LIKE ? OR A.matricula = ?)"
      params.push(`%${q}%`, q)
    }

    const sql = `
      SELECT 
        A.matricula, A.nombreCompleto, A.grado, A.grupo, A.nivel, A.plantel, A.estatus, A.correo, A.telefono, A.\`Nombre del padre o tutor\` as padre, A.\`Fecha de nacimiento\` as birth, A.interno,
        IFNULL(B.pagosTotal, 0) AS pagosTotal,
        IFNULL(C.saldo, 0) AS importeTotal,
        (IFNULL(C.saldo, 0) - IFNULL(B.pagosTotal, 0)) AS saldoNeto
      FROM base A
      LEFT JOIN (
        SELECT matricula, SUM(monto) AS pagosTotal FROM referenciasdepago WHERE ciclo = ? AND estatus = 'Vigente' GROUP BY matricula
      ) B ON A.matricula = B.matricula
      LEFT JOIN (
        SELECT matricula, SUM(((100 - IFNULL(beca, 0)) * costo / 100) * IFNULL(meses, 1)) AS saldo FROM documentos WHERE ciclo = ? GROUP BY matricula
      ) C ON A.matricula = C.matricula
      WHERE ${whereClause}
      ORDER BY A.nombreCompleto ASC LIMIT 100;
    `
    return await query(sql, [ciclo, ciclo, ...params])
  }

  if (method === 'POST') {
    const body = await readBody(event)
    const assignedPlantel = user.role === 'global' ? body.plantel : user.active_plantel

    await query(`
      INSERT INTO base (
        matricula, apellidoPaterno, apellidoMaterno, nombres, 
        \`Fecha de nacimiento\`, genero, plantel, nivel, grado, grupo, 
        \`Nombre del padre o tutor\`, telefono, correo, usuario, ciclo, interno
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      '', 
      body.apellidoPaterno, body.apellidoMaterno, body.nombres,
      body.birth, body.genero, assignedPlantel, body.nivel, body.grado, body.grupo,
      body.padre, body.telefono, body.correo, user.name, body.ciclo, body.interno
    ])
    return { success: true }
  }
})