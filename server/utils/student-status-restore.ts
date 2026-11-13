export type StudentRestoreQuery = (sql: string, params: unknown[]) => Promise<any>

export class StudentRestoreError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'StudentRestoreError'
    this.statusCode = statusCode
  }
}

export const restoreStudentActiveStatus = async (
  matricula: string,
  planteles: string[] | null,
  queryDb: StudentRestoreQuery,
) => {
  const requestedMatricula = String(matricula || '').trim()
  if (!requestedMatricula) throw new StudentRestoreError(400, 'Matrícula requerida.')

  const scoped = planteles !== null
  if (scoped && !planteles?.length) throw new StudentRestoreError(403, 'Selecciona un plantel autorizado.')
  const campusParams = planteles || []
  const campusScope = scoped ? ` AND plantel IN (${campusParams.map(() => '?').join(',')})` : ''
  const [student] = await queryDb(
    `SELECT matricula, estatus FROM base WHERE matricula = ?${campusScope} LIMIT 1`,
    [requestedMatricula, ...campusParams],
  )

  if (!student) throw new StudentRestoreError(404, 'Alumno no encontrado en el plantel seleccionado.')
  const previousStatus = String(student.estatus || '').trim()
  if (!previousStatus) throw new StudentRestoreError(409, 'El alumno no tiene un estatus de baja verificable.')
  if (previousStatus.toLowerCase() === 'activo') {
    return { success: true, alreadyActive: true, estatus: 'Activo' }
  }

  const result = await queryDb(
    `UPDATE base SET estatus = 'Activo' WHERE matricula = ? AND estatus = ?${campusScope}`,
    [student.matricula, student.estatus, ...campusParams],
  )
  if (Number(result?.affectedRows) !== 1) {
    throw new StudentRestoreError(409, 'El estatus cambió durante la operación. Actualiza la lista e intenta de nuevo.')
  }

  return { success: true, alreadyActive: false, estatus: 'Activo' }
}
