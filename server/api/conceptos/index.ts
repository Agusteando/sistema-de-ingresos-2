import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  
  if (method === 'GET') {
    const { ciclo = '2025', q = '' } = getQuery(event)
    const cicloKey = normalizeCicloKey(ciclo)
    const search = String(Array.isArray(q) ? q[0] : q || '').trim()
    const params: any[] = [cicloKey]
    let where = 'ciclo = ?'

    if (search) {
      where += ' AND (concepto LIKE ? OR description LIKE ? OR CAST(id AS CHAR) = ?)'
      params.push(`%${search}%`, `%${search}%`, search)
    }

    return await query(`
      SELECT id, concepto, costo, description, plantel, eventual, plazo, ciclo
      FROM conceptos
      WHERE ${where}
      ORDER BY concepto ASC
    `, params)
  }

  if (method === 'POST') {
    throw createError({
      statusCode: 405,
      message: 'Los conceptos se administran desde la fuente central.'
    })
  }

  throw createError({ statusCode: 405, message: 'Metodo no permitido.' })
})
