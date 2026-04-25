import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  
  if (method === 'GET') {
    const { ciclo = '2025' } = getQuery(event)
    const cicloKey = normalizeCicloKey(ciclo)
    return await query(`SELECT * FROM conceptos WHERE ciclo = ? ORDER BY concepto ASC`, [cicloKey])
  }

  if (method === 'POST') {
    const body = await readBody(event)
    const cicloKey = normalizeCicloKey(body.ciclo)
    await query(`
      INSERT INTO conceptos (concepto, description, costo, eventual, ciclo, plazo)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [body.concepto, body.description, body.costo, body.eventual ? 1 : 0, cicloKey, body.plazo])
    return { success: true }
  }
})
