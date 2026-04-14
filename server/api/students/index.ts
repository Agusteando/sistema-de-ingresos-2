import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method

  if (method === 'GET') {
    const { q = '', ciclo = '2024' } = getQuery(event)
    
    let whereClause = "A.estatus = 'Activo'"
    const params: any[] = []

    if (q) {
      whereClause += " AND (A.nombreCompleto LIKE ? OR A.matricula = ?)"
      params.push(`%${q}%`, q)
    }

    const sql = `
      SELECT 
        A.matricula, A.nombreCompleto, A.grado, A.grupo, A.nivel, A.plantel, A.estatus, A.correo, A.telefono, A.padre, A.birth,
        IFNULL(B.pagosTotal, 0) AS pagosTotal,
        IFNULL(C.saldo, 0) AS importeTotal,
        (IFNULL(C.saldo, 0) - IFNULL(B.pagosTotal, 0)) AS saldoNeto,
        IF(A.ciclo = ?, 0, 1) as interno
      FROM base A
      LEFT JOIN (
        SELECT matricula, SUM(monto) AS pagosTotal FROM referenciasdepago WHERE ciclo = ? AND estatus = 'Vigente' GROUP BY matricula
      ) B ON A.matricula = B.matricula
      LEFT JOIN (
        SELECT matricula, SUM(((100 - IFNULL(beca, 0)) * costo / 100) * IFNULL(meses, 1)) AS saldo FROM documentos WHERE ciclo = ? GROUP BY matricula
      ) C ON A.matricula = C.matricula
      WHERE ${whereClause}
      ORDER BY A.nombreCompleto ASC LIMIT 50;
    `
    return await query(sql, [ciclo, ciclo, ciclo, ...params])
  }

  if (method === 'POST') {
    const body = await readBody(event)
    await query(`
      INSERT INTO base (
        matricula, nombreCompleto, apellidoPaterno, apellidoMaterno, nombres, 
        birth, padre, genero, plantel, nivel, grado, grupo, telefono, correo, ciclo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        nombreCompleto = VALUES(nombreCompleto), nivel = VALUES(nivel), grado = VALUES(grado), grupo = VALUES(grupo)
    `, [
      body.matricula, body.nombreCompleto, body.apellidoPaterno, body.apellidoMaterno, body.nombres,
      body.birth, body.padre, body.genero, body.plantel, body.nivel, body.grado, body.grupo, body.telefono, body.correo, body.ciclo
    ])
    return { success: true }
  }
})