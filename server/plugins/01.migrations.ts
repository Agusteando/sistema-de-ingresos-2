import { ensureSchema } from '../utils/db'

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const transport = String(config.dbTransport || 'direct').toLowerCase()
  const bridgeAgentId = String(config.dbBridgeAgentId || '').trim()
  const bridgeAutoMigrate = String(config.dbBridgeAutoMigrateOnStartup || '').toLowerCase() === 'true'

  if (transport === 'bridge' && (!bridgeAgentId || !bridgeAutoMigrate)) {
    return
  }

  // Iniciamos la sincronizacion de esquema en segundo plano durante el arranque del servidor.
  // Si una peticion web llega antes de que esto finalice, la peticion esperara pacientemente
  // (gracias al middleware/db utils), eliminando el 100% de los errores Serverless cold-start.
  ensureSchema().catch(err => console.error('[Auto-Migration] Error en arranque:', err))
})
