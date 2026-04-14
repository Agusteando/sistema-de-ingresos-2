import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { folios, raw } = getQuery(event)
  if (!folios) return []

  const folioList = Array.isArray(folios) ? folios : String(folios).split(',')
  const placeholders = folioList.map(() => '?').join(',')
  
  const refs = await query<any[]>(`
    SELECT r.folio, r.monto, r.fecha, r.formaDePago, r.conceptoNombre, b.nombreCompleto, b.matricula, b.grado, b.grupo, b.nivel
    FROM referenciasdepago r
    LEFT JOIN base b ON r.matricula = b.matricula
    WHERE r.folio IN (${placeholders}) AND r.estatus = 'Vigente'
  `, folioList)

  if (raw) return refs
  
  // Standard HTML fallback logic
  return { html: 'Use print view router mapping instead.' }
})