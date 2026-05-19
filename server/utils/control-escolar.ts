import { PLANTELES_LIST } from '../../utils/constants'

export type ControlEscolarUser = {
  email?: string
  name?: string
  role?: string
  planteles?: string
  active_plantel?: string
}

export type ControlEscolarTarget = {
  agentId: string
  plantel: string
}

const normalizeToken = (value: unknown) => String(value || '').trim().toUpperCase()

const parsePlanteles = (value: unknown) => String(value || '')
  .split(',')
  .map(item => normalizeToken(item))
  .filter(Boolean)

export const getAllowedControlEscolarAgents = (user: ControlEscolarUser = {}) => {
  if (user.role === 'global') return [...PLANTELES_LIST]

  const allowed = parsePlanteles(user.planteles)
  return PLANTELES_LIST.filter(plantel => allowed.includes(plantel))
}

export const resolveControlEscolarTarget = (event: any): ControlEscolarTarget => {
  const query = getQuery(event)
  const bodyAgent = event.context?.controlEscolarBodyAgentId
  const requested = normalizeToken(query.agentId || query.plantel || bodyAgent)
  const allowedAgents = getAllowedControlEscolarAgents(event.context.user)

  if (!requested) {
    throw createError({ statusCode: 400, message: 'agentId requerido.' })
  }

  if (!PLANTELES_LIST.includes(requested)) {
    throw createError({ statusCode: 400, message: 'agentId no reconocido.' })
  }

  if (!allowedAgents.includes(requested)) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para consultar este plantel.' })
  }

  const config = useRuntimeConfig() as any
  const transport = String(config.dbTransport || 'direct').toLowerCase()
  const fixedAgentId = normalizeToken(config.dbBridgeAgentId)

  if (transport === 'bridge' && fixedAgentId && fixedAgentId !== requested) {
    throw createError({
      statusCode: 409,
      message: `DB_BRIDGE_AGENT_ID fija el puente en ${fixedAgentId}. Para Control Escolar multi-plantel, deja DB_BRIDGE_AGENT_ID vacío y usa selección por agentId.`
    })
  }

  return { agentId: requested, plantel: requested }
}

export const normalizeControlEscolarPageSize = (value: unknown) => {
  const parsed = Number(value || 50)
  if (!Number.isFinite(parsed)) return 50
  return Math.min(200, Math.max(10, Math.trunc(parsed)))
}

export const normalizeControlEscolarPage = (value: unknown) => {
  const parsed = Number(value || 1)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.trunc(parsed))
}

export const studentMissingFields = (student: Record<string, any>) => {
  const missing: string[] = []
  const checks = [
    ['CURP', student.curp],
    ['Teléfono', student.telefono],
    ['Correo', student.correo],
    ['Tutor', student.padre],
    ['Fecha nacimiento', student.birth]
  ]

  for (const [label, value] of checks) {
    if (!String(value || '').trim()) missing.push(label)
  }

  return missing
}
