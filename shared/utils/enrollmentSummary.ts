import { displayGrado, nivelFromMatricula, normalizeGrado } from './grado'

export type EnrollmentSummaryType = 'interno' | 'externo'

export interface EnrollmentSummaryGroup {
  key: string
  value: string
  label: string
  internos: number
  externos: number
  total: number
}

export interface EnrollmentSummaryRow {
  key: string
  gradeValue: string
  gradeLabel: string
  nivel: string
  internos: number
  externos: number
  total: number
  groups: EnrollmentSummaryGroup[]
  sortIndex: number
}

export interface EnrollmentSummaryResult {
  rows: EnrollmentSummaryRow[]
  internos: number
  externos: number
  total: number
}

interface EnrollmentSummaryOptions<T> {
  include: (student: T) => boolean
  type: (student: T) => EnrollmentSummaryType
  grade: (student: T) => unknown
  group: (student: T) => unknown
  matricula: (student: T) => unknown
}

const normalizeText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()

const normalizedGradeLabel = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!raw) return 'Sin grado'
  if (normalizeText(raw) === 'egresado') return 'Egresado'
  return displayGrado(raw)
}

const gradeSortIndex = (value: unknown) => {
  const raw = normalizeText(value)
  if (!raw) return 90
  if (raw === 'egresado') return 99
  const normalized = normalizeGrado(value)
  const order = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto']
  const index = order.indexOf(normalized)
  return index >= 0 ? index : 90
}

const groupSort = (left: EnrollmentSummaryGroup, right: EnrollmentSummaryGroup) =>
  left.label.localeCompare(right.label, 'es', { numeric: true, sensitivity: 'base' })

export const buildEnrollmentSummary = <T>(
  students: T[] = [],
  options: EnrollmentSummaryOptions<T>,
): EnrollmentSummaryResult => {
  const rowMap = new Map<string, EnrollmentSummaryRow & { groupMap: Map<string, EnrollmentSummaryGroup> }>()

  for (const student of students) {
    if (!options.include(student)) continue

    const rawGrade = String(options.grade(student) || '').trim()
    const normalizedGrade = !rawGrade
      ? 'sin-grado'
      : normalizeText(rawGrade) === 'egresado'
        ? 'egresado'
        : normalizeGrado(rawGrade)
    const key = normalizedGrade || 'sin-grado'
    const type = options.type(student) === 'interno' ? 'interno' : 'externo'
    const countKey = type === 'interno' ? 'internos' : 'externos'

    let row = rowMap.get(key)
    if (!row) {
      row = {
        key,
        gradeValue: rawGrade,
        gradeLabel: normalizedGradeLabel(rawGrade),
        nivel: nivelFromMatricula(options.matricula(student)),
        internos: 0,
        externos: 0,
        total: 0,
        groups: [],
        groupMap: new Map(),
        sortIndex: gradeSortIndex(rawGrade),
      }
      rowMap.set(key, row)
    }

    row[countKey] += 1
    row.total += 1

    const rawGroup = String(options.group(student) || '').trim()
    if (!rawGroup) continue
    const groupKey = normalizeText(rawGroup)
    let group = row.groupMap.get(groupKey)
    if (!group) {
      group = {
        key: `${key}|${groupKey}`,
        value: rawGroup,
        label: rawGroup,
        internos: 0,
        externos: 0,
        total: 0,
      }
      row.groupMap.set(groupKey, group)
    }
    group[countKey] += 1
    group.total += 1
  }

  const rows = Array.from(rowMap.values())
    .map(({ groupMap, ...row }) => ({ ...row, groups: Array.from(groupMap.values()).sort(groupSort) }))
    .sort((left, right) => {
      if (left.sortIndex !== right.sortIndex) return left.sortIndex - right.sortIndex
      return left.gradeLabel.localeCompare(right.gradeLabel, 'es', { numeric: true, sensitivity: 'base' })
    })

  return rows.reduce<EnrollmentSummaryResult>((summary, row) => {
    summary.rows.push(row)
    summary.internos += row.internos
    summary.externos += row.externos
    summary.total += row.total
    return summary
  }, { rows: [], internos: 0, externos: 0, total: 0 })
}
