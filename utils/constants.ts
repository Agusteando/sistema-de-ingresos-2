import { normalizeCicloKey } from '../shared/utils/ciclo'

export const PLANTELES_LIST = [
  'PREEM', 'PREET', 'CT', 'CM', 'DM', 'CO', 'DC', 'GM', 'PM', 'PT', 'SM', 'ST', 'IS', 'ISM'
]

export const CONCEPTOS_PLANTELES_LIST = ['PM', 'SM', 'PT', 'ST', 'CT', 'PREEM', 'GM']

export const normalizeConceptosPlantel = (value: string | null | undefined, fallback = CONCEPTOS_PLANTELES_LIST[0]) => {
  const code = String(value || '').trim().toUpperCase()
  return CONCEPTOS_PLANTELES_LIST.includes(code) ? code : fallback
}

export const isConceptosPlantel = (value: string | null | undefined) => {
  const code = String(value || '').trim().toUpperCase()
  return CONCEPTOS_PLANTELES_LIST.includes(code)
}

export const CICLOS_LIST = [
  { value: '2025', label: '2025-2026' },
  { value: '2026', label: '2026-2027' }
]

export const GRADOS_ORDEN: Record<string, number> = {
  'Primero': 1,
  'Segundo': 2,
  'Tercero': 3,
  'Cuarto': 4,
  'Quinto': 5,
  'Sexto': 6,
  'Egresado': 99
}

export const normalizeCicloOption = (value: string | number | null | undefined) => {
  const cicloKey = normalizeCicloKey(value)
  return CICLOS_LIST.find(c => c.value === cicloKey) ? cicloKey : CICLOS_LIST[0].value
}
