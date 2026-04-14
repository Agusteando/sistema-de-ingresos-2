import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  
  const [conceptoRef] = await query<any[]>(`SELECT concepto FROM conceptos WHERE id = ?`, [body.conceptoId])
  const conceptoNombre = conceptoRef ? conceptoRef.concepto : 'Cargo'
  const plazosArray = JSON.stringify(Array.from({length: Number(body.meses)}, (_, i) => i + 1))

  const result = await query<any>(`
    INSERT INTO documentos (concepto, conceptoNombre, matricula, costo, plazo, meses, beca, ciclo, eventual, responsable)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin')
  `, [
    body.conceptoId, conceptoNombre, body.matricula, body.costo, plazosArray, 
    body.meses, body.beca || 0, body.ciclo, body.eventual ? 1 : 0
  ])
  
  return { success: true, documento: result.insertId }
})