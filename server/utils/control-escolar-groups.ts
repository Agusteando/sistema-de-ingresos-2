import {
  buildCanonicalGroupMap,
  canonicalGroupDisplay,
  canonicalizeGroupValues,
  canonicalizeStudentGroups,
  normalizeGroupDisplay,
  normalizeGroupIdentity,
  type GroupCanonicalMap,
} from '../../shared/utils/group'
import { fetchControlEscolarStudents } from './control-escolar'

const wantsAllRows = (filters: any = {}) =>
  ['1', 'true', 'all', 'snapshot', 'index'].includes(
    String(filters.all || filters.mode || '').toLowerCase(),
  )

const requestedGroupValue = (filters: any = {}) =>
  filters.group ?? filters.grupo ?? ''

const catalogGroupValues = (catalogs: any = {}) => [
  ...(Array.isArray(catalogs?.grupos) ? catalogs.grupos : []),
  ...Object.values(catalogs?.gruposPorGrado || {}).flatMap((values: any) =>
    Array.isArray(values) ? values : [],
  ),
]

const studentGroupValues = (students: any[] = []) =>
  students.flatMap((student) => [student?.group, student?.grupo])

const canonicalMapForResult = (result: any = {}) =>
  buildCanonicalGroupMap([
    ...studentGroupValues(Array.isArray(result?.data) ? result.data : []),
    ...catalogGroupValues(result?.catalogs),
  ])

const canonicalizeCatalogs = (
  catalogs: any = {},
  canonical: GroupCanonicalMap,
) => {
  const gruposPorGrado = Object.entries(catalogs?.gruposPorGrado || {}).reduce<Record<string, string[]>>(
    (acc, [grado, values]) => {
      acc[grado] = canonicalizeGroupValues(Array.isArray(values) ? values : [], canonical)
      return acc
    },
    {},
  )

  return {
    ...catalogs,
    grupos: canonicalizeGroupValues(Array.isArray(catalogs?.grupos) ? catalogs.grupos : [], canonical),
    gruposPorGrado,
  }
}

export const canonicalizeControlEscolarStudentsResult = (
  result: any = {},
  canonical: GroupCanonicalMap = canonicalMapForResult(result),
) => ({
  ...result,
  data: canonicalizeStudentGroups(
    Array.isArray(result?.data) ? result.data : [],
    [...canonical.values()],
  ),
  catalogs: canonicalizeCatalogs(result?.catalogs || {}, canonical),
})

const uniqueStoredGroupVariants = (students: any[], requestedIdentity: string) => {
  const seen = new Set<string>()
  const variants: string[] = []

  studentGroupValues(students).forEach((value) => {
    const display = normalizeGroupDisplay(value)
    if (!display || normalizeGroupIdentity(display) !== requestedIdentity || seen.has(display)) return
    seen.add(display)
    variants.push(display)
  })

  return variants
}

const safePage = (filters: any = {}) => Math.max(1, Number(filters.page || 1) || 1)
const safeLimit = (filters: any = {}) => {
  const max = filters.externalApi ? 500 : 100
  return Math.min(max, Math.max(8, Number(filters.limit || 25) || 25))
}

const rowKey = (student: any) => String(student?.matricula || student?.id || '').trim().toUpperCase()

const collectVariantRows = async (
  agentId: string,
  filters: any,
  variant: string,
) => {
  const collectionLimit = filters.externalApi ? 500 : 100
  const query = {
    ...filters,
    all: '',
    mode: '',
    group: variant,
    grupo: variant,
    page: 1,
    limit: collectionLimit,
  }
  const first = await fetchControlEscolarStudents(agentId, query)
  const rows = [...(Array.isArray(first?.data) ? first.data : [])]
  const pages = Math.max(1, Number(first?.pagination?.pages || 1))

  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchControlEscolarStudents(agentId, { ...query, page })
    if (Array.isArray(next?.data)) rows.push(...next.data)
  }

  return { rows, result: first }
}

export const fetchControlEscolarStudentsWithCanonicalGroups = async (
  agentId: string,
  filters: any = {},
) => {
  const requestedIdentity = normalizeGroupIdentity(requestedGroupValue(filters))

  if (!requestedIdentity || wantsAllRows(filters)) {
    return canonicalizeControlEscolarStudentsResult(
      await fetchControlEscolarStudents(agentId, filters),
    )
  }

  const rawScope = await fetchControlEscolarStudents(agentId, {
    ...filters,
    search: '',
    q: '',
    status: '',
    quality: '',
    grado: '',
    group: '',
    grupo: '',
    recent: '',
    all: '1',
    mode: 'index',
    page: 1,
  })
  const canonical = canonicalMapForResult(rawScope)
  const variants = uniqueStoredGroupVariants(
    Array.isArray(rawScope?.data) ? rawScope.data : [],
    requestedIdentity,
  )

  if (!variants.length) {
    const empty = canonicalizeControlEscolarStudentsResult(rawScope, canonical)
    return {
      ...empty,
      data: [],
      pagination: {
        page: safePage(filters),
        limit: safeLimit(filters),
        total: 0,
        pages: 1,
      },
    }
  }

  if (variants.length === 1) {
    const result = await fetchControlEscolarStudents(agentId, {
      ...filters,
      group: variants[0],
      grupo: variants[0],
    })
    return canonicalizeControlEscolarStudentsResult(result, canonical)
  }

  const collected = await Promise.all(
    variants.map((variant) => collectVariantRows(agentId, filters, variant)),
  )
  const rowsByKey = new Map<string, any>()
  collected.flatMap((entry) => entry.rows).forEach((student) => {
    const key = rowKey(student)
    if (key && !rowsByKey.has(key)) rowsByKey.set(key, student)
  })

  const scopeOrder = new Map<string, number>()
  ;(Array.isArray(rawScope?.data) ? rawScope.data : []).forEach((student, index) => {
    const key = rowKey(student)
    if (key && !scopeOrder.has(key)) scopeOrder.set(key, index)
  })

  const merged = Array.from(rowsByKey.values()).sort((left, right) =>
    (scopeOrder.get(rowKey(left)) ?? Number.MAX_SAFE_INTEGER) -
    (scopeOrder.get(rowKey(right)) ?? Number.MAX_SAFE_INTEGER),
  )
  const canonicalRows = canonicalizeStudentGroups(merged, [...canonical.values()])
  const page = safePage(filters)
  const limit = safeLimit(filters)
  const offset = (page - 1) * limit
  const baseResult = collected[0]?.result || rawScope

  return {
    ...canonicalizeControlEscolarStudentsResult(baseResult, canonical),
    data: canonicalRows.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      total: canonicalRows.length,
      pages: Math.max(1, Math.ceil(canonicalRows.length / limit)),
    },
    catalogs: canonicalizeCatalogs(rawScope?.catalogs || {}, canonical),
  }
}

export const canonicalControlEscolarGroupDisplay = (
  value: unknown,
  values: unknown[] = [],
) => canonicalGroupDisplay(value, buildCanonicalGroupMap(values))
