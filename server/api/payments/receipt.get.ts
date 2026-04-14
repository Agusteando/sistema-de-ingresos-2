import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { folios } = getQuery(event)
  if (!folios) return []

  const folioList = Array.isArray(folios) ? folios : String(folios).split(',')
  const placeholders = folioList.map(() => '?').join(',')
  
  // Fully implemented end-to-end receipt retrieval endpoint replacing the legacy hack
  const refs = await query<any[]>(`
    SELECT r.folio, r.monto, r.fecha, r.formaDePago, r.conceptoNombre, b.nombreCompleto, b.matricula, b.grado, b.grupo, b.nivel
    FROM referenciasdepago r
    LEFT JOIN base b ON r.matricula = b.matricula
    WHERE r.folio IN (${placeholders}) AND r.estatus = 'Vigente'
  `, folioList)

  return refs
})