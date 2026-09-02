const GROUP_COMBINING_MARKS_RE = /[\u0300-\u036f]/g
const GROUP_MAX_LENGTH = 40

export type GroupCanonicalMap = Map<string, string>

export const normalizeGroupDisplay = (value: unknown): string => {
  const normalized = String(value ?? '')
    .replaceAll('"', '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('es-MX')
    .slice(0, GROUP_MAX_LENGTH)

  if (!normalized || normalized.toLocaleLowerCase('es-MX') === 'null') return ''
  return normalized
}

export const normalizeGroupIdentity = (value: unknown): string =>
  normalizeGroupDisplay(value)
    .normalize('NFD')
    .replace(GROUP_COMBINING_MARKS_RE, '')
    .normalize('NFC')

const diacriticCount = (value: string) => (
  value.normalize('NFD').match(GROUP_COMBINING_MARKS_RE)?.length || 0
)

const preferGroupDisplay = (candidate: string, current: string): boolean => {
  const candidateDiacritics = diacriticCount(candidate)
  const currentDiacritics = diacriticCount(current)
  if (candidateDiacritics !== currentDiacritics) return candidateDiacritics > currentDiacritics

  return candidate.localeCompare(current, 'es-MX', { sensitivity: 'variant' }) < 0
}

export const buildCanonicalGroupMap = (values: unknown[] = []): GroupCanonicalMap => {
  const canonical = new Map<string, string>()

  values.forEach((value) => {
    const display = normalizeGroupDisplay(value)
    const identity = normalizeGroupIdentity(display)
    if (!display || !identity) return

    const current = canonical.get(identity)
    if (!current || preferGroupDisplay(display, current)) canonical.set(identity, display)
  })

  return canonical
}

export const canonicalGroupDisplay = (
  value: unknown,
  canonical: GroupCanonicalMap = new Map(),
): string => {
  const display = normalizeGroupDisplay(value)
  const identity = normalizeGroupIdentity(display)
  return identity ? canonical.get(identity) || display : ''
}

export const canonicalizeGroupValues = (
  values: unknown[] = [],
  canonical: GroupCanonicalMap = buildCanonicalGroupMap(values),
): string[] => {
  const seen = new Set<string>()
  const result: string[] = []

  values.forEach((value) => {
    const identity = normalizeGroupIdentity(value)
    if (!identity || seen.has(identity)) return
    seen.add(identity)
    result.push(canonicalGroupDisplay(value, canonical))
  })

  return result.sort((left, right) => left.localeCompare(right, 'es-MX'))
}

const studentGroupValue = (student: Record<string, any>) => {
  const group = normalizeGroupDisplay(student?.group)
  if (group) return group
  return normalizeGroupDisplay(student?.grupo)
}

export const canonicalizeStudentGroups = <T extends Record<string, any>>(
  students: T[] = [],
  extraValues: unknown[] = [],
): T[] => {
  if (!Array.isArray(students) || !students.length) return Array.isArray(students) ? students : []

  const values = [
    ...extraValues,
    ...students.flatMap((student) => [student?.group, student?.grupo]),
  ]
  const canonical = buildCanonicalGroupMap(values)

  return students.map((student) => {
    const display = canonicalGroupDisplay(studentGroupValue(student), canonical)
    if (!display) return student

    const next: Record<string, any> = { ...student }
    if (Object.prototype.hasOwnProperty.call(student, 'group')) next.group = display
    if (Object.prototype.hasOwnProperty.call(student, 'grupo')) next.grupo = display
    return next as T
  })
}
