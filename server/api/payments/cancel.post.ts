import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  await query(`UPDATE referenciasdepago SET estatus = 'Cancelada', cancelada_por = ? WHERE folio = ?`, [body.motivo, body.folio])
  return { success: true }
})