import { normalizePlantel } from './grado'

const GLOBAL_TOKENS = new Set(['', 'GLOBAL', 'TODOS', 'TODO', 'ALL', '*', 'GENERAL'])

const normalizeConceptPlantelToken = (value: unknown) => {
  const token = String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

  if (token === 'PRIMARIA METEPEC' || token === 'PMA' || token === 'PMB') return 'PM'
  if (token === 'PRIMARIA TOLUCA') return 'PT'
  if (token === 'SECUNDARIA METEPEC') return 'SM'
  if (token === 'SECUNDARIA TOLUCA') return 'ST'
  if (token === 'PREESCOLAR METEPEC') return 'PREEM'
  if (token === 'PREESCOLAR TOLUCA') return 'PREET'
  return normalizePlantel(token)
}

export const parseConceptPlanteles = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!raw) return []

  return Array.from(new Set(
    raw
      .split(/[|,;/]+/)
      .map(normalizeConceptPlantelToken)
      .filter(Boolean)
  ))
}

export const conceptBelongsToPlantel = (conceptPlantel: unknown, studentPlantel: unknown) => {
  const raw = String(conceptPlantel || '').trim()
  if (GLOBAL_TOKENS.has(raw.toUpperCase())) return true

  const allowed = parseConceptPlanteles(raw)
  if (!allowed.length) return true
  if (allowed.some((token) => GLOBAL_TOKENS.has(token))) return true

  const student = normalizeConceptPlantelToken(studentPlantel)
  if (!student || student === 'GLOBAL') return true
  return allowed.includes(student)
}

export const conceptPlantelLabel = (value: unknown) => {
  const planteles = parseConceptPlanteles(value)
  return planteles.length ? planteles.join(' · ') : 'Global'
}
