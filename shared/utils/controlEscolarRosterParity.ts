const normalizeEnrollmentState = (value: unknown) =>
  String(value ?? '').trim().toLowerCase()

const normalizeMatriculaKey = (value: unknown) =>
  String(value ?? '').trim().toUpperCase()

export const selectControlEscolarUiInscritos = <T extends Record<string, any>>(rows: T[] = []) =>
  rows.filter((student) => normalizeEnrollmentState(student?.enrollmentState) === 'inscrito')

export const controlEscolarRosterIdentityKeys = (rows: Array<Record<string, any>> = []) =>
  rows
    .map((student) => normalizeMatriculaKey(student?.matricula || student?.studentId))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'es', { numeric: true, sensitivity: 'base' }))

export const duplicateControlEscolarRosterIdentities = (rows: Array<Record<string, any>> = []) => {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const key of controlEscolarRosterIdentityKeys(rows)) {
    if (seen.has(key)) duplicates.add(key)
    else seen.add(key)
  }
  return Array.from(duplicates)
}
