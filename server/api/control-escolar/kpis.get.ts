import { query, runWithBridgeAgentId } from '../../utils/db'
import { resolveControlEscolarTarget } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const target = resolveControlEscolarTarget(event)

  return await runWithBridgeAgentId(target.agentId, async () => {
    const [summary] = await query<any[]>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN estatus = 'Activo' THEN 1 ELSE 0 END) AS activos,
        SUM(CASE WHEN estatus <> 'Activo' OR estatus IS NULL THEN 1 ELSE 0 END) AS inactivos,
        SUM(CASE WHEN curp IS NULL OR TRIM(curp) = '' THEN 1 ELSE 0 END) AS sinCurp,
        SUM(CASE WHEN telefono IS NULL OR TRIM(telefono) = '' THEN 1 ELSE 0 END) AS sinTelefono,
        SUM(CASE WHEN correo IS NULL OR TRIM(correo) = '' THEN 1 ELSE 0 END) AS sinCorreo,
        SUM(CASE WHEN \`Nombre del padre o tutor\` IS NULL OR TRIM(\`Nombre del padre o tutor\`) = '' THEN 1 ELSE 0 END) AS sinTutor,
        SUM(CASE WHEN \`Fecha de nacimiento\` IS NULL OR TRIM(CAST(\`Fecha de nacimiento\` AS CHAR)) = '' THEN 1 ELSE 0 END) AS sinNacimiento
      FROM base
      WHERE plantel = ?
    `, [target.plantel])

    const byNivel = await query<any[]>(`
      SELECT COALESCE(NULLIF(TRIM(nivel), ''), 'Sin nivel') AS nivel, COUNT(*) AS total
      FROM base
      WHERE plantel = ?
      GROUP BY COALESCE(NULLIF(TRIM(nivel), ''), 'Sin nivel')
      ORDER BY total DESC, nivel ASC
      LIMIT 12
    `, [target.plantel])

    const byGrado = await query<any[]>(`
      SELECT COALESCE(NULLIF(TRIM(grado), ''), 'Sin grado') AS grado, COUNT(*) AS total
      FROM base
      WHERE plantel = ? AND estatus = 'Activo'
      GROUP BY COALESCE(NULLIF(TRIM(grado), ''), 'Sin grado')
      ORDER BY total DESC, grado ASC
      LIMIT 16
    `, [target.plantel])

    return {
      agentId: target.agentId,
      summary: {
        total: Number(summary?.total || 0),
        activos: Number(summary?.activos || 0),
        inactivos: Number(summary?.inactivos || 0),
        sinCurp: Number(summary?.sinCurp || 0),
        sinTelefono: Number(summary?.sinTelefono || 0),
        sinCorreo: Number(summary?.sinCorreo || 0),
        sinTutor: Number(summary?.sinTutor || 0),
        sinNacimiento: Number(summary?.sinNacimiento || 0),
        incompletos: Number(summary?.sinCurp || 0) + Number(summary?.sinTelefono || 0) + Number(summary?.sinTutor || 0)
      },
      byNivel: byNivel.map(row => ({ nivel: row.nivel, total: Number(row.total || 0) })),
      byGrado: byGrado.map(row => ({ grado: row.grado, total: Number(row.total || 0) }))
    }
  })
})
