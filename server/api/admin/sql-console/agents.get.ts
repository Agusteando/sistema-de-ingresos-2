import { PLANTELES_LIST } from '../../../../utils/constants'
import { requireSqlConsoleAdmin, sqlConsoleRelay } from '../../../utils/sql-console-bridge'

// Pinned fleet baseline for this rollout; optional private deployment override.
// Never infer that the most common SHA is necessarily the newest release.
const ROLLOUT_AGENT_SHA = 'PENDING_AGENT_MAIN_SHA'
const validSha = (value: unknown) => /^[a-f0-9]{40}$/i.test(String(value || ''))
  ? String(value).toLowerCase() : null

export default defineEventHandler(async (event) => {
  requireSqlConsoleAdmin(event)
  let result: any
  let relaySupportsDiagnostics = true
  try {
    result = await sqlConsoleRelay(event, '/agents/diagnostics')
  } catch (error: any) {
    // During staggered deployments, never break the existing versions panel.
    if (Number(error?.statusCode) !== 404) throw error
    relaySupportsDiagnostics = false
    result = await sqlConsoleRelay(event, '/agents')
  }
  const active = new Map<string, any>(
    (Array.isArray(result?.agents) ? result.agents : [])
      .map((agent: any) => [String(agent?.agentId || '').toUpperCase(), agent] as [string, any])
  )
  const targetSha = validSha(process.env.DB_BRIDGE_AGENT_TARGET_SHA) || validSha(ROLLOUT_AGENT_SHA)
  setHeader(event, 'Cache-Control', 'no-store')
  return {
    ok: true,
    relaySupportsDiagnostics,
    relayStartedAt: result?.relayStartedAt || null,
    targetSha,
    agents: PLANTELES_LIST.map(plantel => {
      const agent = active.get(plantel)
      const sha = validSha(agent?.commitSha)
      const online = Boolean(agent && (relaySupportsDiagnostics ? agent.online === true : true))
      const live = online && agent?.diagnostics?.schemaVersion === 1 ? agent.diagnostics : null
      const historical = !online && agent?.previousDiagnostics?.schemaVersion === 1
        ? agent.previousDiagnostics : null
      return {
        plantel,
        observed: Boolean(agent),
        online,
        hostname: agent?.hostname || null,
        agentVersion: agent?.agentVersion || null,
        commitSha: sha,
        versionStatus: !online ? 'unknown' : !sha || !targetSha ? 'unknown' : sha === targetSha ? 'current' : 'different',
        connectedAt: agent?.connectedAt || null,
        lastSeenAt: agent?.lastSeenAt || null,
        reconnectsSinceRelayStart: Number(agent?.reconnectsSinceRelayStart || 0),
        telemetry: live ? 'live' : historical ? 'historical' : 'unknown',
        diagnosticsAt: live ? agent.diagnosticsAt : (historical ? agent.previousDiagnosticsAt : null),
        diagnostics: live || historical,
      }
    })
  }
})
