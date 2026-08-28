import { normalizePlantel } from './auth-session'

export const EXTERNAL_CONTROL_ESCOLAR_PLANTELES = ['PREEM', 'PREET', 'GM', 'PM', 'PT', 'SM', 'ST'] as const
const EXTERNAL_CONTROL_ESCOLAR_PLANTEL_SET = new Set<string>(EXTERNAL_CONTROL_ESCOLAR_PLANTELES)

/**
 * Public/integration plantel names are intentionally stable even when the
 * physical Bridge agent uses a different operational code. In particular,
 * PREET is the external academic scope while CT is the live Control Escolar
 * Bridge agent used by Aurora's operator UI.
 */
export const normalizeExternalControlEscolarPlantel = (value: unknown) => {
  const plantel = normalizePlantel(value || '')
  if (plantel === 'CT') return 'PREET'
  if (plantel === 'CM') return 'PREEM'
  if (plantel === 'PMA' || plantel === 'PMB') return 'PM'
  return EXTERNAL_CONTROL_ESCOLAR_PLANTEL_SET.has(plantel) ? plantel : ''
}

/**
 * Returns Bridge agents in preferred order for an external Control Escolar
 * scope. Keep the canonical alias as a fallback so older installations that
 * still expose PREET directly remain compatible.
 */
export const controlEscolarBridgeAgentCandidates = (value: unknown) => {
  const raw = normalizePlantel(value || '')
  const canonical = normalizeExternalControlEscolarPlantel(raw)
  if (!canonical) return raw ? [raw] : []

  const candidates: string[] = []
  const add = (candidate: string) => {
    const normalized = normalizePlantel(candidate)
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
  }

  if (canonical === 'PREET') {
    // Aurora's current operator/control-school scope is CT. PREET is the
    // external academic name consumed by integrations such as Husky Pass.
    add('CT')
    add('PREET')
    return candidates
  }

  // Preserve an explicitly configured legacy/raw agent before its canonical
  // alias, except for CT/PREET which has the deliberate route above.
  if (raw && raw !== canonical) add(raw)
  add(canonical)
  return candidates
}

/**
 * Expands a configured Bridge allow-list without dropping explicit agents.
 * This prevents a canonical PREET-only environment variable from making CT
 * matriculas unreachable in the Husky Pass fallback endpoint.
 */
export const expandControlEscolarBridgeAgentIds = (values: unknown[]) => {
  const expanded: string[] = []
  const add = (candidate: string) => {
    const normalized = normalizePlantel(candidate)
    if (normalized && !expanded.includes(normalized)) expanded.push(normalized)
  }

  for (const value of values) {
    const raw = normalizePlantel(value || '')
    if (!raw) continue
    const candidates = controlEscolarBridgeAgentCandidates(raw)
    if (candidates.length) candidates.forEach(add)
    else add(raw)
  }

  return expanded
}
