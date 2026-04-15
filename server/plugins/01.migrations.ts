import { ensureSchema } from '../utils/db'

export default defineNitroPlugin(() => {
  // Iniciamos la sincronización de esquema en segundo plano durante el arranque del servidor.
  // Si una petición web llega antes de que esto finalice, la petición esperará pacientemente
  // (gracias al middleware/db utils), eliminando el 100% de los errores Serverless cold-start.
  ensureSchema().catch(err => console.error('[Auto-Migration] Error en arranque:', err))
})