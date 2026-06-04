import { runWithBridgeAgentId } from '../../../utils/db'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  // Deprecated: family relationships are now owned by Control Escolar through
  // the matricula family field and are read-only from Alumnos-Financiero.
  return {
    success: true,
    cleared: 0,
    deprecated: true,
    message: 'Los vínculos familiares se administran desde Control Escolar.'
  }
}))
