import { StudentRestoreError, restoreStudentActiveStatus, type StudentRestoreQuery } from './student-status-restore.ts'

type CentralQuery = (sql: string, params: unknown[]) => Promise<any[]>
type CentralPatch = { baja: number; motivoBaja: string | null; categoriaBaja: string | null; seguimientoBaja: string | null }
type CentralUpdate = (matricula: string, patch: CentralPatch) => Promise<unknown>

export type RestoreAuroraStudentOptions = {
  matricula: string
  planteles: string[] | null
  requireBase: boolean
  queryBase: StudentRestoreQuery
  queryCentral: CentralQuery
  updateCentral: CentralUpdate
  onCompensationFailure?: (error: unknown) => void
}

// Both Aurora screens store the withdrawal in different databases.
// Verify both records before writing and compensate the central mutation
// if the guarded Bridge write conflicts or fails. Leave financial data untouched.
export const restoreAuroraStudentBaja = async ({
  matricula, planteles, requireBase, queryBase, queryCentral, updateCentral, onCompensationFailure,
}: RestoreAuroraStudentOptions) => {
  const key = String(matricula || '').trim()
  if (!key) throw new StudentRestoreError(400, 'Matrícula requerida.')
  if (planteles !== null && !planteles?.length) {
    throw new StudentRestoreError(403, 'Selecciona un plantel autorizado.')
  }
  const scoped = planteles !== null
  const scope = scoped ? ` AND plantel IN (${planteles!.map(() => '?').join(',')})` : ''
  const [base] = await queryBase(
    `SELECT matricula, plantel, estatus FROM base WHERE matricula = ?${scope} LIMIT 1`,
    [key, ...(planteles || [])],
  )
  if (!base && requireBase) {
    throw new StudentRestoreError(404, 'Alumno no encontrado en el plantel seleccionado.')
  }
  if (base && !String(base.estatus || '').trim()) {
    throw new StudentRestoreError(409, 'El alumno no tiene un estatus verificable.')
  }

  const [central] = await queryCentral(
    'SELECT matricula, plantel, baja, motivo_baja, categoria_baja, seguimiento_baja FROM matricula WHERE UPPER(TRIM(matricula)) = ? LIMIT 1',
    [key.toUpperCase()],
  )
  if (!base && !central) {
    throw new StudentRestoreError(404, 'Alumno no encontrado en el plantel seleccionado.')
  }
  if (!base && central && scoped && !planteles!.includes(String(central.plantel || '').trim().toUpperCase())) {
    throw new StudentRestoreError(403, 'El alumno no pertenece al plantel autorizado.')
  }
  const previous: CentralPatch | null = central ? {
    baja: Number(central.baja || 0),
    motivoBaja: central.motivo_baja ?? null,
    categoriaBaja: central.categoria_baja ?? null,
    seguimientoBaja: central.seguimiento_baja ?? null,
  } : null
  const needsCentralRestore = previous !== null && previous.baja !== 0
  const emptyBaja: CentralPatch = { baja: 0, motivoBaja: null, categoriaBaja: null, seguimientoBaja: null }
  if (needsCentralRestore) await updateCentral(key, emptyBaja)

  let restoredBase = false
  let alreadyActive = !base
  try {
    if (base) {
      const result = await restoreStudentActiveStatus(key, planteles, queryBase)
      restoredBase = !result.alreadyActive
      alreadyActive = result.alreadyActive
    }
  } catch (error) {
    if (needsCentralRestore && previous) {
      try {
        await updateCentral(key, previous)
      } catch (compensationError) {
        onCompensationFailure?.(compensationError)
        throw new StudentRestoreError(503, 'La baja no se pudo revertir por completo. Reintenta la restauración o solicita soporte; se registró el error de compensación.')
      }
    }
    throw error
  }
  return {
    success: true,
    alreadyActive: alreadyActive && !needsCentralRestore,
    estatus: 'Activo',
    restoredBase,
    restoredCentral: needsCentralRestore,
  }
}
