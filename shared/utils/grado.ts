import { normalizeCicloKey } from './ciclo'

export const GRADOS_NORMALIZADOS = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto']
export const GRADOS_DISPLAY = ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto']
export const NIVELES_ESCOLARES = ['Preescolar', 'Primaria', 'Secundaria'] as const
export type NivelEscolar = typeof NIVELES_ESCOLARES[number]

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

const NIVEL_NORMALIZADO: Record<string, NivelEscolar> = {
  preescolar: 'Preescolar',
  kinder: 'Preescolar',
  jardin: 'Preescolar',
  primaria: 'Primaria',
  prim: 'Primaria',
  secundaria: 'Secundaria',
  sec: 'Secundaria'
}

const normalizeText = (value: unknown) => String(value || '')
  .toLowerCase()
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')

export const normalizePlantel = (plantel: unknown) => String(plantel || '').trim().toUpperCase()

export const normalizeNivelEscolar = (nivel: unknown): NivelEscolar | '' => {
  const normalized = normalizeText(nivel)
  if (!normalized || normalized === 'null' || normalized === 'undefined') return ''
  return NIVEL_NORMALIZADO[normalized] || ''
}

export const nivelFromPlantel = (plantel: unknown): NivelEscolar => {
  const normalized = normalizePlantel(plantel)
  if (PRIMARIA_PLANTELES.has(normalized)) return 'Primaria'
  if (SECUNDARIA_PLANTELES.has(normalized)) return 'Secundaria'
  return 'Preescolar'
}

export const resolveNivelEscolar = (input: unknown, nivelOverride?: unknown): NivelEscolar => {
  if (typeof input === 'object' && input !== null) {
    const source = input as Record<string, unknown>
    const explicit = normalizeNivelEscolar(nivelOverride ?? source.nivelOverride ?? source.nivelBase ?? source.nivel)
    if (explicit) return explicit
    return nivelFromPlantel(source.plantel)
  }

  const explicit = normalizeNivelEscolar(nivelOverride)
  if (explicit) return explicit
  return nivelFromPlantel(input)
}

export const maxGradoForNivel = (nivel: unknown) => normalizeNivelEscolar(nivel) === 'Primaria' ? 6 : 3

export const maxGradoForPlantel = (plantel: unknown, nivelOverride?: unknown) => {
  return maxGradoForNivel(resolveNivelEscolar(plantel, nivelOverride))
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

export const normalizeGradoForPlantel = (grado: unknown, plantel: unknown, nivelOverride?: unknown) => {
  const normalized = normalizeGrado(grado)
  const max = maxGradoForPlantel(plantel, nivelOverride)
  const index = GRADOS_NORMALIZADOS.indexOf(normalized)
  return GRADOS_NORMALIZADOS[Math.min(Math.max(index, 0), max - 1)]
}

export const displayGrado = (grado: unknown) => {
  if (String(grado || '').toLowerCase().trim() === 'egresado') return 'Egresado'
  const g = normalizeGrado(grado)
  return g.charAt(0).toUpperCase() + g.slice(1)
}

export const gradeOptionsForNivel = (nivel: unknown) => {
  return GRADOS_DISPLAY.slice(0, maxGradoForNivel(nivel))
}

export const gradeOptionsForPlantel = (plantel: unknown, nivelOverride?: unknown) => {
  return gradeOptionsForNivel(resolveNivelEscolar(plantel, nivelOverride))
}

export const calculatePromotedGrado = (
  gradoBase: unknown,
  plantel: unknown,
  cicloBase: unknown,
  selectedCiclo: unknown,
  nivelOverride?: unknown
) => {
  const nivel = resolveNivelEscolar(plantel, nivelOverride)
  const normalizedGrado = normalizeGradoForPlantel(gradoBase, plantel, nivel)
  const max = maxGradoForNivel(nivel)
  const baseIndex = GRADOS_NORMALIZADOS.indexOf(normalizedGrado)

  if (!cicloBase || !selectedCiclo) {
    return { grado: normalizedGrado, nivel, egresado: false, outOfScope: false, maxGrado: max }
  }

  const baseYear = parseInt(normalizeCicloKey(cicloBase), 10)
  const selectedYear = parseInt(normalizeCicloKey(selectedCiclo), 10)

  if (isNaN(baseYear) || isNaN(selectedYear)) {
    return { grado: normalizedGrado, nivel, egresado: false, outOfScope: false, maxGrado: max }
  }

  const diff = selectedYear - baseYear
  const promotedIndex = Math.max(0, baseIndex + diff)

  if (promotedIndex >= max) {
    return { grado: 'egresado', nivel: 'Egresado', egresado: true, outOfScope: true, maxGrado: max }
  }

  return {
    grado: GRADOS_NORMALIZADOS[promotedIndex],
    nivel,
    egresado: false,
    outOfScope: false,
    maxGrado: max
  }
}

export const isOutOfScopeForPlantelCiclo = (
  gradoBase: unknown,
  plantel: unknown,
  cicloBase: unknown,
  selectedCiclo: unknown,
  nivelOverride?: unknown
) => calculatePromotedGrado(gradoBase, plantel, cicloBase, selectedCiclo, nivelOverride).outOfScope

export const isInScopeForPlantelCiclo = (
  gradoBase: unknown,
  plantel: unknown,
  cicloBase: unknown,
  selectedCiclo: unknown,
  nivelOverride?: unknown
) => !isOutOfScopeForPlantelCiclo(gradoBase, plantel, cicloBase, selectedCiclo, nivelOverride)
