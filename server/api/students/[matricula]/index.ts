import { executeStatementTransaction, query, type SqlStatement } from '../../../utils/db'
import { nivelFromPlantel, normalizeGradoForPlantel } from '../../../../shared/utils/grado'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const matricula = event.context.params?.matricula
  const method = event.node.req.method

  if (method === 'PUT') {
    const body = await readBody(event)
    const cicloKey = normalizeCicloKey(body.ciclo)
    const plantel = String(body.plantel || '').trim()
    const normalizedGrado = normalizeGradoForPlantel(body.grado, plantel)
    const [currentStudent] = await query<any[]>(
      `SELECT plantel, grado, ciclo FROM base WHERE matricula = ? LIMIT 1`,
      [matricula]
    )

    if (!currentStudent) {
      throw createError({ statusCode: 404, message: 'Alumno no encontrado' })
    }

    const normalizedCurrentGrado = normalizeGradoForPlantel(currentStudent.grado, currentStudent.plantel || plantel)
    const normalizedCurrentCiclo = currentStudent.ciclo ? normalizeCicloKey(currentStudent.ciclo) : ''
    const academicChangedByValue =
      String(currentStudent.plantel || '').trim() !== plantel ||
      normalizedCurrentGrado !== normalizedGrado ||
      normalizedCurrentCiclo !== cicloKey
    const hasAcademicChangedFlag = Object.prototype.hasOwnProperty.call(body, 'academicChanged')
    const academicChangedByClient = hasAcademicChangedFlag
      ? body.academicChanged === true || String(body.academicChanged).toLowerCase() === 'true'
      : academicChangedByValue
    const shouldWriteCiclo = academicChangedByClient && academicChangedByValue
    const setClauses = [
      'apellidoPaterno = ?',
      'apellidoMaterno = ?',
      'nombres = ?',
      "nombreCompleto = CONCAT(?, ' ', ?, ' ', ?)",
      '`Fecha de nacimiento` = ?',
      '`Nombre del padre o tutor` = ?',
      'plantel = ?',
      'nivel = ?',
      'grado = ?',
      'grupo = ?',
      'telefono = ?',
      'correo = ?'
    ]
    const updateParams = [
      body.apellidoPaterno,
      body.apellidoMaterno,
      body.nombres,
      body.apellidoPaterno,
      body.apellidoMaterno,
      body.nombres,
      body.birth,
      body.padre,
      plantel,
      nivelFromPlantel(plantel),
      normalizedGrado,
      body.grupo,
      body.telefono,
      body.correo
    ]

    if (shouldWriteCiclo) {
      setClauses.push('ciclo = ?')
      updateParams.push(cicloKey)
    }

    setClauses.push('interno = ?', 'estatus = ?')
    updateParams.push(body.interno, body.estatus || 'Activo', matricula)

    const statements: SqlStatement[] = [{
      sql: `
        UPDATE base SET
          ${setClauses.join(',\n          ')}
        WHERE matricula = ?
      `,
      params: updateParams
    }]

    const hasPreviousMatricula = Object.prototype.hasOwnProperty.call(body, 'matriculaAnterior')
    const hasSuccessorMatricula = Object.prototype.hasOwnProperty.call(body, 'matriculaSiguiente')
    const previousMatricula = String(body.matriculaAnterior || '').trim()
    const successorMatricula = String(body.matriculaSiguiente || '').trim()

    if (hasPreviousMatricula) {
      statements.push({
        sql: `DELETE FROM alumno_matricula_links WHERE successor_matricula = ?`,
        params: [matricula]
      })

      if (previousMatricula && previousMatricula !== matricula) {
        statements.push({
          sql: `DELETE FROM alumno_matricula_links WHERE previous_matricula = ? OR successor_matricula = ?`,
          params: [previousMatricula, matricula]
        })
        statements.push({
          sql: `
            INSERT INTO alumno_matricula_links (previous_matricula, successor_matricula)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE
              successor_matricula = VALUES(successor_matricula),
              updated_at = CURRENT_TIMESTAMP
          `,
          params: [previousMatricula, matricula]
        })
      }
    }

    if (hasSuccessorMatricula) {
      statements.push({
        sql: `DELETE FROM alumno_matricula_links WHERE previous_matricula = ?`,
        params: [matricula]
      })

      if (successorMatricula && successorMatricula !== matricula) {
        statements.push({
          sql: `DELETE FROM alumno_matricula_links WHERE previous_matricula = ? OR successor_matricula = ?`,
          params: [matricula, successorMatricula]
        })
        statements.push({
          sql: `
            INSERT INTO alumno_matricula_links (previous_matricula, successor_matricula)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE
              successor_matricula = VALUES(successor_matricula),
              updated_at = CURRENT_TIMESTAMP
          `,
          params: [matricula, successorMatricula]
        })
      }
    }

    await executeStatementTransaction(statements)
    return { success: true }
  }

  if (method === 'DELETE') {
    const body = await readBody(event)
    await query(`UPDATE base SET estatus = ? WHERE matricula = ?`, [body.motivo || 'Baja', matricula])
    return { success: true }
  }
})
