import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { matricula, pagos, formaDePago, ciclo = '2024' } = body

  if (!matricula || !pagos || !pagos.length) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos para procesar el pago' })
  }

  const results = []
  for (const p of pagos) {
    const insert = await query<any>(`
      INSERT INTO referenciasdepago (matricula, monto, ciclo, mes, recargo, importeTotal, documento, formaDePago, estatus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Vigente')
    `, [matricula, p.montoPagado, ciclo, p.mes, p.hasRecargo ? 1 : 0, p.subtotal, p.documento, formaDePago])
    results.push(insert.insertId)
  }

  return { success: true, folios: results }
})