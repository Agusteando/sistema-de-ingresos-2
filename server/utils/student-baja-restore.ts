import { StudentRestoreError, restoreStudentActiveStatus, type StudentRestoreQuery } from './student-status-restore.ts'

type CentralQuery = (sql: string, params: unknown[]) => Promise<any[]>
const withdrawalColumns = {
  motivoBaja: 'motivo_baja',
  categoriaBaja: 'categoria_baja',
  seguimientoBaja: 'seguimiento_baja',
} as const
type WithdrawalField = keyof typeof withdrawalColumns
type CentralPatch = { baja: number } & Partial<Record<WithdrawalField, string | null>>
type CentralUpdate = (matricula: string, patch: CentralPatch) => Promise<unknown>

export type RestoreAuroraStudentOptions = {
  matricula: string
  planteles: string[] | null
  requireBase: boolean
  queryBase: StudentRestoreQuery
  getCentralColumns: () => Promise<ReadonlySet<string>>
  queryCentral: CentralQuery
  updateCentral: CentralUpdate
  onCompensationFailure?: (error: unknown) => void
}

// Both Aurora screens store the withdrawal in different databases.
// Verify both records before writing and compensate the central mutation
// if the guarded Bridge write conflicts or fails. Leave financial data untouched.
export const restoreAuroraStudentBaja = async ({
  matricula, planteles, requireBase, queryBase, getCentralColumns, queryCentral, updateCentral, onCompensationFailure,
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

  const columns = await getCentralColumns()
  if (!columns.has('baja')) {
    throw new StudentRestoreError(503, 'No se pudo verificar el estado de baja en Control Escolar.')
  }
  const metadata = (Object.keys(withdrawalColumns) as WithdrawalField[])
    .filter(field => columns.has(withdrawalColumns[field]))
  // The scoped Bridge row establishes campus ownership on legacy central schemas.
  const campusColumn = columns.has('plantel') ? ['plantel'] : []
  const projection = ['matricula', 'baja', ...campusColumn, ...metadata.map(field => withdrawalColumns[field])]
  const [central] = await queryCentral(
    `SELECT ${projection.join(', ')} FROM matricula WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`,
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
    ...Object.fromEntries(metadata.map(field => [field, central[withdrawalColumns[field]] ?? null])),
  } : null
  const needsCentralRestore = previous !== null && previous.baja !== 0
  const emptyBaja: CentralPatch = { baja: 0, ...Object.fromEntries(metadata.map(field => [field, null])) }
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
