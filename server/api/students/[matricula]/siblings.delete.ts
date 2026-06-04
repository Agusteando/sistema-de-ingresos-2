import { runWithBridgeAgentId } from '../../../utils/db'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  // Deprecated: sibling relationships are derived from Control Escolar parent
  // names and are read-only from Alumnos-Financiero.
  return {
    success: true,
    cleared: 0,
    deprecated: true,
    message: 'Los hermanos se calculan desde Control Escolar por padre y madre; no hay vínculos locales que limpiar.'
  }
}))
