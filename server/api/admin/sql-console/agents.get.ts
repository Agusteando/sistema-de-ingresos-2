import { PLANTELES_LIST } from '../../../../utils/constants'
import { requireSqlConsoleAdmin, sqlConsoleRelay } from '../../../utils/sql-console-bridge'

export default defineEventHandler(async (event) => {
  requireSqlConsoleAdmin(event)
  const result: any = await sqlConsoleRelay(event, '/agents')
  const active = new Map((Array.isArray(result?.agents) ? result.agents : []).map((agent: any) => [String(agent.agentId || '').toUpperCase(), agent]))
  setHeader(event, 'Cache-Control', 'no-store')
  return {
    ok: true,
    agents: PLANTELES_LIST.map(plantel => {
      const agent: any = active.get(plantel)
      const sha = String(agent?.commitSha || '').toLowerCase()
      return {
        plantel,
        online: Boolean(agent),
        hostname: agent?.hostname || null,
        agentVersion: agent?.agentVersion || null,
        commitSha: /^[a-f0-9]{40}$/.test(sha) ? sha : null,
        connectedAt: agent?.connectedAt || null,
        lastSeenAt: agent?.lastSeenAt || null
      }
    })
  }
})
