import { query } from '../../utils/db'
import { calculatePromotedGrado, displayGrado, normalizeGrado } from '../../../shared/utils/grado'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  const user = event.context.user

  if (method === 'GET') {
    const { q = '', ciclo = '2025', nivel = '', grado = '', grupo = '' } = getQuery(event)
    const cicloKey = normalizeCicloKey(ciclo)
    
    let whereClause = "1=1"
    const params: any[] = []

    if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
      whereClause += " AND A.plantel = ?"
      params.push(user.active_plantel)
    }

    if (q) {
      whereClause += " AND (A.nombreCompleto LIKE ? OR A.matricula = ?)"
      params.push(`%${q}%`, q)
    } else {
      whereClause += " AND (A.estatus = 'Activo' OR A.ciclo = ?)"
      params.push(cicloKey)
    }

    const sql = `
      SELECT 
        A.matricula, A.nombreCompleto, A.grado as gradoBase, A.grupo, A.nivel as nivelBase, A.ciclo as cicloBase, A.plantel, A.estatus, A.correo, A.telefono, A.\`Nombre del padre o tutor\` as padre, A.\`Fecha de nacimiento\` as birth, A.interno as internoBase,
        IFNULL(B.pagosTotal, 0) AS pagosTotal,
        B.conceptosPagados,
        IFNULL(C.saldo, 0) AS importeTotal,
        C.conceptosCargados,
        (IFNULL(C.saldo, 0) - IFNULL(B.pagosTotal, 0)) AS saldoNeto
      FROM base A
      LEFT JOIN (
        SELECT matricula, SUM(monto) AS pagosTotal, GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') as conceptosPagados
        FROM referenciasdepago WHERE ciclo = ? AND estatus = 'Vigente' GROUP BY matricula
      ) B ON A.matricula = B.matricula
      LEFT JOIN (
        SELECT matricula, SUM(((100 - IFNULL(beca, 0)) * costo / 100) * IFNULL(meses, 1)) AS saldo, GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') as conceptosCargados
        FROM documentos WHERE ciclo = ? AND estatus = 'Activo' GROUP BY matricula
      ) C ON A.matricula = C.matricula
      WHERE ${whereClause}
      ORDER BY A.estatus = 'Activo' DESC, A.nombreCompleto ASC LIMIT 5000;
    `
    const rows = await query<any[]>(sql, [cicloKey, cicloKey, ...params])
    let mapped = rows.map(r => {
      const p = calculatePromotedGrado(r.gradoBase, r.nivelBase, r.cicloBase, cicloKey)
      return {
        ...r,
        grado: displayGrado(p.grado),
        nivel: p.nivel,
        interno: r.internoBase
      }
    })

    if (nivel) mapped = mapped.filter(r => String(r.nivel).toLowerCase() === String(nivel).toLowerCase())
    if (grado) mapped = mapped.filter(r => String(r.grado).toLowerCase() === String(grado).toLowerCase())
    if (grupo) mapped = mapped.filter(r => r.grupo === grupo)

    return mapped
  }

  if (method === 'POST') {
    const body = await readBody(event)
    const cicloKey = normalizeCicloKey(body.ciclo)
    const assignedPlantel = user.role === 'global' ? body.plantel : user.active_plantel

    await query(`
      INSERT INTO base (
        matricula, apellidoPaterno, apellidoMaterno, nombres, 
        \`Fecha de nacimiento\`, genero, plantel, nivel, grado, grupo, 
        \`Nombre del padre o tutor\`, telefono, correo, usuario, ciclo, interno, estatus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      '', 
      body.apellidoPaterno, body.apellidoMaterno, body.nombres,
      body.birth, body.genero, assignedPlantel, body.nivel, normalizeGrado(body.grado), body.grupo,
      body.padre, body.telefono, body.correo, user.name, cicloKey, body.interno, body.estatus || 'Activo'
    ])
    return { success: true }
  }
})
