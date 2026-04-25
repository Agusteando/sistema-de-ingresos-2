import { query } from '../../utils/db'
import { calculatePromotedGrado, displayGrado } from '../../../shared/utils/grado'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const { q = '', ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user
  
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
    // If no search query, optimize by only loading active students OR inactive students touched in this cycle
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
      FROM referenciasdepago
      WHERE ciclo = ? AND estatus = 'Vigente'
      GROUP BY matricula
    ) B ON A.matricula = B.matricula
    LEFT JOIN (
      SELECT matricula, SUM(((100 - IFNULL(beca, 0)) * costo / 100) * IFNULL(meses, 1)) AS saldo, GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') as conceptosCargados
      FROM documentos
      WHERE ciclo = ? AND estatus = 'Vigente'
      GROUP BY matricula
    ) C ON A.matricula = C.matricula
    WHERE ${whereClause}
    ORDER BY A.estatus = 'Activo' DESC, A.nombreCompleto ASC
    LIMIT 5000;
  `
  
  const queryParams = [cicloKey, cicloKey, ...params]
  const rows = await query<any[]>(sql, queryParams)
  
  return rows.map(r => {
    const promoted = calculatePromotedGrado(r.gradoBase, r.nivelBase, r.cicloBase, cicloKey)
    return {
      ...r,
      grado: displayGrado(promoted.grado),
      nivel: promoted.nivel,
      interno: r.internoBase
    }
  })
})
