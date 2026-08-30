import { automaticSchoolCycleKey, formatCicloLabel, normalizeCicloKey } from '../shared/utils/ciclo'

export const PLANTELES_LIST = [
  'PREEM', 'PREET', 'CT', 'CM', 'DM', 'CO', 'DC', 'GM', 'PM', 'PT', 'SM', 'ST', 'IS', 'ISM'
]

export const DASHBOARD_PLANTELES = ['PM', 'PT', 'SM', 'ST', 'PREEM', 'CT', 'GM', 'CO', 'DC'] as const

// Concept configuration also drives Portal Tallerista. DM is not part of the
// dashboard collection cards, but it must be configurable here so its
// workshop/service concepts can be resolved by the external Talleres API.
export const CONCEPTOS_PLANTELES_LIST: string[] = [...DASHBOARD_PLANTELES, 'DM']

export const normalizeConceptosPlantel = (value: string | null | undefined, fallback = CONCEPTOS_PLANTELES_LIST[0]) => {
  const code = String(value || '').trim().toUpperCase()
  return CONCEPTOS_PLANTELES_LIST.includes(code) ? code : fallback
}

export const isConceptosPlantel = (value: string | null | undefined) => {
  const code = String(value || '').trim().toUpperCase()
  return CONCEPTOS_PLANTELES_LIST.includes(code)
}

const automaticCycle = Number(automaticSchoolCycleKey())
export const CICLOS_LIST = [automaticCycle, automaticCycle + 1, automaticCycle - 1, automaticCycle - 2, automaticCycle - 3]
  .filter((value, index, values) => Number.isFinite(value) && values.indexOf(value) === index)
  .map((value) => ({ value: String(value), label: formatCicloLabel(String(value)) }))

export const GRADOS_ORDEN: Record<string, number> = {
  'Primero': 1,
  'Segundo': 2,
  'Tercero': 3,
  'Cuarto': 4,
  'Quinto': 5,
  'Sexto': 6,
  'Egresado': 99
}

export const normalizeCicloOption = (value: string | number | null | undefined) =>
  normalizeCicloKey(value, automaticSchoolCycleKey())
