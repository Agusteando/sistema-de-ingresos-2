import { normalizePlantel } from './auth-session'
import type { LocalSystemBridgeResult } from './local-system-handoff'

export const configuredLocalSystemPlantel = () => {
  const config = useRuntimeConfig()
  return normalizePlantel(
    process.env.LOCAL_SYSTEM_PLANTEL ||
    process.env.AGENT_ID ||
    config.localSystemPlantel
  )
}

export const localSystemPlantelEligibility = (event: any) => {
  const activePlantel = normalizePlantel(event?.context?.user?.active_plantel)
  const localPlantel = configuredLocalSystemPlantel()
  const eligible = Boolean(
    activePlantel &&
    activePlantel !== 'GLOBAL' &&
    localPlantel &&
    activePlantel === localPlantel
  )

  return {
    activePlantel,
    localPlantel,
    eligible
  }
}

export const assertLocalSystemPlantelEligibility = (event: any) => {
  const eligibility = localSystemPlantelEligibility(event)
  if (!eligibility.eligible) {
    throw createError({
      statusCode: 409,
      message: eligibility.localPlantel
        ? `Este equipo está configurado para ${eligibility.localPlantel}, no para ${eligibility.activePlantel || 'el plantel actual'}.`
        : 'Este equipo no tiene un plantel local configurado.'
    })
  }
  return eligibility
}

export const bridgeAgentMatchesPlantel = (
  result: LocalSystemBridgeResult | null,
  requestedPlantel: unknown,
) => {
  if (!result || result.diagnostics?.agentCommandIntercepted === false) return false

  const expected = normalizePlantel(requestedPlantel)
  const reported = normalizePlantel(
    result.plantel ||
    result.diagnostics?.echoedPlantel
  )

  // Sensitive local actions require the agent to report the exact plantel.
  // Routing alone is not sufficient proof of eligibility.
  return Boolean(expected && reported && reported === expected)
}
