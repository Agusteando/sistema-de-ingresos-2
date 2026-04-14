import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const result = await query<any>(`
    INSERT INTO documentos (matricula, conceptoId, costo, meses, beca, ciclo)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [body.matricula, body.conceptoId, body.costo, body.meses, body.beca || 0, body.ciclo])
  
  return { success: true, documento: result.insertId }
})