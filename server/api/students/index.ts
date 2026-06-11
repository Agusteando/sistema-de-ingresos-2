import { runWithBridgeAgentId, query } from '../../utils/db'
import { calculateBasePlacementForTargetPosition, calculatePromotedGrado, displayGrado, normalizeGradoForPlantel, normalizePlantel, plantelCandidatesForProjectedScope, resolveNivelEscolar } from '../../../shared/utils/grado'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { parseCurp } from '../../../shared/utils/curp'
import { previousCicloKey, resolveTipoIngreso } from '../../../shared/utils/tipoIngreso'
import { attachCustomSectionsToStudents } from '../../utils/student-sections'
import { getHistoricalEnrollmentConceptEvidence, parseEnrollmentConceptIds } from '../../utils/enrollment-evidence'
import { fetchCentralMatriculaOverlays } from '../../utils/central-matricula-overlay'
import { resolveFinancialFamilyContact } from '../../../shared/utils/familyContact'

type SqlWriteError = Error & {
  code?: string
  errno?: number
  sqlState?: string
  httpStatus?: number
  status?: number
  statusCode?: number
  bridgePayload?: any
}

type InsertResult = { insertId?: number }

const normalizeTextValue = (value: unknown) => String(value || '').trim()
const normalizeMatricula = (value: unknown) => normalizeTextValue(value).toUpperCase().replace(/[^A-Z0-9]/g, '')

const normalizeFinancialMatricula = (value: unknown) => normalizeTextValue(value).toUpperCase()

const mergeCentralOverlayIntoFinancialStudent = (student: any, overlay: any) => {
  const central = overlay?.student || overlay
  if (!student || !central) return student
  const merged = {
    ...student,
    centralMatricula: { ...(student.centralMatricula || {}), ...central },
    centralMatriculaRaw: overlay?.raw || student.centralMatriculaRaw || null,
    matriculaEnrichmentStatus: 'ready',
    curp: normalizeTextValue(central.curp) || student.curp,
    madre: normalizeTextValue(central.madre) || student.madre,
    telefonoPadre: normalizeTextValue(central.telefonoPadre) || student.telefonoPadre,
    telefonoMadre: normalizeTextValue(central.telefonoMadre) || student.telefonoMadre,
    emailPadre: normalizeTextValue(central.emailPadre) || student.emailPadre,
    emailMadre: normalizeTextValue(central.emailMadre) || student.emailMadre,
    nombrePadre: normalizeTextValue(central.nombrePadre) || student.nombrePadre,
    apellidoPaternoPadre: normalizeTextValue(central.apellidoPaternoPadre) || student.apellidoPaternoPadre,
    apellidoMaternoPadre: normalizeTextValue(central.apellidoMaternoPadre) || student.apellidoMaternoPadre,
    nombreMadre: normalizeTextValue(central.nombreMadre) || student.nombreMadre,
    apellidoPaternoMadre: normalizeTextValue(central.apellidoPaternoMadre) || student.apellidoPaternoMadre,
    apellidoMaternoMadre: normalizeTextValue(central.apellidoMaternoMadre) || student.apellidoMaternoMadre,
    direccion: normalizeTextValue(central.direccion) || student.direccion,
  }
  const familyContact = resolveFinancialFamilyContact(merged)
  return {
    ...merged,
    padre: familyContact.tutorName || student.padre,
    tutor: familyContact.tutorName || student.tutor,
    telefono: familyContact.phone || student.telefono,
    correo: familyContact.email || student.correo,
    controlEscolarFamilyContact: familyContact,
  }
}

const enrichFinancialStudentsWithMatricula = async (students: any[] = []) => {
  const matriculas = Array.from(new Set(students.map(student => normalizeTextValue(student?.matricula)).filter(Boolean)))
  if (!matriculas.length) return students
  try {
    const overlays = await fetchCentralMatriculaOverlays(matriculas)
    if (!overlays.size) return students.map(student => ({ ...student, matriculaEnrichmentStatus: 'missing' }))
    return students.map((student) => {
      const overlay = overlays.get(normalizeFinancialMatricula(student?.matricula))
      return overlay
        ? mergeCentralOverlayIntoFinancialStudent(student, overlay)
        : { ...student, matriculaEnrichmentStatus: 'missing' }
    })
  } catch (error: any) {
    console.warn('[Students GET] central matricula enrichment unavailable.', { message: error?.message || error })
    return students.map(student => ({ ...student, matriculaEnrichmentStatus: 'unavailable' }))
  }
}

const isDuplicateKeyError = (error: unknown) => {
  const err = error as SqlWriteError
  const message = String(err?.message || '').toLowerCase()
  return err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062 || message.includes('duplicate entry')
}

const isHandledHttpError = (error: unknown) => {
  const err = error as SqlWriteError
  const statusCode = Number(err?.statusCode || err?.status || 0)
  return Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 500
}

const bridgeHttpStatus = (error: unknown) => {
  const err = error as SqlWriteError
  const status = Number(err?.httpStatus || 0)
  return Number.isFinite(status) && status > 0 ? status : 0
}

const createStudentPersistenceError = (error: unknown, explicitMatricula: string) => {
  const err = error as SqlWriteError
  const httpStatus = bridgeHttpStatus(err)
  const code = err?.code || (httpStatus ? `DB_BRIDGE_HTTP_${httpStatus}` : undefined)
  const detail = String(err?.bridgePayload?.error?.message || err?.bridgePayload?.message || err?.message || '').trim()

  if (isDuplicateKeyError(err)) {
    return createError({
      statusCode: 409,
      message: explicitMatricula
        ? `La matrícula ${explicitMatricula} ya existe.`
        : 'La matrícula generada por la base de datos ya existe. Intenta guardar nuevamente.',
      data: { code: err?.code || 'ER_DUP_ENTRY', errno: err?.errno || 1062 }
    })
  }

  if (httpStatus) {
    return createError({
      statusCode: httpStatus >= 500 ? 502 : httpStatus,
      message: `No se pudo registrar el alumno: el servicio de base de datos respondió con HTTP ${httpStatus}. La matrícula debe generarla el trigger de la tabla base y el alta no fue confirmada. Revisa que el DB bridge/agente del plantel esté disponible y vuelve a intentar.`,
      data: { code, httpStatus, detail: detail || null },
      cause: err
    })
  }

  return createError({
    statusCode: 500,
    message: 'No se pudo registrar el alumno por un error de base de datos. El alta no fue confirmada; revisa el detalle técnico y vuelve a intentar.',
    data: { code: code || null, errno: err?.errno || null, sqlState: err?.sqlState || null, detail: detail || null },
    cause: err
  })
}

const buildNombreCompleto = (body: Record<string, any>) => [
  normalizeTextValue(body.apellidoPaterno),
  normalizeTextValue(body.apellidoMaterno),
  normalizeTextValue(body.nombres)
].filter(Boolean).join(' ')

const resolveAltaBasePlacement = (body: Record<string, any>, assignedPlantel: string, assignedNivel: string, cicloKey: string) => {
  const targetCiclo = normalizeCicloKey(body.targetCiclo || cicloKey)
  const targetNivel = resolveNivelEscolar({ plantel: assignedPlantel, nivel: body.targetNivel || body.resolvedNivel || assignedNivel })
  const targetGrado = normalizeGradoForPlantel(body.targetGrado || body.grado, assignedPlantel, targetNivel)
  const placement = calculateBasePlacementForTargetPosition(
    targetNivel,
    targetGrado,
    cicloKey,
    targetCiclo,
    assignedPlantel
  )

  if (placement.outOfScope || !placement.nivel || !placement.grado || !placement.plantel) {
    throw createError({
      statusCode: 400,
      message: 'La combinación de grado y ciclo de ingreso no corresponde con la progresión escolar. Selecciona el grado actual del alumno y el ciclo real de ingreso.'
    })
  }

  return {
    targetCiclo,
    plantel: placement.plantel || assignedPlantel,
    nivel: placement.nivel || assignedNivel,
    grado: placement.grado || normalizeGradoForPlantel(body.grado, assignedPlantel, assignedNivel)
  }
}

const insertStudent = async (body: Record<string, any>, user: any, assignedPlantel: string, assignedNivel: string, cicloKey: string, explicitMatricula = '') => {
  const curpInfo = parseCurp(body.curp)
  const basePlacement = resolveAltaBasePlacement(body, assignedPlantel, assignedNivel, cicloKey)
  const nombreCompleto = buildNombreCompleto(body)
  const matriculaValue = explicitMatricula || null

  const result = await query<InsertResult>(`
    INSERT INTO base (
      matricula, apellidoPaterno, apellidoMaterno, nombres,
      nombreCompleto,
      curp, \`Fecha de nacimiento\`, genero, plantel, nivel, grado, grupo,
      \`Nombre del padre o tutor\`, telefono, correo, usuario, ciclo, estatus
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    matriculaValue,
    normalizeTextValue(body.apellidoPaterno), normalizeTextValue(body.apellidoMaterno), normalizeTextValue(body.nombres),
    nombreCompleto,
    curpInfo.normalized, curpInfo.isEmpty ? null : curpInfo.birthDate, curpInfo.isEmpty ? null : curpInfo.gender, basePlacement.plantel, basePlacement.nivel, basePlacement.grado, normalizeTextValue(body.grupo),
    normalizeTextValue(body.padre), normalizeTextValue(body.telefono), normalizeTextValue(body.correo), normalizeTextValue(user?.name), cicloKey, body.estatus || 'Activo'
  ])

  const insertId = Number(result?.insertId || 0)

  if (!insertId) {
    return explicitMatricula
  }

  try {
    const rows = await query<any[]>(`SELECT matricula FROM base WHERE id = ? LIMIT 1`, [insertId])
    return normalizeMatricula(rows[0]?.matricula) || explicitMatricula
  } catch (error) {
    console.warn('[Students POST] Alumno registrado, pero no se pudo leer la matrícula generada por trigger.', {
      insertId,
      code: (error as SqlWriteError)?.code,
      httpStatus: (error as SqlWriteError)?.httpStatus,
      message: (error as Error)?.message
    })
    return explicitMatricula
  }
}



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
      const enrollmentState = r.estatus === 'Activo'
        ? (hasCurrentEnrollmentEvidence ? 'inscrito' : 'no_inscrito')
        : (hasCurrentEnrollmentEvidence ? 'baja_inscrita' : 'baja')

      return {
        ...r,
        enrollmentState,
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

    const withSections = await attachCustomSectionsToStudents(mapped, user)
    return await enrichFinancialStudentsWithMatricula(withSections)
  }

  if (method === 'POST') {
    const body = await readBody(event)
    const cicloKey = normalizeCicloKey(body.cicloIngreso ?? body.ciclo)
    const assignedPlantel = user.active_plantel && user.active_plantel !== 'GLOBAL'
      ? user.active_plantel
      : normalizeTextValue(body.plantel)

    if (!assignedPlantel || assignedPlantel === 'GLOBAL') {
      throw createError({ statusCode: 400, message: 'Selecciona un plantel para dar de alta alumnos.' })
    }

    const curpInfo = parseCurp(body.curp)
    if (!curpInfo.isEmpty && !curpInfo.isValid) {
      throw createError({ statusCode: 400, message: curpInfo.message || 'CURP inválida.' })
    }

    const assignedNivel = resolveNivelEscolar({ plantel: assignedPlantel, nivel: body.nivel })
    const explicitMatricula = normalizeMatricula(body.matricula)

    try {
      const matricula = await insertStudent(body, user, assignedPlantel, assignedNivel, cicloKey, explicitMatricula)
      return { success: true, matricula: matricula || undefined }
    } catch (error) {
      if (isHandledHttpError(error)) throw error

      console.error('[Students POST] Error registrando alumno', {
        code: (error as SqlWriteError)?.code,
        errno: (error as SqlWriteError)?.errno,
        sqlState: (error as SqlWriteError)?.sqlState,
        httpStatus: (error as SqlWriteError)?.httpStatus,
        message: (error as Error)?.message
      })

      throw createStudentPersistenceError(error, explicitMatricula)
    }
  }
}))
