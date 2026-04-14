import { executeTransaction } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { matricula, pagos, formaDePago, ciclo = '2024' } = body

  if (!matricula || !pagos || !pagos.length) {
    throw createError({ statusCode: 400, message: 'Invalid payment payload' })
  }

  const folios = await executeTransaction(async (conn) => {
    const results = []
    for (const p of pagos) {
      if (p.montoPagado <= 0) continue
      const [insert] = await conn.execute(`
        INSERT INTO referenciasdepago (matricula, monto, ciclo, mes, recargo, importeTotal, documento, concepto, formaDePago, estatus)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Vigente')
      `, [matricula, p.montoPagado, ciclo, p.mes, p.hasRecargo ? 1 : 0, p.subtotal, p.documento, p.conceptoNombre, formaDePago])
      
      results.push((insert as any).insertId)
    }
    return results
  })

  return { success: true, folios }
})