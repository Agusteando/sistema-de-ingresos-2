import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const cicloKey = normalizeCicloKey(body.ciclo)
  
  const [conceptoRef] = await query<any[]>(`SELECT concepto FROM conceptos WHERE id = ?`, [body.conceptoId])
  const conceptoNombre = conceptoRef ? conceptoRef.concepto : 'Cargo'
  const meses = Math.max(1, Number(body.meses) || 1)
  const plazoLegacy = Array.from({ length: meses }, (_, i) => i + 1).join(',')

  const result = await query<any>(`
    INSERT INTO documentos (concepto, conceptoNombre, matricula, costo, plazo, meses, beca, ciclo, eventual, responsable, estatus)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin', 'Activo')
  `, [
    body.conceptoId, conceptoNombre, body.matricula, body.costo, plazoLegacy, 
    meses, body.beca || 0, cicloKey, body.eventual ? 1 : 0
  ])
  
  return { success: true, documento: result.insertId }
})
