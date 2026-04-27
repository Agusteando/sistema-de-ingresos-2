import { query } from '../../utils/db'
import { calculatePromotedGrado, displayGrado, nivelFromPlantel, normalizeGradoForPlantel } from '../../../shared/utils/grado'
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
        A.matricula, A.nombreCompleto, A.apellidoPaterno, A.apellidoMaterno, A.nombres, A.genero,
        A.grado as gradoBase, A.grupo, A.ciclo as cicloBase, A.ciclo, A.plantel, A.estatus,
        A.correo, A.telefono, A.\`Nombre del padre o tutor\` as padre, A.\`Fecha de nacimiento\` as birth, A.interno as internoBase,
        Prev.previous_matricula AS matriculaAnterior,
        Next.successor_matricula AS matriculaSiguiente,
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
        SELECT cargos.matricula, SUM(cargos.monto) AS saldo, GROUP_CONCAT(DISTINCT cargos.conceptoNombre SEPARATOR '|') as conceptosCargados
        FROM (
          SELECT
            D.matricula,
            ((100 - IFNULL(D.beca, 0)) * IFNULL(P.costo, D.costo) / 100) AS monto,
            IFNULL(P.conceptoNombre, D.conceptoNombre) AS conceptoNombre
          FROM documentos D
          JOIN (
            SELECT 1 AS mes UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
            UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
          ) M ON M.mes <= GREATEST(1, CAST(IFNULL(NULLIF(D.meses, ''), '1') AS UNSIGNED))
          LEFT JOIN documento_concepto_periodos P
            ON P.documento = D.documento
            AND P.estatus = 'Activo'
            AND M.mes >= P.start_mes
            AND (P.end_mes IS NULL OR M.mes <= P.end_mes)
          WHERE D.ciclo = ? AND D.estatus = 'Activo' AND (P.accion IS NULL OR P.accion <> 'cancelacion')
        ) cargos
        GROUP BY cargos.matricula
      ) C ON A.matricula = C.matricula
      LEFT JOIN alumno_matricula_links Prev ON Prev.successor_matricula = A.matricula
      LEFT JOIN alumno_matricula_links Next ON Next.previous_matricula = A.matricula
      WHERE ${whereClause}
      ORDER BY A.estatus = 'Activo' DESC, A.nombreCompleto ASC LIMIT 5000;
    `
    const rows = await query<any[]>(sql, [cicloKey, cicloKey, ...params])
    let mapped = rows.map(r => {
      const p = calculatePromotedGrado(r.gradoBase, r.plantel, r.cicloBase, cicloKey)
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
    const assignedNivel = nivelFromPlantel(assignedPlantel)

    await query(`
      INSERT INTO base (
        matricula, apellidoPaterno, apellidoMaterno, nombres, 
        nombreCompleto,
        \`Fecha de nacimiento\`, genero, plantel, nivel, grado, grupo, 
        \`Nombre del padre o tutor\`, telefono, correo, usuario, ciclo, interno, estatus
      ) VALUES (?, ?, ?, ?, CONCAT(?, ' ', ?, ' ', ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      '', 
      body.apellidoPaterno, body.apellidoMaterno, body.nombres,
      body.apellidoPaterno, body.apellidoMaterno, body.nombres,
      body.birth, body.genero, assignedPlantel, assignedNivel, normalizeGradoForPlantel(body.grado, assignedPlantel), body.grupo,
      body.padre, body.telefono, body.correo, user.name, cicloKey, body.interno, body.estatus || 'Activo'
    ])
    return { success: true }
  }
})
