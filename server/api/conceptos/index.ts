import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  
  if (method === 'GET') {
    const { ciclo = '2024' } = getQuery(event)
    return await query(`SELECT * FROM conceptos WHERE ciclo = ? ORDER BY concepto ASC`, [ciclo])
  }

  if (method === 'POST') {
    const body = await readBody(event)
    await query(`
      INSERT INTO conceptos (concepto, description, costo, eventual, ciclo, plazo)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [body.concepto, body.description, body.costo, body.eventual ? 1 : 0, body.ciclo, body.plazo])
    return { success: true }
  }
})