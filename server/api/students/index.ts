import { runWithBridgeAgentId, query } from '../../utils/db'
import { calculatePromotedGrado, displayGrado, normalizeGradoForPlantel, normalizePlantel, plantelCandidatesForProjectedScope, resolveNivelEscolar } from '../../../shared/utils/grado'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { parseCurp } from '../../../shared/utils/curp'
import { previousCicloKey, resolveTipoIngreso } from '../../../shared/utils/tipoIngreso'
import { attachCustomSectionsToStudents } from '../../utils/student-sections'
import { getHistoricalEnrollmentConceptEvidence, parseEnrollmentConceptIds } from '../../utils/enrollment-evidence'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const method = event.node.req.method
  const user = event.context.user

  if (method === 'GET') {
    const { q = '', ciclo = '2025', nivel = '', grado = '', grupo = '', concepts = '' } = getQuery(event)
    const cicloKey = normalizeCicloKey(ciclo)
    const previousCiclo = previousCicloKey(cicloKey)
    const enrollmentConceptIds = parseEnrollmentConceptIds(concepts)
    
    let whereClause = "1=1"
    const params: any[] = []
    const addCurrentEnrollmentScope = () => {
      if (!enrollmentConceptIds.length) {
        whereClause += " AND (A.estatus = 'Activo' OR A.ciclo = ?)"
        params.push(cicloKey)
        return
      }

      const conceptPlaceholders = enrollmentConceptIds.map(() => '?').join(',')
      whereClause += ` AND (
        A.estatus = 'Activo'
        OR A.ciclo = ?
        OR EXISTS (
          SELECT 1
          FROM documentos DScope
          LEFT JOIN documento_concepto_periodos PScope
            ON PScope.documento = DScope.documento
            AND PScope.estatus = 'Activo'
          WHERE DScope.matricula = A.matricula
            AND DScope.ciclo = ?
            AND DScope.estatus = 'Activo'
            AND (PScope.accion IS NULL OR PScope.accion <> 'cancelacion')
            AND CAST(COALESCE(PScope.concepto_id, DScope.concepto) AS CHAR) IN (${conceptPlaceholders})
          LIMIT 1
        )
        OR EXISTS (
          SELECT 1
          FROM referenciasdepago RScope
          LEFT JOIN documentos DScopePaid ON DScopePaid.documento = RScope.documento
          LEFT JOIN documento_concepto_periodos PScopePaid
            ON PScopePaid.documento = RScope.documento
            AND PScopePaid.estatus = 'Activo'
            AND CAST(RScope.mes AS UNSIGNED) >= PScopePaid.start_mes
            AND (PScopePaid.end_mes IS NULL OR CAST(RScope.mes AS UNSIGNED) <= PScopePaid.end_mes)
          WHERE RScope.matricula = A.matricula
            AND RScope.ciclo = ?
            AND RScope.estatus = 'Vigente'
            AND CAST(COALESCE(PScopePaid.concepto_id, DScopePaid.concepto, RScope.concepto) AS CHAR) IN (${conceptPlaceholders})
          LIMIT 1
        )
      )`
      params.push(cicloKey, cicloKey, ...enrollmentConceptIds, cicloKey, ...enrollmentConceptIds)
    }

    const isScopedToActivePlantel = !user.isSuperAdmin || (user.isSuperAdmin && user.active_plantel !== 'GLOBAL')

    if (isScopedToActivePlantel) {
      const plantelCandidates = plantelCandidatesForProjectedScope(user.active_plantel)
      whereClause += ` AND A.plantel IN (${plantelCandidates.map(() => '?').join(',')})`
      params.push(...plantelCandidates)
    }


    const enrollmentConceptSet = new Set(enrollmentConceptIds)
    const rowHasCurrentEnrollmentEvidence = (row: any) => {
      if (!enrollmentConceptSet.size) return false
      return parseEnrollmentConceptIds([
        row.conceptoIdsPagados,
        row.conceptoIdsCargados,
        row.conceptoIdsCicloActual
      ]).some(conceptId => enrollmentConceptSet.has(conceptId))
    }

    if (q) {
      whereClause += " AND (A.nombreCompleto LIKE ? OR A.matricula = ?)"
      params.push(`%${q}%`, q)
    } else {
      addCurrentEnrollmentScope()
    }

    const sql = `
      SELECT 
        A.matricula, A.nombreCompleto, A.apellidoPaterno, A.apellidoMaterno, A.nombres, A.curp, A.genero,
        A.grado as gradoBase, A.grupo, A.ciclo as cicloBase, A.ciclo, A.plantel, A.nivel as nivelBase, A.estatus,
        A.correo, A.telefono, A.\`Nombre del padre o tutor\` as padre, A.\`Fecha de nacimiento\` as birth,
        Prev.previous_matricula AS matriculaAnterior,
        Next.successor_matricula AS matriculaSiguiente,
        IFNULL(B.pagosTotal, 0) AS pagosTotal,
        B.conceptosPagados,
        B.conceptoIdsPagados,
        IFNULL(C.saldo, 0) AS importeTotal,
        C.conceptosCargados,
        C.conceptoIdsCargados,
        BPrev.conceptosPagadosPrevios,
        BPrev.conceptoIdsPagadosPrevios,
        CPrev.conceptosCargadosPrevios,
        CPrev.conceptoIdsCargadosPrevios,
        CONCAT_WS('|', B.conceptosPagados, C.conceptosCargados) AS conceptosCicloActual,
        CONCAT_WS('|', B.conceptoIdsPagados, C.conceptoIdsCargados) AS conceptoIdsCicloActual,
        CONCAT_WS('|', BPrev.conceptosPagadosPrevios, CPrev.conceptosCargadosPrevios) AS conceptosCicloPrevio,
        CONCAT_WS('|', BPrev.conceptoIdsPagadosPrevios, CPrev.conceptoIdsCargadosPrevios) AS conceptoIdsCicloPrevio,
        (IFNULL(C.saldo, 0) - IFNULL(B.pagosTotal, 0)) AS saldoNeto
      FROM base A
      LEFT JOIN (
        SELECT
          R.matricula AS matricula,
          SUM(R.monto) AS pagosTotal,
          GROUP_CONCAT(DISTINCT R.conceptoNombre SEPARATOR '|') AS conceptosPagados,
          GROUP_CONCAT(DISTINCT CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS CHAR) SEPARATOR '|') AS conceptoIdsPagados
        FROM referenciasdepago R
        LEFT JOIN documentos D ON D.documento = R.documento
        LEFT JOIN documento_concepto_periodos P
          ON P.documento = R.documento
          AND P.estatus = 'Activo'
          AND CAST(R.mes AS UNSIGNED) >= P.start_mes
          AND (P.end_mes IS NULL OR CAST(R.mes AS UNSIGNED) <= P.end_mes)
        WHERE R.ciclo = ? AND R.estatus = 'Vigente' GROUP BY R.matricula
      ) B ON A.matricula = B.matricula
      LEFT JOIN (
        SELECT
          cargos.matricula,
          SUM(cargos.monto) AS saldo,
          GROUP_CONCAT(DISTINCT cargos.conceptoNombre SEPARATOR '|') AS conceptosCargados,
          GROUP_CONCAT(DISTINCT cargos.conceptoId SEPARATOR '|') AS conceptoIdsCargados
        FROM (
          SELECT
            D.matricula,
            CASE
            WHEN P.accion = 'cambio' THEN COALESCE(P.montoFinal, ((100 - IFNULL(D.beca, 0)) * IFNULL(P.costo, D.costo) / 100))
            ELSE COALESCE(D.montoFinal, ((100 - IFNULL(D.beca, 0)) * IFNULL(P.costo, D.costo) / 100))
          END AS monto,
            IFNULL(P.conceptoNombre, D.conceptoNombre) AS conceptoNombre,
            CAST(COALESCE(P.concepto_id, D.concepto) AS CHAR) AS conceptoId
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
      LEFT JOIN (
        SELECT
          R.matricula AS matricula,
          GROUP_CONCAT(DISTINCT R.conceptoNombre SEPARATOR '|') AS conceptosPagadosPrevios,
          GROUP_CONCAT(DISTINCT CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS CHAR) SEPARATOR '|') AS conceptoIdsPagadosPrevios
        FROM referenciasdepago R
        LEFT JOIN documentos D ON D.documento = R.documento
        LEFT JOIN documento_concepto_periodos P
          ON P.documento = R.documento
          AND P.estatus = 'Activo'
          AND CAST(R.mes AS UNSIGNED) >= P.start_mes
          AND (P.end_mes IS NULL OR CAST(R.mes AS UNSIGNED) <= P.end_mes)
        WHERE R.ciclo = ? AND R.estatus = 'Vigente'
        GROUP BY R.matricula
      ) BPrev ON A.matricula = BPrev.matricula
      LEFT JOIN (
        SELECT
          matricula,
          GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') AS conceptosCargadosPrevios,
          GROUP_CONCAT(DISTINCT concepto SEPARATOR '|') AS conceptoIdsCargadosPrevios
        FROM documentos
        WHERE ciclo = ? AND estatus = 'Activo'
        GROUP BY matricula
      ) CPrev ON A.matricula = CPrev.matricula
      LEFT JOIN alumno_matricula_links Prev ON Prev.successor_matricula = A.matricula
      LEFT JOIN alumno_matricula_links Next ON Next.previous_matricula = A.matricula
      WHERE ${whereClause}
      ORDER BY A.estatus = 'Activo' DESC, A.nombreCompleto ASC LIMIT 5000;
    `
    const rows = await query<any[]>(sql, [cicloKey, cicloKey, previousCiclo, previousCiclo, ...params])
    const historicalEnrollmentEvidence = await getHistoricalEnrollmentConceptEvidence(rows.map(r => r.matricula), enrollmentConceptIds)
    let mapped = rows.flatMap(r => {
      const p = calculatePromotedGrado(r.gradoBase, r.plantel, r.cicloBase, cicloKey, r.nivelBase)
      const hasCurrentEnrollmentEvidence = rowHasCurrentEnrollmentEvidence(r)
      if (p.outOfScope && !hasCurrentEnrollmentEvidence) return []
      const historicalConceptIds = historicalEnrollmentEvidence.get(String(r.matricula || '').trim()) || ''
      if (isScopedToActivePlantel && !hasCurrentEnrollmentEvidence && normalizePlantel(p.plantel) !== normalizePlantel(user.active_plantel)) return []

      const tipoIngreso = resolveTipoIngreso({
        ...r,
        tipoIngresoEvidence: {
          targetCiclo: cicloKey,
          previousCiclo,
          targetConceptIds: [r.conceptoIdsPagados, r.conceptoIdsCargados, r.conceptoIdsCicloActual],
          previousConceptIds: [r.conceptoIdsPagadosPrevios, r.conceptoIdsCargadosPrevios, r.conceptoIdsCicloPrevio],
          allConceptIds: [historicalConceptIds]
        }
      }, cicloKey, { enrollmentConcepts: enrollmentConceptIds })

      return {
        ...r,
        conceptoIdsTodos: historicalConceptIds,
        conceptoIdsHistoricos: historicalConceptIds,
        currentEnrollmentConceptMatch: hasCurrentEnrollmentEvidence,
        inscritoCicloActual: hasCurrentEnrollmentEvidence,
        plantelBase: r.plantel,
        plantel: p.outOfScope && hasCurrentEnrollmentEvidence && isScopedToActivePlantel ? normalizePlantel(user.active_plantel) : p.plantel,
        grado: displayGrado(p.grado),
        nivel: p.nivel,
        tipoIngreso
      }
    })

    if (nivel) mapped = mapped.filter(r => String(r.nivel).toLowerCase() === String(nivel).toLowerCase())
    if (grado) mapped = mapped.filter(r => String(r.grado).toLowerCase() === String(grado).toLowerCase())
    if (grupo) mapped = mapped.filter(r => r.grupo === grupo)

    return await attachCustomSectionsToStudents(mapped, user)
  }

  if (method === 'POST') {
    const body = await readBody(event)
    const cicloKey = normalizeCicloKey(body.cicloIngreso ?? body.ciclo)
    const assignedPlantel = user.active_plantel && user.active_plantel !== 'GLOBAL'
      ? user.active_plantel
      : String(body.plantel || '').trim()

    if (!assignedPlantel || assignedPlantel === 'GLOBAL') {
      throw createError({ statusCode: 400, message: 'Selecciona un plantel para dar de alta alumnos.' })
    }

    const curpInfo = parseCurp(body.curp)
    if (!curpInfo.isValid) {
      throw createError({ statusCode: 400, message: curpInfo.message || 'CURP inválida.' })
    }

    const assignedNivel = resolveNivelEscolar({ plantel: assignedPlantel, nivel: body.nivel })

    await query(`
      INSERT INTO base (
        matricula, apellidoPaterno, apellidoMaterno, nombres, 
        nombreCompleto,
        curp, \`Fecha de nacimiento\`, genero, plantel, nivel, grado, grupo, 
        \`Nombre del padre o tutor\`, telefono, correo, usuario, ciclo, estatus
      ) VALUES (?, ?, ?, ?, CONCAT(?, ' ', ?, ' ', ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      '', 
      body.apellidoPaterno, body.apellidoMaterno, body.nombres,
      body.apellidoPaterno, body.apellidoMaterno, body.nombres,
      curpInfo.normalized, curpInfo.birthDate, curpInfo.gender, assignedPlantel, assignedNivel, normalizeGradoForPlantel(body.grado, assignedPlantel, assignedNivel), '',
      body.padre, body.telefono, body.correo, user.name, cicloKey, body.estatus || 'Activo'
    ])
    return { success: true }
  }
}))
