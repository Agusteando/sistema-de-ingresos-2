import { normalizeCicloKey } from './ciclo'

export const GRADOS_NORMALIZADOS = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto']
export const GRADOS_DISPLAY = ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto']

const PRIMARIA_PLANTELES = new Set(['PM', 'PT'])
const SECUNDARIA_PLANTELES = new Set(['SM', 'ST'])

const GRADO_NUMERICO: Record<string, string> = {
  '1': 'primero',
  '01': 'primero',
  primero: 'primero',
  primer: 'primero',
  '2': 'segundo',
  '02': 'segundo',
  segundo: 'segundo',
  '3': 'tercero',
  '03': 'tercero',
  tercero: 'tercero',
  tercer: 'tercero',
  '4': 'cuarto',
  '04': 'cuarto',
  cuarto: 'cuarto',
  '5': 'quinto',
  '05': 'quinto',
  quinto: 'quinto',
  '6': 'sexto',
  '06': 'sexto',
  sexto: 'sexto'
}

export const normalizePlantel = (plantel: unknown) => String(plantel || '').trim().toUpperCase()

export const nivelFromPlantel = (plantel: unknown) => {
  const normalized = normalizePlantel(plantel)
  if (PRIMARIA_PLANTELES.has(normalized)) return 'Primaria'
  if (SECUNDARIA_PLANTELES.has(normalized)) return 'Secundaria'
  return 'Preescolar'
}

export const maxGradoForPlantel = (plantel: unknown) => {
  const nivel = nivelFromPlantel(plantel)
  return nivel === 'Primaria' ? 6 : 3
}

export const normalizeGrado = (grado: unknown) => {
  if (!grado) return 'primero'
  const key = String(grado)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  return GRADO_NUMERICO[key] || 'primero'
}

export const normalizeGradoForPlantel = (grado: unknown, plantel: unknown) => {
  const normalized = normalizeGrado(grado)
  const max = maxGradoForPlantel(plantel)
  const index = GRADOS_NORMALIZADOS.indexOf(normalized)
  return GRADOS_NORMALIZADOS[Math.min(Math.max(index, 0), max - 1)]
}

export const displayGrado = (grado: unknown) => {
  if (String(grado || '').toLowerCase().trim() === 'egresado') return 'Egresado'
  const g = normalizeGrado(grado)
  return g.charAt(0).toUpperCase() + g.slice(1)
}

export const gradeOptionsForPlantel = (plantel: unknown) => {
  return GRADOS_DISPLAY.slice(0, maxGradoForPlantel(plantel))
}

export const calculatePromotedGrado = (
  gradoBase: unknown,
  plantel: unknown,
  cicloBase: unknown,
  selectedCiclo: unknown
) => {
  const normalizedGrado = normalizeGradoForPlantel(gradoBase, plantel)
  const nivel = nivelFromPlantel(plantel)

  if (!cicloBase || !selectedCiclo) {
    return { grado: normalizedGrado, nivel, egresado: false }
  }

  const baseYear = parseInt(normalizeCicloKey(cicloBase), 10)
  const selectedYear = parseInt(normalizeCicloKey(selectedCiclo), 10)

  if (isNaN(baseYear) || isNaN(selectedYear)) {
    return { grado: normalizedGrado, nivel, egresado: false }
  }

  const diff = selectedYear - baseYear
  const max = maxGradoForPlantel(plantel)
  const baseIndex = GRADOS_NORMALIZADOS.indexOf(normalizedGrado)
  const promotedIndex = Math.max(0, baseIndex + diff)

  if (promotedIndex >= max) {
    return { grado: 'egresado', nivel: 'Egresado', egresado: true }
  }

  return {
    grado: GRADOS_NORMALIZADOS[promotedIndex],
    nivel,
    egresado: false
  }
}
